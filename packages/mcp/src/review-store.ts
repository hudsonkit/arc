import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync, chmodSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { ArchitectureReview, ArchitectureReviewArtifact, LiveDiagramSnapshot } from '../../../src/types/live.ts'
import { normalizeLiveDiagram } from '../../../src/utils/liveDiagramValidation.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_ARTIFACT_BYTES = 64 * 1024 * 1024
const MAX_REVISIONS = 2000

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`)
  return value as Record<string, unknown>
}

function string(value: unknown, label: string, max: number, empty = false): string {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim()) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw new Error(`${label} must be text of ${empty ? '0' : '1'}–${max} characters`)
  return value
}

function url(value: unknown, label: string): string {
  const text = string(value, label, 2048)
  const parsed = new URL(text)
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error(`${label} must be an HTTP(S) URL without credentials`)
  return text
}

function list(value: unknown, label: string, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new Error(`${label} must be an array of at most ${max} items`)
  return value
}

/** Copy only the public review contract; capabilities and unknown fields cannot leak. */
export function normalizeReview(value: unknown): ArchitectureReview {
  const review = object(value, 'review')
  const repository = review.repository === undefined ? undefined : object(review.repository, 'repository')
  const result: ArchitectureReview = {
    question: string(review.question, 'question', 4000),
    ...(repository ? { repository: {
      name: string(repository.name, 'repository.name', 200),
      ...(repository.url === undefined ? {} : { url: url(repository.url, 'repository.url') }),
      ...(repository.revision === undefined ? {} : { revision: string(repository.revision, 'repository.revision', 200) }),
    } } : {}),
    ...(review.summary === undefined ? {} : { summary: string(review.summary, 'summary', 16000, true) }),
    findings: list(review.findings, 'findings', 200).map((value, index) => {
      const finding = object(value, `findings[${index}]`)
      if (!['info', 'low', 'medium', 'high'].includes(finding.severity as string)) throw new Error('Finding severity must be info, low, medium, or high')
      return {
        id: string(finding.id, 'finding.id', 200), title: string(finding.title, 'finding.title', 500),
        detail: string(finding.detail, 'finding.detail', 16000), severity: finding.severity as ArchitectureReview['findings'][number]['severity'],
        ...(finding.nodeIds === undefined ? {} : { nodeIds: list(finding.nodeIds, 'finding.nodeIds', 200).map(id => string(id, 'nodeId', 200)) }),
        sources: list(finding.sources, 'finding.sources', 50).map(value => {
          const source = object(value, 'source')
          if (source.line !== undefined && (!Number.isSafeInteger(source.line) || (source.line as number) <= 0)) throw new Error('Source line must be a positive safe integer')
          return {
            path: string(source.path, 'source.path', 2000),
            ...(source.line === undefined ? {} : { line: source.line as number }),
            ...(source.revision === undefined ? {} : { revision: string(source.revision, 'source.revision', 200) }),
            ...(source.url === undefined ? {} : { url: url(source.url, 'source.url') }),
          }
        }),
      }
    }),
    decisions: list(review.decisions, 'decisions', 200).map(value => string(value, 'decision', 4000)),
    openQuestions: list(review.openQuestions, 'openQuestions', 200).map(value => string(value, 'open question', 4000)),
  }
  if (new Set(result.findings.map(item => item.id)).size !== result.findings.length) throw new Error('Finding IDs must be unique')
  if (Buffer.byteLength(JSON.stringify(result)) > 1024 * 1024) throw new Error('Review metadata exceeds 1 MiB')
  return result
}

/** Private disk envelope. Never return this object from a viewer endpoint. */
export interface ReviewEnvelope {
  schemaVersion: 1
  readToken: string
  resumeTokenHash: string
  viewerOrigin: string
  owner?: { pid: number; instanceId: string; actorId: string }
  artifact: ArchitectureReviewArtifact
}

export function hashResumeToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function matchesResumeToken(token: string, hash: string): boolean {
  if (typeof token !== 'string' || token.length > 200 || !/^[a-f0-9]{64}$/.test(hash)) return false
  return timingSafeEqual(Buffer.from(hashResumeToken(token), 'hex'), Buffer.from(hash, 'hex'))
}

function processAlive(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false
  try { process.kill(pid, 0); return true } catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM' }
}

function validateSnapshot(value: unknown, sessionId: string): LiveDiagramSnapshot {
  const snapshot = object(value, 'snapshot')
  if (snapshot.sessionId !== sessionId || !Number.isSafeInteger(snapshot.revision) || (snapshot.revision as number) < 1
    || !['working', 'idle', 'complete'].includes(snapshot.status as string)) throw new Error('Invalid saved review snapshot')
  const actor = object(snapshot.actor, 'actor')
  string(actor.name, 'actor.name', 500)
  string(actor.id, 'actor.id', 200)
  string(snapshot.title, 'title', 200)
  if (typeof snapshot.updatedAt !== 'string' || !Number.isFinite(Date.parse(snapshot.updatedAt))) throw new Error('Invalid saved review timestamp')
  return { ...snapshot, diagram: normalizeLiveDiagram(snapshot.diagram), review: normalizeReview(snapshot.review) } as unknown as LiveDiagramSnapshot
}

export class ReviewStore {
  readonly directory: string
  readonly instanceId = randomUUID()

  constructor(directory: string) { this.directory = resolve(directory) }

  owner(actorId: string): NonNullable<ReviewEnvelope['owner']> { return { pid: process.pid, instanceId: this.instanceId, actorId } }

  ownedElsewhere(envelope: ReviewEnvelope): boolean {
    return !!envelope.owner && envelope.owner.instanceId !== this.instanceId && processAlive(envelope.owner.pid)
  }

  private path(id: string): string {
    if (!UUID.test(id)) throw new Error('Invalid review session ID')
    return join(this.directory, `${id}.json`)
  }

  read(id: string): ReviewEnvelope | undefined {
    const path = this.path(id)
    if (!existsSync(path)) return undefined
    if (statSync(path).size > MAX_ARTIFACT_BYTES + 8192) throw new Error('Saved review exceeds the storage limit')
    const value = object(JSON.parse(readFileSync(path, 'utf8')), 'saved review')
    const artifact = object(value.artifact, 'artifact')
    if (value.schemaVersion !== 1 || artifact.schemaVersion !== 1 || typeof value.readToken !== 'string'
      || !/^[\w-]{43}$/.test(value.readToken) || typeof value.resumeTokenHash !== 'string' || !/^[a-f0-9]{64}$/.test(value.resumeTokenHash)) throw new Error('Invalid saved review envelope')
    const viewerOrigin = url(value.viewerOrigin, 'viewer origin')
    if (new URL(viewerOrigin).origin !== viewerOrigin) throw new Error('Invalid saved viewer origin')
    const snapshot = validateSnapshot(artifact.snapshot, id)
    const revisions = list(artifact.revisions, 'revisions', MAX_REVISIONS).map(item => validateSnapshot(item, id))
    if (!revisions.length || revisions.some((item, index) => item.revision !== index + 1)
      || JSON.stringify(revisions.at(-1)) !== JSON.stringify(snapshot)) throw new Error('Saved review history is inconsistent')
    const owner = value.owner === undefined ? undefined : object(value.owner, 'owner')
    if (owner && (!Number.isSafeInteger(owner.pid) || typeof owner.instanceId !== 'string' || typeof owner.actorId !== 'string' || !owner.actorId || (owner.actorId as string).length > 200)) throw new Error('Invalid saved review owner')
    return {
      schemaVersion: 1, readToken: value.readToken, resumeTokenHash: value.resumeTokenHash, viewerOrigin,
      ...(owner ? { owner: owner as ReviewEnvelope['owner'] } : {}),
      artifact: { schemaVersion: 1, baseline: normalizeLiveDiagram(artifact.baseline), snapshot, revisions },
    }
  }

  all(): ReviewEnvelope[] {
    if (!existsSync(this.directory)) return []
    return readdirSync(this.directory).filter(name => name.endsWith('.json') && UUID.test(name.slice(0, -5))).map(name => this.read(name.slice(0, -5))!)
  }

  /** A disk commit happens before the hub exposes a revision or capability change. */
  save(envelope: ReviewEnvelope, expectedRevision?: number): void {
    if (envelope.artifact.revisions.length > MAX_REVISIONS) throw new Error('Review history reached 2000 revisions; open a new review')
    const body = JSON.stringify(envelope)
    if (Buffer.byteLength(body) > MAX_ARTIFACT_BYTES) throw new Error('Review history exceeds 64 MiB; open a new review')
    mkdirSync(this.directory, { recursive: true, mode: 0o700 })
    chmodSync(this.directory, 0o700)
    const path = this.path(envelope.artifact.snapshot.sessionId)
    const lock = `${path}.lock`
    let lockFd: number
    try { lockFd = openSync(lock, 'wx', 0o600) } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      let pid: number | undefined
      try { pid = JSON.parse(readFileSync(lock, 'utf8')).pid } catch { /* process may be writing the lock */ }
      if (pid ? processAlive(pid) : Date.now() - statSync(lock).mtimeMs < 5000) throw new Error('Review is busy in another write; retry')
      rmSync(lock)
      lockFd = openSync(lock, 'wx', 0o600)
    }
    const temporary = `${path}.${randomUUID()}.tmp`
    try {
      writeFileSync(lockFd, JSON.stringify({ pid: process.pid }))
      const previous = this.read(envelope.artifact.snapshot.sessionId)
      if (previous?.artifact.snapshot.revision !== expectedRevision) throw new Error('Review changed in another relay; resume it again before writing')
      if (previous && this.ownedElsewhere(previous)) throw new Error('Review is still owned by a live MCP connection in another relay')
      const fd = openSync(temporary, 'wx', 0o600)
      try { writeFileSync(fd, body); fsyncSync(fd) } finally { closeSync(fd) }
      renameSync(temporary, path)
      const directoryFd = openSync(this.directory, 'r')
      try { fsyncSync(directoryFd) } finally { closeSync(directoryFd) }
    } finally {
      closeSync(lockFd)
      rmSync(temporary, { force: true })
      rmSync(lock, { force: true })
    }
  }
}
