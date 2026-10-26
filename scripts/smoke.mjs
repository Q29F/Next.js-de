// Run npm run build before the HTTP tests.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { startProductionServer } from './server.mjs'

function scriptNonce(response, html) {
  const csp = response.headers.get('content-security-policy') ?? ''
  assert.doesNotMatch(csp, /'unsafe-inline'|'unsafe-eval'/)
  assert.match(csp, /(?:^|;)\s*frame-ancestors\s+'none'\s*(?:;|$)/)
  const nonce = /(?:^|;)\s*script-src\s+[^;]*'nonce-([^']+)'/.exec(csp)?.[1]
  assert.ok(nonce, 'Production scripts require a nonce in the CSP')
  const tags = html.match(/<script\b[^>]*>/g) ?? []
  assert.ok(tags.length > 0, 'The interactive workbench must include its scripts')
  for (const tag of tags) {
    assert.equal(/\bnonce=["']([^"']+)["']/.exec(tag)?.[1], nonce, 'Each script must match the response CSP nonce')
  }
  return nonce
}

test('production HTTP behavior', { timeout: 60_000 }, async t => {
  const { request } = await startProductionServer(t)

  await t.test('home renders the workbench document and main heading', async () => {
    const response = await request('/')
    assert.equal(response.status, 200)
    assert.match(response.headers.get('content-type') ?? '', /^text\/html\b/i)
    const html = await response.text()
    assert.match(html, /<title\b[^>]*>\s*Fusion workbench \| IDMHYSI systems\s*<\/title>/)
    assert.match(html, /<main\b/)
    assert.match(html, /<h1\b[^>]*>[\s\S]*?Fusion[\s\S]*?workbench[\s\S]*?<\/h1>/)
  })

  await t.test('production headers and script nonces are enforced and fresh', async () => {
    const first = await request('/')
    const firstNonce = scriptNonce(first, await first.text())
    assert.equal(first.headers.get('x-content-type-options'), 'nosniff')
    assert.equal(first.headers.get('referrer-policy'), 'no-referrer')
    assert.equal(first.headers.get('x-powered-by'), null)
    const second = await request('/')
    const secondNonce = scriptNonce(second, await second.text())
    assert.notEqual(firstNonce, secondNonce, 'A nonce must not be reused across requests')
  })

  await t.test('health endpoint returns its liveness response without caching', async () => {
    const response = await request('/api/health')
    assert.equal(response.status, 200)
    assert.match(response.headers.get('content-type') ?? '', /^application\/json\b/i)
    assert.match(response.headers.get('cache-control') ?? '', /(?:^|,)\s*no-store\s*(?:,|$)/)
    assert.deepEqual(await response.json(), { status: 'ok', application: 'fusion-workbench' })
  })

  await t.test('health endpoint rejects unsupported POST requests', async () => {
    const response = await request('/api/health', { method: 'POST' })
    assert.equal(response.status, 405)
    await response.arrayBuffer()
  })

  await t.test('site icon is served as a nonempty image', async () => {
    const response = await request('/favicon.ico')
    assert.equal(response.status, 200)
    assert.match(response.headers.get('content-type') ?? '', /^image\//i)
    assert.ok((await response.arrayBuffer()).byteLength > 0)
  })

  await t.test('real framework asset endpoints retain their expected responses', async () => {
    const home = await request('/')
    const html = await home.text()
    const script = /<script\b[^>]*\bsrc="(\/_next\/static\/[^"]+)"/.exec(html)?.[1]
    assert.ok(script, 'The home page must reference a compiled framework script')
    const asset = await request(script)
    assert.equal(asset.status, 200)
    assert.match(asset.headers.get('content-type') ?? '', /^(?:text|application)\/javascript\b/i)
    assert.match(asset.headers.get('cache-control') ?? '', /\bimmutable\b/)
    assert.ok((await asset.arrayBuffer()).byteLength > 0)

    const image = await request('/_next/image')
    assert.equal(image.status, 400, 'The image endpoint must reject a request without its required parameters')
    assert.doesNotMatch(await image.text(), /<script\b/i)
  })

  await t.test('unknown routes return 404 with matching script nonces', async () => {
    const response = await request(`/missing-${randomUUID()}`)
    assert.equal(response.status, 404)
    scriptNonce(response, await response.text())
  })

  await t.test('asset-like unknown routes receive the HTML nonce policy', async () => {
    for (const path of [
      '/faviconXico', '/favicon.ico/missing', '/icon.svg',
      '/_next/static-review', '/_next/static', '/_next/image-review', '/_next/image/missing',
    ]) {
      const response = await request(path)
      assert.equal(response.status, 404, path)
      assert.match(response.headers.get('content-type') ?? '', /^text\/html\b/i, path)
      scriptNonce(response, await response.text())
    }
  })
})
