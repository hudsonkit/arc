// LocalStorage-based diagram session persistence
// Enables URL-based session recovery: /editor/:sessionId

const STORAGE_PREFIX = 'arc-session-'
const LAST_SESSION_KEY = 'arc-last-session'

export interface DiagramSession {
  diagram: any
  themeId: string | null
  colorMode: 'light' | 'dark'
  diagramMeta: Record<string, any>
  updatedAt: number
  name?: string
  originalDiagram?: any  // Pre-offset original data for player rendering
}

/** Generate a short session ID (first 8 hex chars of a UUID for brevity in URLs) */
export function generateSessionId(): string {
  return crypto.randomUUID().slice(0, 8)
}

/** Derive a URL-safe session ID from a diagram's source path or ID */
export function deriveSessionId(source: string): string {
  // e.g. "OPERATE.CONTROL.001" → "operate-control-001"
  // e.g. "operate/control-plane" → "operate-control-plane"
  return source
    .toLowerCase()
    .replace(/[./]/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/** Save a diagram session to localStorage */
export function saveDiagramSession(id: string, data: Omit<DiagramSession, 'updatedAt'>): void {
  const session: DiagramSession = {
    ...data,
    updatedAt: Date.now(),
  }
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${id}`, JSON.stringify(session))
    window.dispatchEvent(new CustomEvent('arc-session-saved', { detail: { id, session } }))
  } catch (e) {
    console.warn('Failed to save diagram session:', e)
  }
}

/** Load a diagram session from localStorage */
export function loadDiagramSession(id: string): DiagramSession | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${id}`)
    if (!raw) return null
    return JSON.parse(raw)
  } catch (e) {
    console.warn('Failed to load diagram session:', e)
    return null
  }
}

/** List all saved diagram sessions, sorted by most recent */
export function listDiagramSessions(): Array<{ id: string; name?: string; updatedAt: number }> {
  const sessions: Array<{ id: string; name?: string; updatedAt: number }> = []
  let length = 0
  try {
    length = localStorage.length
  } catch {
    return sessions
  }
  for (let i = 0; i < length; i++) {
    const key = localStorage.key(i)
    if (!key?.startsWith(STORAGE_PREFIX)) continue
    try {
      const raw = localStorage.getItem(key)
      if (!raw) continue
      const session = JSON.parse(raw) as DiagramSession
      sessions.push({
        id: key.slice(STORAGE_PREFIX.length),
        name: session.name,
        updatedAt: session.updatedAt,
      })
    } catch {
      // skip corrupt entries
    }
  }
  return sessions.sort((a, b) => b.updatedAt - a.updatedAt)
}

/** Delete a diagram session */
export function deleteDiagramSession(id: string): void {
  try {
    localStorage.removeItem(`${STORAGE_PREFIX}${id}`)
  } catch (e) {
    console.warn('Failed to delete diagram session:', e)
  }
}

/**
 * The session the editor was last on.
 *
 * Leaving the editor for another surface and coming back should return to the
 * diagram in progress, not open a blank one — /editor with no id mints a new
 * session every time.
 */
export function rememberLastSession(id: string): void {
  try {
    localStorage.setItem(LAST_SESSION_KEY, id)
  } catch {
    // Private mode — the link just falls back to a fresh editor.
  }
}

export function lastSessionId(): string | null {
  try {
    const id = localStorage.getItem(LAST_SESSION_KEY)
    return id && localStorage.getItem(`${STORAGE_PREFIX}${id}`) ? id : null
  } catch {
    return null
  }
}

/** Same-document writes use a custom event; other tabs receive native storage events. */
export function subscribeDiagramSession(id: string, listener: (session: DiagramSession) => void): () => void {
  const saved = (event: Event) => {
    const detail = (event as CustomEvent<{ id: string; session: DiagramSession }>).detail
    if (detail.id === id) listener(detail.session)
  }
  const storage = (event: StorageEvent) => {
    if (event.key === `${STORAGE_PREFIX}${id}` && event.newValue) {
      try { listener(JSON.parse(event.newValue)) } catch { /* Ignore corrupt external writes. */ }
    }
  }
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('arc-session-preview') : null
  if (channel) channel.onmessage = event => {
    if (event.data?.id === id) listener(event.data.session)
  }
  window.addEventListener('arc-session-saved', saved)
  window.addEventListener('storage', storage)
  return () => {
    channel?.close()
    window.removeEventListener('arc-session-saved', saved)
    window.removeEventListener('storage', storage)
  }
}

/** Publish editor frames without waiting for the debounced durable write. */
export function publishDiagramSession(id: string, data: Omit<DiagramSession, 'updatedAt'>): void {
  const session = { ...data, updatedAt: Date.now() }
  window.dispatchEvent(new CustomEvent('arc-session-saved', { detail: { id, session } }))
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel('arc-session-preview')
    channel.postMessage({ id, session })
    channel.close()
  }
}
