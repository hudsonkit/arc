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
 * 1120×780 app surface in light mode, and frames it 1280×960 with the
 * recording's heading and MCP call rail. It never opens or resumes a saved
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
const APP = { width: 1120, height: 780 }
const FRAME = { width: 1280, height: 960 }
/** Long enough for the springs and the auto-frame camera to come to rest. */
const SETTLE_MS = 2_400

type Beat = { id: string; summary: string; result: string; scope: LiveWorkScope; diagram: ArcDiagramData }

const initial: ArcDiagramData = {
  id: 'arc-mcp-recording-demo',
  layout: { width: 460, height: 430 },
  nodes: { agent: { x: 80, y: 200, size: 'l' } },
  nodeData: { agent: { kind: 'service', icon: 'Bot', color: 'emerald', name: 'Agent', subtitle: 'An architecture request' } },
  connectors: [],
  connectorStyles: {
    request: { color: 'emerald', strokeWidth: 2, label: 'MCP' },
    write: { color: 'blue', strokeWidth: 2, label: 'Revisions' },
    read: { color: 'violet', strokeWidth: 2, label: 'Reopen' },
  },
}
const routed = structuredClone(initial)
routed.layout = { width: 780, height: 430 }
routed.nodes.router = { x: 480, y: 200, size: 'l' }
routed.nodeData.router = { kind: 'gateway', name: 'Request router', subtitle: 'Validate each operation' }
routed.connectors.push({ id: 'agent-router', from: 'agent', to: 'router', fromAnchor: 'right', toAnchor: 'left', style: 'request' })

const stored = structuredClone(routed)
stored.layout = { width: 1160, height: 430 }
stored.nodes.agent.x = 40
stored.nodes.router.x = 440
stored.nodes.store = { x: 840, y: 200, size: 'l' }
stored.nodeData.store = { kind: 'database', name: 'Review store', subtitle: 'Keep each revision' }
stored.connectors.push({ id: 'router-store', from: 'router', to: 'store', fromAnchor: 'right', toAnchor: 'left', style: 'write' })

const reopened = structuredClone(stored)
reopened.layout = { width: 1160, height: 640 }
for (const id of ['agent', 'router', 'store']) reopened.nodes[id].y = 120
reopened.nodes.saved = { x: 840, y: 440, size: 'l' }
reopened.nodeData.saved = { kind: 'frontend', icon: 'FileCheck2', color: 'violet', name: 'Saved review', subtitle: 'One link to return to' }
reopened.connectors.push({ id: 'store-saved', from: 'store', to: 'saved', fromAnchor: 'bottom', toAnchor: 'top', style: 'read' })

const beats: Beat[] = [
  { id: 'route', summary: 'Demo · Add the request router', result: 'Request router connected', scope: { type: 'region', x: 440, y: 160, width: 300, height: 170 }, diagram: routed },
  { id: 'persist', summary: 'Demo · Make room for durable storage', result: 'Review store connected; request path aligned', scope: { type: 'region', x: 800, y: 160, width: 300, height: 170 }, diagram: stored },
  { id: 'reopen', summary: 'Demo · Add the saved review and arrange the flow', result: 'Saved review connected; layout complete', scope: { type: 'region', x: 800, y: 400, width: 300, height: 170 }, diagram: reopened },
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
html,body { width:${FRAME.width}px; height:${FRAME.height}px; overflow:hidden; background:#eff0ec; color:#20272b; font-family:"Inter",sans-serif; }
.heading { position:absolute; top:23px; left:80px; width:1120px; display:flex; align-items:center; justify-content:space-between; }
.title { font-size:19px; line-height:24px; letter-spacing:-0.035em; font-weight:700; }
.context, .call-label { font-family:"JetBrains Mono",monospace; font-size:10px; line-height:20px; color:#59636b; letter-spacing:0.09em; }
.capture { position:absolute; left:80px; top:64px; width:${APP.width}px; height:${APP.height}px; outline:1px solid #cbd1ce; background:#f8f8f5; }
.capture img { display:block; width:100%; height:100%; }
.rail { position:absolute; left:80px; top:866px; width:1120px; height:76px; border-top:1px solid #cbd1ce; display:flex; align-items:center; justify-content:space-between; }
.primary { display:grid; grid-template-columns:142px 1fr; column-gap:16px; row-gap:6px; align-items:baseline; }
.call-label { grid-row:1 / 3; letter-spacing:0.07em; }
.tool { font-family:"JetBrains Mono",monospace; font-size:18px; line-height:22px; letter-spacing:-0.03em; }
.detail { grid-column:2; font-size:12px; line-height:16px; color:#4b5961; }
.meta { display:flex; flex-direction:column; align-items:flex-end; gap:7px; font-family:"JetBrains Mono",monospace; font-size:11px; line-height:16px; }
.beat { color:#39464d; } .receipt { color:#33624e; }
</style></head><body>
<header class="heading"><h1 class="title">Arc · Live architecture · Light</h1><p class="context">RECORDED APP · REAL MCP CALLS · REAL-TIME PLAYBACK</p></header>
<div class="capture"><img src="data:image/png;base64,${Buffer.from(app).toString('base64')}" alt=""></div>
<div class="rail"><div class="primary"><span class="call-label">MCP / LATEST CALL</span><span class="tool">${escape(last!.tool)}</span><span class="detail">${escape(last!.detail)}</span></div>
<div class="meta"><span class="beat">${escape(last!.beat)}</span><span class="receipt">${escape(last!.receipt)}</span></div></div>
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
