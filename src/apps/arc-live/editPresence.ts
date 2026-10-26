import type { Connector } from '../../types/diagram'
import type { LiveDiagramSnapshot } from '../../types/live'
import { diffDiagram } from '../../utils/diffDiagram'

export type EditPresence = {
  nodeId: string
  action: 'Added' | 'Moved' | 'Updated' | 'Connected' | 'Disconnected'
  updatedAt?: string
}

/** JSON value equality, independent of object identity and object key order. */
function equalValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length
      && a.every((value, index) => equalValue(value, b[index]))
  }
  const left = a as Record<string, unknown>
  const right = b as Record<string, unknown>
  const keys = new Set([...Object.keys(left), ...Object.keys(right)])
  return [...keys].every(key => equalValue(left[key], right[key]))
}

/** Select one surviving box that an observed revision actually edited. */
export function deriveEditPresence(previous: LiveDiagramSnapshot | null, next: LiveDiagramSnapshot): EditPresence | null {
  if (!previous || previous.sessionId !== next.sessionId || next.revision <= previous.revision) return null
  const before = previous.diagram
  const after = next.diagram
  const ids = Object.keys(after.nodes)

  for (const nodeId of ids) {
    if (!Object.prototype.hasOwnProperty.call(before.nodes, nodeId)) return { nodeId, action: 'Added' }
  }
  for (const nodeId of ids) {
    const oldPosition = before.nodes[nodeId]
    const position = after.nodes[nodeId]
    if (oldPosition.x !== position.x || oldPosition.y !== position.y) return { nodeId, action: 'Moved' }
  }
  for (const nodeId of ids) {
    if (!equalValue(before.nodes[nodeId], after.nodes[nodeId]) || !equalValue(before.nodeData[nodeId], after.nodeData[nodeId])) {
      return { nodeId, action: 'Updated' }
    }
  }

  const atEndpoint = (connector: Connector, action: EditPresence['action']): EditPresence | null => {
    const nodeId = [connector.to, connector.from].find(id => Object.prototype.hasOwnProperty.call(after.nodes, id))
    return nodeId ? { nodeId, action } : null
  }
  const { connectors } = diffDiagram(before, after)
  for (const { connector } of connectors.added) {
    const presence = atEndpoint(connector, 'Connected')
    if (presence) return presence
  }
  for (const { before: oldConnector, after: connector } of connectors.changed) {
    if (equalValue(oldConnector, connector)) continue
    const retargeted = oldConnector.from !== connector.from || oldConnector.to !== connector.to
    const presence = atEndpoint(connector, retargeted ? 'Connected' : 'Updated')
    if (presence) return presence
  }
  for (const { connector } of connectors.removed) {
    const presence = atEndpoint(connector, 'Disconnected')
    if (presence) return presence
  }
  for (const connector of after.connectors) {
    if (!equalValue(before.connectorStyles[connector.style], after.connectorStyles[connector.style])) {
      const presence = atEndpoint(connector, 'Updated')
      if (presence) return presence
    }
  }
  return null
}

export type EditPresenceState = { pending: EditPresence | null; completed: EditPresence | null }

/** Keep result attribution separate from the region announced before work begins. */
export function advanceEditPresence(state: EditPresenceState, previous: LiveDiagramSnapshot | null, next: LiveDiagramSnapshot): EditPresenceState {
  if (!previous || previous.sessionId !== next.sessionId) return { pending: null, completed: null }
  if (next.revision <= previous.revision) return state
  const edit = deriveEditPresence(previous, next)
  const sameWork = next.work?.id === previous.work?.id
  if (next.work?.status === 'working') {
    return { pending: edit ?? (sameWork ? state.pending : null), completed: null }
  }
  if (next.work?.status === 'interrupted') {
    return { pending: null, completed: null }
  }
  const finished = sameWork && previous.work?.status === 'working' && next.work?.status === 'complete'
  const result = edit ?? (finished ? state.pending : null)
  return {
    pending: null,
    completed: result ? { ...result, updatedAt: next.updatedAt } : state.completed,
  }
}
