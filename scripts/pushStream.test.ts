import { WebSocket } from 'ws'
import { describe, test, expect } from 'bun:test'
import { applyOps, createArcLiveState, emptyDiagram } from '../src/live/protocol'
import { serveArcLive } from './arc-live'

describe('push command streams', () => {
  test('atomic validation, sequence gaps, reset recovery and cascade', () => {
    let state = createArcLiveState('demo')
    const send = (ops: unknown[], base = state.seq, seq = base + 1) => applyOps(state, { v: 1, stream: 'demo', base, seq, ops })
    state = send([{ op: 'reset', diagram: emptyDiagram() }]).state
    state = send([{ op: 'node.add', id: 'api', data: { name: 'API', kind: 'service' } }]).state
    expect(state.diagram.nodes.api.x).toBeGreaterThan(0)
    const invalid = send([{ op: 'node.update', id: 'api', data: { name: 'changed' } }, { op: 'node.remove', id: 'missing' }])
    expect(invalid.state).toBe(state)
    expect(invalid.diagnostics.length).toBe(1)
    expect(send([{ op: 'layout.auto' }], 100, 101).resync).toBe(true)
    expect(send([{ op: 'reset', diagram: emptyDiagram() }], 100, 101).state.seq).toBe(101)
    state = send([{ op: 'node.add', id: 'db', data: { name: 'DB', kind: 'database' } }]).state
    state = send([{ op: 'style.set', id: 'http', data: { color: 'blue', strokeWidth: 2, label: 'HTTP' } }]).state
    state = send([{ op: 'connector.add', id: 'write', data: { from: 'api', to: 'db', fromAnchor: 'right', toAnchor: 'left', style: 'http' } }]).state
    expect(state.diagram.connectors).toHaveLength(1)
    state = send([{ op: 'node.remove', id: 'db' }]).state
    expect(state.diagram.connectors).toHaveLength(0)
    expect(send([{ op: 'focus', nodes: ['api'], caption: 'Working' }]).state.focus?.caption).toBe('Working')
    expect(send([{ op: 'unknown' }]).state).toBe(state)
  })
  test('RPC fans out every committed envelope over SSE and rejects bad batches', async () => {
    const relay = serveArcLive('test', 0)
    await relay.ready
    const address = relay.server.address() as { port: number }
    const base = 'http://127.0.0.1:' + address.port
    const abort = new AbortController()
    const response = await fetch(base + '/events', { signal: abort.signal })
    const reader = response.body!.getReader()
    const initial = new TextDecoder().decode((await reader.read()).value)
    expect(initial).toContain('"op":"reset"')
    const envelope = { v: 1, stream: 'test', base: 1, seq: 2, ops: [{ op: 'node.add', id: 'api', data: { kind: 'service', name: 'API' } }] }
    const rpc = await fetch(base + '/apply', { method: 'POST', body: JSON.stringify(envelope) })
    expect(rpc.status).toBe(200)
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('"seq":2')
    const bad = await fetch(base + '/apply', { method: 'POST', body: JSON.stringify(envelope) })
    expect(bad.status).toBe(409)
    abort.abort(); relay.close()
  })
  test('WebSocket reset, apply acknowledgement, diagnostics and resync', async () => {
    const relay = serveArcLive('socket', 0)
    await relay.ready
    const port = (relay.server.address() as { port: number }).port
    const ws = new WebSocket('ws://127.0.0.1:' + port + '/socket')
    const messages: unknown[] = []
    ws.on('message', bytes => messages.push(JSON.parse(bytes.toString())))
    const until = async (count: number) => {
      for (let i = 0; i < 100 && messages.length < count; i++) await new Promise(resolve => setTimeout(resolve, 5))
      expect(messages.length).toBeGreaterThanOrEqual(count)
    }
    try {
      await until(1)
      ws.send(JSON.stringify({ v: 1, stream: 'socket', base: 1, seq: 2, ops: [{ op: 'focus', caption: 'Live' }] }))
      await until(3)
      expect(messages[1]).toMatchObject({ seq: 2, ops: [{ op: 'focus' }] })
      expect(messages[2]).toMatchObject({ seq: 2, diagnostics: [] })
      ws.send(JSON.stringify({ type: 'resync' }))
      await until(4)
      expect(messages[3]).toMatchObject({ ops: [{ op: 'reset' }] })
    } finally { ws.terminate(); relay.close() }
  })

})
