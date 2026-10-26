import type { LiveDiagramActor } from '../../types/live'
import type { LiveConnection } from './LiveDiagramContext'

/** What the presence row shows. Derived only from observed connection state. */
export type PresenceState = 'working' | 'listening' | 'complete' | 'connecting' | 'offline'

export function presenceState(connection: LiveConnection, working: boolean): PresenceState {
  if (connection === 'complete') return 'complete'
  if (connection === 'connected') return working ? 'working' : 'listening'
  if (connection === 'connecting') return 'connecting'
  return 'offline'
}

/** The harness the caller declared, else the MCP client name. Never a model claim. */
export function actorLabel(actor: LiveDiagramActor): string {
  return actor.harness?.trim() || actor.name
}
