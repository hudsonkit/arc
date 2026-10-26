import type { ArchitectureReviewArtifact, LiveDiagramSnapshot } from '../../types/live'
import { normalizeLiveDiagram } from '../../utils/liveDiagramValidation'
import { describeUpdate, readLiveSnapshot } from './liveState'

export interface ActivityEntry { revision: number; message: string; actor: string; updatedAt: string }

export function reviewArtifactUrl(stream: string): string {
  const url = new URL(stream)
  if (!url.pathname.endsWith('/events')) throw new Error('This session has no saved review address.')
  url.pathname = `${url.pathname.slice(0, -'/events'.length)}/review`
  return url.href
}

export function readReviewArtifact(value: unknown, sessionId: string): ArchitectureReviewArtifact {
  const artifact = value as ArchitectureReviewArtifact
  if (!artifact || artifact.schemaVersion !== 1 || !Array.isArray(artifact.revisions) || artifact.revisions.length > 2000) {
    throw new Error('The saved review could not be read.')
  }
  const snapshot = readLiveSnapshot(artifact.snapshot, sessionId)
  let previousRevision = 0
  const revisions = artifact.revisions.map(value => {
    const revision = readLiveSnapshot(value, sessionId)
    if (revision.revision <= previousRevision || revision.revision > snapshot.revision) {
      throw new Error('The saved review has an invalid revision history.')
    }
    previousRevision = revision.revision
    return revision
  })
  return {
    schemaVersion: 1, baseline: normalizeLiveDiagram(artifact.baseline), snapshot,
    revisions: [...revisions.filter(revision => revision.revision < snapshot.revision), snapshot],
  }
}

/** An older fetch fills history gaps without rolling back a newer SSE revision. */
export function mergeReviewRevisions(current: LiveDiagramSnapshot[], incoming: LiveDiagramSnapshot[]): LiveDiagramSnapshot[] {
  const revisions = new Map<number, LiveDiagramSnapshot>()
  const sessionId = current[0]?.sessionId ?? incoming[0]?.sessionId
  for (const revision of [...incoming, ...current]) {
    if (revision.sessionId === sessionId) revisions.set(revision.revision, revision)
  }
  return [...revisions.values()].sort((a, b) => a.revision - b.revision)
}

export function reviewActivity(revisions: LiveDiagramSnapshot[]): ActivityEntry[] {
  return revisions.map((revision, index) => ({
    revision: revision.revision, message: describeUpdate(revisions[index - 1] ?? null, revision),
    actor: revision.actor.displayName || revision.actor.harness || revision.actor.name, updatedAt: revision.updatedAt,
  })).reverse()
}
