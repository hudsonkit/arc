import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { createArcHttpHandler } from './http-server.ts'

const publicBaseUrl = 'http://127.0.0.1:5190'
const token = 'private-preview-test-token-not-a-real-secret'
const cleanup: Array<() => void | Promise<void>> = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })

function app(options: Partial<Parameters<typeof createArcHttpHandler>[0]> = {}) {
  const value = createArcHttpHandler({ publicBaseUrl, ...options })
  cleanup.push(() => value.close())
  return value
}

function studio(base = '/') {
  const directory = mkdtempSync(join(tmpdir(), 'arc-private-preview-'))
  cleanup.push(() => rmSync(directory, { recursive: true, force: true }))
  const build = join(directory, 'dist')
  mkdirSync(join(build, 'assets'), { recursive: true })
  mkdirSync(join(build, 'src'))
  writeFileSync(join(build, 'index.html'), `<!doctype html><title>Arc private preview</title><script type="module" src="${base}assets/main-test.js"></script>`)
  writeFileSync(join(build, 'assets/main-test.js'), 'export const studio = true;')
  writeFileSync(join(build, 'assets/main-test.css'), 'body { margin: 0 }')
  writeFileSync(join(build, 'arc-mark.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>')
  writeFileSync(join(build, 'version.json'), '{"version":"preview"}')
  writeFileSync(join(build, '.env'), 'SECRET=do-not-serve')
  writeFileSync(join(build, 'private.json'), '{"secret":"do-not-serve"}')
  writeFileSync(join(build, 'assets/private.json'), '{"secret":"do-not-serve"}')
  writeFileSync(join(build, 'assets/main-test.js.map'), '{"sourcesContent":["private source"]}')
  writeFileSync(join(build, 'src/source.svg'), '<svg>private source asset</svg>')
  writeFileSync(join(build, 'src/main.tsx'), 'private source')
  writeFileSync(join(directory, 'outside.js'), 'private outside file')
  symlinkSync(join(directory, 'outside.js'), join(build, 'assets/outside.js'))
  symlinkSync(join(build, '.env'), join(build, 'assets/secret.js'))
  return build
}

async function connect(handler: ReturnType<typeof createArcHttpHandler>) {
  const client = new Client({ name: 'Private preview verification', version: '1' }, { capabilities: {} })
  const transport = new StreamableHTTPClientTransport(new URL(`${publicBaseUrl}/mcp`), {
    requestInit: { headers: { authorization: `Bearer ${token}` } },
    fetch: (input, init) => handler.fetch(new Request(input, init)),
  })
  cleanup.push(() => client.close())
  await client.connect(transport)
  return { client, transport }
}

function resultJson(result: Awaited<ReturnType<Client['callTool']>>) {
  if (!Array.isArray(result.content) || result.content[0]?.type !== 'text') throw new Error('Expected MCP text')
  return JSON.parse(result.content[0].text)
}

describe('private preview authorization', () => {
  test('requires a token outside loopback and rejects unsafe configuration', () => {
    for (const bindHost of ['0.0.0.0', '::', '192.168.1.20']) {
      expect(() => app({ bindHost })).toThrow('required when binding outside loopback')
    }
    for (const value of ['', 'spaces are invalid', 'new\nline']) {
      expect(() => app({ token: value })).toThrow('nonempty token without whitespace')
    }
    for (const value of ['https://example.test/path', 'https://example.test?secret=a', 'https://example.test#secret', 'ftp://example.test', 'https://user:password@example.test']) {
      expect(() => app({ publicBaseUrl: value })).toThrow()
    }
    for (const value of ['*', 'null', 'https://trusted.test/path', 'https://trusted.test?secret=a']) {
      expect(() => app({ allowedOrigins: [value] })).toThrow()
    }
    app({ bindHost: '0.0.0.0', token })
    app({ bindHost: '::1' })
  })

  test('authenticates every MCP method and session, before processing a request', async () => {
    const handler = app({ token })
    for (const method of ['GET', 'POST', 'DELETE']) {
      for (const authorization of [undefined, 'Bearer wrong', `Basic ${token}`]) {
        const response = await handler.fetch(new Request(`${publicBaseUrl}/mcp`, {
          method, headers: authorization ? { authorization } : {},
        }))
        expect(response.status).toBe(401)
        expect(response.headers.get('www-authenticate')).toBe('Bearer realm="arc-mcp"')
        expect(await response.text()).not.toContain(token)
      }
    }
    const { client, transport } = await connect(handler)
    expect((await client.listTools()).tools.some(tool => tool.name === 'open_live_diagram')).toBe(true)
    expect((await handler.fetch(new Request(`${publicBaseUrl}/mcp`, {
      headers: { 'mcp-session-id': transport.sessionId! },
    }))).status).toBe(401)
    const health = await handler.fetch(new Request(`${publicBaseUrl}/health`))
    expect(health.status).toBe(200)
    expect(await health.text()).not.toContain(token)
  })

  test('rejects rebinding Hosts and foreign Origins, and permits a bounded auth preflight', async () => {
    const handler = app({ token, allowedOrigins: ['https://trusted.test'] })
    for (const headers of [{ origin: 'https://evil.test' }, { origin: 'null' }, { host: 'evil.test' }, { host: '127.0.0.1:5191' }]) {
      expect((await handler.fetch(new Request(`${publicBaseUrl}/mcp`, { headers: { authorization: `Bearer ${token}`, ...headers } }))).status).toBe(403)
    }
    expect((await handler.fetch(new Request('http://evil.test/mcp'))).status).toBe(403)
    const preflight = await handler.fetch(new Request(`${publicBaseUrl}/mcp`, { method: 'OPTIONS', headers: { origin: 'https://trusted.test' } }))
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-origin')).toBe('https://trusted.test')
    expect(preflight.headers.get('access-control-allow-headers')).toContain('authorization')
    expect(preflight.headers.get('access-control-allow-origin')).not.toBe('*')
  })
})

describe('production studio hosting', () => {
  test('serves studio routes, built assets, and HEAD without granting MCP access', async () => {
    const handler = app({ token, studioDir: studio() })
    for (const path of ['/', '/live', '/live/review-id', '/editor', '/editor/draft-id', '/showcase']) {
      const response = await handler.fetch(new Request(`${publicBaseUrl}${path}`))
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toStartWith('text/html')
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(await response.text()).toContain('<title>Arc private preview</title>')
    }
    const js = await handler.fetch(new Request(`${publicBaseUrl}/assets/main-test.js`))
    expect(js.headers.get('content-type')).toContain('javascript')
    expect(await js.text()).toBe('export const studio = true;')
    expect((await handler.fetch(new Request(`${publicBaseUrl}/arc-mark.svg`))).status).toBe(200)
    expect((await handler.fetch(new Request(`${publicBaseUrl}/version.json`))).status).toBe(200)
    const head = await handler.fetch(new Request(`${publicBaseUrl}/live/review-id`, { method: 'HEAD' }))
    expect(head.status).toBe(200)
    expect(Number(head.headers.get('content-length'))).toBeGreaterThan(0)
    expect(await head.text()).toBe('')
    expect((await handler.fetch(new Request(`${publicBaseUrl}/live/review-id`, { method: 'POST' }))).status).toBe(405)
    expect((await handler.fetch(new Request(`${publicBaseUrl}/mcp`))).status).toBe(401)
  })

  test('does not expose source, secrets, sourcemaps, symlink targets, or missing assets through SPA fallback', async () => {
    const handler = app({ studioDir: studio() })
    const denied = ['/.env', '/%2eenv', '/private.json', '/assets/private.json', '/package.json', '/src/main.tsx', '/src/source.svg', '/assets/main-test.js.map', '/assets/outside.js', '/assets/secret.js', '/assets/missing.js', '/assets/%2e%2e%2fprivate.json', '/assets/%5c..%5c.env', '/node_modules', '/unrecognized-route', '/live/review-id/review', '/live/review-id/events']
    for (const path of denied) {
      const response = await handler.fetch(new Request(`${publicBaseUrl}${path}`))
      expect(response.status).toBe(404)
      expect(await response.text()).not.toContain('<title>')
    }
    expect((await handler.fetch(new Request(`${publicBaseUrl}/`, { headers: { origin: 'https://evil.test' } }))).status).toBe(403)
    expect((await handler.fetch(new Request(`${publicBaseUrl}/assets/main-test.js`, { headers: { host: 'evil.test' } }))).status).toBe(403)
  })

  test('requires a production index and matching mount path before starting', () => {
    const source = studio()
    writeFileSync(join(source, 'index.html'), '<script type="module" src="/src/main.jsx"></script>')
    expect(() => app({ studioDir: source })).toThrow('production build')
    expect(() => app({ studioDir: studio('/arc/'), editorUrl: publicBaseUrl })).toThrow('ARC_BASE matching')
    expect(() => app({ studioDir: studio(), editorUrl: 'https://other.test' })).toThrow('hosted studio')
  })

  test('creates same-origin live links with a mounted studio while keeping read capabilities independent', async () => {
    const handler = app({ token, studioDir: studio('/arc/'), editorUrl: `${publicBaseUrl}/arc` })
    expect((await handler.fetch(new Request(`${publicBaseUrl}/arc`))).headers.get('location')).toBe('/arc/')
    expect((await handler.fetch(new Request(`${publicBaseUrl}/arc/live/example`))).status).toBe(200)
    expect((await handler.fetch(new Request(`${publicBaseUrl}/arc/assets/main-test.js`))).status).toBe(200)
    expect((await handler.fetch(new Request(`${publicBaseUrl}/assets/main-test.js`))).status).toBe(404)
    const { client } = await connect(handler)
    const diagram = { layout: { width: 640, height: 320 }, nodes: { api: { x: 80, y: 100, size: 'm' } }, nodeData: { api: { kind: 'backend', name: 'API' } }, connectors: [], connectorStyles: {} }
    const opened = resultJson(await client.callTool({ name: 'open_live_diagram', arguments: { diagram } }))
    expect(opened.liveUrl).toStartWith(`${publicBaseUrl}/arc/live/`)
    expect(opened.streamUrl).toStartWith(`${publicBaseUrl}/live/`)
    const viewer = await handler.fetch(new Request(opened.liveUrl))
    expect(viewer.status).toBe(200)
    expect(await viewer.text()).not.toContain(token)
    const stream = await handler.fetch(new Request(opened.streamUrl, { headers: { origin: publicBaseUrl } }))
    expect(stream.status).toBe(200)
    const reader = stream.body!.getReader()
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('Private preview verification')
    await reader.cancel()
    const withoutReadCapability = new URL(opened.streamUrl)
    withoutReadCapability.search = ''
    expect((await handler.fetch(new Request(withoutReadCapability, { headers: { authorization: `Bearer ${token}` } }))).status).toBe(404)
    expect((await handler.fetch(new Request(opened.streamUrl, { headers: { origin: 'https://evil.test' } }))).status).toBe(403)
  })

  test('serves the saved review artifact only to its read capability, without exposing writer credentials', async () => {
    const reviewDir = mkdtempSync(join(tmpdir(), 'arc-private-review-'))
    cleanup.push(() => rmSync(reviewDir, { recursive: true, force: true }))
    const handler = app({ token, studioDir: studio(), reviewDir })
    const { client } = await connect(handler)
    const diagram = { layout: { width: 640, height: 320 }, nodes: { api: { x: 80, y: 100, size: 'm' } }, nodeData: { api: { kind: 'backend', name: 'API' } }, connectors: [], connectorStyles: {} }
    const opened = resultJson(await client.callTool({ name: 'open_architecture_review', arguments: {
      diagram, title: 'API review', question: 'Where does the API store state?',
      repository: { name: 'Example repository', revision: 'abc123' },
    } }))
    expect(opened.ok).toBe(true)
    const artifactUrl = new URL(opened.streamUrl)
    artifactUrl.pathname = artifactUrl.pathname.replace(/\/events$/, '/review')
    const response = await handler.fetch(new Request(artifactUrl, { headers: { origin: publicBaseUrl } }))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
    const text = await response.text()
    expect(text).not.toContain(token)
    expect(text).not.toContain(opened.resumeToken)
    expect(text).not.toContain(artifactUrl.searchParams.get('token')!)
    expect(JSON.parse(text)).toMatchObject({ baseline: diagram, snapshot: { review: { question: 'Where does the API store state?' } } })
    expect((await handler.fetch(new Request(artifactUrl, { headers: { origin: 'https://evil.test' } }))).status).toBe(403)
    artifactUrl.search = ''
    expect((await handler.fetch(new Request(artifactUrl, { headers: { authorization: `Bearer ${token}` } }))).status).toBe(404)
  })
})

// Exercise actual HTTP sockets while the same relay stays alive: restarting the
// relay would hide stale ownership left behind by an author that never DELETEs.
for (const expiryPath of ['maintenance', 'late request'] as const) {
  test(`saved review author lease recovers after missing DELETE via ${expiryPath}`, async () => {
    const hour = 60 * 60_000
    const start = Date.now()
    const time = spyOn(Date, 'now').mockReturnValue(start)
    cleanup.push(() => { time.mockRestore() })
    const reviewDir = mkdtempSync(join(tmpdir(), 'arc-author-lease-'))
    cleanup.push(() => rmSync(reviewDir, { recursive: true, force: true }))
    let handler: ReturnType<typeof createArcHttpHandler>
    const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: request => handler.fetch(request) })
    cleanup.push(() => server.stop(true))
    const base = `http://127.0.0.1:${server.port}`
    const intervals = spyOn(globalThis, 'setInterval')
    let expire!: () => void
    try {
      handler = createArcHttpHandler({ publicBaseUrl: base, editorUrl: base, token, reviewDir })
      cleanup.push(() => handler.close())
      expire = intervals.mock.calls.find(call => call[1] === 60_000)![0] as () => void
    }
    finally { intervals.mockRestore() }
    const connectAuthor = async (name: string) => {
      const client = new Client({ name, version: '1' }, { capabilities: {} })
      client.onerror = () => {}
      const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
        requestInit: { headers: { authorization: `Bearer ${token}` } },
      })
      cleanup.push(() => client.close())
      await client.connect(transport)
      return { client, transport }
    }
    const author = await connectAuthor('Original author')
    const diagram = { layout: { width: 640, height: 320 }, nodes: { api: { x: 80, y: 100, size: 'm' } },
      nodeData: { api: { kind: 'backend', name: 'API' } }, connectors: [], connectorStyles: {} }
    const opened = resultJson(await author.client.callTool({ name: 'open_architecture_review', arguments: {
      diagram, title: 'Author recovery', question: 'Can another author resume after connection loss?',
    } }))
    expect(opened.ok).toBe(true)
    const finding = { id: 'lease', title: 'Bound author lifetime', detail: 'An absent author must not retain ownership forever.', severity: 'info', sources: [] }
    await author.client.callTool({ name: 'update_architecture_review', arguments: { sessionId: opened.sessionId, findings: [finding] } })
    const readUrl = new URL(opened.streamUrl)
    readUrl.pathname = readUrl.pathname.replace(/\/events$/, '/review')
    const readReview = async () => {
      const response = await fetch(readUrl)
      expect(response.status).toBe(200)
      return response.json()
    }

    // A real MCP ping renews author ownership beyond the initial one-hour lease.
    time.mockReturnValue(start + hour / 2)
    await author.client.ping()
    time.mockReturnValue(start + hour + 1)
    expire()
    const other = await connectAuthor('Replacement author')
    const denied = await other.client.callTool({ name: 'resume_architecture_review', arguments: {
      sessionId: opened.sessionId, resumeToken: opened.resumeToken,
    } })
    expect(denied.isError).toBe(true)
    expect(JSON.stringify(denied.content)).toContain('live MCP connection')
    await author.client.callTool({ name: 'begin_live_diagram_work', arguments: { sessionId: opened.sessionId, summary: 'Inspecting lease recovery' } })
    const oldSessionId = author.transport.sessionId!
    // SDK close aborts local streams but deliberately does not send DELETE.
    await author.client.close()
    time.mockReturnValue(start + 2 * hour + 2)
    if (expiryPath === 'maintenance') expire()
    const stale = await fetch(`${base}/mcp`, {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'mcp-session-id': oldSessionId,
        'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 'too-late', method: 'ping' }),
    })
    expect(stale.status).toBe(404)
    await stale.body?.cancel()
    const retained = await readReview()
    expect(retained.baseline).toEqual(diagram)
    expect(retained.snapshot.review.findings).toEqual([finding])
    expect(retained.snapshot.work.status).toBe('interrupted')
    expect(retained.snapshot.status).toBe('idle')
    expect(retained.revisions.length).toBeGreaterThan(3)
    const view = await fetch(opened.streamUrl)
    expect(view.status).toBe(200)
    await view.body?.cancel()

    const replacement = await connectAuthor('Resumed author')
    const resumed = resultJson(await replacement.client.callTool({ name: 'resume_architecture_review', arguments: {
      sessionId: opened.sessionId, resumeToken: opened.resumeToken,
    } }))
    expect(resumed.ok).toBe(true)
    expect(resumed.actor.name).toBe('Resumed author')
    expect(resumed.actor.id).not.toBe(opened.actor.id)
    expect(resultJson(await replacement.client.callTool({ name: 'update_architecture_review', arguments: {
      sessionId: opened.sessionId, summary: 'The same saved review resumed.',
    } })).ok).toBe(true)
    const after = await readReview()
    expect(after.snapshot.review.findings).toEqual([finding])
    expect(after.snapshot.review.summary).toBe('The same saved review resumed.')
    expect(after.revisions.length).toBeGreaterThan(retained.revisions.length)
    expect((await fetch(`${base}/health`)).status).toBe(200)
  })
}
