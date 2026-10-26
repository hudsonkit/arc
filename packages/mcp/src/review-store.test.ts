import { afterEach, expect, spyOn, test } from 'bun:test'
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LiveDiagramHub } from './live.ts'
import { ReviewStore } from './review-store.ts'
import { createArcMcpServer } from './server.ts'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'

const diagram = {
  layout: { width: 640, height: 320 }, nodes: { api: { x: 80, y: 100, size: 'm' } },
  nodeData: { api: { kind: 'backend', name: 'API' } }, connectors: [], connectorStyles: {},
}
const actor = { name: 'Actual MCP client', version: '1', id: 'owner-a' }
const nextActor = { name: 'Resuming MCP client', version: '2', id: 'owner-b' }
const cleanups: (() => void)[] = []
afterEach(() => { for (const fn of cleanups.splice(0).reverse()) fn() })
function setup() {
  const directory = mkdtempSync(join(tmpdir(), 'arc-review-test-'))
  cleanups.push(() => rmSync(directory, { recursive: true, force: true }))
  const hubs: LiveDiagramHub[] = []
  const make = () => { const hub = new LiveDiagramHub({ reviewDir: directory, retainForMs: 10 }); hubs.push(hub); return hub }
  cleanups.push(() => { for (const hub of hubs) hub.close() })
  return { directory, make, hub: make() }
}
function open(hub: LiveDiagramHub) {
  return hub.openReview(diagram, actor, { title: 'API review', question: 'Where is authorization enforced?', repository: { name: 'Service', url: 'https://example.test/repo', revision: 'abc123' }, baseUrl: 'https://studio.test/arc' })
}
function urls(hub: LiveDiagramHub, id: string, owner = actor.id) {
  const stream = hub.streamUrl(id, owner, 'http://relay.test')
  return { stream, artifact: stream.replace('/events?', '/review?') }
}
async function snapshot(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const chunk = await reader.read()
  if (chunk.done) throw new Error('No snapshot')
  return JSON.parse(new TextDecoder().decode(chunk.value).match(/data: (.+)/)![1])
}
const finding = { id: 'auth-boundary', title: 'Authorization is central', detail: 'The request passes through the API guard.', severity: 'info' as const, nodeIds: ['api'], sources: [{ path: 'src/auth.ts', line: 12, revision: 'abc123' }] }

test('durable review keeps a baseline and ordered evidence history without exporting capabilities', async () => {
  const { hub, directory } = setup()
  const { snapshot: initial, resumeToken } = open(hub)
  const { stream, artifact } = urls(hub, initial.sessionId)
  const work = hub.beginWork(initial.sessionId, actor.id, 'Inspect authorization', { type: 'nodes', nodeIds: ['api'] })
  const moved = structuredClone(diagram); moved.nodes.api.x = 160
  hub.update(initial.sessionId, actor.id, moved)
  hub.updateReview(initial.sessionId, actor.id, { findings: [finding], summary: 'Guard confirmed', decisions: ['Keep the shared guard'] })
  hub.updateReview(initial.sessionId, actor.id, { openQuestions: ['Does the worker use the same policy?'] })
  hub.finishWork(initial.sessionId, actor.id, work.work!.id)
  const response = hub.handleRequest(new Request(artifact))
  expect(response.status).toBe(200)
  const saved = await response.json()
  expect(saved.baseline).toEqual(diagram)
  expect(saved.snapshot.diagram).toEqual(moved)
  expect(saved.snapshot.review).toMatchObject({ findings: [finding], decisions: ['Keep the shared guard'], openQuestions: ['Does the worker use the same policy?'] })
  expect(saved.revisions.map((item: {revision: number}) => item.revision)).toEqual([1, 2, 3, 4, 5, 6])
  expect(saved.revisions[0].review.findings).toEqual([])
  const body = JSON.stringify(saved)
  expect(body).not.toContain(resumeToken)
  expect(body).not.toContain(new URL(stream).searchParams.get('token')!)
  expect(body).not.toContain('resumeTokenHash')
  expect(statSync(directory).mode & 0o777).toBe(0o700)
  const path = join(directory, `${initial.sessionId}.json`)
  expect(statSync(path).mode & 0o777).toBe(0o600)
  const envelope = JSON.parse(readFileSync(path, 'utf8'))
  expect(envelope.resumeTokenHash).toHaveLength(64)
  expect(readFileSync(path, 'utf8')).not.toContain(resumeToken)
  hub.sweep(Date.now() + 100_000)
  expect(hub.handleRequest(new Request(artifact)).status).toBe(200)
})

test('disconnect interrupts declared work; restart reopens same link and requires resume authority', async () => {
  const { hub, make } = setup()
  const { snapshot: initial, resumeToken } = open(hub)
  const { artifact, stream } = urls(hub, initial.sessionId)
  hub.beginWork(initial.sessionId, actor.id, 'Read repository')
  expect(() => hub.resumeReview(initial.sessionId, resumeToken, nextActor)).toThrow('live MCP connection')
  expect(() => hub.resumeReview(initial.sessionId, 'wrong', nextActor)).toThrow('capability')
  hub.close()
  const restored = make()
  const reader = restored.handleRequest(new Request(stream)).body!.getReader()
  expect(await snapshot(reader)).toMatchObject({ revision: 3, status: 'idle', work: { status: 'interrupted' } })
  await reader.cancel()
  expect(() => restored.updateReview(initial.sessionId, actor.id, { summary: 'No authority' })).toThrow('MCP connection')
  const resumed = restored.resumeReview(initial.sessionId, resumeToken, nextActor)
  expect(resumed.actor).toEqual(nextActor)
  expect(resumed.revision).toBe(4)
  expect(() => restored.update(initial.sessionId, actor.id, diagram)).toThrow('MCP connection')
  restored.updateReview(initial.sessionId, nextActor.id, { findings: [finding] })
  restored.complete(initial.sessionId, nextActor.id, 'Review complete')
  const before = await restored.handleRequest(new Request(artifact)).json()
  restored.close()
  const final = make()
  expect(await final.handleRequest(new Request(artifact)).json()).toEqual(before)
  const reopened = final.resumeReview(initial.sessionId, resumeToken, actor)
  expect(reopened).toEqual(before.snapshot)
  expect(await final.handleRequest(new Request(artifact)).json()).toEqual(before)
  expect(() => final.updateReview(initial.sessionId, actor.id, { summary: 'Edit ended review' })).toThrow('read-only')
  expect(() => final.update(initial.sessionId, actor.id, diagram)).toThrow('complete')
})

test('hard-restart recovery interrupts a persisted working revision before SSE serves it', async () => {
  const { hub, directory, make } = setup()
  const opened = open(hub)
  const { stream, artifact } = urls(hub, opened.snapshot.sessionId)
  hub.beginWork(opened.snapshot.sessionId, actor.id, 'Inspect source')
  // Model a crashed process with no live owner, preserving its on-disk working revision.
  const store = new ReviewStore(directory)
  const original = store.read(opened.snapshot.sessionId)!
  hub.close()
  const detached = { ...original, owner: undefined }
  const recovering = new ReviewStore(directory)
  recovering.save(detached, 3)
  const restored = make()
  const reader = restored.handleRequest(new Request(stream)).body!.getReader()
  expect(await snapshot(reader)).toMatchObject({ revision: 3, status: 'idle', work: { status: 'interrupted' } })
  await reader.cancel()
  const saved = await restored.handleRequest(new Request(artifact)).json()
  expect(saved.revisions.map((item: {revision: number}) => item.revision)).toEqual([1, 2, 3])
  expect(saved.revisions[1].work.status).toBe('working')
  expect(saved.snapshot.work.finishedAt).toBeString()
})

test('share revocation closes old viewers and persists a new read capability', async () => {
  const { hub, make } = setup()
  const opened = open(hub)
  const old = urls(hub, opened.snapshot.sessionId)
  const reader = hub.handleRequest(new Request(old.stream)).body!.getReader()
  await snapshot(reader)
  expect(() => hub.revokeReviewShare(opened.snapshot.sessionId, nextActor.id)).toThrow('MCP connection')
  hub.revokeReviewShare(opened.snapshot.sessionId, actor.id)
  expect((await reader.read()).done).toBe(true)
  expect(hub.handleRequest(new Request(old.stream)).status).toBe(404)
  expect(hub.handleRequest(new Request(old.artifact)).status).toBe(404)
  const current = urls(hub, opened.snapshot.sessionId)
  expect(current.stream).not.toBe(old.stream)
  expect(hub.handleRequest(new Request(current.artifact)).status).toBe(200)
  hub.close()
  const restored = make()
  expect(restored.handleRequest(new Request(old.artifact)).status).toBe(404)
  expect(restored.handleRequest(new Request(current.artifact)).status).toBe(200)
  expect(restored.resumeReview(opened.snapshot.sessionId, opened.resumeToken, nextActor).actor).toEqual(nextActor)
})

test('revocation in a resumed relay invalidates cached reads and existing streams in the previous relay', async () => {
  const { hub, make } = setup()
  const opened = open(hub)
  const id = opened.snapshot.sessionId
  const old = urls(hub, id)
  const reader = hub.handleRequest(new Request(old.stream)).body!.getReader()
  await snapshot(reader)
  hub.disconnect(actor.id)

  const resumed = make()
  resumed.resumeReview(id, opened.resumeToken, nextActor)
  resumed.revokeReviewShare(id, nextActor.id)
  const current = urls(resumed, id, nextActor.id)

  // Exercise the ordinary sweep: an existing stream must close even when no
  // new request arrives at the old relay to notice the rotated capability.
  hub.sweep()
  expect(await Promise.race([reader.read().then(result => result.done), Bun.sleep(100).then(() => false)])).toBe(true)
  expect(hub.handleRequest(new Request(old.stream)).status).toBe(404)
  expect(hub.handleRequest(new Request(old.artifact)).status).toBe(404)
  expect(resumed.handleRequest(new Request(current.artifact)).status).toBe(200)

  // A later handoff back must retain the rotated capability, including when
  // the completed artifact itself has no new revision on resume.
  resumed.complete(id, nextActor.id)
  resumed.disconnect(nextActor.id)
  hub.resumeReview(id, opened.resumeToken, actor)
  expect(hub.handleRequest(new Request(old.artifact)).status).toBe(404)
  expect(hub.handleRequest(new Request(current.artifact)).status).toBe(200)
})

test('cached artifact requests check durable authority before the next sweep', () => {
  const { hub, make } = setup()
  const opened = open(hub)
  const id = opened.snapshot.sessionId
  const old = urls(hub, id)
  hub.disconnect(actor.id)
  const resumed = make()
  resumed.resumeReview(id, opened.resumeToken, nextActor)
  resumed.revokeReviewShare(id, nextActor.id)
  expect(hub.handleRequest(new Request(old.artifact)).status).toBe(404)
  expect(hub.handleRequest(new Request(old.stream)).status).toBe(404)
})

test('completed review resume cannot restore a stale capability without a revision change', () => {
  const { hub, make } = setup()
  const opened = open(hub)
  const id = opened.snapshot.sessionId
  const old = urls(hub, id)
  const completed = hub.complete(id, actor.id)
  hub.disconnect(actor.id)
  const resumed = make()
  expect(resumed.resumeReview(id, opened.resumeToken, nextActor)).toEqual(completed)
  resumed.revokeReviewShare(id, nextActor.id)
  const current = urls(resumed, id, nextActor.id)
  resumed.disconnect(nextActor.id)

  // No read or sweep has refreshed the first hub's cached capability.
  expect(hub.resumeReview(id, opened.resumeToken, actor)).toEqual(completed)
  expect(hub.handleRequest(new Request(old.artifact)).status).toBe(404)
  expect(hub.handleRequest(new Request(current.artifact)).status).toBe(200)
})

test('failed durable commits and invalid evidence preserve the last published revision', async () => {
  const { hub, directory } = setup()
  const opened = open(hub)
  const { artifact } = urls(hub, opened.snapshot.sessionId)
  const before = await hub.handleRequest(new Request(artifact)).json()
  const path = join(directory, `${opened.snapshot.sessionId}.json`)
  const disk = readFileSync(path, 'utf8')
  const spy = spyOn(ReviewStore.prototype, 'save').mockImplementationOnce(() => { throw new Error('Simulated disk full') })
  try { expect(() => hub.updateReview(opened.snapshot.sessionId, actor.id, { summary: 'Not committed' })).toThrow('disk full') } finally { spy.mockRestore() }
  expect(readFileSync(path, 'utf8')).toBe(disk)
  expect(await hub.handleRequest(new Request(artifact)).json()).toEqual(before)
  for (const findings of [[finding, finding], [{ ...finding, detail: { bad: true } }], [{ ...finding, sources: [{ path: 'x', line: -1 }] }], [{ ...finding, sources: [{ path: 'x', url: 'javascript:alert(1)' }] }]]) {
    expect(() => hub.updateReview(opened.snapshot.sessionId, actor.id, { findings: findings as never })).toThrow()
  }
  expect(await hub.handleRequest(new Request(artifact)).json()).toEqual(before)
  expect(hub.updateReview(opened.snapshot.sessionId, actor.id, { summary: '' }).revision).toBe(2)
})

test('ordinary sessions stay transient and a second relay cannot take a live review owner', () => {
  const { hub, directory, make } = setup()
  hub.open(diagram, actor)
  expect(readdirSync(directory)).toEqual([])
  const opened = open(hub)
  const other = make()
  expect(() => other.resumeReview(opened.snapshot.sessionId, opened.resumeToken, nextActor)).toThrow('another relay')
  expect(() => other.update(opened.snapshot.sessionId, nextActor.id, diagram)).toThrow('MCP connection')
  hub.disconnect(actor.id)
  expect(other.resumeReview(opened.snapshot.sessionId, opened.resumeToken, nextActor).actor).toEqual(nextActor)
  expect(() => hub.resumeReview(opened.snapshot.sessionId, opened.resumeToken, actor)).toThrow('another relay')
})


test('MCP resume accepts declared labels without replacing actual identity or completed authors', async () => {
  const { hub } = setup()
  const opened = open(hub)
  const id = opened.snapshot.sessionId
  const { artifact } = urls(hub, id)
  hub.disconnect(actor.id)
  const clients: Client[] = []
  const connect = async (id: string, name: string) => {
    const server = createArcMcpServer({ live: { hub, baseUrl: 'http://relay.test' }, editorUrl: 'https://studio.test/arc', connectionId: id })
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair()
    const client = new Client({ name, version: '7.1' }, { capabilities: {} })
    clients.push(client)
    await server.connect(serverTransport)
    await client.connect(clientTransport)
    return client
  }
  const resume = async (client: Client, agent?: unknown) => {
    const result = await client.callTool({ name: 'resume_architecture_review', arguments: { sessionId: id, resumeToken: opened.resumeToken, ...(agent === undefined ? {} : { agent }) } })
    if (result.isError) throw new Error(JSON.stringify(result.content))
    return JSON.parse((result.content as { text: string }[])[0].text)
  }
  try {
    const labeled = await connect('new-connection-a', 'Actual resume client A')
    const before = await hub.handleRequest(new Request(artifact)).json()
    for (const agent of [{ harness: '' }, { harness: 'Codex', name: 'bad\nlabel' }, { harness: 'Codex', id: 'forged-id' }]) {
      const result = await labeled.callTool({ name: 'resume_architecture_review', arguments: { sessionId: id, resumeToken: opened.resumeToken, agent } })
      expect(result.isError).toBe(true)
    }
    expect(await hub.handleRequest(new Request(artifact)).json()).toEqual(before)
    const resumed = await resume(labeled, { harness: ' Codex ', name: ' Review agent ' })
    expect(resumed.actor).toEqual({ name: 'Actual resume client A', version: '7.1', id: 'new-connection-a', harness: 'Codex', displayName: 'Review agent' })
    expect((await hub.handleRequest(new Request(artifact)).json()).snapshot.actor).toEqual(resumed.actor)
    await labeled.close()

    const plain = await connect('new-connection-b', 'Actual resume client B')
    const withoutLabels = await resume(plain)
    expect(withoutLabels.actor).toEqual({ name: 'Actual resume client B', version: '7.1', id: 'new-connection-b' })
    hub.complete(id, 'new-connection-b')
    const completed = await hub.handleRequest(new Request(artifact)).json()
    await plain.close()

    const viewer = await connect('new-connection-c', 'Actual resume client C')
    const viewed = await resume(viewer, { harness: 'Another harness', name: 'Another author' })
    expect(viewed.readOnly).toBe(true)
    expect(viewed.actor).toEqual(completed.snapshot.actor)
    expect(viewed.revision).toBe(completed.snapshot.revision)
    expect(await hub.handleRequest(new Request(artifact)).json()).toEqual(completed)
  } finally { for (const client of clients) await client.close() }
})
