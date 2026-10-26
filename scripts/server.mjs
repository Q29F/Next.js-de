import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(import.meta.url)

async function availablePort() {
  const reservation = createServer()
  await new Promise((resolve, reject) => {
    reservation.once('error', reject)
    reservation.listen(0, '127.0.0.1', resolve)
  })
  const { port } = reservation.address()
  await new Promise((resolve, reject) => {
    reservation.close(error => error ? reject(error) : resolve())
  })
  return port
}

/** Start a production build and register bounded cleanup with the test context. */
export async function startProductionServer(t) {
  await assert.doesNotReject(
    access(new URL('../.next/BUILD_ID', import.meta.url)),
    'No production build found. Run npm run build before these tests.'
  )
  const port = await availablePort()
  const origin = `http://127.0.0.1:${port}`
  const child = spawn(process.execPath, [
    require.resolve('next/dist/bin/next'),
    'start', '--hostname', '127.0.0.1', '--port', String(port),
  ], {
    cwd: projectRoot,
    env: { ...process.env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let serverLog = ''
  let spawnError
  let stopped = false
  const closed = new Promise(resolve => {
    child.once('close', () => { stopped = true; resolve() })
    child.once('error', error => {
      spawnError = error
      if (!child.pid) { stopped = true; resolve() }
    })
  })
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding('utf8')
    stream.on('data', data => { serverLog = (serverLog + data).slice(-16_384) })
  }

  const kill = () => { if (!stopped) child.kill('SIGKILL') }
  process.once('exit', kill)
  t.signal.addEventListener('abort', kill, { once: true })
  t.after(async () => {
    try {
      if (!stopped) {
        child.kill('SIGTERM')
        await Promise.race([closed, delay(2_000, undefined, { ref: false })])
      }
      if (!stopped) {
        kill()
        await Promise.race([closed, delay(2_000, undefined, { ref: false })])
      }
      assert.ok(stopped, 'The production server did not stop after SIGKILL')
    } finally {
      if (stopped) process.removeListener('exit', kill)
      t.signal.removeEventListener('abort', kill)
    }
  })

  async function request(path, options = {}) {
    const { timeout = 5_000, ...fetchOptions } = options
    return fetch(new URL(path, origin), {
      ...fetchOptions,
      redirect: 'error',
      signal: AbortSignal.any([t.signal, AbortSignal.timeout(timeout)]),
    })
  }

  const deadline = Date.now() + 30_000
  let lastReadinessError = 'server did not respond'
  while (Date.now() < deadline && !t.signal.aborted) {
    assert.ok(!stopped, `Production server exited before readiness: ${spawnError ?? ''}\n${serverLog}`)
    try {
      const response = await request('/', { timeout: Math.max(1, Math.min(1_000, deadline - Date.now())) })
      await response.arrayBuffer()
      if (response.status === 200) return { origin, request }
      lastReadinessError = `GET / returned ${response.status}`
    } catch (error) {
      lastReadinessError = error.message
    }
    await delay(100, undefined, { signal: t.signal })
  }
  assert.fail(`Production server was not ready within 30s: ${lastReadinessError}\n${serverLog}`)
}
