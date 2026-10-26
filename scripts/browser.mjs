// Run npm run build and install Playwright Chromium before the browser tests.
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import { chromium } from 'playwright'
import { startProductionServer } from './server.mjs'

async function downloadResult(page) {
  const ready = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download JSON', exact: true }).click()
  const download = await ready
  assert.equal(download.suggestedFilename(), 'fusion-result.json')
  assert.equal(await download.failure(), null)
  const stream = await download.createReadStream()
  assert.ok(stream, 'The JSON download must have readable content')
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  const exported = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  assert.deepEqual(Object.keys(exported).sort(), ['input', 'model', 'result'])
  assert.equal(exported.model, 'EssenceFusion')
  return exported
}

async function fillInputs(page, quantum, classical, quantumPotential, classicalPotential) {
  await page.getByLabel('Vector q', { exact: true }).fill(quantum)
  await page.getByLabel('Vector c', { exact: true }).fill(classical)
  await page.getByLabel('Potential Aq', { exact: true }).fill(quantumPotential)
  await page.getByLabel('Potential Ac', { exact: true }).fill(classicalPotential)
}

async function screenshot(page, filename) {
  const directory = process.env.FUSION_SCREENSHOTS
  if (!directory) return
  await mkdir(directory, { recursive: true })
  await page.evaluate(() => globalThis.scrollTo({ top: 0, left: 0, behavior: 'instant' }))
  await page.screenshot({ path: join(directory, filename), fullPage: true })
}

async function assertNoHorizontalOverflow(page) {
  const viewport = page.viewportSize().width
  const dimensions = await page.evaluate(() => ({
    document: globalThis.document.documentElement.scrollWidth,
    body: globalThis.document.body.scrollWidth,
  }))
  assert.ok(dimensions.document <= viewport + 1, `Document overflows ${viewport}px: ${JSON.stringify(dimensions)}`)
  assert.ok(dimensions.body <= viewport + 1, `Body overflows ${viewport}px: ${JSON.stringify(dimensions)}`)
}

test('production workbench in Chromium', { timeout: 90_000 }, async t => {
  const { origin } = await startProductionServer(t)
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const pageErrors = []
  const consoleErrors = []
  const policyViolations = []
  const editRequests = []
  const expectedMissing = new Set()
  let recordEdits = false

  async function createContext(options = {}) {
    const context = await browser.newContext({ acceptDownloads: true, ...options })
    context.setDefaultTimeout(5_000)
    context.setDefaultNavigationTimeout(15_000)
    await context.exposeBinding('recordPolicyViolation', (_source, details) => {
      policyViolations.push(details)
    })
    await context.addInitScript(() => {
      globalThis.document.addEventListener('securitypolicyviolation', event => {
        globalThis.recordPolicyViolation({
          directive: event.effectiveDirective,
          blocked: event.blockedURI,
          document: event.documentURI,
        })
      })
    })
    context.on('request', request => {
      if (recordEdits && /^https?:/.test(request.url())) {
        editRequests.push({ method: request.method(), url: request.url() })
      }
    })
    context.on('page', page => {
      page.on('pageerror', error => pageErrors.push({ url: page.url(), message: error.message }))
      page.on('console', message => {
        if (message.type() !== 'error') return
        const url = message.location().url
        if (expectedMissing.has(url) && /\b404\b/.test(message.text())) return
        consoleErrors.push({ url, text: message.text() })
      })
    })
    return context
  }

  const context = await createContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  let baseline

  await t.test('loads labelled controls, accessible results, and a real JSON download', async () => {
    const response = await page.goto(origin)
    assert.equal(response.status(), 200)
    await page.waitForLoadState('networkidle')
    assert.equal(await page.title(), 'Fusion workbench | IDMHYSI systems')
    assert.ok(await page.getByRole('heading', { name: 'Fusion workbench', level: 1 }).isVisible())
    assert.ok(await page.getByRole('link', { name: 'IDMHYSI systems', exact: true }).isVisible())
    for (const label of ['Vector q', 'Vector c', 'Potential Aq', 'Potential Ac']) {
      const field = page.getByLabel(label, { exact: true })
      assert.ok(await field.isVisible(), `${label} must have a visible labelled control`)
      assert.ok(await field.isEditable(), `${label} must accept keyboard input`)
    }
    assert.ok(await page.getByRole('img', { name: /^Vector comparison/ }).isVisible())
    assert.equal(await page.getByRole('table', { name: 'Component values' }).getByRole('row').count(), 5)
    recordEdits = true
    baseline = await downloadResult(page)
    assert.deepEqual(baseline.input, {
      quantum: [0.8, 0.3, 0.1, 0.4],
      classical: [0.2, 0.6, 0.5, 0.3],
      quantumPotential: 3,
      classicalPotential: 2,
    })
    assert.equal(baseline.result.dimension, 4)
    await screenshot(page, 'fusion-desktop.png')
  })

  await t.test('editing computes and exports the current signed-vector fixture', async () => {
    await fillInputs(page, '1, 1', '1, -1', '1', '1')
    assert.equal(await page.getByRole('table', { name: 'Component values' }).getByRole('row').count(), 3)
    assert.equal(await page.getByRole('status', { name: 'Fusion weight alpha', exact: true }).textContent(), '0.5')
    assert.equal((await page.getByRole('status', { name: 'Confidence index', exact: true }).textContent()).trim(), '0')
    const exported = await downloadResult(page)
    assert.deepEqual(exported.input, {
      quantum: [1, 1], classical: [1, -1], quantumPotential: 1, classicalPotential: 1,
    })
    assert.deepEqual(exported.result, {
      dimension: 2,
      entropyQuantum: 1,
      entropyClassical: 1,
      structuralWeight: 0.5,
      entropyWeight: 0.5,
      alpha: 0.5,
      fused: [1, 0],
      disagreement: 1,
      fusedNorm: 1,
      confidenceRaw: 0,
    })
    await page.getByLabel('Vector q', { exact: true }).focus()
    await page.keyboard.press('Tab')
    assert.ok(await page.getByLabel('Vector c', { exact: true }).evaluate(element => element === globalThis.document.activeElement))
  })

  await t.test('very small representable entropy remains usable in the interface', async () => {
    await fillInputs(page, '1000, 5e-324', '1000, 5e-324', '1', '1')
    const exported = await downloadResult(page)
    assert.equal(exported.result.entropyQuantum, Number.MIN_VALUE)
    assert.equal(exported.result.entropyClassical, Number.MIN_VALUE)
    assert.equal(exported.result.alpha, 0.5)
    assert.deepEqual(exported.result.fused, [1000, Number.MIN_VALUE])
    assert.equal(exported.result.confidenceRaw, 1)
    assert.equal(await page.getByRole('main').getByRole('alert').count(), 0)
  })

  await t.test('presets and keyboard reset update the inputs and calculation', async () => {
    await page.getByRole('button', { name: 'Balanced mix', exact: true }).click()
    assert.deepEqual(await downloadResult(page), baseline)
    const emphasis = page.getByRole('button', { name: 'Q emphasis', exact: true })
    await emphasis.focus()
    await page.keyboard.press('Enter')
    assert.equal(await page.getByLabel('Potential Aq', { exact: true }).inputValue(), '9')
    assert.equal(await page.getByLabel('Potential Ac', { exact: true }).inputValue(), '1')
    const changed = await downloadResult(page)
    assert.deepEqual(changed.input.quantum, baseline.input.quantum)
    assert.deepEqual(changed.input.classical, baseline.input.classical)
    assert.ok(Math.abs(changed.result.alpha - baseline.result.alpha - 0.21) < 1e-12)
    assert.notDeepEqual(changed.result.fused, baseline.result.fused)
    await page.getByRole('button', { name: 'Reset inputs', exact: true }).focus()
    await page.keyboard.press('Enter')
    assert.deepEqual(await downloadResult(page), baseline)
  })

  await t.test('opposing channels display and export the undefined confidence boundary', async () => {
    await page.getByRole('button', { name: 'Opposing channels', exact: true }).click()
    assert.equal((await page.getByRole('status', { name: 'Confidence index', exact: true }).textContent()).trim(), 'Undefined')
    assert.ok(await page.getByText('The fused vector has zero norm, so this index is undefined.', { exact: true }).isVisible())
    const exported = await downloadResult(page)
    assert.deepEqual(exported.result.fused, [0, 0, 0, 0])
    assert.equal(exported.result.fusedNorm, 0)
    assert.equal(exported.result.confidenceRaw, null)
  })

  await t.test('invalid inputs prevent downloads and remove stale results until reset', async () => {
    await page.getByLabel('Vector q', { exact: true }).fill('1,,2')
    assert.ok(await page.getByRole('main').getByRole('alert').isVisible())
    assert.equal(await page.getByLabel('Vector q', { exact: true }).getAttribute('aria-invalid'), 'true')
    assert.ok(await page.getByRole('button', { name: 'Download JSON', exact: true }).isDisabled())
    assert.equal(await page.getByRole('table', { name: 'Component values' }).count(), 0)
    assert.equal(await page.getByRole('status', { name: 'Fusion weight alpha', exact: true }).count(), 0)
    await page.getByRole('button', { name: 'Reset inputs', exact: true }).click()
    await page.getByLabel('Potential Aq', { exact: true }).fill('-1e-999')
    assert.equal(await page.getByLabel('Potential Aq', { exact: true }).getAttribute('aria-invalid'), 'true')
    assert.match(await page.getByRole('main').getByRole('alert').textContent(), /nonnegative/)
    assert.ok(await page.getByRole('button', { name: 'Download JSON', exact: true }).isDisabled())
    assert.equal(await page.getByRole('table', { name: 'Component values' }).count(), 0)
    await page.getByRole('button', { name: 'Reset inputs', exact: true }).click()
    await page.getByLabel('Potential Aq', { exact: true }).fill('0')
    await page.getByLabel('Potential Ac', { exact: true }).fill('0')
    assert.ok(await page.getByRole('main').getByRole('alert').isVisible())
    assert.ok(await page.getByRole('button', { name: 'Download JSON', exact: true }).isDisabled())
    await page.getByRole('button', { name: 'Reset inputs', exact: true }).click()
    assert.equal(await page.getByRole('main').getByRole('alert').count(), 0)
    assert.deepEqual(await downloadResult(page), baseline)
    await page.waitForLoadState('networkidle')
    recordEdits = false
    assert.deepEqual(editRequests, [], 'Input changes and JSON downloads must stay in the browser')
  })

  await t.test('mobile layout contains its chart and supports the same controls', async () => {
    const mobileContext = await createContext({
      viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    })
    const mobile = await mobileContext.newPage()
    await mobile.goto(origin)
    await mobile.waitForLoadState('networkidle')
    await assertNoHorizontalOverflow(mobile)
    assert.ok(await mobile.getByLabel('Vector q', { exact: true }).isEditable())
    assert.ok(await mobile.getByRole('region', { name: 'Scrollable component comparison', exact: true }).isVisible())
    assert.equal(await mobile.getByRole('table', { name: 'Component values' }).getByRole('row').count(), 5)
    await screenshot(mobile, 'fusion-mobile.png')
    await mobile.getByRole('button', { name: 'Q emphasis', exact: true }).click()
    assert.equal(await mobile.getByLabel('Potential Aq', { exact: true }).inputValue(), '9')
    await mobile.getByRole('button', { name: 'Reset inputs', exact: true }).click()
    assert.deepEqual(await downloadResult(mobile), baseline)
    await mobile.setViewportSize({ width: 320, height: 844 })
    await mobile.getByRole('button', { name: 'Opposing channels', exact: true }).click()
    assert.equal((await mobile.getByRole('status', { name: 'Confidence index', exact: true }).textContent()).trim(), 'Undefined')
    await assertNoHorizontalOverflow(mobile)
    await screenshot(mobile, 'fusion-mobile-opposed.png')
    await mobileContext.close()
  })

  await t.test('home and unknown pages have no JavaScript or security policy failures', async () => {
    const missingUrl = `${origin}/missing-${randomUUID()}`
    expectedMissing.add(missingUrl)
    const response = await page.goto(missingUrl)
    assert.equal(response.status(), 404)
    await page.waitForLoadState('networkidle')
    assert.deepEqual(
      { pageErrors, policyViolations, consoleErrors },
      { pageErrors: [], policyViolations: [], consoleErrors: [] },
      'Production pages must have no JavaScript errors, policy violations, or unexpected console errors'
    )
  })
})
