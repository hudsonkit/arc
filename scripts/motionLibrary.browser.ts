/**
 * Real stdio MCP → SSE → Motion renderer regression. Run against an existing
 * Arc dev server: ARC_EDITOR_URL=http://127.0.0.1:5194 bun scripts/motionLibrary.browser.ts
 * Uses its own ephemeral MCP owner/store and never opens a saved review.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import puppeteer from 'puppeteer'
import type { ArcDiagramData } from '../src/types/diagram'
import { findChrome } from './renderImage'

const root = join(import.meta.dir, '..')
const baseUrl = process.env.ARC_EDITOR_URL || 'http://127.0.0.1:5194'
const output = process.env.ARC_CAPTURE_DIR || mkdtempSync(join(tmpdir(), 'arc-motion-evidence-'))
const reviewDir = mkdtempSync(join(tmpdir(), 'arc-motion-store-'))
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
mkdirSync(output, { recursive: true })
const environment = { ...process.env, ARC_EDITOR_URL: baseUrl, ARC_REVIEW_DIR: reviewDir }
delete environment.ARC_MCP_TOKEN
const transport = new StdioClientTransport({ command: process.execPath, args: ['packages/mcp/src/server.ts'], cwd: root, env: environment, stderr: 'pipe' })
const client = new Client({ name: 'Arc Motion regression', version: '1.0.0' }, { capabilities: {} })
// Drain without recording arbitrary server diagnostics or capabilities.
transport.stderr?.on('data', () => undefined)
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true })
const page = await browser.newPage()
page.setDefaultTimeout(15_000)
const errors: string[] = []
page.on('pageerror', error => errors.push(String(error)))
const checks: string[] = []
const evidence: Record<string, unknown> = { baseUrl, browser: await browser.version(), checks, errors }
let sessionId: string | undefined

type Frame = {
  time: number; revision: number; x: number; y: number; width: number; height: number
  scale: number; cameraX: number; cameraY: number; connectorError: number
  workError: number | null; commits: number; diagramCommits: number
}

// Observe actual React commits without changing production components. The hook
// is installed before React loads; all-root commits are a conservative upper
// bound that also catches a render loop in a wrapper or overlay.
await page.evaluateOnNewDocument(() => {
  const state = { commits: 0, diagramCommits: 0, renderers: 0 }
  const renderers = new Map<number, unknown>()
  ;(window as any).__arcCommitEvidence = state
  ;(window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    renderers,
    inject(renderer: unknown) { const id = ++state.renderers; renderers.set(id, renderer); return id },
    onCommitFiberRoot(_renderer: number, root: any) {
      state.commits++
      const visit = (fiber: any): boolean => {
        if (!fiber) return false
        const type = fiber.elementType ?? fiber.type
        if ((type?.displayName === 'ArcDiagram' || type?.name === 'ArcDiagram') && (fiber.flags & 1)) return true
        return visit(fiber.child) || visit(fiber.sibling)
      }
      if (visit(root.current)) state.diagramCommits++
    },
    onCommitFiberUnmount() {}, onPostCommitFiberRoot() {},
  }
})

async function call(name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args })
  const text = (result.content as Array<{ type: string; text?: string }>).find(item => item.type === 'text')?.text
  assert.ok(text, `${name} returns JSON`)
  const value = JSON.parse(text)
  assert.notEqual(result.isError, true, `${name} failed: ${String(value.error ?? value.message ?? 'unknown error')}`)
  assert.equal(value.ok, true, `${name} succeeded`)
  return value
}

async function installSampler() {
  await page.evaluate(() => {
    ;(window as any).__arcReadFrame = () => {
      const node = document.querySelector<HTMLElement>('[data-arc-node-id="api"]')
      const target = document.querySelector<HTMLElement>('[data-arc-node-id="db"]')
      const path = document.querySelector<SVGPathElement>('[data-arc-connector-id="api-db"] > path[stroke^="url("]')
      const camera = document.querySelector<HTMLElement>('[data-arc-camera]')
      if (!node || !target || !path || !camera) return null
      const matrix = path.getScreenCTM()
      if (!matrix) return null
      const sourceRect = node.getBoundingClientRect(), targetRect = target.getBoundingClientRect()
      const local = new DOMPoint(sourceRect.left, sourceRect.top).matrixTransform(matrix.inverse())
      const start = path.getPointAtLength(0).matrixTransform(matrix)
      const end = path.getPointAtLength(path.getTotalLength()).matrixTransform(matrix)
      const sourceError = Math.hypot(start.x - sourceRect.right, start.y - (sourceRect.top + sourceRect.height / 2))
      const targetError = Math.hypot(end.x - targetRect.left, end.y - (targetRect.top + targetRect.height / 2))
      const scale = Math.hypot(matrix.a, matrix.b)
      const transform = new DOMMatrix(getComputedStyle(camera).transform)
      const region = document.querySelector<HTMLElement>('[data-arc-work-scope="nodes"]')
      const work = region?.getBoundingClientRect()
      const commit = (window as any).__arcCommitEvidence
      return {
        time: performance.now(), revision: Number(document.querySelector('[data-arc-live-stage]')?.getAttribute('data-revision')),
        x: local.x, y: local.y, width: sourceRect.width / scale, height: sourceRect.height / scale,
        scale, cameraX: transform.m41, cameraY: transform.m42,
        connectorError: Math.max(sourceError, targetError),
        workError: work ? Math.max(Math.abs(work.left - sourceRect.left + 10), Math.abs(work.top - sourceRect.top + 10), Math.abs(work.right - sourceRect.right - 10), Math.abs(work.bottom - sourceRect.bottom - 10)) : null,
        commits: commit.commits, diagramCommits: commit.diagramCommits,
      }
    }
  })
}

async function frame(): Promise<Frame> {
  const value = await page.evaluate(() => (window as any).__arcReadFrame())
  assert.ok(value, 'renderer geometry exists')
  return value
}

async function startFrames() {
  await page.evaluate(() => {
    const state = { running: true, frames: [] as unknown[], start: { ...(window as any).__arcCommitEvidence } }
    ;(window as any).__arcMotionSample = state
    const sample = () => {
      if (!state.running) return
      // Read after this frame's animation callbacks. Reading inside our own
      // rAF can precede Motion's newly scheduled callback after a jump and
      // falsely report a mismatch that is resolved before the same paint.
      setTimeout(() => {
        if (!state.running) return
        const frame = (window as any).__arcReadFrame()
        if (frame) state.frames.push(frame)
        requestAnimationFrame(sample)
      }, 0)
    }
    requestAnimationFrame(sample)
  })
}

async function stopFrames(name: string) {
  const result = await page.evaluate(() => {
    const state = (window as any).__arcMotionSample
    state.running = false
    const current = (window as any).__arcCommitEvidence
    return { frames: state.frames as Frame[], commits: current.commits - state.start.commits, diagramCommits: current.diagramCommits - state.start.diagramCommits }
  })
  evidence[name] = result
  assert.ok(result.frames.length >= 4, `${name}: enough rendered samples`)
  assert.ok(result.frames.every(f => [f.x, f.y, f.width, f.height, f.scale, f.connectorError].every(Number.isFinite)), `${name}: finite geometry`)
  assert.ok(Math.max(...result.frames.map(f => f.connectorError)) < 2, `${name}: connectors stay within 2 screen pixels of both boxes`)
  return result
}

async function waitForX(x: number) {
  await page.waitForFunction(expected => {
    const value = (window as any).__arcReadFrame?.()
    return value && Math.abs(value.x - expected) < 0.15
  }, {}, x)
}

async function update(diagram: ArcDiagramData, message: string) {
  return call('update_live_diagram', { sessionId, diagram, message })
}

async function matrixRunning() {
  return page.evaluate(() => document.getAnimations().filter(animation => {
    const element = (animation.effect as KeyframeEffect | null)?.target
    return element instanceof Element && !!element.closest('.arc-live-matrix') && animation.playState === 'running'
  }).length)
}

const drawing: ArcDiagramData = {
  id: 'motion-regression', layout: { width: 1120, height: 560 },
  nodes: { api: { x: 100, y: 180, size: 'm' }, db: { x: 800, y: 180, size: 'm' } },
  nodeData: { api: { name: 'Request router', icon: 'Server', color: 'emerald' }, db: { name: 'Review store', icon: 'Database', color: 'blue' } },
  connectors: [{ id: 'api-db', from: 'api', to: 'db', fromAnchor: 'right', toAnchor: 'left', style: 'request' }],
  connectorStyles: { request: { color: 'blue', strokeWidth: 2, label: 'Save', showEndpoints: true } },
}

try {
  await client.connect(transport)
  const opened = await call('open_live_diagram', { diagram: drawing, title: 'Motion library regression', agent: { harness: 'Codex', name: 'Browser verification' }, baseUrl })
  sessionId = opened.sessionId
  assert.equal(opened.actor.name, 'Arc Motion regression')
  await page.setViewport({ width: 1440, height: 960 })
  await page.goto(opened.liveUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-arc-node-id="api"]')
  await page.waitForFunction(() => document.querySelector('[data-arc-live-connection]')?.getAttribute('data-arc-live-connection') === 'connected')
  assert.ok(await page.$('[data-hudson-template="hudson"]'))
  await installSampler()
  await delay(700)
  assert.ok(await page.evaluate(() => (window as any).__arcCommitEvidence.renderers > 0), 'React commit instrumentation is connected')
  await page.evaluate(() => { (window as any).__arcOriginalNode = document.querySelector('[data-arc-node-id="api"]') })
  checks.push('fresh real MCP initialize, SSE snapshot and Hudson shell')

  const work = await call('begin_live_diagram_work', { sessionId, summary: 'Verify displayed node and connector motion', scope: { type: 'nodes', nodeIds: ['api'] } })
  await page.waitForSelector('[data-arc-work-scope="nodes"]')
  await delay(150)
  assert.ok(await matrixRunning() >= 15, 'working matrix uses active browser animations')
  const moved = structuredClone(drawing)
  Object.assign(moved.nodes.api, { x: 340, y: 230, width: 240, height: 110 })
  await startFrames()
  await update(moved, 'Move and resize the router')
  await waitForX(340)
  await delay(250)
  const move = await stopFrames('move')
  assert.ok(move.frames.some(f => f.x > 102 && f.x < 338), 'node visits intermediate transformed positions')
  assert.ok(move.frames.some(f => f.width > 162 && f.width < 238), 'custom node dimensions interpolate')
  assert.ok(move.frames.filter(f => f.workError !== null).every(f => f.workError! < 2), 'work scope follows displayed box geometry')
  assert.ok(move.commits <= 14, `geometry animation must not drive per-frame root commits (observed ${move.commits})`)
  assert.ok(move.diagramCommits <= 8, `ArcDiagram must not render every motion frame (observed ${move.diagramCommits})`)
  assert.equal(await page.evaluate(() => (window as any).__arcOriginalNode === document.querySelector('[data-arc-node-id="api"]')), true)
  checks.push('transformed node, custom size, connectors and work scope share displayed geometry without frame-driven React commits')
  await call('finish_live_diagram_work', { sessionId, workId: work.workId, message: 'Motion alignment verified' })
  await delay(150)
  assert.equal(await matrixRunning(), 0, 'finishing work cancels matrix playback')
  checks.push('explicit finish cancels working animations')

  const expanded = structuredClone(moved)
  expanded.layout.width = 1900
  expanded.nodes.worker = { x: 1550, y: 100, size: 'm' }
  expanded.nodeData.worker = { name: 'Saved review', icon: 'FileText', color: 'amber' }
  expanded.connectors.push({ id: 'db-worker', from: 'db', to: 'worker', fromAnchor: 'right', toAnchor: 'left', style: 'request' })
  const beforeExpansion = await frame()
  await startFrames()
  await update(expanded, 'Add saved review output')
  await page.waitForSelector('[data-arc-node-id="worker"]')
  await delay(1200)
  const growth = await stopFrames('growth')
  const afterExpansion = await frame()
  assert.ok(afterExpansion.scale < beforeExpansion.scale - 0.05, 'authored growth zooms out')
  assert.ok(growth.frames.some(f => f.scale < beforeExpansion.scale - 0.01 && f.scale > afterExpansion.scale + 0.01), 'camera visits intermediate zoom values')
  assert.ok(growth.commits <= 14, 'camera animation does not drive React commits')
  assert.equal(await page.evaluate(() => {
    const stage = document.querySelector('[data-arc-live-stage]')!.getBoundingClientRect()
    return Array.from(document.querySelectorAll('[data-arc-node-id]')).every(node => {
      const rect = node.getBoundingClientRect()
      return rect.left >= stage.left && rect.top >= stage.top && rect.right <= stage.right && rect.bottom <= stage.bottom
    })
  }), true, 'smart fit keeps every authored box in the visible stage')
  checks.push('growth smoothly fits all authored nodes without frame-driven camera commits')

  const rapid = structuredClone(expanded)
  rapid.nodes.api.x = 180
  await startFrames()
  await update(rapid, 'First rapid target')
  await delay(70)
  rapid.nodes.api.x = 440
  await update(rapid, 'Replace target while moving')
  await waitForX(440)
  await delay(200)
  const retarget = await stopFrames('retarget')
  assert.ok(retarget.frames.some(f => f.x > 185 && f.x < 430), 'rapid retarget preserves a moving trajectory')
  assert.ok(retarget.frames.slice(1).every((f, i) => Math.abs(f.x - retarget.frames[i].x) < 180), 'retarget does not reset to an authored endpoint')
  checks.push('rapid revisions retarget the existing moving box and attached path')

  const stage = await page.$eval('[data-arc-live-stage]', element => { const r = element.getBoundingClientRect(); return { x: r.left + r.width * 0.5, y: r.top + r.height * 0.85 } })
  await page.mouse.move(stage.x, stage.y)
  await page.mouse.down()
  await page.mouse.move(stage.x + 55, stage.y + 25, { steps: 5 })
  await page.mouse.up()
  await delay(150)
  const manuallyFramed = await frame()
  rapid.nodeData.api.name = 'Renamed request router'
  await update(rapid, 'Metadata only')
  await delay(350)
  const metadataFrame = await frame()
  evidence.manualCamera = { manuallyFramed, metadataFrame }
  assert.ok(Math.abs(manuallyFramed.cameraX - metadataFrame.cameraX) < 0.1 && Math.abs(manuallyFramed.cameraY - metadataFrame.cameraY) < 0.1, 'metadata revision preserves manual camera')
  checks.push('metadata-only updates preserve a manually positioned camera')

  const preferenceWork = await call('begin_live_diagram_work', { sessionId, summary: 'Verify motion preferences', scope: { type: 'nodes', nodeIds: ['api'] } })
  await page.waitForSelector('[data-arc-work-scope="nodes"]')
  await delay(100)
  assert.ok(await matrixRunning() >= 15)
  rapid.nodes.api.x = 60
  await update(rapid, 'Start movement before preference change')
  await delay(70)
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
  await waitForX(60)
  await delay(100)
  await startFrames()
  rapid.nodes.api.x = 260
  await update(rapid, 'Reduced motion target')
  await waitForX(260)
  await delay(120)
  const reduced = await stopFrames('reduced')
  assert.equal(reduced.frames.some(f => f.x > 61 && f.x < 259), false, 'reduced motion jumps directly to target')
  assert.equal(await matrixRunning(), 0)
  checks.push('system reduced motion snaps geometry and cancels active matrix playback')

  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }])
  await delay(100)
  assert.ok(await matrixRunning() >= 15, 'visible working matrix resumes when preference allows motion')
  await page.click('button[aria-label="Animate changes"]')
  await page.waitForSelector('[data-arc-live-motion="off"]')
  await delay(100)
  assert.equal(await matrixRunning(), 0, 'viewer toggle cancels active matrix playback')
  await startFrames()
  rapid.nodes.api.x = 380
  await update(rapid, 'Motion disabled target')
  await waitForX(380)
  await delay(120)
  const disabled = await stopFrames('disabled')
  assert.equal(disabled.frames.some(f => f.x > 261 && f.x < 379), false, 'motion toggle jumps directly to target')
  checks.push('viewer animation toggle snaps geometry')
  await call('finish_live_diagram_work', { sessionId, workId: preferenceWork.workId, message: 'Preferences verified' })

  await page.click('button[aria-label="Animate changes"]')
  const hiddenWork = await call('begin_live_diagram_work', { sessionId, summary: 'Verify visibility cleanup', scope: { type: 'nodes', nodeIds: ['api'] } })
  await page.waitForSelector('[data-arc-work-scope="nodes"]')
  await delay(150)
  assert.ok(await matrixRunning() >= 15)
  rapid.nodes.api.x = 100
  await update(rapid, 'Start movement before visibility changes')
  await delay(70)
  // Deterministically exercise the visibility boundary. A synthetic visibility
  // signal is recorded honestly; this is not a claim about OS background power.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await waitForX(100)
  rapid.nodes.api.x = 510
  await startFrames()
  await update(rapid, 'Hidden document target')
  await waitForX(510)
  await delay(120)
  const hidden = await stopFrames('hidden')
  assert.equal(hidden.frames.some(f => f.x > 101 && f.x < 509), false, 'hidden document snaps directly to target')
  assert.equal(await matrixRunning(), 0, 'hidden document cancels matrix browser animations')
  await page.evaluate(() => {
    delete (document as any).hidden
    delete (document as any).visibilityState
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await call('finish_live_diagram_work', { sessionId, workId: hiddenWork.workId, message: 'Visibility cleanup verified' })
  await delay(200)
  assert.ok(Math.abs((await frame()).x - 510) < 0.15, 'visibility restore does not revive stale geometry motion')
  assert.equal(await matrixRunning(), 0)
  checks.push('synthetic hidden/visible boundary cancels work animations and does not replay stale geometry')

  await call('end_live_diagram', { sessionId, message: 'Motion regression complete' })
  await delay(100)
  assert.deepEqual(errors, [], 'no renderer exceptions')
  await page.screenshot({ path: join(output, 'complete.png') })
  // Unmount the viewer while a second fresh session has active matrix playback.
  const cleanup = await call('open_live_diagram', { diagram: drawing, title: 'Unmount regression', baseUrl })
  sessionId = cleanup.sessionId
  await page.goto(cleanup.liveUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-arc-node-id="api"]')
  await call('begin_live_diagram_work', { sessionId, summary: 'Verify unmount cleanup', scope: { type: 'nodes', nodeIds: ['api'] } })
  await page.waitForSelector('[data-arc-work-scope="nodes"]')
  await delay(150)
  assert.ok(await matrixRunning() >= 15)
  const detached = await page.evaluate(() => {
    const animations = document.getAnimations().filter(animation => {
      const target = (animation.effect as KeyframeEffect | null)?.target
      return target instanceof Element && !!target.closest('.arc-live-matrix')
    })
    ;(window as any).__arcUnmountAnimations = animations
    history.pushState({}, '', location.pathname.replace(/\/live\/[^/]+$/, '/live'))
    dispatchEvent(new PopStateEvent('popstate'))
    return animations.length
  })
  await page.waitForSelector('.arc-live-empty')
  await delay(100)
  assert.ok(detached > 0)
  assert.equal(await page.evaluate(() => (window as any).__arcUnmountAnimations.filter((animation: Animation) => animation.playState === 'running').length), 0, 'unmounted matrices cancel retained animation handles')
  checks.push('viewer unmount cancels retained browser animation handles')
  await call('end_live_diagram', { sessionId, message: 'Unmount regression complete' })
  assert.deepEqual(errors, [])
  writeFileSync(join(output, 'motion-results.json'), JSON.stringify(evidence, null, 2))
  console.log(`PASS ${checks.length} Motion browser checks; evidence: ${output}`)
} catch (error) {
  evidence.failure = String(error)
  writeFileSync(join(output, 'motion-results.json'), JSON.stringify(evidence, null, 2))
  await page.screenshot({ path: join(output, 'failure.png') }).catch(() => undefined)
  throw error
} finally {
  await client.close().catch(() => undefined)
  await browser.close()
  rmSync(reviewDir, { recursive: true, force: true })
}
