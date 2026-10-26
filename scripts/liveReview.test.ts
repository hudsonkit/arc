import { describe, expect, test } from 'bun:test'
import type { ArchitectureReview, ArchitectureReviewArtifact, LiveDiagramSnapshot } from '../src/types/live'
import { readArchitectureReview, reviewSourceUrl, reviewWebUrl } from '../src/apps/arc-live/reviewData'
import { mergeReviewRevisions, readReviewArtifact, reviewActivity, reviewArtifactUrl } from '../src/apps/arc-live/savedReview'
import { readLiveSnapshot } from '../src/apps/arc-live/liveState'

const review: ArchitectureReview = {
  question: 'Where does the API hand off persistence?',
  repository: { name: 'hudsonkit/arc', url: 'https://github.com/hudsonkit/arc', revision: 'abc123' },
  summary: 'The API owns the write boundary.',
  findings: [{ id: 'write-boundary', title: 'Writes need a durable receipt', detail: 'The service can acknowledge a write before storage completes.', severity: 'medium', nodeIds: ['api'], sources: [{ path: 'src/api.ts', line: 42 }] }],
  decisions: ['Persist before acknowledging.'], openQuestions: ['Who retries a failed write?'],
}
const snapshot = (revision = 1): LiveDiagramSnapshot => ({
  sessionId: 'test-review', revision, title: 'API review', actor: { name: 'Codex', id: 'connection-1' },
  diagram: {
    layout: { width: 800, height: 500 }, nodes: { api: { x: revision * 100, y: 100, size: 'm' } },
    nodeData: { api: { name: 'API', kind: 'service' } }, connectors: [], connectorStyles: {},
  },
  status: 'idle', updatedAt: new Date(1700000000000 + revision * 1000).toISOString(), review,
})
const artifact = (): ArchitectureReviewArtifact => ({ schemaVersion: 1, baseline: snapshot().diagram, snapshot: snapshot(3), revisions: [snapshot(), snapshot(2), snapshot(3)] })

describe('review metadata boundary', () => {
  test('accepts linked findings, historical node references, and an explicitly cleared summary', () => {
    expect(readArchitectureReview(review)).toEqual(review)
    expect(readArchitectureReview({ ...review, summary: '' }).summary).toBe('')
    expect(readArchitectureReview({ ...review, findings: [{ ...review.findings[0], nodeIds: ['removed-node'] }] }).findings[0].nodeIds).toEqual(['removed-node'])
  })
  test.each([
    null,
    { ...review, findings: {} },
    { ...review, question: ' ' },
    { ...review, summary: 2 },
    { ...review, decisions: [null] },
    { ...review, openQuestions: 'unknown' },
    { ...review, repository: { name: 'repo', url: 'javascript:alert(1)' } },
    { ...review, findings: [review.findings[0], review.findings[0]] },
    { ...review, findings: [{ ...review.findings[0], severity: 'urgent' }] },
    { ...review, findings: [{ ...review.findings[0], sources: [{ path: 'src/api.ts', line: -1 }] }] },
    { ...review, findings: [{ ...review.findings[0], sources: [{ path: 'src/api.ts', line: 1.5 }] }] },
    { ...review, findings: [{ ...review.findings[0], sources: [{ path: 'src/api.ts', url: 'https://secret@example.com/source' }] }] },
    { ...review, findings: [{ ...review.findings[0], nodeIds: [null] }] },
  ])('rejects malformed or unsafe review metadata %#', value => {
    expect(() => readArchitectureReview(value)).toThrow('invalid review')
  })
  test('snapshot parsing validates reviews before the viewer can render them', () => {
    expect(() => readLiveSnapshot({ ...snapshot(), review: { ...review, findings: [null] } }, 'test-review')).toThrow()
  })
  test('projects public fields rather than carrying unknown capabilities into a download', () => {
    const value = artifact()
    const received = {
      ...value, token: 'read-secret', resumeToken: 'resume-secret',
      snapshot: { ...value.snapshot, token: 'snapshot-secret', actor: { ...value.snapshot.actor, sessionToken: 'actor-secret' }, review: { ...review, token: 'review-secret' } },
    }
    const result = JSON.stringify(readReviewArtifact(received, 'test-review'))
    expect(result).not.toContain('secret')
    expect(result).not.toContain('Token')
  })
})

describe('saved revision recovery', () => {
  test('uses the same read capability and retains the canonical base path', () => {
    expect(reviewArtifactUrl('http://localhost:8080/arc/live/test-review/events?token=read-token')).toBe('http://localhost:8080/arc/live/test-review/review?token=read-token')
    expect(() => reviewArtifactUrl('https://example.com/something')).toThrow()
  })
  test('restores the baseline and every historical revision', () => {
    const saved = readReviewArtifact(artifact(), 'test-review')
    expect(saved.revisions.map(revision => revision.revision)).toEqual([1, 2, 3])
    expect(saved.baseline.nodes.api.x).toBe(100)
    expect(reviewActivity(saved.revisions).map(entry => entry.revision)).toEqual([3, 2, 1])
    expect(reviewActivity(saved.revisions)[0].message).toBe('1 node moved')
  })
  test('adds the latest snapshot when the history omits it', () => {
    const value = artifact()
    value.revisions.pop()
    expect(readReviewArtifact(value, 'test-review').revisions.map(revision => revision.revision)).toEqual([1, 2, 3])
  })
  test('an older artifact fills missed revisions without replacing newer SSE data', () => {
    const live = snapshot(4)
    const known = snapshot(3)
    known.message = 'Current live receipt'
    const revisions = mergeReviewRevisions([known, live], artifact().revisions)
    expect(revisions.map(revision => revision.revision)).toEqual([1, 2, 3, 4])
    expect(revisions[2].message).toBe('Current live receipt')
    expect(revisions[3]).toBe(live)
    expect(mergeReviewRevisions(revisions, artifact().revisions)).toEqual(revisions)
  })
  test('does not merge another session into the active history', () => {
    expect(mergeReviewRevisions([snapshot(3)], [{ ...snapshot(4), sessionId: 'other' }])).toHaveLength(1)
    expect(() => readReviewArtifact(artifact(), 'other')).toThrow('invalid update')
  })
  test('rejects duplicate, decreasing, future, and mismatched saved revisions', () => {
    for (const revisions of [[snapshot(2), snapshot()], [snapshot(), snapshot()], [snapshot(4)], [{ ...snapshot(), sessionId: 'other' }]]) {
      expect(() => readReviewArtifact({ ...artifact(), revisions }, 'test-review')).toThrow()
    }
  })
  test('history is not limited to revisions seen by this tab or the last thirty entries', () => {
    const revisions = Array.from({ length: 40 }, (_, index) => snapshot(index + 1))
    expect(reviewActivity(mergeReviewRevisions([snapshot(41)], revisions))).toHaveLength(41)
  })
})

describe('source navigation', () => {
  test('explicit source URLs take priority', () => {
    expect(reviewSourceUrl({ path: 'a.ts', line: 2, url: 'https://example.com/file#L2' }, review.repository)).toBe('https://example.com/file#L2')
  })
  test('builds a source link only from a known GitHub repository and revision', () => {
    expect(reviewSourceUrl({ path: 'src/api.ts', line: 42 }, review.repository)).toBe('https://github.com/hudsonkit/arc/blob/abc123/src/api.ts#L42')
    expect(reviewSourceUrl({ path: 'src/my file.ts', revision: 'review/work', line: 4 }, review.repository)).toBe('https://github.com/hudsonkit/arc/blob/review%2Fwork/src/my%20file.ts#L4')
    expect(reviewSourceUrl({ path: 'src/api.ts' }, { name: 'arc', url: 'https://github.com/hudsonkit/arc' })).toBeUndefined()
  })
  test('does not invent navigation for local or traversal paths', () => {
    for (const path of ['/private/project/api.ts', '../api.ts', 'src/../api.ts', 'C:\\src\\api.ts']) {
      expect(reviewSourceUrl({ path }, review.repository)).toBeUndefined()
    }
  })
  test('rejects script, file, credential, and malformed URLs', () => {
    for (const value of ['javascript:alert(1)', 'file:///etc/passwd', 'https://user:password@example.com', 'not a url', 'data:text/html,hello']) expect(reviewWebUrl(value)).toBeUndefined()
  })
})
