/**
 * Local review aid: real stdio MCP updates for the Arc live view.
 * Run `bun scripts/liveDiagram.demo.ts` with the Arc studio running.
 * ARC_EDITOR_URL defaults to http://127.0.0.1:5188 and may include /arc.
 * This is an illustrative demo, not evidence about a running application's architecture.
 */
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import type { ArcDiagramData } from '../src/types/diagram'
import { normalizeLiveDiagram } from '../src/utils/liveDiagramValidation'

const DEFAULT_EDITOR_URL = 'http://127.0.0.1:5188'
const OPENING_PAUSE_MS = 12_000
const PHASE_PAUSE_MS = 5_000

interface DemoPhase {
  message: string
  diagram: ArcDiagramData
}

const requestPath: ArcDiagramData = {
  layout: { width: 680, height: 380 },
  nodes: {
    web: { x: 70, y: 160, size: 'm' },
    api: { x: 390, y: 160, size: 'm' },
  },
  nodeData: {
    web: { kind: 'frontend', name: 'Web app', subtitle: 'The request starts here' },
    api: { kind: 'backend', name: 'API service', subtitle: 'Handles requests' },
  },
  connectors: [
    { id: 'web-api', from: 'web', to: 'api', fromAnchor: 'right', toAnchor: 'left', style: 'request' },
  ],
  connectorStyles: {
    request: { color: 'violet', strokeWidth: 2, label: 'HTTPS' },
  },
}

const persistence = structuredClone(requestPath)
persistence.layout = { width: 880, height: 420 }
persistence.nodes.web = { x: 50, y: 180, size: 'm' }
persistence.nodes.api = { x: 330, y: 180, size: 'm' }
persistence.nodes.db = { x: 650, y: 180, size: 'm' }
persistence.nodeData.db = { kind: 'database', name: 'Postgres', subtitle: 'Durable application data' }
persistence.connectorStyles.storage = { color: 'blue', strokeWidth: 2, label: 'SQL' }
persistence.connectors.push({ id: 'api-db', from: 'api', to: 'db', fromAnchor: 'right', toAnchor: 'left', style: 'storage' })

const backgroundJobs = structuredClone(persistence)
backgroundJobs.layout = { width: 900, height: 520 }
backgroundJobs.nodes.web.y = 120
backgroundJobs.nodes.api.y = 120
backgroundJobs.nodes.db.y = 120
backgroundJobs.nodes.queue = { x: 330, y: 350, size: 'm' }
backgroundJobs.nodes.worker = { x: 650, y: 350, size: 'm' }
backgroundJobs.nodeData.queue = { kind: 'queue', name: 'Job queue', subtitle: 'Work that can wait' }
backgroundJobs.nodeData.worker = { kind: 'service', name: 'Worker', subtitle: 'Processes queued jobs', color: 'amber' }
backgroundJobs.connectorStyles.jobs = { color: 'amber', strokeWidth: 2, label: 'Jobs' }
backgroundJobs.connectors.push(
  { id: 'api-queue', from: 'api', to: 'queue', fromAnchor: 'bottom', toAnchor: 'top', style: 'jobs' },
  { id: 'queue-worker', from: 'queue', to: 'worker', fromAnchor: 'right', toAnchor: 'left', style: 'jobs' },
  { id: 'worker-db', from: 'worker', to: 'db', fromAnchor: 'top', toAnchor: 'bottom', style: 'storage' },
)

const cachedReads = structuredClone(backgroundJobs)
cachedReads.layout = { width: 920, height: 550 }
cachedReads.nodes.web.y = 210
cachedReads.nodes.api.y = 210
cachedReads.nodes.db.y = 210
cachedReads.nodes.queue.y = 390
cachedReads.nodes.worker.y = 390
cachedReads.nodes.cache = { x: 330, y: 50, size: 'm' }
cachedReads.nodeData.cache = { kind: 'cache', name: 'Cache', subtitle: 'Frequently requested data' }
cachedReads.connectorStyles.cache = { color: 'emerald', strokeWidth: 2, label: 'Read through' }
cachedReads.connectors.push({ id: 'api-cache', from: 'api', to: 'cache', fromAnchor: 'top', toAnchor: 'bottom', style: 'cache' })

/** Exported so the scenes can be validated without launching a process or relay. */
export const liveDemoPhases: readonly DemoPhase[] = [
  { message: 'Demo 1/4 · Start with the web request path', diagram: requestPath },
  { message: 'Demo 2/4 · Add durable storage', diagram: persistence },
  { message: 'Demo 3/4 · Move background work into a queue', diagram: backgroundJobs },
  { message: 'Demo 4/4 · Add a cache for frequent reads', diagram: cachedReads },
].map(phase => ({ ...phase, diagram: normalizeLiveDiagram(phase.diagram) }))

export async function runLiveDiagramDemo(): Promise<void> {
  if (!process.versions.bun) throw new Error('Run this preview with bun scripts/liveDiagram.demo.ts')
  const baseUrl = process.env.ARC_EDITOR_URL || DEFAULT_EDITOR_URL
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['packages/mcp/src/server.ts'],
    cwd: join(import.meta.dir, '..'),
    env: { ...process.env, ARC_EDITOR_URL: baseUrl },
    stderr: 'inherit',
  })
  // This is the actual initialize identity of this demonstration client.
  const client = new Client({ name: 'Arc preview demo', version: '1.0.0' }, { capabilities: {} })
  const stop = new AbortController()
  const requestStop = () => stop.abort()
  process.once('SIGINT', requestStop)
  process.once('SIGTERM', requestStop)
  let sessionId: string | undefined

  async function call(name: string, args: Record<string, unknown>) {
    const result = await client.callTool({ name, arguments: args })
    const content = Array.isArray(result.content)
      ? result.content.find(item => item.type === 'text')
      : undefined
    if (!content || content.type !== 'text') throw new Error(`${name} returned no JSON text`)
    const payload = JSON.parse(content.text) as Record<string, unknown>
    if (result.isError || payload.ok !== true) throw new Error(`${name}: ${content.text}`)
    return payload
  }

  try {
    await client.connect(transport)
    const available = new Set((await client.listTools()).tools.map(tool => tool.name))
    for (const tool of ['open_live_diagram', 'update_live_diagram', 'end_live_diagram']) {
      if (!available.has(tool)) throw new Error(`Connected MCP server does not expose ${tool}`)
    }
    const opened = await call('open_live_diagram', {
      title: 'Arc live preview',
      diagram: normalizeLiveDiagram(liveDemoPhases[0].diagram),
    })
    if (typeof opened.sessionId !== 'string' || typeof opened.liveUrl !== 'string') {
      throw new Error('The MCP server did not return a live session URL')
    }
    sessionId = opened.sessionId
    console.log(`Arc live preview — illustrative MCP demo\n${opened.liveUrl}`)
    console.log('Open this URL in the local studio. The four-phase demo starts in 12 seconds and repeats until Ctrl+C.')
    await call('update_live_diagram', {
      sessionId, diagram: normalizeLiveDiagram(liveDemoPhases[0].diagram), message: liveDemoPhases[0].message,
    })
    await delay(OPENING_PAUSE_MS, undefined, { signal: stop.signal })
    let index = 1
    while (!stop.signal.aborted) {
      const phase = liveDemoPhases[index]
      await call('update_live_diagram', {
        sessionId, diagram: normalizeLiveDiagram(phase.diagram), message: phase.message,
      })
      console.log(phase.message)
      index = (index + 1) % liveDemoPhases.length
      await delay(PHASE_PAUSE_MS, undefined, { signal: stop.signal })
    }
  } catch (error) {
    if (!stop.signal.aborted) throw error
  } finally {
    if (sessionId) {
      try {
        await call('end_live_diagram', { sessionId, message: 'Demo stopped · Arc live preview complete' })
      } catch (error) {
        console.error('Could not mark the demo complete:', error instanceof Error ? error.message : error)
      }
    }
    await client.close()
    process.off('SIGINT', requestStop)
    process.off('SIGTERM', requestStop)
  }
}

if (import.meta.main) {
  runLiveDiagramDemo().catch(error => {
    console.error('Arc live preview failed:', error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
