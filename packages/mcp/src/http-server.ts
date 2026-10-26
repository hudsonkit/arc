/** Streamable HTTP MCP transport with one server/identity per initialized client. */
import { randomUUID, timingSafeEqual } from 'node:crypto'
import { readFileSync, realpathSync, statSync } from 'node:fs'
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { homedir } from 'node:os'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { editorBaseUrl } from '../../../scripts/diagramHandoff.ts'
import { createArcMcpServer } from './server.ts'
import { LiveDiagramHub, liveViewerBase } from './live.ts'

const HTTP_PATHS = { mcp: '/mcp', health: '/health', live: '/live/' }
const MCP_HEADERS = ['authorization', 'content-type', 'mcp-session-id', 'last-event-id', 'mcp-protocol-version']
const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 5190
const CONNECTION_TTL_MS = 60 * 60_000
const MEDIA_EXTENSIONS = new Set(['.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.ico', '.woff', '.woff2', '.ttf', '.otf', '.mp4', '.webm', '.mp3', '.wav'])
const ASSET_EXTENSIONS = new Set([...MEDIA_EXTENSIONS, '.js', '.css', '.wasm'])
const STUDIO_ROUTES = /^\/(?:live(?:\/[^/]+)?|editor(?:\/[^/]+)?|player(?:\/[^/]+)*|showcase|examples(?:\/[^/]+)?|inspiration|docs(?:\/[^/]+)?|skills|architecture-diagram-software|blog\/native-mermaid-sequences|iso-demo|iso-examples|exploded|panel-cube)?\/?$/

function configuredOrigin(value: string, name: string): URL {
  const url = new URL(value)
  liveViewerBase(value) // Reject non-HTTP(S) URLs and credentials.
  if (url.pathname !== '/' || url.search || url.hash) throw new Error(`${name} must be an HTTP(S) origin without a path, query, or fragment`)
  return url
}

function loopbackHost(host: string): boolean {
  return host === 'localhost' || host === '::1' || /^127(?:\.\d{1,3}){3}$/.test(host)
}

function validBearer(header: string | null, token: string): boolean {
  if (!header?.startsWith('Bearer ')) return false
  const received = Buffer.from(header.slice(7))
  const expected = Buffer.from(token)
  return received.length === expected.length && timingSafeEqual(received, expected)
}

/** Only a production build is a public file root. Source paths never fall back to the SPA. */
function studioFiles(directory: string, mountPath: string) {
  const root = realpathSync(directory)
  const inside = (file: string) => {
    const path = relative(root, file)
    return !isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`)
  }
  const indexPath = realpathSync(resolve(root, 'index.html'))
  if (indexPath !== resolve(root, 'index.html') || !inside(indexPath) || !statSync(indexPath).isFile()) throw new Error('ARC_STUDIO_DIR must contain a built index.html')
  const html = readFileSync(indexPath, 'utf8')
  const assetPrefix = `${mountPath}assets/`
  const modules = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map(match => match[1])
  if (!modules.some(src => src.startsWith(assetPrefix) && src.endsWith('.js')) || modules.some(src => !src.startsWith(assetPrefix))) {
    throw new Error('ARC_STUDIO_DIR must be a production build with ARC_BASE matching the studio URL path')
  }
  return (request: Request, pathname: string): Response | null => {
    if (mountPath !== '/' && pathname === mountPath.slice(0, -1)) {
      return new Response(null, { status: 308, headers: { location: mountPath } })
    }
    if (!pathname.startsWith(mountPath)) return null
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD' } })
    let path: string
    try { path = decodeURIComponent(pathname.slice(mountPath.length)) } catch { return new Response('Not found', { status: 404 }) }
    const parts = path.split('/')
    if (path.includes('\\') || path.includes('\0') || parts.some(part => part.startsWith('.') || part === 'node_modules') || /%(?:2f|5c|2e)/i.test(path)) {
      return new Response('Not found', { status: 404 })
    }
    const appRoute = STUDIO_ROUTES.test(`/${path}`)
    const extension = extname(path).toLowerCase()
    const asset = parts[0] === 'assets' && ASSET_EXTENSIONS.has(extension)
    const media = MEDIA_EXTENSIONS.has(extension) && !['src', 'packages', 'scripts', 'node_modules'].includes(parts[0])
    if (!appRoute && !asset && !media && path !== 'version.json' && path !== 'index.html') {
      return new Response('Not found', { status: 404 })
    }
    let file: string
    try {
      const requestedFile = resolve(root, appRoute ? 'index.html' : path)
      file = realpathSync(requestedFile)
      // A symlink could disguise an internal secret as a .js asset, as well as
      // escape the root. Production build assets are ordinary files.
      if (file !== requestedFile || !inside(file) || !statSync(file).isFile()) throw new Error('Not a build asset')
    } catch { return new Response('Not found', { status: 404 }) }
    const blob = Bun.file(file)
    return new Response(request.method === 'HEAD' ? null : blob, { headers: {
      'content-type': blob.type,
      'content-length': String(blob.size),
      'cache-control': asset ? 'public, max-age=3600' : 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
    } })
  }
}

interface Connection {
  server: McpServer
  transport: WebStandardStreamableHTTPServerTransport
  actorId: string
  lastSeen: number
}

export function createArcHttpHandler(options: {
  publicBaseUrl: string
  editorUrl?: string
  allowedOrigins?: string[]
  bindHost?: string
  token?: string
  studioDir?: string
  reviewDir?: string
  hub?: LiveDiagramHub
}) {
  const publicUrl = configuredOrigin(options.publicBaseUrl, 'ARC_MCP_PUBLIC_URL')
  const token = options.token
  if (token !== undefined && (!token.length || /\s/.test(token))) throw new Error('ARC_MCP_TOKEN must be a nonempty token without whitespace')
  if (!loopbackHost(options.bindHost ?? DEFAULT_HOST) && !token) throw new Error('ARC_MCP_TOKEN is required when binding outside loopback')
  const editorUrl = options.editorUrl ?? (options.studioDir ? publicUrl.origin : editorBaseUrl())
  const editor = liveViewerBase(editorUrl)
  if (options.studioDir && editor.origin !== publicUrl.origin) throw new Error('A hosted studio must use the ARC_MCP_PUBLIC_URL origin')
  const origins = new Set([editor.origin, publicUrl.origin, ...(options.allowedOrigins ?? []).map(value => configuredOrigin(value, 'ARC_MCP_ALLOWED_ORIGINS').origin)])
  const serveStudio = options.studioDir ? studioFiles(options.studioDir, editor.pathname) : null
  const hub = options.hub ?? new LiveDiagramHub({ reviewDir: options.reviewDir })
  const connections = new Map<string, Connection>()
  const expiry = setInterval(() => {
    for (const [id, connection] of connections) {
      // An unfinished review is durable, but its HTTP author is still leased.
      // Missing DELETE/client crashes must not reserve that author forever.
      if (Date.now() - connection.lastSeen > CONNECTION_TTL_MS) {
        connections.delete(id)
        void connection.server.close()
      }
    }
  }, 60_000)
  expiry.unref()

  const cors = (response: Response, origin: string | null) => {
    if (origin) response.headers.set('access-control-allow-origin', origin)
    response.headers.set('vary', 'Origin')
    response.headers.set('access-control-expose-headers', 'mcp-session-id, mcp-protocol-version')
    return response
  }
  const error = (message: string, status: number) => Response.json({ error: message }, { status })

  return {
    hub,
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url)
      // A configured public origin is also the allowed Host. Reverse proxies
      // must preserve that host rather than accepting arbitrary rebinding hosts.
      const hostHeader = request.headers.get('host')
      if (url.host !== publicUrl.host || (hostHeader && hostHeader.toLowerCase() !== publicUrl.host)) return error('Invalid host', 403)
      // The read capability belongs to the hub. A studio route at /live/:id is HTML;
      // every deeper /live path is reserved for capability-protected endpoints.
      if (url.pathname.startsWith(HTTP_PATHS.live) && url.pathname.slice(HTTP_PATHS.live.length).includes('/')) return hub.handleRequest(request)
      const origin = request.headers.get('origin')
      if (origin && !origins.has(origin)) return error('Origin is not allowed', 403)
      if (request.method === 'OPTIONS') {
        return cors(new Response(null, { status: 204, headers: {
          'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
          'access-control-allow-headers': MCP_HEADERS.join(', '),
        } }), origin)
      }
      if (url.pathname === HTTP_PATHS.health) {
        if (!['GET', 'HEAD'].includes(request.method)) return error('Method not allowed', 405)
        return cors(Response.json({ ok: true, service: 'arc-mcp', editor: editorUrl }), origin)
      }
      if (url.pathname !== HTTP_PATHS.mcp) return serveStudio?.(request, url.pathname) ?? error('Not found', 404)
      if (token && !validBearer(request.headers.get('authorization'), token)) {
        const response = error('MCP bearer token required', 401)
        response.headers.set('www-authenticate', 'Bearer realm="arc-mcp"')
        return cors(response, origin)
      }
      const sessionId = request.headers.get('mcp-session-id')
      if (sessionId) {
        const connection = connections.get(sessionId)
        // Enforce the lease before refreshing it, including between sweeps.
        if (!connection || Date.now() - connection.lastSeen > CONNECTION_TTL_MS) {
          if (connection) {
            connections.delete(sessionId)
            await connection.server.close()
          }
          return cors(error('MCP session not found; initialize a new connection', 404), origin)
        }
        connection.lastSeen = Date.now()
        return cors(await connection.transport.handleRequest(request), origin)
      }
      if (request.method !== 'POST') return cors(error('Initialize an MCP session first', 400), origin)
      let body: unknown
      try { body = await request.json() } catch { return cors(error('Invalid JSON', 400), origin) }
      if (!isInitializeRequest(body)) return cors(error('Initialize an MCP session first', 400), origin)
      if (connections.size >= 128) return cors(error('MCP connection capacity reached', 503), origin)
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: randomUUID,
        onsessioninitialized: id => { connections.set(id, connection) },
        onsessionclosed: id => { connections.delete(id) },
      })
      // The public actor ID is independent of the MCP transport's session ID.
      const actorId = randomUUID()
      const server = createArcMcpServer({ live: { hub, baseUrl: publicUrl.href }, editorUrl, connectionId: actorId })
      const connection: Connection = { transport, server, actorId, lastSeen: Date.now() }
      try {
        await server.connect(transport)
        const response = await transport.handleRequest(request, { parsedBody: body })
        if (!transport.sessionId) await server.close()
        return cors(response, origin)
      } catch (cause) {
        if (transport.sessionId) connections.delete(transport.sessionId)
        await server.close()
        throw cause
      }
    },
    async close() {
      clearInterval(expiry)
      await Promise.all([...connections.values()].map(connection => connection.server.close()))
      connections.clear()
      hub.close()
    },
  }
}

if (import.meta.main) {
  const port = Number(process.env.ARC_MCP_PORT || DEFAULT_PORT)
  const host = process.env.ARC_MCP_HOST || DEFAULT_HOST
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('ARC_MCP_PORT must be an integer between 1 and 65535')
  const publicBaseUrl = process.env.ARC_MCP_PUBLIC_URL || `http://${host.includes(':') ? `[${host}]` : host}:${port}`
  const handler = createArcHttpHandler({
    publicBaseUrl,
    bindHost: host,
    token: process.env.ARC_MCP_TOKEN,
    studioDir: process.env.ARC_STUDIO_DIR,
    reviewDir: process.env.ARC_REVIEW_DIR || join(homedir(), '.arc/reviews'),
    editorUrl: process.env.ARC_EDITOR_URL,
    allowedOrigins: process.env.ARC_MCP_ALLOWED_ORIGINS?.split(',').map(value => value.trim()).filter(Boolean),
  })
  const server = Bun.serve({ hostname: host, port, fetch: handler.fetch })
  const shutdown = () => { void handler.close().finally(() => { server.stop(true); process.exit(0) }) }
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
  console.error(`arc-mcp http listening on ${publicBaseUrl}${HTTP_PATHS.mcp}`)
  console.error(`studio: ${process.env.ARC_EDITOR_URL || (process.env.ARC_STUDIO_DIR ? publicBaseUrl : editorBaseUrl())}`)
}
