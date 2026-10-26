import { describe, expect, test } from 'bun:test'
import { advanceEditPresence, deriveEditPresence } from '../src/apps/arc-live/editPresence'
import type { LiveDiagramSnapshot } from '../src/types/live'

function snapshot(): LiveDiagramSnapshot {
  return {
    sessionId: 'session-a', revision: 1, title: 'Architecture',
    actor: { id: 'connection-a', name: 'MCP client' }, status: 'working', updatedAt: '2026-10-24T12:00:00.000Z',
    diagram: {
      layout: { width: 800, height: 500 },
      nodes: { api: { x: 100, y: 100, size: 'm' }, db: { x: 400, y: 100, size: 'm' } },
      nodeData: {
        api: { name: 'API', kind: 'backend', source: { path: 'src/api.ts', line: 10, commit: 'abc' } },
        db: { name: 'Database', kind: 'database' },
      },
      connectors: [{ id: 'read', from: 'api', to: 'db', fromAnchor: 'right', toAnchor: 'left', style: 'data' }],
      connectorStyles: { data: { color: 'blue', strokeWidth: 2 } },
    },
  }
}

function revision(before: LiveDiagramSnapshot): LiveDiagramSnapshot {
  return { ...JSON.parse(JSON.stringify(before)), revision: before.revision + 1 }
}

describe('observed node edit presence', () => {
  test('ignores initial, other-session, duplicate, and older snapshots', () => {
    const before = snapshot()
    const after = revision(before)
    after.diagram.nodes.api.x = 200
    expect(deriveEditPresence(null, after)).toBeNull()
    expect(deriveEditPresence(before, { ...after, sessionId: 'session-b' })).toBeNull()
    for (const status of ['idle', 'complete'] as const) expect(deriveEditPresence(before, { ...after, status })).toEqual({ nodeId: 'api', action: 'Moved' })
    for (const number of [0, 1]) expect(deriveEditPresence(before, { ...after, revision: number })).toBeNull()
  })

  test('ignores fresh JSON object identities, key ordering, and status-only revisions', () => {
    const before = snapshot()
    const after = revision(before)
    after.diagram.nodeData.api.source = { commit: 'abc', line: 10, path: 'src/api.ts' }
    after.diagram.nodeData.api.description = undefined
    after.message = 'Still here'
    after.updatedAt = '2026-10-24T12:00:05.000Z'
    expect(deriveEditPresence(before, after)).toBeNull()
    expect(deriveEditPresence({ ...before, status: 'idle' }, after)).toBeNull()
  })

  test('prioritizes added nodes, then movement, then changed data', () => {
    const before = snapshot()
    const after = revision(before)
    after.diagram.nodeData.api.name = 'Updated API'
    after.diagram.nodes.db.x = 450
    after.diagram.nodes.cache = { x: 600, y: 100, size: 'm' }
    after.diagram.nodeData.cache = { name: 'Cache', kind: 'cache' }
    expect(deriveEditPresence(before, after)).toEqual({ nodeId: 'cache', action: 'Added' })
    delete after.diagram.nodes.cache
    delete after.diagram.nodeData.cache
    expect(deriveEditPresence(before, after)).toEqual({ nodeId: 'db', action: 'Moved' })
    after.diagram.nodes.db.x = 400
    expect(deriveEditPresence(before, after)).toEqual({ nodeId: 'api', action: 'Updated' })
  })

  test('detects real nested changes and resizing without claiming a move', () => {
    const before = snapshot()
    const after = revision(before)
    after.diagram.nodeData.api.source!.line = 12
    expect(deriveEditPresence(before, after)).toEqual({ nodeId: 'api', action: 'Updated' })
    after.diagram.nodeData.api.source!.line = 10
    after.diagram.nodes.db.width = 220
    expect(deriveEditPresence(before, after)).toEqual({ nodeId: 'db', action: 'Updated' })
  })

  test('attaches added, edited, and removed connectors to a surviving target', () => {
    const before = snapshot()
    const empty = revision(before)
    empty.diagram.connectors = []
    expect(deriveEditPresence(before, empty)).toEqual({ nodeId: 'db', action: 'Disconnected' })
    const restored = revision(empty)
    restored.diagram.connectors = structuredClone(before.diagram.connectors)
    expect(deriveEditPresence(empty, restored)).toEqual({ nodeId: 'db', action: 'Connected' })
    const labelled = revision(before)
    labelled.diagram.connectors[0].label = 'Read data'
    expect(deriveEditPresence(before, labelled)).toEqual({ nodeId: 'db', action: 'Updated' })
    const reversed = revision(before)
    reversed.diagram.connectors[0].from = 'db'
    reversed.diagram.connectors[0].to = 'api'
    expect(deriveEditPresence(before, reversed)).toEqual({ nodeId: 'api', action: 'Connected' })
  })

  test('never attaches to a removed node and does not invent cues for unrelated changes', () => {
    const before = snapshot()
    const after = revision(before)
    delete after.diagram.nodes.db
    delete after.diagram.nodeData.db
    after.diagram.connectors = []
    expect(deriveEditPresence(before, after)).toEqual({ nodeId: 'api', action: 'Disconnected' })
    const noEdges = { ...before, diagram: { ...before.diagram, connectors: [] } }
    expect(deriveEditPresence(noEdges, after)).toBeNull()
    delete after.diagram.nodes.api
    delete after.diagram.nodeData.api
    expect(deriveEditPresence(before, after)).toBeNull()
    const layout = revision(before)
    layout.diagram.layout.width = 1200
    layout.diagram.connectorStyles.unused = { color: 'rose', strokeWidth: 3 }
    expect(deriveEditPresence(before, layout)).toBeNull()
  })

  test('uses referenced style changes and preserves both input snapshots', () => {
    const before = snapshot()
    const after = revision(before)
    after.diagram.connectorStyles.data.color = 'emerald'
    const copies = structuredClone([before, after])
    expect(deriveEditPresence(before, after)).toEqual({ nodeId: 'db', action: 'Updated' })
    expect([before, after]).toEqual(copies)
  })
})


describe('work and completion attribution', () => {
  const empty = { pending: null, completed: null }
  const work = { id: 'turn-a', summary: 'Reposition API', scope: { type: 'nodes' as const, nodeIds: ['api'] }, status: 'working' as const, startedAt: '2026-10-24T12:00:00.000Z' }
  test('announces before mutation, holds attribution until finish, and preserves final node', () => {
    const start = snapshot()
    const begin = { ...revision(start), work }
    const pending = advanceEditPresence(empty, start, begin)
    expect(pending).toEqual(empty)
    const update = revision(begin)
    update.diagram.nodes.api.x = 220
    const changed = advanceEditPresence(pending, begin, update)
    expect(changed.pending).toEqual({ nodeId: 'api', action: 'Moved' })
    expect(changed.completed).toBeNull()
    const done = { ...revision(update), status: 'idle' as const, work: { ...work, status: 'complete' as const, finishedAt: '2026-10-24T12:00:10.000Z' } }
    const result = advanceEditPresence(changed, update, done)
    expect(result.pending).toBeNull()
    expect(result.completed?.nodeId).toBe('api')
    expect(result.completed?.updatedAt).toBe(done.updatedAt)
  })
  test('interruption never celebrates unfinished work and a new turn clears old results', () => {
    const begin = { ...snapshot(), work }
    const update = revision(begin)
    update.diagram.nodes.api.x = 220
    const pending = advanceEditPresence(empty, begin, update)
    const interrupted = { ...revision(update), status: 'idle' as const, work: { ...work, status: 'interrupted' as const, finishedAt: '2026-10-24T12:00:10.000Z' } }
    expect(advanceEditPresence(pending, update, interrupted)).toEqual(empty)
    const beforeWork = { ...snapshot(), status: 'idle' as const }
    expect(advanceEditPresence(empty, beforeWork, interrupted)).toEqual(empty)
    const next = { ...revision(interrupted), work: { ...work, id: 'turn-b' }, status: 'working' as const }
    expect(advanceEditPresence({ pending: null, completed: { nodeId: 'api', action: 'Moved' } }, interrupted, next)).toEqual(empty)
  })
  test('ordinary updates receive only result attribution and unchanged work invents no edits', () => {
    const before = { ...snapshot(), status: 'idle' as const }
    const after = revision(before)
    after.diagram.nodes.api.x = 220
    expect(advanceEditPresence(empty, before, after).completed?.action).toBe('Moved')
    const begin = { ...revision(before), work, status: 'working' as const }
    const done = { ...revision(begin), status: 'idle' as const, work: { ...work, status: 'complete' as const, finishedAt: '2026-10-24T12:00:10.000Z' } }
    expect(advanceEditPresence(empty, begin, done)).toEqual(empty)
  })
})
