#!/usr/bin/env bun
/**
 * Regenerate the README / landing live-review poster from the real live app.
 *
 *   bun scripts/generate-live-review-poster.ts            # writes public/arc-live-review-poster.jpg
 *   ARC_EDITOR_URL=http://localhost:5188 ARC_POSTER_OUT=/tmp/p.jpg bun scripts/generate-live-review-poster.ts
 *
 * Needs the Arc dev server running. Drives a fresh stdio MCP session through
 * the same three beats as the recorded demo (Request router → Review store →
 * Saved review), stops on the third beat's working revision, captures the
 * 1120×720 app surface in light mode, and frames it 1200×820 on the same
 * paper as the README hero, with one caption. It never opens or resumes a saved
 * review: the child MCP server gets an empty, temporary review directory.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import puppeteer from 'puppeteer'
import sharp from 'sharp'
import type { ArcDiagramData } from '../src/types/diagram'
import type { LiveWorkScope } from '../src/types/live'
import { normalizeLiveDiagram } from '../src/utils/liveDiagramValidation'
import { findChrome } from './renderImage'

const ROOT = resolve(import.meta.dir, '..')
const BASE_URL = process.env.ARC_EDITOR_URL || 'http://localhost:5188'
const OUTPUT = resolve(ROOT, process.env.ARC_POSTER_OUT || 'public/arc-live-review-poster.jpg')
const APP = { width: 1120, height: 720 }
const FRAME = { width: 1200, height: 820 }
/** Long enough for the springs and the auto-frame camera to come to rest. */
const SETTLE_MS = 2_400

type Beat = { id: string; summary: string; result: string; scope: LiveWorkScope; diagram: ArcDiagramData }

const initial: ArcDiagramData = {
  id: 'arc-mcp-recording-demo',
  layout: { width: 280, height: 220 },
  nodes: { agent: { x: 24, y: 64, size: 'l' } },
  nodeData: { agent: { kind: 'service', icon: 'Bot', color: 'emerald', name: 'Agent', subtitle: 'An architecture request' } },
  connectors: [],
  connectorStyles: {
    request: { color: 'emerald', strokeWidth: 2, label: 'MCP' },
    write: { color: 'blue', strokeWidth: 2, label: 'Revisions' },
    read: { color: 'violet', strokeWidth: 2, label: 'Reopen' },
  },
}
const routed = structuredClone(initial)
routed.layout = { width: 560, height: 220 }
routed.nodes.router = { x: 300, y: 64, size: 'l' }
routed.nodeData.router = { kind: 'gateway', name: 'Request router', subtitle: 'Validate each operation' }
routed.connectors.push({ id: 'agent-router', from: 'agent', to: 'router', fromAnchor: 'right', toAnchor: 'left', style: 'request' })

const stored = structuredClone(routed)
stored.layout = { width: 840, height: 220 }
stored.nodes.store = { x: 576, y: 64, size: 'l' }
stored.nodeData.store = { kind: 'database', name: 'Review store', subtitle: 'Keep each revision' }
stored.connectors.push({ id: 'router-store', from: 'router', to: 'store', fromAnchor: 'right', toAnchor: 'left', style: 'write' })

const reopened = structuredClone(stored)
// The last beat turns the row into a path that occupies the frame: down from
// the router, then across to the saved review. A drop under the store left
// the lower half of the canvas empty.
reopened.layout = { width: 820, height: 360 }
reopened.nodes.agent = { x: 24, y: 28, size: 'l' }
reopened.nodes.router = { x: 300, y: 28, size: 'l' }
reopened.nodes.store = { x: 300, y: 230, size: 'l' }
reopened.nodes.saved = { x: 576, y: 230, size: 'l' }
reopened.nodeData.saved = { kind: 'frontend', icon: 'FileCheck2', color: 'violet', name: 'Saved review', subtitle: 'One link to return to' }
reopened.connectors = reopened.connectors.map(connector =>
  connector.id === 'router-store' ? { ...connector, fromAnchor: 'bottom', toAnchor: 'top' } : connector)
reopened.connectors.push({ id: 'store-saved', from: 'store', to: 'saved', fromAnchor: 'right', toAnchor: 'left', style: 'read' })

const beats: Beat[] = [
  { id: 'route', summary: 'Demo · Add the request router', result: 'Request router connected', scope: { type: 'region', x: 284, y: 48, width: 252, height: 122 }, diagram: routed },
  { id: 'persist', summary: 'Demo · Make room for durable storage', result: 'Review store connected; request path aligned', scope: { type: 'region', x: 560, y: 48, width: 252, height: 122 }, diagram: stored },
  { id: 'reopen', summary: 'Demo · Add the saved review and arrange the flow', result: 'Saved review connected; layout complete', scope: { type: 'region', x: 560, y: 214, width: 252, height: 122 }, diagram: reopened },
]

const reviewDir = mkdtempSync(join(tmpdir(), 'arc-poster-reviews-'))
const env = Object.fromEntries(Object.entries({ ...process.env, ARC_EDITOR_URL: BASE_URL, ARC_REVIEW_DIR: reviewDir })
  .filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
delete env.ARC_MCP_TOKEN
const transport = new StdioClientTransport({ command: process.execPath, args: ['packages/mcp/src/server.ts'], cwd: ROOT, env, stderr: 'pipe' })
transport.stderr?.on('data', () => undefined)
const client = new Client({ name: 'Arc recording demo', version: '1.0.0' }, { capabilities: {} })
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true })

async function call(name: string, args: Record<string, unknown>) {
  const began = performance.now()
  const result = await client.callTool({ name, arguments: args })
  const text = (result.content as Array<{ type: string; text?: string }>).find(item => item.type === 'text')?.text
  if (!text) throw new Error(`${name} returned no JSON text`)
  const payload = JSON.parse(text) as Record<string, unknown>
  if (result.isError || payload.ok !== true) throw new Error(`${name}: ${text}`)
  return { ...payload, durationMs: Math.max(1, Math.round(performance.now() - began)) }
}

const escape = (value: string) => value.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

try {
  await client.connect(transport)
  const opened = await call('open_live_diagram', {
    diagram: normalizeLiveDiagram(initial), title: 'Arc · Live architecture demo', baseUrl: BASE_URL,
    agent: { harness: 'Codex', name: 'Architecture demo' },
  })
  if (typeof opened.sessionId !== 'string' || typeof opened.liveUrl !== 'string') throw new Error('MCP did not return a live session URL')
  const sessionId = opened.sessionId

  const page = await browser.newPage()
  await page.setViewport({ ...APP, deviceScaleFactor: 2 })
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }])
  const url = new URL(opened.liveUrl)
  url.searchParams.set('theme', 'light')
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-arc-node-id="agent"]')
  await page.waitForFunction(() => document.querySelector('[data-arc-live-connection]')?.getAttribute('data-arc-live-connection') === 'connected')
  await delay(800)

  let last: { tool: string; detail: string; beat: string; receipt: string } | undefined
  for (const [index, beat] of beats.entries()) {
    const begun = await call('begin_live_diagram_work', { sessionId, summary: beat.summary, scope: beat.scope })
    await delay(600)
    const updated = await call('update_live_diagram', { sessionId, diagram: normalizeLiveDiagram(beat.diagram), message: `Demo · ${beat.result}` })
    const label = beat.diagram.nodeData[Object.keys(beat.diagram.nodes).at(-1)!].name
    last = { tool: 'update_live_diagram', detail: beat.result, beat: `${String(index + 1).padStart(2, '0')} / ${label}`, receipt: `r${updated.revision} · working · ${updated.durationMs} ms` }
    // The poster is the last beat's working revision: the region, its label
    // and the new box are all on screen at once.
    if (index === beats.length - 1) break
    await delay(SETTLE_MS / 2)
    await call('finish_live_diagram_work', { sessionId, workId: begun.workId, message: `Demo · ${beat.result}` })
    await delay(400)
  }
  await page.waitForSelector('[data-arc-node-id="saved"]')
  await page.waitForSelector('[data-arc-work-scope="region"]')
  await delay(SETTLE_MS)
  // Hold the working matrix on a lit frame rather than an arbitrary phase.
  await page.evaluate(() => document.getAnimations().forEach(animation => { animation.pause(); animation.currentTime = 220 }))
  const app = await page.screenshot({ type: 'png' }) as Uint8Array

  const frame = await browser.newPage()
  await frame.setViewport({ ...FRAME, deviceScaleFactor: 1 })
  await frame.setContent(`<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&family=JetBrains+Mono:wght@400&display=block" rel="stylesheet">
<style>
* { box-sizing:border-box; margin:0; padding:0; }
html,body { width:${FRAME.width}px; height:${FRAME.height}px; overflow:hidden; background:#f4f1ea; color:#20272b; font-family:"Inter",sans-serif; }
.capture { position:absolute; left:40px; top:32px; width:${APP.width}px; height:${APP.height}px; outline:1px solid #d9d3c6; background:#f8f8f5; }
.capture img { display:block; width:100%; height:100%; }
.caption { position:absolute; left:40px; top:764px; width:${APP.width}px; display:flex; justify-content:space-between; align-items:baseline; font-family:"JetBrains Mono",monospace; font-size:12px; line-height:16px; color:#59636b; }
.caption strong { color:#20272b; font-weight:500; letter-spacing:-0.02em; }
.receipt { color:#33624e; }
</style></head><body>
<div class="capture"><img src="data:image/png;base64,${Buffer.from(app).toString('base64')}" alt=""></div>
<p class="caption"><span><strong>${escape(last!.tool)}</strong> · ${escape(last!.detail)}</span><span class="receipt">${escape(last!.beat)} · ${escape(last!.receipt)}</span></p>
</body></html>`, { waitUntil: 'networkidle0' })
  await frame.evaluate(() => document.fonts.ready)
  const composed = await frame.screenshot({ type: 'png' }) as Uint8Array
  await sharp(composed).jpeg({ quality: 88, mozjpeg: true }).toFile(OUTPUT)
  await call('end_live_diagram', { sessionId, message: 'Poster capture complete' }).catch(() => undefined)
  console.log(`Wrote ${OUTPUT} (${FRAME.width}×${FRAME.height})`)
} finally {
  await client.close().catch(() => undefined)
  await browser.close()
  rmSync(reviewDir, { recursive: true, force: true })
}
