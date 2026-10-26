/**
 * Real MCP → SSE → Hudson AppShell browser regression.
 * Run `bun scripts/liveDiagram.browser.ts` with Arc serving port 5188.
 * ARC_EDITOR_URL may include a mount path, such as http://127.0.0.1:5188/arc.
 */
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createServer, request, type ServerResponse } from 'node:http'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import puppeteer, { type Page } from 'puppeteer'
import type { ArcDiagramData } from '../src/types/diagram'
import { findChrome } from './renderImage'

const root = join(import.meta.dir, '..')
const baseUrl = process.env.ARC_EDITOR_URL || 'http://127.0.0.1:5188'
const output = process.env.ARC_CAPTURE_DIR || '/tmp/arc-live-verification'
const clientName = 'Arc browser verification'
const nodeSelector = (id: string) => `[data-arc-node-id="${id}"]`
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const checks: string[] = []
const evidence: Record<string, unknown> = { baseUrl, checks }
const errors: string[] = []
const consoleErrors: string[] = []
const failedRequests: string[] = []
const analyticsRequests: string[] = []
mkdirSync(output, { recursive: true })

const initial: ArcDiagramData = {
  layout: { width: 960, height: 560 },
  nodes: {
    api: { x: 100, y: 180, size: 'm' },
    db: { x: 600, y: 180, size: 'm' },
  },
  nodeData: {
    api: { icon: 'Server', name: 'API gateway', subtitle: 'Routes requests', color: 'emerald' },
    db: { icon: 'Database', name: 'Postgres', subtitle: 'Stores events', color: 'blue' },
  },
  connectors: [{ id: 'api-db', from: 'api', to: 'db', fromAnchor: 'right', toAnchor: 'left', style: 'sql' }],
  connectorStyles: { sql: { color: 'blue', strokeWidth: 2, label: 'SQL' } },
}

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['packages/mcp/src/server.ts'],
  cwd: root,
  env: { ...process.env, ARC_EDITOR_URL: baseUrl },
  stderr: 'pipe',
})
const client = new Client({ name: clientName, version: '1.0.0' }, { capabilities: {} })
let serverErrors = ''
transport.stderr?.on('data', chunk => { serverErrors += String(chunk) })
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true })
const page = await browser.newPage()
page.on('pageerror', error => errors.push(String(error)))
page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
page.on('request', request => {
  if (/google-analytics\.com|googletagmanager\.com/.test(request.url())) analyticsRequests.push(new URL(request.url()).origin)
})
page.on('requestfailed', request => {
  const url = new URL(request.url())
  failedRequests.push(`${url.origin}${url.pathname}: ${request.failure()?.errorText}`)
})
page.setDefaultTimeout(20_000)

// A controlled TCP interruption is more faithful than Chrome's offline mode,
// which leaves established localhost EventSource connections alive.
async function streamProxy(streamUrl: string) {
  const upstream = new URL(streamUrl)
  const responses = new Set<ServerResponse>()
  const server = createServer((incoming, outgoing) => {
    responses.add(outgoing)
    outgoing.on('close', () => responses.delete(outgoing))
    const forwarded = request(new URL(incoming.url || '/', upstream.origin), {
      method: incoming.method,
      headers: { ...incoming.headers, host: upstream.host },
    }, response => {
      outgoing.writeHead(response.statusCode || 502, response.headers)
      response.pipe(outgoing)
    })
    forwarded.on('error', () => outgoing.destroy())
    outgoing.on('close', () => forwarded.destroy())
    incoming.pipe(forwarded)
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const viewerUrl = new URL(upstream)
  viewerUrl.host = `127.0.0.1:${address.port}`
  return {
    url: viewerUrl.href,
    disconnect: () => { for (const response of responses) response.destroy() },
    close: () => { server.closeAllConnections(); server.close() },
  }
}
let relay: Awaited<ReturnType<typeof streamProxy>> | undefined

async function call(name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args })
  const contents = result.content as Array<{ type: string; text?: string }>
  const text = contents.find(content => content.type === 'text')?.text
  assert.ok(text, `${name} must return JSON text`)
  const payload = JSON.parse(text)
  assert.notEqual(result.isError, true, `${name}: ${text}`)
  assert.equal(payload.ok, true, `${name}: ${text}`)
  return payload
}

async function button(name: string, target: Page = page) {
  const selector = `button[aria-label="${name}"]`
  if (await target.$(selector)) return selector
  const buttons = await target.$$('button')
  for (const element of buttons) {
    if ((await element.evaluate(node => node.textContent?.trim())) === name) return element
    await element.dispose()
  }
  throw new Error(`Missing ${name} button`)
}

async function clickButton(name: string, target: Page = page) {
  const control = await button(name, target)
  if (typeof control === 'string') await target.click(control)
  else { await control.click(); await control.dispose() }
}

async function isPressed(name: string) {
  const control = await button(name)
  if (typeof control === 'string') return page.$eval(control, element => element.getAttribute('aria-pressed'))
  try { return await control.evaluate(element => element.getAttribute('aria-pressed')) }
  finally { await control.dispose() }
}

async function position(id: string, target: Page = page) {
  return target.$eval(nodeSelector(id), element => {
    const node = element as HTMLElement
    const rect = node.getBoundingClientRect()
    return { x: parseFloat(getComputedStyle(node).left), y: parseFloat(getComputedStyle(node).top), scale: rect.width / node.offsetWidth }
  })
}

// Record every rendered frame before sending the tool. This proves movement
// occurred through intermediate coordinates, independent of command latency.
async function startFrames(id = 'api') {
  await page.evaluate(selector => {
    const state = { running: true, frames: [] as Array<{ time: number; x: number; scale: number }> }
    ;(window as any).__arcLiveFrames = state
    const sample = () => {
      if (!state.running) return
      const node = document.querySelector<HTMLElement>(selector)
      if (node) {
        const rect = node.getBoundingClientRect()
        state.frames.push({ time: performance.now(), x: parseFloat(getComputedStyle(node).left), scale: rect.width / node.offsetWidth })
      }
      requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  }, nodeSelector(id))
}

async function stopFrames(): Promise<Array<{ time: number; x: number; scale: number }>> {
  return page.evaluate(() => {
    const state = (window as any).__arcLiveFrames
    state.running = false
    return state.frames
  })
}

async function waitForX(id: string, x: number, target = page) {
  await target.waitForFunction((selector, expected) => {
    const node = document.querySelector<HTMLElement>(selector)
    return node && Math.abs(parseFloat(getComputedStyle(node).left) - expected) < 0.1
  }, {}, nodeSelector(id), x)
}

try {
  await client.connect(transport)
  evidence.browser = await browser.version()
  const opened = await call('open_live_diagram', { diagram: initial, title: 'Live architecture verification' })
  assert.equal(opened.actor.name, clientName, 'identity must come from the actual MCP initialize handshake')
  assert.ok(opened.actor.id)
  assert.match(opened.liveUrl, /\/live\//)
  const sessionId = opened.sessionId as string
  evidence.sessionId = sessionId
  relay = await streamProxy(opened.streamUrl)
  const liveUrl = new URL(opened.liveUrl)
  liveUrl.hash = new URLSearchParams({ stream: relay.url }).toString()
  await page.setViewport({ width: 1440, height: 960 })
  await page.goto(liveUrl.href, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-arc-live-stage]')
  await page.waitForSelector(nodeSelector('api'))
  await page.waitForFunction(name => document.body.textContent?.includes(name), {}, clientName)
  await page.waitForFunction(() => document.querySelector('[data-arc-live-connection]')?.getAttribute('data-arc-live-connection') === 'connected')
  assert.ok(await page.$('[data-hudson-template="hudson"]'), 'live diagram must use Hudson AppShell')
  await delay(800)
  checks.push('real stdio MCP handshake identity and initial SSE snapshot in Hudson AppShell')
  await page.evaluate(selector => { (window as any).__arcOriginalNode = document.querySelector(selector) }, nodeSelector('api'))

  const moved = structuredClone(initial)
  moved.nodes.api.x = 320
  await startFrames()
  await call('update_live_diagram', { sessionId, diagram: moved, message: 'Move the gateway into the request path' })
  await waitForX('api', 320)
  await delay(150)
  const moveFrames = await stopFrames()
  evidence.moveFrames = moveFrames
  evidence.motionEnvironment = await page.evaluate(() => ({ hidden: document.hidden, reduced: matchMedia('(prefers-reduced-motion: reduce)').matches }))
  assert.ok(moveFrames.some(frame => frame.x > 101 && frame.x < 319), 'node must visit intermediate positions')
  assert.equal(await page.evaluate(selector => (window as any).__arcOriginalNode === document.querySelector(selector), nodeSelector('api')), true, 'existing nodes must retain DOM identity')
  checks.push('node positions interpolate while stable node DOM identity survives updates')

  const expanded = structuredClone(moved)
  expanded.layout.width = 1960
  expanded.nodes.worker = { x: 1650, y: 180, size: 'm' }
  expanded.nodeData.worker = { icon: 'Workflow', name: 'Background worker', subtitle: 'Processes events', color: 'amber' }
  expanded.connectors.push({ id: 'db-worker', from: 'db', to: 'worker', fromAnchor: 'right', toAnchor: 'left', style: 'sql' })
  const beforeExpansion = await position('api')
  await startFrames()
  await call('update_live_diagram', { sessionId, diagram: expanded, message: 'Add the background processing tier' })
  await page.waitForSelector(nodeSelector('worker'))
  await delay(1_200)
  const afterExpansion = await position('api')
  const cameraFrames = await stopFrames()
  assert.ok(afterExpansion.scale < beforeExpansion.scale - 0.05, 'added content must cause camera to zoom out')
  assert.ok(cameraFrames.some(frame => frame.scale < beforeExpansion.scale - 0.01 && frame.scale > afterExpansion.scale + 0.01), 'camera must visit intermediate zoom values')
  evidence.camera = { beforeExpansion, afterExpansion, frames: cameraFrames }
  checks.push('new node appears and expanding architecture smoothly reframes the camera')
  await page.screenshot({ path: `${output}/desktop.png`, fullPage: true })

  // Pause from within the page at the first measurable camera movement. Tool
  // and Puppeteer round trips could otherwise miss a short spring entirely.
  await page.evaluate(() => {
    const camera = document.querySelector<HTMLElement>('[data-arc-camera]')!
    const read = () => {
      const matrix = new DOMMatrix(getComputedStyle(camera).transform)
      return { x: matrix.m41, y: matrix.m42, scale: matrix.m11 }
    }
    const state = {
      start: read(),
      paused: null as ReturnType<typeof read> | null,
      frames: [] as Array<ReturnType<typeof read>>,
      done: false,
    }
    ;(window as any).__arcFollowFreeze = state
    const sample = () => {
      const current = read()
      if (!state.paused && current.scale < state.start.scale - 0.015) {
        state.paused = current
        document.querySelector<HTMLButtonElement>('button[aria-label="Follow agent"]')!.click()
      }
      if (state.paused) state.frames.push(current)
      if (state.frames.length >= 36) state.done = true
      else requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  })
  const wider = structuredClone(expanded)
  wider.layout.width = 3200
  wider.nodes.worker.x = 2900
  await call('update_live_diagram', { sessionId, diagram: wider, message: 'Pause while the camera is framing a larger diagram' })
  await page.waitForFunction(() => (window as any).__arcFollowFreeze.done)
  const freeze = await page.evaluate(() => (window as any).__arcFollowFreeze) as {
    start: { x: number; y: number; scale: number }
    paused: { x: number; y: number; scale: number }
    frames: Array<{ x: number; y: number; scale: number }>
  }
  assert.equal(await isPressed('Follow agent'), 'false')
  assert.ok(freeze.paused.scale < freeze.start.scale && freeze.paused.scale > 0.5, 'Follow must pause during an intermediate frame')
  assert.ok(freeze.frames.every(frame => Math.abs(frame.scale - freeze.paused.scale) < 0.001 && Math.abs(frame.x - freeze.paused.x) < 0.5 && Math.abs(frame.y - freeze.paused.y) < 0.5), 'turning Follow off must freeze the displayed frame without a jump')
  evidence.followFreeze = freeze
  checks.push('turning Follow off during a spring freezes the displayed camera without a jump')
  await call('update_live_diagram', { sessionId, diagram: expanded, message: 'Restore the architecture after camera ownership check' })
  await clickButton('Follow agent')
  await delay(800)

  const rapid = structuredClone(expanded)
  rapid.nodes.api.x = 180
  await call('update_live_diagram', { sessionId, diagram: rapid, message: 'First rapid update' })
  rapid.nodes.api.x = 440
  await call('update_live_diagram', { sessionId, diagram: rapid, message: 'Latest rapid update' })
  await waitForX('api', 440)
  await delay(250)
  assert.ok(Math.abs((await position('api')).x - 440) < 0.1)
  checks.push('rapid updates settle on the newest diagram')

  assert.equal(await isPressed('Follow agent'), 'true')
  const stage = await page.$('[data-arc-live-stage]')
  const bounds = await stage!.boundingBox()
  assert.ok(bounds)
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height - 70)
  await page.mouse.down()
  await page.mouse.move(bounds.x + bounds.width / 2 + 110, bounds.y + bounds.height - 20, { steps: 8 })
  await page.mouse.up()
  assert.equal(await isPressed('Follow agent'), 'false', 'manual pan must hand camera control to the viewer')
  await clickButton('Follow agent')
  assert.equal(await isPressed('Follow agent'), 'true')
  checks.push('manual pan pauses following and Follow agent restores it')

  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
  await delay(80)
  rapid.nodes.api.x = 260
  await startFrames()
  await call('update_live_diagram', { sessionId, diagram: rapid, message: 'Respect reduced motion' })
  await waitForX('api', 260)
  await delay(120)
  const reducedFrames = await stopFrames()
  assert.equal(reducedFrames.some(frame => frame.x > 261 && frame.x < 439), false, 'reduced motion must settle without intermediate node travel')
  evidence.reducedFrames = reducedFrames
  checks.push('system reduced motion applies the new snapshot without movement')

  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }])
  if (await isPressed('Animate changes') === 'true') await clickButton('Animate changes')
  rapid.nodes.api.x = 380
  await startFrames()
  await call('update_live_diagram', { sessionId, diagram: rapid, message: 'Viewer disabled animations' })
  await waitForX('api', 380)
  await delay(120)
  const disabledFrames = await stopFrames()
  assert.equal(disabledFrames.some(frame => frame.x > 261 && frame.x < 379), false, 'animation toggle must disable motion')
  checks.push('Animate changes control disables movement independently of system preference')

  relay.disconnect()
  await page.waitForFunction(() => ['reconnecting', 'unavailable'].includes(document.querySelector('[data-arc-live-connection]')?.getAttribute('data-arc-live-connection') || ''), { timeout: 8_000 })
  assert.ok(Math.abs((await position('api')).x - 380) < 0.1, 'network interruption must preserve the last drawing')
  rapid.nodes.api.x = 410
  await call('update_live_diagram', { sessionId, diagram: rapid, message: 'Update while the viewer is offline' })
  await page.waitForFunction(() => document.querySelector('[data-arc-live-connection]')?.getAttribute('data-arc-live-connection') === 'connected')
  await waitForX('api', 410)
  checks.push('dropped SSE socket retains drawing and automatically reconnects to the latest revision')

  // Reload establishes a fresh EventSource connection. It must receive the
  // latest full snapshot without requiring the MCP client to resend it.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForX('api', 410)
  await page.waitForSelector(nodeSelector('worker'))
  checks.push('fresh SSE connection restores latest diagram without replaying tool calls')

  const complete = await call('end_live_diagram', { sessionId, message: 'Architecture ready for review' })
  assert.equal(complete.status, 'complete')
  await page.waitForFunction(() => document.body.textContent?.includes('Architecture ready for review'))
  assert.ok(await page.$(nodeSelector('worker')), 'completion keeps the final drawing available')
  checks.push('completion retains final snapshot and displays the final agent message')

  await page.setViewport({ width: 390, height: 844 })
  await delay(500)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'mobile layout must not overflow horizontally')
  await page.screenshot({ path: `${output}/mobile.png`, fullPage: true })
  checks.push('390px mobile viewport has no horizontal overflow')
  assert.deepEqual(analyticsRequests, [], 'direct live URLs must not load analytics')
  assert.equal(await page.evaluate(() => Boolean(document.querySelector('script[src*="googletagmanager.com"]'))), false)
  checks.push('direct live URL does not request analytics or inject its script')

  const empty = await browser.newPage()
  empty.on('pageerror', error => errors.push(String(error)))
  await empty.setViewport({ width: 1440, height: 960 })
  await empty.goto(`${baseUrl.replace(/\/$/, '')}/live`, { waitUntil: 'domcontentloaded' })
  await empty.waitForSelector('[data-arc-live-stage]')
  assert.match(await empty.$eval('[data-arc-live-stage]', node => node.textContent || ''), /Watch your architecture take shape/)
  assert.equal(await empty.$eval('[data-arc-live-connection]', node => node.getAttribute('data-arc-live-connection')), 'unavailable')
  await empty.screenshot({ path: `${output}/empty.png`, fullPage: true })
  await empty.close()
  checks.push('unconnected live route explains how to open an agent session')
  assert.deepEqual(errors, [])
  evidence.errors = errors
  evidence.consoleErrors = consoleErrors
  evidence.failedRequests = failedRequests
  evidence.analyticsRequests = analyticsRequests
  writeFileSync(`${output}/browser-results.json`, JSON.stringify(evidence, null, 2))
  console.log(`PASS ${checks.length} live diagram browser checks; evidence: ${output}`)
} catch (error) {
  evidence.errors = errors
  evidence.consoleErrors = consoleErrors
  evidence.failedRequests = failedRequests
  evidence.failure = String(error)
  // Never write the stream capability URL or token to the report.
  evidence.serverErrors = serverErrors
  writeFileSync(`${output}/browser-results.json`, JSON.stringify(evidence, null, 2))
  await page.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => undefined)
  throw error
} finally {
  await client.close()
  relay?.close()
  await browser.close()
}
