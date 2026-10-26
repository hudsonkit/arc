import { test, expect } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

// Real HTTP and a separate server process: this catches failures hidden by
// an in-memory hub test, especially hard restarts and stale author ownership.
test('private review survives author loss and server restarts at the same saved link', async () => {
  const reviewDir = await mkdtemp(join(tmpdir(), 'arc-review-integration-'))
  const probe = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response() })
  const port = probe.port
  probe.stop(true)
  const base = `http://127.0.0.1:${port}`
  const token = randomBytes(32).toString('hex')
  let server: ReturnType<typeof Bun.spawn> | undefined
  const clients: Client[] = []
  const start = async () => {
    server = Bun.spawn([process.execPath, 'packages/mcp/src/http-server.ts'], {
      cwd: resolve(import.meta.dir, '..'),
      env: { ...process.env, ARC_MCP_HOST: '127.0.0.1', ARC_MCP_PORT: String(port), ARC_MCP_PUBLIC_URL: base,
        ARC_EDITOR_URL: base, ARC_REVIEW_DIR: reviewDir, ARC_MCP_TOKEN: token, ARC_STUDIO_DIR: '' },
      stdout: 'ignore', stderr: 'pipe',
    })
    for (let n = 0; n < 100; n++) {
      try { if ((await fetch(new URL('/health', base))).ok) return } catch { /* waiting for listen */ }
      if (server.exitCode !== null) throw new Error(await new Response(server.stderr).text())
      await Bun.sleep(30)
    }
    throw new Error('Preview server did not start')
  }
  const stop = async (hard = false) => {
    if (server) { server.kill(hard ? 'SIGKILL' : 'SIGTERM'); await server.exited; server = undefined }
  }
  const connect = async () => {
    const client = new Client({ name: 'Review restart acceptance', version: '1' }, { capabilities: {} })
    client.onerror = () => {}
    await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', base), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    }))
    clients.push(client)
    return client
  }
  const call = async (client: Client, name: string, args: Record<string, unknown>) => {
    const result = await client.callTool({ name, arguments: args })
    const text = (result.content as Array<{ type: string; text?: string }>).find(item => item.type === 'text')?.text
    if (result.isError) throw new Error(text)
    const parsed = JSON.parse(text!)
    expect(parsed.ok).toBe(true)
    return parsed
  }
  const readEvent = async (url: string) => {
    const abort = new AbortController()
    try {
      const response = await fetch(url, { signal: abort.signal })
      expect(response.status).toBe(200)
      const reader = response.body!.getReader()
      let buffer = ''
      while (!buffer.includes('\n\n')) {
        const value = await reader.read()
        if (value.done) throw new Error('SSE closed without a snapshot')
        buffer += new TextDecoder().decode(value.value)
      }
      const line = buffer.split('\n').find(line => line.startsWith('data:'))!
      return JSON.parse(line.slice(5))
    } finally { abort.abort() }
  }
  try {
    await start()
    expect((await fetch(new URL('/mcp', base), { method: 'POST' })).status).toBe(401)
    const author = await connect()
    const diagram = { layout: { width: 900, height: 500 }, nodes: { studio: { x: 100, y: 100, size: 'm' } },
      nodeData: { studio: { kind: 'frontend', name: 'Hudson Kit studio' } }, connectors: [] }
    const opened = await call(author, 'open_architecture_review', { diagram, title: 'Restart acceptance review',
      question: 'Does a saved review survive a hard restart?', repository: { name: 'Arc', revision: 'test-fixture' },
      agent: { harness: 'Codex', name: 'Acceptance' } })
    const sessionId = opened.sessionId
    const reviewUrl = new URL(opened.streamUrl)
    reviewUrl.pathname = reviewUrl.pathname.replace(/\/events$/, '/review')
    await call(author, 'begin_live_diagram_work', { sessionId, summary: 'Inspecting durable storage', scope: { type: 'canvas' } })
    const updated = structuredClone(diagram)
    Object.assign(updated.nodes, { store: { x: 460, y: 100, size: 'm' } })
    Object.assign(updated.nodeData, { store: { kind: 'database', name: 'Saved reviews' } })
    await call(author, 'update_live_diagram', { sessionId, diagram: updated, message: 'Mapped the review store' })
    await call(author, 'update_architecture_review', { sessionId, summary: 'Review data must survive process loss.',
      findings: [{ id: 'durability', title: 'Persist before publishing', detail: 'An acknowledged revision must be durable.',
        severity: 'info', nodeIds: ['store'], sources: [{ path: 'packages/mcp/src/live.ts', line: 1, revision: 'test-fixture' }] }],
      decisions: ['One author per review'], openQuestions: ['How should archived reviews be pruned?'] })
    const joined = await readEvent(opened.streamUrl)
    expect(joined.work.status).toBe('working')
    expect(joined.diagram.nodes.store).toBeDefined()
    await stop(true)
    await author.close()
    await start()
    const restored = await (await fetch(reviewUrl)).json()
    expect(restored.snapshot.work.status).toBe('interrupted')
    expect(restored.snapshot.review.findings[0].id).toBe('durability')
    expect(restored.baseline.nodes.store).toBeUndefined()
    expect(restored.revisions.length).toBeGreaterThan(3)
    expect((await readEvent(opened.streamUrl)).revision).toBe(restored.snapshot.revision)
    const resumedAuthor = await connect()
    await call(resumedAuthor, 'resume_architecture_review', { sessionId, resumeToken: opened.resumeToken })
    const work = await call(resumedAuthor, 'begin_live_diagram_work', { sessionId, summary: 'Confirming persisted findings' })
    await call(resumedAuthor, 'finish_live_diagram_work', { sessionId, workId: work.workId })
    await call(resumedAuthor, 'end_live_diagram', { sessionId, message: 'Review complete' })
    const completed = await (await fetch(reviewUrl)).json()
    expect(completed.snapshot.status).toBe('complete')
    expect(JSON.stringify(completed)).not.toContain(opened.resumeToken)
    expect(JSON.stringify(completed)).not.toContain(new URL(opened.streamUrl).searchParams.get('token')!)
    await resumedAuthor.close()
    await stop()
    await start()
    const reopened = await (await fetch(reviewUrl)).json()
    expect(reopened).toEqual(completed)
    expect((await readEvent(opened.streamUrl)).status).toBe('complete')
    const invalid = new URL(reviewUrl); invalid.searchParams.set('token', 'invalid')
    expect((await fetch(invalid)).status).toBe(404)
  } finally {
    for (const client of clients) await client.close().catch(() => {})
    await stop()
    await rm(reviewDir, { recursive: true, force: true })
  }
}, 30_000)
