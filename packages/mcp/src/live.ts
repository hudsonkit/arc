import { randomBytes, randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import type { ReadableStream as NodeReadableStream } from 'node:stream/web'
import type { ArchitectureReview, ArchitectureReviewRepository, LiveDiagramActor, LiveDiagramSnapshot, LiveWorkScope } from '../../../src/types/live.ts'
import { normalizeLiveDiagram } from '../../../src/utils/liveDiagramValidation.ts'
import { editorBaseUrl } from '../../../scripts/diagramHandoff.ts'

import { ReviewStore, hashResumeToken, matchesResumeToken, normalizeReview } from './review-store.ts'
import type { ReviewEnvelope } from './review-store.ts'

const LIVE_ROOT = 'live'
const HEARTBEAT_MS = 15_000
const encoder = new TextEncoder()

interface LiveSession {
  snapshot: LiveDiagramSnapshot
  token: string
  viewerOrigin: string
  touchedAt: number
  ownerConnected: boolean
  workTouchedAt?: number
  durable?: ReviewEnvelope
  listeners: Set<(snapshot: LiveDiagramSnapshot | null) => void>
}

export interface LiveDiagramService {
  hub: LiveDiagramHub
  baseUrl: string
}

export function liveViewerBase(value = editorBaseUrl()): URL {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('baseUrl must be an HTTP(S) studio URL without credentials')
  }
  url.hash = ''
  url.search = ''
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/`
  return url
}


function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status })
}

function workScope(value: unknown, nodes: LiveDiagramSnapshot['diagram']['nodes']): LiveWorkScope {
  if (value === undefined) return { type: 'canvas' }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Work scope must be an object')
  const scope = value as Record<string, unknown>
  const keys = Object.keys(scope)
  if (scope.type === 'canvas' && keys.length === 1) return { type: 'canvas' }
  if (scope.type === 'nodes' && keys.length === 2 && Array.isArray(scope.nodeIds)) {
    const ids = scope.nodeIds
    if (ids.length < 1 || ids.length > 200 || new Set(ids).size !== ids.length
      || ids.some(id => typeof id !== 'string' || !id.length || id.length > 200 || !Object.hasOwn(nodes, id))) {
      throw new Error('Work scope nodeIds must contain 1–200 unique existing node IDs, each at most 200 characters')
    }
    return { type: 'nodes', nodeIds: [...ids] }
  }
  if (scope.type === 'region' && keys.length === 5
    && ['x', 'y', 'width', 'height'].every(key => typeof scope[key] === 'number' && Number.isFinite(scope[key]) && Math.abs(scope[key] as number) <= 100_000)
    && (scope.width as number) > 0 && (scope.height as number) > 0) {
    return { type: 'region', x: scope.x as number, y: scope.y as number, width: scope.width as number, height: scope.height as number }
  }
  throw new Error('Work scope must be canvas, existing nodes, or a finite region with positive dimensions and coordinates within ±100000')
}

/** Connection ownership and SSE fan-out, with opt-in durable review storage. */
export class LiveDiagramHub {
  private sessions = new Map<string, LiveSession>()
  private timer: ReturnType<typeof setInterval>
  private workLeaseMs: number
  private retainForMs: number
  private maxSessions: number
  private reviewStore?: ReviewStore

  constructor(options: { workLeaseMs?: number; retainForMs?: number; maxSessions?: number; reviewDir?: string } = {}) {
    this.workLeaseMs = options.workLeaseMs ?? 5 * 60_000
    this.retainForMs = options.retainForMs ?? 60 * 60_000
    this.maxSessions = options.maxSessions ?? 100
    if (options.reviewDir) {
      this.reviewStore = new ReviewStore(options.reviewDir)
      for (const envelope of this.reviewStore.all()) {
        if (!this.reviewStore.ownedElsewhere(envelope)) this.restore(envelope)
      }
    }
    this.timer = setInterval(() => {
      try { this.sweep() } catch { console.error('Arc could not persist a live review lifecycle update; it will retry') }
    }, 1_000)
    this.timer.unref()
  }

  open(diagram: unknown, actor: LiveDiagramActor, options: { title?: string; baseUrl?: string } = {}): LiveDiagramSnapshot {
    const data = normalizeLiveDiagram(diagram)
    const viewerOrigin = liveViewerBase(options.baseUrl).origin
    this.sweep()
    this.checkCapacity()
    const now = Date.now()
    const snapshot: LiveDiagramSnapshot = {
      sessionId: randomUUID(), revision: 1, diagram: data,
      title: options.title?.trim() || 'Live architecture',
      actor: { ...actor }, status: 'idle', updatedAt: new Date(now).toISOString(),
    }
    this.sessions.set(snapshot.sessionId, {
      snapshot, token: randomBytes(32).toString('base64url'), viewerOrigin,
      touchedAt: now, ownerConnected: true, listeners: new Set(),
    })
    return structuredClone(snapshot)
  }

  openReview(diagram: unknown, actor: LiveDiagramActor, options: {
    title: string; question: string; repository?: ArchitectureReviewRepository; baseUrl?: string
  }): { snapshot: LiveDiagramSnapshot; resumeToken: string } {
    if (!this.reviewStore) throw new Error('Saved architecture reviews require a configured reviewDir (ARC_REVIEW_DIR)')
    const data = normalizeLiveDiagram(diagram)
    if (typeof options.title !== 'string' || !options.title.trim() || options.title.length > 200) throw new Error('Review title must contain 1–200 characters')
    const review = normalizeReview({ question: options.question, repository: options.repository, findings: [], decisions: [], openQuestions: [] })
    const viewerOrigin = liveViewerBase(options.baseUrl).origin
    this.sweep()
    this.checkCapacity()
    const now = Date.now()
    const snapshot: LiveDiagramSnapshot = {
      sessionId: randomUUID(), revision: 1, diagram: data, title: options.title.trim(),
      actor: { ...actor }, status: 'idle', review, updatedAt: new Date(now).toISOString(),
    }
    const resumeToken = randomBytes(32).toString('base64url')
    const durable: ReviewEnvelope = {
      schemaVersion: 1, readToken: randomBytes(32).toString('base64url'), resumeTokenHash: hashResumeToken(resumeToken),
      viewerOrigin, owner: this.reviewStore.owner(actor.id),
      artifact: { schemaVersion: 1, baseline: structuredClone(data), snapshot, revisions: [snapshot] },
    }
    this.reviewStore.save(durable)
    this.sessions.set(snapshot.sessionId, {
      snapshot, token: durable.readToken, viewerOrigin, durable, touchedAt: now, ownerConnected: true, listeners: new Set(),
    })
    return { snapshot: structuredClone(snapshot), resumeToken }
  }

  updateReview(sessionId: string, actorId: string, patch: Partial<Pick<ArchitectureReview, 'summary' | 'findings' | 'decisions' | 'openQuestions'>>): LiveDiagramSnapshot {
    const session = this.owned(sessionId, actorId)
    if (!session.durable || !session.snapshot.review) throw new Error('This session is not a saved architecture review')
    if (session.snapshot.status === 'complete') throw new Error('This architecture review is complete and read-only')
    const review = normalizeReview({ ...session.snapshot.review, ...Object.fromEntries(Object.entries(patch).filter(([key, value]) => ['summary', 'findings', 'decisions', 'openQuestions'].includes(key) && value !== undefined)) })
    const now = Date.now()
    this.expireWork(session, now)
    const working = session.snapshot.work?.status === 'working'
    return this.publish(session, { review, status: working ? 'working' : 'idle', ...(working ? {} : { work: undefined }) }, now)
  }

  resumeReview(sessionId: string, resumeToken: string, actor: LiveDiagramActor, options: { baseUrl?: string } = {}): LiveDiagramSnapshot {
    if (!this.reviewStore) throw new Error('Saved architecture reviews require a configured reviewDir')
    const envelope = this.reviewStore.read(sessionId)
    if (!envelope || !matchesResumeToken(resumeToken, envelope.resumeTokenHash)) throw new Error('Architecture review or resume capability not found')
    if (this.reviewStore.ownedElsewhere(envelope)) throw new Error('Architecture review is still owned by a live MCP connection in another relay')
    let session = this.sessions.get(sessionId)
    if (session?.ownerConnected && this.ownerId(session) !== actor.id) throw new Error('Architecture review is still owned by a live MCP connection')
    if (!session || session.snapshot.revision !== envelope.artifact.snapshot.revision
      || session.token !== envelope.readToken || session.viewerOrigin !== envelope.viewerOrigin) {
      if (session) for (const listener of session.listeners) listener(null)
      session = this.restore(envelope)
    }
    const viewerOrigin = options.baseUrl === undefined ? session.viewerOrigin : liveViewerBase(options.baseUrl).origin
    if (!session.ownerConnected || viewerOrigin !== session.viewerOrigin) {
      if (!session.ownerConnected) this.checkCapacity()
      const metadata = { owner: this.reviewStore.owner(actor.id), viewerOrigin }
      // A finished review preserves its final author and history. The private
      // owner may still obtain viewing links and revoke its share capability.
      if (session.snapshot.status === 'complete') this.persistMetadata(session, metadata)
      else this.publish(session, { actor: { ...actor } }, Date.now(), metadata)
      session.ownerConnected = true
    }
    return structuredClone(session.snapshot)
  }

  revokeReviewShare(sessionId: string, actorId: string, options: { baseUrl?: string } = {}): LiveDiagramSnapshot {
    const session = this.owned(sessionId, actorId)
    if (!session.durable) throw new Error('This session is not a saved architecture review')
    this.persistMetadata(session, { readToken: randomBytes(32).toString('base64url'), ...(options.baseUrl === undefined ? {} : { viewerOrigin: liveViewerBase(options.baseUrl).origin }) })
    for (const listener of session.listeners) listener(null)
    return structuredClone(session.snapshot)
  }

  private checkCapacity(): void {
    // Saved, disconnected reviews live on disk without consuming an active-owner slot.
    const active = [...this.sessions.values()].filter(session => !session.durable || session.ownerConnected).length
    if (active >= this.maxSessions) throw new Error('Live diagram capacity reached; finish or disconnect a session before opening another')
  }

  private restore(envelope: ReviewEnvelope): LiveSession {
    const session: LiveSession = {
      snapshot: envelope.artifact.snapshot, token: envelope.readToken, viewerOrigin: envelope.viewerOrigin, durable: envelope,
      touchedAt: Date.now(), ownerConnected: false, listeners: new Set(),
    }
    const work = session.snapshot.work
    if (work?.status === 'working') this.publish(session, {
      status: 'idle', work: { ...work, status: 'interrupted', finishedAt: new Date().toISOString() },
    }, Date.now(), { owner: undefined })
    else if (envelope.owner) this.persistMetadata(session, { owner: undefined })
    this.sessions.set(session.snapshot.sessionId, session)
    return session
  }

  update(sessionId: string, actorId: string, diagram: unknown, message?: string): LiveDiagramSnapshot {
    const session = this.owned(sessionId, actorId)
    if (session.snapshot.status === 'complete') throw new Error('This live diagram is complete; open a new live diagram to continue')
    const data = normalizeLiveDiagram(diagram)
    const now = Date.now()
    this.expireWork(session, now)
    const working = session.snapshot.work?.status === 'working'
    return this.publish(session, {
      diagram: data, message, status: working ? 'working' : 'idle',
      ...(working ? {} : { work: undefined }),
    }, now)
  }

  beginWork(sessionId: string, actorId: string, summary: string, scope?: LiveWorkScope): LiveDiagramSnapshot {
    const session = this.owned(sessionId, actorId)
    if (session.snapshot.status === 'complete') throw new Error('This live diagram is complete; open a new live diagram to continue')
    if (typeof summary !== 'string' || !summary.trim() || summary.trim().length > 500 || /[\u0000-\u001f\u007f]/.test(summary)) {
      throw new Error('Work summary must contain 1–500 characters of text without control characters')
    }
    const validatedScope = workScope(scope, session.snapshot.diagram.nodes)
    const now = Date.now()
    this.expireWork(session, now)
    if (session.snapshot.work?.status === 'working') throw new Error('This live diagram already has active work; finish it before beginning another scope')
    return this.publish(session, {
      status: 'working', message: undefined,
      work: { id: randomUUID(), summary: summary.trim(), scope: validatedScope, status: 'working', startedAt: new Date(now).toISOString() },
    }, now)
  }

  finishWork(sessionId: string, actorId: string, workId: string, message?: string): LiveDiagramSnapshot {
    const session = this.owned(sessionId, actorId)
    const now = Date.now()
    this.expireWork(session, now)
    const work = session.snapshot.work
    if (!work || work.status !== 'working' || work.id !== workId) throw new Error('Active work not found for this workId; it may have finished or been interrupted')
    return this.publish(session, { status: 'idle', message, work: { ...work, status: 'complete', finishedAt: new Date(now).toISOString() } }, now)
  }

  complete(sessionId: string, actorId: string, message?: string): LiveDiagramSnapshot {
    const session = this.owned(sessionId, actorId)
    if (session.snapshot.status === 'complete') return structuredClone(session.snapshot)
    const now = Date.now()
    this.expireWork(session, now)
    const work = session.snapshot.work
    return this.publish(session, {
      status: 'complete', message,
      ...(work?.status === 'working' ? { work: { ...work, status: 'complete', finishedAt: new Date(now).toISOString() } } : {}),
    }, now)
  }

  disconnect(actorId: string): void {
    for (const session of this.sessions.values()) {
      if (this.ownerId(session) !== actorId || !session.ownerConnected) continue
      const now = Date.now()
      const work = session.snapshot.work
      if (work?.status === 'working') this.publish(session, {
        status: 'idle', work: { ...work, status: 'interrupted', finishedAt: new Date(now).toISOString() },
      }, now, { owner: undefined })
      else this.persistMetadata(session, { owner: undefined })
      session.ownerConnected = false
      session.workTouchedAt = undefined
      if (session.snapshot.status !== 'complete') session.touchedAt = now
    }
  }

  /** Unfinished diagrams keep their owning MCP connection alive while idle. */
  hasActiveOwner(actorId: string): boolean {
    for (const session of this.sessions.values()) {
      if (session.ownerConnected && this.ownerId(session) === actorId && session.snapshot.status !== 'complete') return true
    }
    return false
  }

  streamUrl(sessionId: string, actorId: string, baseUrl: string): string {
    const session = this.owned(sessionId, actorId)
    const url = new URL(`${LIVE_ROOT}/${sessionId}/events`, liveViewerBase(baseUrl))
    url.searchParams.set('token', session.token)
    return url.href
  }

  viewerUrl(sessionId: string, actorId: string, streamBaseUrl: string, baseUrl?: string): string {
    const url = new URL(`${LIVE_ROOT}/${sessionId}`, liveViewerBase(baseUrl))
    url.hash = new URLSearchParams({ stream: this.streamUrl(sessionId, actorId, streamBaseUrl) }).toString()
    return url.href
  }

  private ownerId(session: LiveSession): string { return session.durable?.owner?.actorId ?? session.snapshot.actor.id }

  private owned(sessionId: string, actorId: string): LiveSession {
    const session = this.sessions.get(sessionId)
    if (!session || !session.ownerConnected || this.ownerId(session) !== actorId) throw new Error('Live diagram not found for this MCP connection')
    return session
  }

  private persistMetadata(session: LiveSession, patch: Partial<Pick<ReviewEnvelope, 'owner' | 'readToken' | 'viewerOrigin'>>): void {
    if (!session.durable) return
    const durable = { ...session.durable, ...patch }
    this.reviewStore!.save(durable, session.snapshot.revision)
    session.durable = durable
    session.token = durable.readToken
    session.viewerOrigin = durable.viewerOrigin
  }

  private publish(session: LiveSession, patch: Partial<LiveDiagramSnapshot>, now = Date.now(), metadata: Partial<Pick<ReviewEnvelope, 'owner' | 'viewerOrigin'>> = {}): LiveDiagramSnapshot {
    const snapshot: LiveDiagramSnapshot = {
      ...session.snapshot, ...patch,
      revision: session.snapshot.revision + 1, updatedAt: new Date(now).toISOString(),
    }
    if (session.durable) {
      const durable: ReviewEnvelope = { ...session.durable, ...metadata,
        artifact: { ...session.durable.artifact, snapshot, revisions: [...session.durable.artifact.revisions, snapshot] },
      }
      this.reviewStore!.save(durable, session.snapshot.revision)
      session.durable = durable
      session.viewerOrigin = durable.viewerOrigin
    }
    session.snapshot = snapshot
    session.touchedAt = now
    session.workTouchedAt = snapshot.work?.status === 'working' ? now : undefined
    for (const listener of session.listeners) listener(snapshot)
    return structuredClone(snapshot)
  }

  private expireWork(session: LiveSession, now: number): void {
    const work = session.snapshot.work
    if (work?.status !== 'working' || session.workTouchedAt === undefined || now - session.workTouchedAt < this.workLeaseMs) return
    this.publish(session, {
      status: 'idle', work: { ...work, status: 'interrupted', finishedAt: new Date(now).toISOString() },
    }, now)
  }

  /** Another relay may rotate a saved review's read authority after handoff. */
  private currentReadCapability(session: LiveSession): boolean {
    if (!session.durable) return true
    try {
      const saved = this.reviewStore!.read(session.snapshot.sessionId)
      if (saved?.readToken === session.token && saved.viewerOrigin === session.viewerOrigin) return true
    } catch { /* Unreadable authority fails closed; never serve a cached secret. */ }
    for (const listener of session.listeners) listener(null)
    // Discard stale metadata as well, so a subsequent resume cannot write the
    // old capability back over the one committed by the other relay.
    if (!session.ownerConnected) this.sessions.delete(session.snapshot.sessionId)
    return false
  }

  sweep(now = Date.now()): void {
    for (const [id, session] of this.sessions) {
      if (session.durable && !session.ownerConnected && session.listeners.size && !this.currentReadCapability(session)) continue
      const age = now - session.touchedAt
      if (!session.durable && (!session.ownerConnected || session.snapshot.status === 'complete') && age >= this.retainForMs) {
        for (const listener of session.listeners) listener(null)
        this.sessions.delete(id)
      } else this.expireWork(session, now)
    }
  }

  close(): void {
    clearInterval(this.timer)
    for (const actorId of new Set([...this.sessions.values()].filter(session => session.ownerConnected).map(session => this.ownerId(session)))) this.disconnect(actorId)
    for (const session of this.sessions.values()) {
      for (const listener of session.listeners) listener(null)
    }
    this.sessions.clear()
  }

  /** The token authorizes reading one diagram; only the owning MCP connection writes. */
  handleRequest(request: Request): Response {
    const url = new URL(request.url)
    const match = url.pathname.match(/^\/live\/([^/]+)\/(events|review)$/)
    const session = match && this.sessions.get(match[1])
    if (!session || url.searchParams.get('token') !== session.token || !this.currentReadCapability(session)) return jsonError('Live diagram not found', 404)
    const origin = request.headers.get('origin')
    if (origin && origin !== session.viewerOrigin) return jsonError('Origin is not the configured studio', 403)
    const headers = new Headers({
      'cache-control': 'no-store',
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-allow-headers': 'last-event-id',
      'access-control-allow-private-network': 'true',
      'vary': 'Origin',
      ...(origin ? { 'access-control-allow-origin': origin } : {}),
    })
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (request.method !== 'GET') return new Response(null, { status: 405, headers })
    if (match![2] === 'review') {
      if (!session.durable) return jsonError('Saved architecture review not found', 404)
      return Response.json(session.durable.artifact, { headers })
    }
    headers.set('content-type', 'text/event-stream')
    headers.set('x-accel-buffering', 'no')
    let cleanup: () => void = () => {}
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false
        let heartbeat: ReturnType<typeof setInterval> | undefined
        const finish = () => {
          if (closed) return
          closed = true
          clearInterval(heartbeat)
          session.listeners.delete(send)
          request.signal.removeEventListener('abort', finish)
          try { controller.close() } catch { /* reader already cancelled */ }
        }
        const send = (snapshot: LiveDiagramSnapshot | null) => {
          if (!snapshot) return finish()
          if (closed) return
          // Slow/offline consumers reconnect to the latest full state instead of
          // accumulating an unbounded queue of historical diagrams.
          if ((controller.desiredSize ?? 1) < -2) return finish()
          controller.enqueue(encoder.encode(`id: ${snapshot.revision}\nevent: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`))
        }
        cleanup = finish
        session.listeners.add(send)
        request.signal.addEventListener('abort', finish, { once: true })
        if (request.signal.aborted) return finish()
        send(session.snapshot)
        heartbeat = setInterval(() => {
          if (!closed) controller.enqueue(encoder.encode(': heartbeat\n\n'))
        }, HEARTBEAT_MS)
        heartbeat.unref()
      },
      cancel() { cleanup() },
    })
    return new Response(stream, { headers })
  }
}

/** A stdio MCP process only listens once the first live diagram is requested. */
export async function startLocalLiveService(options: { reviewDir?: string } = {}): Promise<LiveDiagramService & { close(): void }> {
  const hub = new LiveDiagramHub({ reviewDir: options.reviewDir ?? process.env.ARC_REVIEW_DIR ?? join(homedir(), '.arc/reviews') })
  const http = createServer(async (incoming, outgoing) => {
    const host = incoming.headers.host
    if (!host || host !== `127.0.0.1:${(http.address() as { port: number }).port}`) {
      outgoing.writeHead(403).end()
      return
    }
    const abort = new AbortController()
    outgoing.on('close', () => abort.abort())
    try {
      const request = new Request(`http://${host}${incoming.url}`, {
        method: incoming.method, headers: incoming.headers as Record<string, string>, signal: abort.signal,
      })
      const response = hub.handleRequest(request)
      outgoing.writeHead(response.status, Object.fromEntries(response.headers))
      if (response.body) Readable.fromWeb(response.body as unknown as NodeReadableStream<Uint8Array>).on('error', () => outgoing.destroy()).pipe(outgoing)
      else outgoing.end()
    } catch {
      outgoing.writeHead(500).end()
    }
  })
  try {
    await new Promise<void>((resolve, reject) => {
      http.once('error', reject)
      http.listen(0, '127.0.0.1', resolve)
    })
  } catch (error) {
    hub.close()
    throw error
  }
  const address = http.address() as { port: number }
  return {
    hub, baseUrl: `http://127.0.0.1:${address.port}`,
    close() { hub.close(); http.close(); http.closeAllConnections() },
  }
}
