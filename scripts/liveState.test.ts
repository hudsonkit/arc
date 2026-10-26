import { describe, expect, test } from 'bun:test'
import { connectionLabel, describeUpdate, isDiagramWorking, parseLiveStream, readLiveSnapshot } from '../src/apps/arc-live/liveState'
import type { LiveDiagramSnapshot } from '../src/types/live'

function snapshot(): LiveDiagramSnapshot {
  return {
    sessionId: 'session-a', revision: 1, title: 'Architecture',
    actor: { id: 'connection-a', name: 'Example MCP client', version: '1.0' },
    work: { id: 'work-a', summary: 'Working on API', scope: { type: 'nodes', nodeIds: ['api'] }, status: 'working', startedAt: '2026-10-23T12:00:00.000Z' },
    status: 'working', updatedAt: '2026-10-23T12:00:00.000Z',
    diagram: {
      layout: { width: 800, height: 500 },
      nodes: { api: { x: 100, y: 100, size: 'm' } },
      nodeData: { api: { name: 'API', icon: 'Server', color: 'emerald' } },
      connectors: [], connectorStyles: {},
    },
  }
}

describe('live viewer handoff and state boundary', () => {
  test('activity follows observed server phases instead of a brief local flash', () => {
    const working = snapshot()
    // Arrival time and local animation duration do not override server state.
    expect(isDiagramWorking('connected', working)).toBe(true)
    expect(connectionLabel('connected', isDiagramWorking('connected', working))).toBe('Working on diagram')
    const idle = { ...working, revision: 2, status: 'idle' as const }
    expect(isDiagramWorking('connected', idle)).toBe(false)
    expect(connectionLabel('connected', isDiagramWorking('connected', idle))).toBe('Listening for changes')
    expect(isDiagramWorking('connected', { ...working, revision: 3 })).toBe(true)
    expect(isDiagramWorking('complete', { ...working, status: 'complete' })).toBe(false)
    expect(connectionLabel('complete', false)).toBe('Session complete')
  })

  test('retained working snapshots cannot signal activity while disconnected or awaiting a stream', () => {
    for (const connection of ['connecting', 'reconnecting', 'unavailable', 'complete']) {
      expect(isDiagramWorking(connection, snapshot())).toBe(false)
    }
    expect(isDiagramWorking('connected', null)).toBe(false)
    expect(isDiagramWorking('connected', { ...snapshot(), status: 'complete' })).toBe(false)
    expect(connectionLabel('connecting', false)).toBe('Connecting')
    expect(connectionLabel('reconnecting', false)).toBe('Reconnecting')
    expect(connectionLabel('unavailable', false)).toBe('Not connected')
  })

  test('accepts a capability only for the requested session, including a hosted prefix', () => {
    const stream = 'https://relay.example/arc/live/session-a/events?token=read-capability'
    expect(parseLiveStream(`#${new URLSearchParams({ stream })}`, 'session-a')).toBe(stream)
    expect(parseLiveStream(`#${new URLSearchParams({ stream })}`, 'session-b')).toBeNull()
    for (const invalid of ['javascript:alert(1)', 'file:///live/session-a/events', 'https://user:password@example/live/session-a/events', 'not a URL']) {
      expect(parseLiveStream(`#${new URLSearchParams({ stream: invalid })}`, 'session-a')).toBeNull()
    }
    expect(parseLiveStream('', 'session-a')).toBeNull()
  })

  test('rejects cross-session, malformed, and invalid diagram snapshots', () => {
    expect(readLiveSnapshot(snapshot(), 'session-a')).toEqual(snapshot())
    for (const patch of [{ sessionId: 'other' }, { revision: 0 }, { revision: 1.5 }, { actor: { name: 'client' } }, { updatedAt: 'tomorrow' }, { status: 'thinking' }, { diagram: {} }]) {
      expect(() => readLiveSnapshot({ ...snapshot(), ...patch }, 'session-a')).toThrow()
    }
    expect(() => readLiveSnapshot(null, 'session-a')).toThrow()
  })

  test('preserves declared agent identity separately from MCP identity and rejects non-text fields', () => {
    const value = snapshot()
    const actor = { ...value.actor, harness: 'codex', displayName: 'Architecture agent' }
    expect(readLiveSnapshot({ ...value, actor }, 'session-a').actor).toEqual(actor)
    for (const field of ['harness', 'displayName']) {
      for (const invalid of [{ bad: true }, ['name'], null]) {
        expect(() => readLiveSnapshot({ ...value, actor: { ...actor, [field]: invalid } }, 'session-a')).toThrow()
      }
    }
  })

  test('describes observed changes and preserves an explicit agent message', () => {
    const before = snapshot()
    const after = snapshot()
    after.diagram.nodes.api.x = 280
    after.diagram.nodes.db = { x: 500, y: 100, size: 'm' }
    after.diagram.nodeData.db = { name: 'Database', icon: 'Database', color: 'blue' }
    expect(describeUpdate(before, after)).toBe('1 node added · 1 node moved')
    expect(describeUpdate(null, before)).toBe('Working on API')
    expect(describeUpdate(before, { ...after, message: 'Adding the storage layer' })).toBe('Adding the storage layer')
    expect(describeUpdate(before, { ...after, status: 'complete' })).toBe('Diagram complete')
  })
})


describe('explicit work scope boundary', () => {
  test('legacy post-edit working status does not activate dots', () => {
    const legacy = snapshot()
    delete legacy.work
    expect(isDiagramWorking('connected', legacy)).toBe(false)
  })
  test('validates future regions and terminal work independently of node existence', () => {
    const value = snapshot()
    const work = { ...value.work!, scope: { type: 'region' as const, x: -200, y: 200, width: 350, height: 180 } }
    expect(readLiveSnapshot({ ...value, work }, value.sessionId).work).toEqual(work)
    expect(readLiveSnapshot({ ...value, status: 'idle', work: { ...work, status: 'complete', finishedAt: value.updatedAt } }, value.sessionId).work?.status).toBe('complete')
    for (const scope of [{ type: 'region', x: NaN, y: 0, width: 100, height: 100 }, { type: 'region', x: 0, y: 0, width: -10, height: 100 }, { type: 'nodes', nodeIds: [] }, { type: 'unknown' }]) {
      expect(() => readLiveSnapshot({ ...value, work: { ...work, scope } }, value.sessionId)).toThrow()
    }
    for (const patch of [{ status: 'complete' }, { finishedAt: 'bad-time' }, { summary: '' }, { scope: null }]) {
      expect(() => readLiveSnapshot({ ...value, work: { ...work, ...patch } }, value.sessionId)).toThrow()
    }
  })
})
