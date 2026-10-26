import type { LiveDiagramSnapshot, LiveDiagramWork } from '../../types/live'
import { normalizeLiveDiagram } from '../../utils/liveDiagramValidation'
import { diffDiagram } from '../../utils/diffDiagram'
import { readArchitectureReview } from './reviewData'

/** Activity requires an explicit work announcement, not the arrival of a finished edit. */
export function isDiagramWorking(connection: string, snapshot: Pick<LiveDiagramSnapshot, 'status' | 'work'> | null): boolean {
  return connection === 'connected' && snapshot?.status === 'working' && snapshot.work?.status === 'working'
}

export function connectionLabel(connection: string, working: boolean): string {
  if (connection === 'complete') return 'Session complete'
  if (connection === 'connected') return working ? 'Working on diagram' : 'Listening for changes'
  if (connection === 'reconnecting') return 'Reconnecting'
  if (connection === 'unavailable') return 'Not connected'
  return 'Connecting'
}

/** A handoff is a read-only stream capability. Never include it in telemetry. */
export function parseLiveStream(hash: string, sessionId: string): string | null {
  const value = new URLSearchParams(hash.replace(/^#/, '')).get('stream')
  if (!value) return null
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null
    if (!url.pathname.endsWith(`/live/${encodeURIComponent(sessionId)}/events`)) return null
    return url.href
  } catch { return null }
}

export function readLiveSnapshot(value: unknown, sessionId: string): LiveDiagramSnapshot {
  const s = value as LiveDiagramSnapshot
  if (!s || s.sessionId !== sessionId || !Number.isSafeInteger(s.revision) || s.revision < 1
    || typeof s.title !== 'string' || !s.actor || typeof s.actor.name !== 'string'
    || typeof s.actor.id !== 'string' || (s.actor.version != null && typeof s.actor.version !== 'string')
    || ('harness' in s.actor && s.actor.harness !== undefined && typeof s.actor.harness !== 'string')
    || ('displayName' in s.actor && s.actor.displayName !== undefined && typeof s.actor.displayName !== 'string')
    || !['working', 'idle', 'complete'].includes(s.status)
    || typeof s.updatedAt !== 'string' || !Number.isFinite(Date.parse(s.updatedAt))
    || (s.message != null && typeof s.message !== 'string')) {
    throw new Error('The live session sent an invalid update.')
  }
  if (s.work !== undefined) validateWork(s.work, s.status)
  return {
    sessionId: s.sessionId, revision: s.revision, title: s.title,
    actor: { name: s.actor.name, id: s.actor.id, version: s.actor.version, harness: s.actor.harness, displayName: s.actor.displayName },
    status: s.status, updatedAt: s.updatedAt, message: s.message,
    ...(s.work === undefined ? {} : { work: {
      id: s.work.id, summary: s.work.summary, status: s.work.status, startedAt: s.work.startedAt, finishedAt: s.work.finishedAt,
      scope: s.work.scope.type === 'canvas' ? { type: 'canvas' as const } : s.work.scope.type === 'nodes'
        ? { type: 'nodes' as const, nodeIds: [...s.work.scope.nodeIds] }
        : { type: 'region' as const, x: s.work.scope.x, y: s.work.scope.y, width: s.work.scope.width, height: s.work.scope.height },
    } }),
    ...(s.review === undefined ? {} : { review: readArchitectureReview(s.review) }),
    diagram: normalizeLiveDiagram(s.diagram),
  }
}

function validateWork(work: LiveDiagramWork, status: LiveDiagramSnapshot['status']): void {
  const invalid = () => { throw new Error('The live session sent an invalid work update.') }
  if (!work || typeof work.id !== 'string' || !work.id || work.id.length > 200
    || typeof work.summary !== 'string' || !work.summary.trim() || work.summary.length > 500
    || !['working', 'complete', 'interrupted'].includes(work.status)
    || typeof work.startedAt !== 'string' || !Number.isFinite(Date.parse(work.startedAt))
    || (work.finishedAt !== undefined && (typeof work.finishedAt !== 'string' || !Number.isFinite(Date.parse(work.finishedAt))))
    || (work.status === 'working' ? status !== 'working' || work.finishedAt !== undefined : status === 'working' || !work.finishedAt)
    || !work.scope) return invalid()
  const scope = work.scope
  if (scope.type === 'canvas') return
  if (scope.type === 'nodes') {
    if (!Array.isArray(scope.nodeIds) || !scope.nodeIds.length || scope.nodeIds.length > 200
      || scope.nodeIds.some(id => typeof id !== 'string' || !id || id.length > 200)) invalid()
    return
  }
  if (scope.type === 'region') {
    if (![scope.x, scope.y, scope.width, scope.height].every(value => Number.isFinite(value) && Math.abs(value) <= 100000)
      || scope.width <= 0 || scope.height <= 0) invalid()
    return
  }
  invalid()
}

export function describeUpdate(previous: LiveDiagramSnapshot | null, next: LiveDiagramSnapshot): string {
  if (next.work?.status === 'working' && previous?.work?.id !== next.work.id) return next.work.summary
  if (next.work?.status === 'interrupted') return 'Work interrupted'
  if (next.message) return next.message
  if (next.status === 'complete') return 'Diagram complete'
  if (!previous) return 'Diagram connected'
  const delta = diffDiagram(previous.diagram, next.diagram)
  const parts: string[] = []
  const count = (n: number, noun: string, verb: string) => {
    if (n) parts.push(`${n} ${noun}${n === 1 ? '' : 's'} ${verb}`)
  }
  count(delta.nodes.added.length, 'node', 'added')
  count(delta.nodes.moved.length, 'node', 'moved')
  count(delta.nodes.removed.length, 'node', 'removed')
  count(delta.connectors.added.length, 'connection', 'added')
  count(delta.connectors.removed.length, 'connection', 'removed')
  return parts.join(' · ') || 'Diagram updated'
}
