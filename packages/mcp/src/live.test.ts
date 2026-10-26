import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { join } from 'node:path'
import { LiveDiagramHub, startLocalLiveService } from './live.ts'
import { createArcHttpHandler } from './http-server.ts'
import type { LiveDiagramSnapshot, LiveWorkScope } from '../../../src/types/live.ts'
import type { ArcDiagramData } from '../../../src/types/diagram.ts'

const diagram = {
  layout: { width: 640, height: 320 },
  nodes: { api: { x: 80, y: 100, size: 'm' } },
  nodeData: { api: { kind: 'backend', name: 'API' } },
  connectors: [], connectorStyles: {},
}
const actor = { name: 'Test harness', version: '1.2', id: 'connection-a' }
const origin = 'https://hudson.test'
const cleanup: Array<() => void | Promise<void>> = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })

function hub() {
  const value = new LiveDiagramHub()
  cleanup.push(() => value.close())
  return value
}

function resultJson(result: Awaited<ReturnType<Client['callTool']>>) {
  if (!Array.isArray(result.content) || result.content[0]?.type !== 'text') throw new Error('Expected MCP text')
  return JSON.parse(result.content[0].text)
}

async function snapshot(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<LiveDiagramSnapshot> {
  const frame = await reader.read()
  if (frame.done) throw new Error('Stream ended before snapshot')
  const text = new TextDecoder().decode(frame.value)
  expect(text).toContain('event: snapshot\n')
  return JSON.parse(text.match(/data: (.+)/)![1])
}

describe('live diagram hub', () => {
  test('explicit work spans revisions, reconnects, and finishes into a reusable idle view', async () => {
    const live = hub()
    const opened = live.open(diagram, actor)
    expect(opened.status).toBe('idle')
    expect(opened.work).toBeUndefined()
    const url = live.streamUrl(opened.sessionId, actor.id, 'http://relay.test')
    const reader = live.handleRequest(new Request(url)).body!.getReader()
    await snapshot(reader)
    const scope: LiveWorkScope = { type: 'nodes', nodeIds: ['api'] }
    const begun = live.beginWork(opened.sessionId, actor.id, '  Move the API  ', scope)
    const work = begun.work!
    expect(work).toMatchObject({ summary: 'Move the API', scope, status: 'working' })
    expect(work.finishedAt).toBeUndefined()
    expect(await snapshot(reader)).toMatchObject({ revision: 2, status: 'working', work })
    scope.nodeIds.push('not-published')
    const moved = structuredClone(diagram)
    moved.nodes.api.x = 240
    const update = live.update(opened.sessionId, actor.id, moved, 'API repositioned')
    expect(update.work!.scope).toEqual({ type: 'nodes', nodeIds: ['api'] })
    expect(await snapshot(reader)).toMatchObject({ revision: 3, status: 'working', work: { id: work.id } })
    await reader.cancel()
    const reconnected = live.handleRequest(new Request(url)).body!.getReader()
    expect(await snapshot(reconnected)).toMatchObject({ revision: 3, status: 'working', diagram: moved, work: { id: work.id } })
    const finished = live.finishWork(opened.sessionId, actor.id, work.id, 'API layout checked')
    expect(finished.work!.finishedAt).toBeString()
    expect(await snapshot(reconnected)).toMatchObject({ revision: 4, status: 'idle', work: { id: work.id, status: 'complete' } })
    const standalone = live.update(opened.sessionId, actor.id, moved)
    expect(standalone.status).toBe('idle')
    expect(standalone.work).toBeUndefined()
    const standaloneFrame = await snapshot(reconnected)
    expect(standaloneFrame).toMatchObject({ revision: 5, status: 'idle' })
    expect(standaloneFrame.work).toBeUndefined()
    const next = live.beginWork(opened.sessionId, actor.id, 'Plan a worker', { type: 'region', x: 420, y: 100, width: 200, height: 120 })
    expect(next.work!.id).not.toBe(work.id)
    expect(await snapshot(reconnected)).toMatchObject({ revision: 6, status: 'working', work: next.work })
    expect(() => live.finishWork(opened.sessionId, actor.id, work.id)).toThrow('workId')
    expect(() => live.beginWork(opened.sessionId, actor.id, 'Replace active work')).toThrow('already has active work')
    const final = live.complete(opened.sessionId, actor.id, 'Architecture complete')
    expect(await snapshot(reconnected)).toMatchObject({ revision: 7, status: 'complete', work: { id: next.work!.id, status: 'complete' } })
    expect(final.work!.finishedAt).toBeString()
    expect(() => live.beginWork(opened.sessionId, actor.id, 'Too late')).toThrow('complete')
    expect(() => live.finishWork(opened.sessionId, actor.id, next.work!.id)).toThrow('workId')
    await reconnected.cancel()
  })

  test('invalid work declarations and foreign owners preserve the last revision', async () => {
    const live = hub()
    const opened = live.open(diagram, actor)
    const invalidScopes: unknown[] = [
      null, [], { type: 'other' }, { type: 'canvas', nodeIds: ['api'] },
      { type: 'nodes', nodeIds: [] }, { type: 'nodes', nodeIds: ['missing'] },
      { type: 'nodes', nodeIds: ['api', 'api'] }, { type: 'nodes', nodeIds: [null] },
      { type: 'nodes', nodeIds: ['x'.repeat(201)] }, { type: 'nodes', nodeIds: Array(201).fill('api') },
      ...[NaN, Infinity, -Infinity, 100_001].map(x => ({ type: 'region', x, y: 0, width: 100, height: 100 })),
      ...[0, -1, Infinity, 100_001].map(width => ({ type: 'region', x: 0, y: 0, width, height: 100 })),
      { type: 'region', x: 0, y: 0, width: 100, height: 0 },
    ]
    for (const scope of invalidScopes) {
      expect(() => live.beginWork(opened.sessionId, actor.id, 'Plan work', scope as LiveWorkScope)).toThrow()
    }
    for (const summary of ['', '  ', 'x'.repeat(501), 'Bad\nsummary']) {
      expect(() => live.beginWork(opened.sessionId, actor.id, summary)).toThrow('summary')
    }
    expect(() => live.beginWork(opened.sessionId, 'connection-b', 'Foreign work')).toThrow('not found')
    expect(() => live.finishWork(opened.sessionId, actor.id, 'no-work')).toThrow('workId')
    const reader = live.handleRequest(new Request(live.streamUrl(opened.sessionId, actor.id, 'http://relay.test'))).body!.getReader()
    expect(await snapshot(reader)).toEqual(opened)
    const begun = live.beginWork(opened.sessionId, actor.id, 'Inspect architecture')
    expect(begun.work!.scope).toEqual({ type: 'canvas' })
    expect(await snapshot(reader)).toMatchObject({ revision: 2, work: begun.work })
    expect(() => live.finishWork(opened.sessionId, 'connection-b', begun.work!.id)).toThrow('not found')
    const done = live.finishWork(opened.sessionId, actor.id, begun.work!.id)
    expect(done.revision).toBe(3)
    expect(await snapshot(reader)).toMatchObject({ revision: 3, status: 'idle' })
    expect(() => live.finishWork(opened.sessionId, actor.id, begun.work!.id)).toThrow('workId')
    await reader.cancel()
  })

  test('declared work survives eight seconds, valid updates renew its lease, and expiry interrupts', async () => {
    const time = spyOn(Date, 'now').mockReturnValue(1000)
    cleanup.push(() => { time.mockRestore() })
    const live = hub()
    const opened = live.open(diagram, actor)
    const begun = live.beginWork(opened.sessionId, actor.id, 'Inspect dependencies')
    const url = live.streamUrl(opened.sessionId, actor.id, 'http://relay.test')
    time.mockReturnValue(10_000)
    live.sweep()
    const reader = live.handleRequest(new Request(url)).body!.getReader()
    expect(await snapshot(reader)).toMatchObject({ revision: 2, status: 'working', work: begun.work })
    time.mockReturnValue(299_000)
    const updated = live.update(opened.sessionId, actor.id, diagram)
    expect(updated.work).toEqual(begun.work)
    expect(await snapshot(reader)).toMatchObject({ revision: 3, status: 'working' })
    time.mockReturnValue(598_999)
    live.sweep()
    expect(() => live.update(opened.sessionId, actor.id, { bad: true })).toThrow()
    time.mockReturnValue(599_000)
    live.sweep()
    expect(await snapshot(reader)).toMatchObject({
      revision: 4, status: 'idle', work: { id: begun.work!.id, status: 'interrupted', finishedAt: new Date(599_000).toISOString() },
    })
    expect(() => live.finishWork(opened.sessionId, actor.id, begun.work!.id)).toThrow('workId')
    expect(live.hasActiveOwner(actor.id)).toBe(true)
    const next = live.beginWork(opened.sessionId, actor.id, 'Resume inspection')
    expect(next.revision).toBe(5)
    expect(next.work!.id).not.toBe(begun.work!.id)
    expect(await snapshot(reader)).toMatchObject({ revision: 5, status: 'working' })
    await reader.cancel()
  })

  test('late updates and finish calls cannot revive an expired work lease before the timer sweeps', async () => {
    const time = spyOn(Date, 'now').mockReturnValue(1000)
    cleanup.push(() => { time.mockRestore() })
    const live = new LiveDiagramHub({ workLeaseMs: 100 })
    cleanup.push(() => live.close())
    const first = live.open(diagram, actor)
    const work = live.beginWork(first.sessionId, actor.id, 'Inspect API')
    time.mockReturnValue(1100)
    expect(() => live.finishWork(first.sessionId, actor.id, work.work!.id)).toThrow('workId')
    const idle = live.update(first.sessionId, actor.id, diagram)
    expect(idle).toMatchObject({ revision: 4, status: 'idle' })
    expect(idle.work).toBeUndefined()
    const second = live.open(diagram, actor)
    live.beginWork(second.sessionId, actor.id, 'Inspect API')
    time.mockReturnValue(1200)
    const lateUpdate = live.update(second.sessionId, actor.id, diagram)
    expect(lateUpdate).toMatchObject({ revision: 4, status: 'idle' })
    expect(lateUpdate.work).toBeUndefined()
  })

  test('disconnect interrupts active work without claiming completion or allowing further writes', async () => {
    const live = hub()
    const opened = live.open(diagram, actor)
    const begun = live.beginWork(opened.sessionId, actor.id, 'Inspect API')
    const url = live.streamUrl(opened.sessionId, actor.id, 'http://relay.test')
    const reader = live.handleRequest(new Request(url)).body!.getReader()
    await snapshot(reader)
    live.disconnect(actor.id)
    const interrupted = await snapshot(reader)
    expect(interrupted).toMatchObject({ revision: 3, status: 'idle', work: { id: begun.work!.id, status: 'interrupted' } })
    expect(interrupted.work!.finishedAt).toBeString()
    expect(() => live.update(opened.sessionId, actor.id, diagram)).toThrow('not found')
    expect(() => live.finishWork(opened.sessionId, actor.id, begun.work!.id)).toThrow('not found')
    expect(() => live.beginWork(opened.sessionId, actor.id, 'Resume')).toThrow('not found')
    expect(() => live.complete(opened.sessionId, actor.id)).toThrow('not found')
    await reader.cancel()
  })

  test('publishes ordered revisions and reconnects directly to current full state', async () => {
    const live = hub()
    const opened = live.open(diagram, actor, { baseUrl: `${origin}/arc`, title: 'Services' })
    const url = live.streamUrl(opened.sessionId, actor.id, 'http://relay.test')
    const response = live.handleRequest(new Request(url, { headers: { origin } }))
    expect(response.headers.get('access-control-allow-origin')).toBe(origin)
    const reader = response.body!.getReader()
    expect(await snapshot(reader)).toMatchObject({ revision: 1, actor, title: 'Services', status: 'idle' })
    const moved = structuredClone(diagram)
    moved.nodes.api.x = 200
    live.update(opened.sessionId, actor.id, moved, 'Moving API')
    expect(await snapshot(reader)).toMatchObject({ revision: 2, status: 'idle', message: 'Moving API', diagram: { nodes: { api: { x: 200 } } } })
    await reader.cancel()
    const reconnect = live.handleRequest(new Request(url, { headers: { 'last-event-id': '1' } })).body!.getReader()
    expect(await snapshot(reconnect)).toMatchObject({ revision: 2, diagram: moved })
    live.complete(opened.sessionId, actor.id, 'Ready')
    expect(await snapshot(reconnect)).toMatchObject({ revision: 3, status: 'complete', message: 'Ready' })
    expect(() => live.update(opened.sessionId, actor.id, diagram)).toThrow('complete')
    await reconnect.cancel()
    const viewer = new URL(live.viewerUrl(opened.sessionId, actor.id, 'http://relay.test', `${origin}/arc`))
    expect(viewer.pathname).toBe(`/arc/live/${opened.sessionId}`)
    expect(new URLSearchParams(viewer.hash.slice(1)).get('stream')).toBe(url)
  })

  test('rejects invalid updates and isolates owners, tokens, and origins', async () => {
    const live = hub()
    const opened = live.open(diagram, actor, { baseUrl: origin })
    expect(() => live.update(opened.sessionId, actor.id, { ...diagram, nodes: { api: { x: 'bad', y: 100, size: 'm' } } })).toThrow()
    expect(() => live.update(opened.sessionId, 'connection-b', diagram)).toThrow('not found')
    expect(() => live.complete(opened.sessionId, 'connection-b')).toThrow('not found')
    const url = live.streamUrl(opened.sessionId, actor.id, 'http://relay.test')
    const response = live.handleRequest(new Request(url))
    const reader = response.body!.getReader()
    expect(await snapshot(reader)).toMatchObject({ revision: 1, diagram })
    await reader.cancel()
    expect(live.handleRequest(new Request(url, { headers: { origin: 'https://evil.test' } })).status).toBe(403)
    const badToken = new URL(url)
    badToken.searchParams.set('token', 'wrong')
    expect(live.handleRequest(new Request(badToken)).status).toBe(404)
    const other = live.open(diagram, { ...actor, id: 'connection-b' })
    badToken.pathname = `/live/${other.sessionId}/events`
    badToken.search = new URL(url).search
    expect(live.handleRequest(new Request(badToken)).status).toBe(404)
  })

  test('normalizes omitted collections and refuses geometry the live renderer cannot display', async () => {
    const live = hub()
    const { connectors: _connectors, connectorStyles: _styles, ...minimal } = diagram
    const opened = live.open(minimal, actor)
    expect(opened.diagram.connectors).toEqual([])
    expect(opened.diagram.connectorStyles).toEqual({})
    const malformed = [
      { ...diagram, layout: { width: -1, height: 320 } },
      { ...diagram, layout: { width: 640, height: 0 } },
      { ...diagram, layout: { width: Infinity, height: 320 } },
      { ...diagram, nodes: { api: { x: 80, y: 100, size: 'enormous' } } },
      { ...diagram, nodes: { api: { x: 80, y: NaN, size: 'm' } } },
      { ...diagram, nodes: { api: { x: 80, y: 100, size: 'm', width: -10 } } },
    ]
    for (const value of malformed) {
      expect(() => live.update(opened.sessionId, actor.id, value)).toThrow()
    }
    const reader = live.handleRequest(new Request(live.streamUrl(opened.sessionId, actor.id, 'http://relay.test'))).body!.getReader()
    expect(await snapshot(reader)).toMatchObject({ revision: 1, diagram })
    await reader.cancel()
  })

  test('rejects malformed display fields and focus stories without replacing the last good revision', async () => {
    const live = hub()
    const rich: ArcDiagramData = {
      ...diagram,
      nodes: { api: { x: 80, y: 100, size: 'm' }, db: { x: 360, y: 100, size: 'm' } },
      nodeData: { api: { kind: 'backend', name: 'API' }, db: { kind: 'database', name: 'Database' } },
      connectors: [{ id: 'read', from: 'api', to: 'db', fromAnchor: 'right', toAnchor: 'left', style: 'data', label: 'Read' }],
      connectorStyles: { data: { color: 'blue', strokeWidth: 2, label: 'Request' } },
      groups: [{ id: 'services', type: 'rect', x: 40, y: 60, width: 540, height: 180, color: 'blue', label: 'Services' }],
      flows: [{ id: 'request', label: 'Request', legs: [{ id: 'read' }] }],
      focusTargets: { api: { nodes: ['db'], connectors: [{ id: 'read' }], caption: 'Read data', steps: [{ icon: 'Database', label: 'Store' }] } },
      views: [{ id: 'request', title: 'Request', node: 'api', nodes: ['db'], connectors: [{ id: 'read' }], caption: 'Read data', steps: [{ icon: 'Database', label: 'Store' }] }],
    }
    const opened = live.open(rich, actor)
    const malformedFields: Array<[string[], unknown]> = [
      [['id'], { bad: true }],
      ...['subtitle', 'description', 'icon', 'color'].map(field => [['nodeData', 'api', field], { bad: true }] as [string[], unknown]),
      ...['label', 'fromRole', 'toRole', 'id'].map(field => [['connectors', '0', field], { bad: true }] as [string[], unknown]),
      [['connectorStyles', 'data', 'label'], { bad: true }],
      [['connectorStyles', 'data', 'arrowSize'], { bad: true }],
      [['groups', '0', 'label'], { bad: true }],
      [['flows', '0', 'label'], { bad: true }],
      [['focusTargets', 'api'], null],
      [['focusTargets', 'api', 'nodes'], { bad: true }],
      [['focusTargets', 'api', 'nodes'], [null]],
      [['focusTargets', 'api', 'connectors'], { bad: true }],
      [['focusTargets', 'api', 'connectors'], [null]],
      [['focusTargets', 'api', 'connectors', '0', 'id'], { bad: true }],
      [['focusTargets', 'api', 'caption'], { bad: true }],
      [['focusTargets', 'api', 'steps'], 'invalid'],
      [['focusTargets', 'api', 'steps'], [null]],
      [['focusTargets', 'api', 'steps', '0', 'icon'], { bad: true }],
      [['focusTargets', 'api', 'steps', '0', 'label'], { bad: true }],
      [['views', '0', 'nodes'], { bad: true }],
      [['views', '0', 'connectors'], [null]],
      [['views', '0', 'caption'], { bad: true }],
      [['views', '0', 'steps'], 'invalid'],
      [['views', '0', 'steps'], [null]],
      [['views', '0', 'steps', '0', 'label'], { bad: true }],
    ]
    for (const [path, value] of malformedFields) {
      const invalid = structuredClone(rich) as unknown as Record<string, unknown>
      let target = invalid
      for (const key of path.slice(0, -1)) target = target[key] as Record<string, unknown>
      target[path.at(-1)!] = value
      expect(() => live.update(opened.sessionId, actor.id, invalid)).toThrow()
    }
    const reader = live.handleRequest(new Request(live.streamUrl(opened.sessionId, actor.id, 'http://relay.test'))).body!.getReader()
    expect(await snapshot(reader)).toMatchObject({ revision: 1, diagram: rich })
    live.update(opened.sessionId, actor.id, rich, 'Still healthy')
    expect(await snapshot(reader)).toMatchObject({ revision: 2, message: 'Still healthy', diagram: rich })
    await reader.cancel()
  })

  test('connected idle sessions survive retention and accept updates on the same stream', async () => {
    const live = new LiveDiagramHub({ retainForMs: 500, maxSessions: 1 })
    cleanup.push(() => live.close())
    const start = Date.now()
    const opened = live.open(diagram, actor)
    const reader = live.handleRequest(new Request(live.streamUrl(opened.sessionId, actor.id, 'http://relay.test'))).body!.getReader()
    await snapshot(reader)
    expect(() => live.open(diagram, actor)).toThrow('capacity')
    live.sweep(start + 110)
    live.sweep(start + 600)
    expect(() => live.open(diagram, actor)).toThrow('capacity')
    expect(live.hasActiveOwner(actor.id)).toBe(true)
    live.update(opened.sessionId, actor.id, diagram, 'Resumed after idle')
    expect(await snapshot(reader)).toMatchObject({ revision: 2, status: 'idle', message: 'Resumed after idle' })
    await reader.cancel()
  })

  test('disconnected retention starts at disconnect and releases capacity after expiry', async () => {
    const time = spyOn(Date, 'now').mockReturnValue(1000)
    cleanup.push(() => { time.mockRestore() })
    const live = new LiveDiagramHub({ retainForMs: 500, maxSessions: 1 })
    cleanup.push(() => live.close())
    const opened = live.open(diagram, actor)
    const url = live.streamUrl(opened.sessionId, actor.id, 'http://relay.test')
    const reader = live.handleRequest(new Request(url)).body!.getReader()
    await snapshot(reader)
    time.mockReturnValue(2000)
    live.sweep()
    live.disconnect(actor.id)
    expect(live.hasActiveOwner(actor.id)).toBe(false)
    time.mockReturnValue(2499)
    live.sweep()
    const reconnect = live.handleRequest(new Request(url)).body!.getReader()
    expect(await snapshot(reconnect)).toMatchObject({ sessionId: opened.sessionId, status: 'idle' })
    await reconnect.cancel()
    // Repeated close notifications must not keep an abandoned session alive.
    live.disconnect(actor.id)
    time.mockReturnValue(2500)
    live.sweep()
    expect((await reader.read()).done).toBe(true)
    expect(live.handleRequest(new Request(url)).status).toBe(404)
    expect(live.open(diagram, actor).revision).toBe(1)
  })

  test('completed sessions expire even with their owner connected', async () => {
    const time = spyOn(Date, 'now').mockReturnValue(1000)
    cleanup.push(() => { time.mockRestore() })
    const live = new LiveDiagramHub({ retainForMs: 500 })
    cleanup.push(() => live.close())
    const opened = live.open(diagram, actor)
    const url = live.streamUrl(opened.sessionId, actor.id, 'http://relay.test')
    const reader = live.handleRequest(new Request(url)).body!.getReader()
    await snapshot(reader)
    time.mockReturnValue(2000)
    live.complete(opened.sessionId, actor.id)
    expect(live.hasActiveOwner(actor.id)).toBe(false)
    expect(await snapshot(reader)).toMatchObject({ revision: 2, status: 'complete' })
    live.sweep(2499)
    const reconnect = live.handleRequest(new Request(url)).body!.getReader()
    expect(await snapshot(reconnect)).toMatchObject({ status: 'complete' })
    await reconnect.cancel()
    live.sweep(2500)
    expect((await reader.read()).done).toBe(true)
    expect(live.handleRequest(new Request(url)).status).toBe(404)
  })

  test('loopback relay streams real HTTP and refuses untrusted browser origins', async () => {
    const service = await startLocalLiveService({ reviewDir: '' })
    cleanup.push(() => service.close())
    const opened = service.hub.open(diagram, actor, { baseUrl: origin })
    const url = service.hub.streamUrl(opened.sessionId, actor.id, service.baseUrl)
    const response = await fetch(url, { headers: { origin } })
    expect(response.status).toBe(200)
    const reader = response.body!.getReader()
    expect(await snapshot(reader)).toMatchObject({ revision: 1 })
    service.hub.update(opened.sessionId, actor.id, diagram)
    expect(await snapshot(reader)).toMatchObject({ revision: 2 })
    await reader.cancel()
    expect((await fetch(url, { headers: { origin: 'https://evil.test' } })).status).toBe(403)
    expect((await fetch(url, { headers: { host: 'evil.test' } })).status).toBe(403)
    const preflight = await fetch(url, { method: 'OPTIONS', headers: { origin } })
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-private-network')).toBe('true')
  })
})

describe('live MCP transports', () => {
  test('HTTP pings preserve a live owner beyond one hour; idle sessions expire', async () => {
    const time = spyOn(Date, 'now').mockReturnValue(1000)
    cleanup.push(() => { time.mockRestore() })
    // Run the real maintenance callback at a deterministic future time without
    // waiting an hour or changing the production retention policy.
    const intervals = spyOn(globalThis, 'setInterval')
    const app = createArcHttpHandler({ publicBaseUrl: 'http://relay.test', editorUrl: `${origin}/arc` })
    const expire = intervals.mock.calls.find(call => call[1] === 60_000)![0] as () => void
    intervals.mockRestore()
    cleanup.push(() => app.close())
    const connect = async (name: string) => {
      const transport = new StreamableHTTPClientTransport(new URL('http://relay.test/mcp'), {
        fetch: (input, init) => app.fetch(new Request(input, init)),
      })
      const client = new Client({ name, version: '1' }, { capabilities: {} })
      cleanup.push(() => client.close())
      await client.connect(transport)
      return { client, transport }
    }
    const owner = await connect('Long-running harness')
    const empty = await connect('No live work')
    const opened = resultJson(await owner.client.callTool({ name: 'open_live_diagram', arguments: { diagram } }))
    const finished = resultJson(await owner.client.callTool({ name: 'open_live_diagram', arguments: { diagram } }))
    await owner.client.callTool({ name: 'end_live_diagram', arguments: { sessionId: finished.sessionId } })
    expect(opened.actor.id).not.toBe(owner.transport.sessionId)
    const reader = (await app.fetch(new Request(opened.streamUrl))).body!.getReader()
    cleanup.push(() => reader.cancel())
    expect(await snapshot(reader)).toMatchObject({ revision: 1, actor: opened.actor })

    time.mockReturnValue(1000 + 30 * 60_000)
    await owner.client.ping()
    time.mockReturnValue(1000 + 60 * 60_000 + 1)
    app.hub.sweep()
    expire()
    const emptySession = await app.fetch(new Request('http://relay.test/mcp', {
      headers: { 'mcp-session-id': empty.transport.sessionId! },
    }))
    expect(emptySession.status).toBe(404)
    const moved = structuredClone(diagram)
    moved.nodes.api.x = 240
    const resumed = resultJson(await owner.client.callTool({
      name: 'update_live_diagram', arguments: { sessionId: opened.sessionId, diagram: moved, message: 'Still the same live session' },
    }))
    expect(resumed).toMatchObject({ ok: true, sessionId: opened.sessionId, revision: 2, status: 'idle' })
    expect(await snapshot(reader)).toMatchObject({ revision: 2, status: 'idle', actor: opened.actor, diagram: moved })

    await owner.client.callTool({ name: 'end_live_diagram', arguments: { sessionId: opened.sessionId } })
    expect(await snapshot(reader)).toMatchObject({ revision: 3, status: 'complete' })
    time.mockReturnValue(1000 + 2 * (60 * 60_000 + 1))
    expire()
    const completedOwner = await app.fetch(new Request('http://relay.test/mcp', {
      headers: { 'mcp-session-id': owner.transport.sessionId! },
    }))
    expect(completedOwner.status).toBe(404)
    app.hub.sweep()
    expect((await reader.read()).done).toBe(true)
    expect((await app.fetch(new Request(opened.streamUrl))).status).toBe(404)
  })

  test('HTTP keeps initialization identity and rejects writes across MCP sessions', async () => {
    const app = createArcHttpHandler({ publicBaseUrl: 'http://relay.test', editorUrl: `${origin}/arc` })
    cleanup.push(() => app.close())
    const connect = async (name: string) => {
      const transport = new StreamableHTTPClientTransport(new URL('http://relay.test/mcp'), {
        fetch: (input, init) => app.fetch(new Request(input, init)),
      })
      const client = new Client({ name, version: '9.2' }, { capabilities: {} })
      cleanup.push(() => client.close())
      await client.connect(transport)
      return { client, transport }
    }
    const first = await connect('Harness A')
    const second = await connect('Harness B')
    expect(first.transport.sessionId).not.toBe(second.transport.sessionId)
    const opened = resultJson(await first.client.callTool({
      name: 'open_live_diagram',
      arguments: { diagram, agent: { harness: ' Codex ', name: ' Architecture reviewer ' } },
    }))
    expect(opened.actor).toMatchObject({ name: 'Harness A', version: '9.2', harness: 'Codex', displayName: 'Architecture reviewer' })
    const undeclared = resultJson(await first.client.callTool({ name: 'open_live_diagram', arguments: { diagram } }))
    expect(undeclared.actor).toEqual({ name: 'Harness A', version: '9.2', id: opened.actor.id })
    const other = resultJson(await second.client.callTool({
      name: 'open_live_diagram', arguments: { diagram, agent: { harness: 'Claude' } },
    }))
    expect(other.actor).toMatchObject({ name: 'Harness B', version: '9.2', harness: 'Claude' })
    expect(other.actor.id).not.toBe(opened.actor.id)
    expect(other.actor.displayName).toBeUndefined()
    expect(opened.liveUrl).toStartWith(`${origin}/arc/live/`)
    const reader = (await app.fetch(new Request(opened.streamUrl))).body!.getReader()
    expect(await snapshot(reader)).toMatchObject({ actor: opened.actor })
    const rejected = await second.client.callTool({ name: 'update_live_diagram', arguments: { sessionId: opened.sessionId, diagram } })
    expect(rejected.isError).toBe(true)
    const updated = resultJson(await first.client.callTool({ name: 'update_live_diagram', arguments: { sessionId: opened.sessionId, diagram, message: 'Revised' } }))
    expect(updated.revision).toBe(2)
    expect(await snapshot(reader)).toMatchObject({ revision: 2, actor: opened.actor, message: 'Revised' })
    const begun = resultJson(await first.client.callTool({ name: 'begin_live_diagram_work', arguments: { sessionId: opened.sessionId, summary: 'Inspect API' } }))
    expect(await snapshot(reader)).toMatchObject({ revision: 3, status: 'working', work: { id: begun.workId } })
    expect((await second.client.callTool({ name: 'begin_live_diagram_work', arguments: { sessionId: opened.sessionId, summary: 'Foreign work' } })).isError).toBe(true)
    expect((await second.client.callTool({ name: 'finish_live_diagram_work', arguments: { sessionId: opened.sessionId, workId: begun.workId } })).isError).toBe(true)
    await first.transport.terminateSession()
    expect(await snapshot(reader)).toMatchObject({ revision: 4, status: 'idle', work: { id: begun.workId, status: 'interrupted' } })
    await reader.cancel()
    expect((await app.fetch(new Request('http://relay.test/mcp', { headers: { origin: 'https://evil.test' } }))).status).toBe(403)
    expect((await app.fetch(new Request('http://evil.test/mcp'))).status).toBe(403)
  })

  test('stdio returns a live stream with the actual initialized harness identity', async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ['packages/mcp/src/server.ts'],
      cwd: join(import.meta.dir, '../../..'),
      env: { ...process.env, ARC_REVIEW_DIR: '', ARC_EDITOR_URL: `${origin}/arc` },
      stderr: 'pipe',
    })
    const client = new Client({ name: 'Real stdio harness', version: '3.1' }, { capabilities: {} })
    cleanup.push(() => client.close())
    await client.connect(transport)
    const tools = (await client.listTools()).tools.map(tool => tool.name)
    expect(tools).toContain('begin_live_diagram_work')
    expect(tools).toContain('finish_live_diagram_work')
    const invalidAgents = [
      { harness: '' },
      { harness: '   ' },
      { harness: 'x'.repeat(81) },
      { harness: 'Code\nx' },
      { harness: 'Codex', name: '' },
      { harness: 'Codex', name: 'x'.repeat(81) },
      { harness: 'Codex', name: 'Agent\u007f' },
      { name: 'Name without a harness' },
      { harness: 'Codex', id: 'caller-cannot-set-the-connection-id' },
    ]
    for (const agent of invalidAgents) {
      const rejected = await client.callTool({ name: 'open_live_diagram', arguments: { diagram, agent } })
      expect(rejected.isError).toBe(true)
    }
    const opened = resultJson(await client.callTool({
      name: 'open_live_diagram',
      arguments: { diagram, title: 'Working services', agent: { harness: 'Codex' } },
    }))
    expect(opened.actor).toMatchObject({ name: 'Real stdio harness', version: '3.1', harness: 'Codex' })
    expect(opened.actor.displayName).toBeUndefined()
    const response = await fetch(opened.streamUrl, { headers: { origin } })
    const reader = response.body!.getReader()
    expect(await snapshot(reader)).toMatchObject({ title: 'Working services', actor: opened.actor, status: 'idle' })
    for (const scope of [{ type: 'nodes', nodeIds: ['missing'] }, { type: 'region', x: 0, y: 0, width: -1, height: 100 }]) {
      expect((await client.callTool({ name: 'begin_live_diagram_work', arguments: { sessionId: opened.sessionId, summary: 'Invalid scope', scope } })).isError).toBe(true)
    }
    const begun = resultJson(await client.callTool({ name: 'begin_live_diagram_work', arguments: { sessionId: opened.sessionId, summary: 'Reposition API', scope: { type: 'nodes', nodeIds: ['api'] } } }))
    expect(begun).toMatchObject({ ok: true, revision: 2, status: 'working', work: { id: begun.workId, scope: { type: 'nodes', nodeIds: ['api'] } } })
    expect(await snapshot(reader)).toMatchObject({ revision: 2, status: 'working', work: begun.work })
    expect((await client.callTool({ name: 'begin_live_diagram_work', arguments: { sessionId: opened.sessionId, summary: 'Concurrent work' } })).isError).toBe(true)
    const moved = structuredClone(diagram)
    moved.nodes.api.x = 200
    await client.callTool({ name: 'update_live_diagram', arguments: { sessionId: opened.sessionId, diagram: moved } })
    expect(await snapshot(reader)).toMatchObject({ revision: 3, status: 'working', diagram: moved, work: begun.work })
    const finished = resultJson(await client.callTool({ name: 'finish_live_diagram_work', arguments: { sessionId: opened.sessionId, workId: begun.workId, message: 'API checked' } }))
    expect(finished).toMatchObject({ ok: true, revision: 4, status: 'idle', work: { id: begun.workId, status: 'complete' } })
    expect(await snapshot(reader)).toMatchObject({ revision: 4, status: 'idle', message: 'API checked' })
    expect((await client.callTool({ name: 'finish_live_diagram_work', arguments: { sessionId: opened.sessionId, workId: begun.workId } })).isError).toBe(true)
    const final = resultJson(await client.callTool({ name: 'begin_live_diagram_work', arguments: { sessionId: opened.sessionId, summary: 'Final architecture check' } }))
    expect(await snapshot(reader)).toMatchObject({ revision: 5, status: 'working', work: { id: final.workId, scope: { type: 'canvas' } } })
    await client.callTool({ name: 'end_live_diagram', arguments: { sessionId: opened.sessionId, message: 'Done' } })
    expect(await snapshot(reader)).toMatchObject({ revision: 6, status: 'complete', work: { id: final.workId, status: 'complete' } })
    await reader.cancel()
  })
})
