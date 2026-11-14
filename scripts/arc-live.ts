import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'
import { applyOps, createArcLiveState, type ArcEnvelope, type ArcLiveState } from '../src/live/protocol.ts'

/** In-memory single-stream reference relay. Loopback only; never expose without host auth. */
export function serveArcLive(stream: string, port = 5190, allowedOrigin?: string) {
  let state: ArcLiveState = { ...createArcLiveState(stream), seq: 1 }
  const listeners = new Set<(envelope: ArcEnvelope) => void>()
  const snapshots = (): ArcEnvelope[] => {
    const seq = state.focus ? state.seq - 1 : state.seq
    const reset: ArcEnvelope = { v: 1, stream, seq, base: 0, ops: [{ op: 'reset', diagram: state.diagram }] }
    return state.focus ? [reset, { v: 1, stream, seq: state.seq, base: seq, ops: [state.focus] }] : [reset]
  }
  const apply = (value: unknown) => {
    const result = applyOps(state, value)
    if (result.state !== state) {
      state = result.state
      for (const send of listeners) send(value as ArcEnvelope)
    }
    return { seq: state.seq, diagnostics: result.diagnostics, resync: result.resync }
  }
  const server = createServer(async (req, res) => {
    const origin = req.headers.origin
    if (origin && origin !== allowedOrigin && origin !== 'http://' + req.headers.host) { res.writeHead(403).end(); return }
    if (origin && origin === allowedOrigin) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Vary', 'Origin')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    }
    if (req.method === 'OPTIONS') { res.writeHead(204).end(); return }
    if (req.method === 'GET' && req.url === '/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
      const send = (e: ArcEnvelope) => res.write('data: ' + JSON.stringify(e) + '\n\n')
      snapshots().forEach(send); listeners.add(send)
      req.on('close', () => listeners.delete(send))
      return
    }
    if (req.method === 'GET' && req.url === '/state') {
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(state)); return
    }
    if (req.method === 'POST' && req.url === '/apply') {
      try {
        let body = ''
        for await (const chunk of req) {
          body += chunk
          if (Buffer.byteLength(body) > 1024 * 1024) throw Error('Envelope exceeds 1 MiB')
        }
        res.setHeader('Content-Type', 'application/json')
        const result = apply(JSON.parse(body))
        res.statusCode = result.diagnostics.length ? 409 : 200
        res.end(JSON.stringify(result))
      } catch (error) { res.writeHead(400).end(JSON.stringify({ seq: state.seq, diagnostics: [String(error)] })) }
      return
    }
    res.writeHead(404).end()
  })
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 })
  server.on('upgrade', (req, socket, head) => {
    if (req.url !== '/socket' || (req.headers.origin && req.headers.origin !== allowedOrigin && req.headers.origin !== 'http://' + req.headers.host)) { socket.destroy(); return }
    sockets.handleUpgrade(req, socket, head, ws => {
      const send = (e: ArcEnvelope) => ws.send(JSON.stringify(e))
      snapshots().forEach(send); listeners.add(send)
      ws.on('close', () => listeners.delete(send))
      ws.on('message', bytes => {
        try {
          const value = JSON.parse(bytes.toString())
          if (value.type === 'resync') snapshots().forEach(send)
          else ws.send(JSON.stringify(apply(value)))
        } catch (error) { ws.send(JSON.stringify({ seq: state.seq, diagnostics: [String(error)] })) }
      })
    })
  })
  const ready = new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => { server.removeListener('error', reject); resolve() })
  })
  return { ready, server, sockets, getState: () => state, apply, close: () => {
    for (const ws of sockets.clients) ws.terminate()
    sockets.close(); server.closeAllConnections(); server.close()
  } }
}
