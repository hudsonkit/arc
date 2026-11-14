import type { ArcEnvelope, ArcLiveSource } from './protocol'
/** Reconnecting sources always request a fresh reset, never a periodic refresh. */
export function arcSSESource(url: string): ArcLiveSource {
  const active = new Set<() => void>()
  return {
    requestResync() { for (const reconnect of active) reconnect() },
    subscribe(listener) {
      let events: EventSource
      const connect = () => {
        events?.close()
        events = new EventSource(url)
        events.onmessage = event => {
          try { listener(JSON.parse(event.data)) } catch { /* Malformed wire message is not state. */ }
        }
      }
      active.add(connect); connect()
      return () => { active.delete(connect); events.close() }
    },
  }
}
export function arcWebSocketSource(url: string, onDiagnostic?: (value: unknown) => void): ArcLiveSource {
  const active = new Set<WebSocket>()
  return {
    requestResync() {
      for (const socket of active) if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'resync' }))
    },
    subscribe(listener) {
      const socket = new WebSocket(url)
      active.add(socket)
      socket.onmessage = event => {
        try {
          const value = JSON.parse(event.data)
          if (value.v === 1) listener(value as ArcEnvelope)
          else onDiagnostic?.(value)
        } catch { onDiagnostic?.({ diagnostics: ['Invalid wire JSON'] }) }
      }
      return () => { active.delete(socket); socket.close() }
    },
  }
}
export async function arcApplyRPC(url: string, envelope: ArcEnvelope) {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(envelope) })
  return response.json() as Promise<{ seq: number; diagnostics: string[]; resync?: boolean }>
}
