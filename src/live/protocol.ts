import type { ArcDiagramData, NodeData, NodePosition, Connector, GroupShape, DiagramView, DiagramFlow, ConnectorStyle, DiagramLayout, FocusTarget } from '../types/diagram'
import { validateDiagram } from '../utils/diagramDiagnostics'
import { autoLayout } from '../utils/autoLayout'

const hasOwn = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key)

type EntityOp<K extends string, T> =
  | { op: `${K}.add`; id: string; data: T }
  | { op: `${K}.update`; id: string; data: Partial<T> }
  | { op: `${K}.remove`; id: string }
export type ArcOp =
  | { op: 'reset'; diagram: ArcDiagramData }
  | { op: 'node.add'; id: string; data: NodeData; at?: NodePosition }
  | { op: 'node.update'; id: string; data?: Partial<NodeData>; at?: Partial<NodePosition> }
  | { op: 'node.remove'; id: string }
  | EntityOp<'connector', Connector>
  | EntityOp<'group', GroupShape>
  | EntityOp<'view', DiagramView>
  | EntityOp<'flow', DiagramFlow>
  | { op: 'style.set'; id: string; data: ConnectorStyle }
  | { op: 'layout.set'; data: Partial<DiagramLayout> }
  | { op: 'layout.auto' }
  | ({ op: 'focus' } & Pick<FocusTarget, 'nodes' | 'connectors' | 'caption'>)
export interface ArcEnvelope { v: 1; stream: string; seq: number; base: number; ops: ArcOp[] }
export interface ArcLiveState { stream: string; seq: number; diagram: ArcDiagramData; focus?: Extract<ArcOp, { op: 'focus' }> }
export interface ArcApplyResult { state: ArcLiveState; diagnostics: string[]; resync?: boolean }
export const emptyDiagram = (): ArcDiagramData => ({
  layout: { width: 1000, height: 700 }, nodes: {}, nodeData: {}, connectors: [], connectorStyles: {},
})
export const createArcLiveState = (stream: string): ArcLiveState => ({ stream, seq: 0, diagram: emptyDiagram() })

/** Atomic, transport-neutral application. A reset alone can repair a missed base. */
export function applyOps(state: ArcLiveState, input: unknown): ArcApplyResult {
  try {
    const e = structuredClone(input) as ArcEnvelope
    if (!e || e.v !== 1 || e.stream !== state.stream || !Number.isSafeInteger(e.seq) ||
      !Number.isSafeInteger(e.base) || e.base < 0 || e.seq <= state.seq || e.seq <= e.base ||
      !Array.isArray(e.ops) || !e.ops.length) throw Error('Invalid envelope or stale sequence')
    const reset = e.ops.length === 1 && e.ops[0]?.op === 'reset'
    if (e.base !== state.seq && !reset) return { state, diagnostics: ['Sequence gap: request reset'], resync: true }
    let diagram = structuredClone(state.diagram)
    let focus = structuredClone(state.focus)
    for (const op of e.ops) {
      if (!op || typeof op !== 'object' || typeof op.op !== 'string') throw Error('Invalid operation')
      if ('id' in op && (typeof op.id !== 'string' || !op.id || ['__proto__', 'constructor', 'prototype'].includes(op.id))) throw Error('Invalid ID')
      if ((op.op.endsWith('.add') || op.op.endsWith('.update') || op.op === 'style.set' || op.op === 'layout.set') &&
        op.op !== 'node.update' && (!('data' in op) || !op.data || typeof op.data !== 'object' || Array.isArray(op.data))) throw Error('Operation needs object data')
      switch (op.op) {
        case 'reset': diagram = structuredClone(op.diagram); focus = undefined; break
        case 'node.add':
          if (hasOwn(diagram.nodes, op.id)) throw Error('Node already exists: ' + op.id)
          diagram.nodes[op.id] = op.at ?? { x: (Object.keys(diagram.nodes).length % 4) * 230 + 30, y: Math.floor(Object.keys(diagram.nodes).length / 4) * 150 + 30, size: 'm' }
          diagram.nodeData[op.id] = structuredClone(op.data)
          break
        case 'node.update':
          if (!hasOwn(diagram.nodes, op.id)) throw Error('Unknown node: ' + op.id)
          Object.assign(diagram.nodes[op.id], op.at)
          Object.assign(diagram.nodeData[op.id], op.data)
          break
        case 'node.remove':
          if (!hasOwn(diagram.nodes, op.id)) throw Error('Unknown node: ' + op.id)
          focus = undefined
          delete diagram.nodes[op.id]; delete diagram.nodeData[op.id]
          diagram.connectors = diagram.connectors.filter(c => c.from !== op.id && c.to !== op.id)
          break
        case 'style.set': diagram.connectorStyles[op.id] = structuredClone(op.data); break
        case 'layout.set': Object.assign(diagram.layout, op.data); break
        case 'layout.auto': diagram = autoLayout(diagram); break
        case 'focus':
          if (op.nodes?.some(id => !hasOwn(diagram.nodes, id))) throw Error('Unknown focus node')
          if (op.caption !== undefined && typeof op.caption !== 'string') throw Error('Focus caption must be a string')
          if (op.connectors !== undefined && !Array.isArray(op.connectors)) throw Error('Focus connectors must be an array')
          {
            const errors = validateDiagram({ ...diagram, views: [{ id: '__focus', title: 'Focus', ...op }] }).filter(d => d.severity === 'error')
            if (errors.length) throw Error(JSON.stringify(errors))
          }
          focus = op.nodes?.length || op.connectors?.length || op.caption ? structuredClone(op) : undefined; break
        default: {
          const [kind, action] = op.op.split('.')
          const key = ({ connector: 'connectors', group: 'groups', view: 'views', flow: 'flows' } as const)[kind as 'connector']
          if (!key || !['add', 'update', 'remove'].includes(action)) throw Error('Unknown operation: ' + op.op)
          const entity = op as { id: string; data?: object }
          const items = (diagram[key] ??= []) as { id?: string }[]
          const index = items.findIndex(item => item.id === entity.id)
          if (action === 'add') {
            if (index !== -1) throw Error('Duplicate ID: ' + entity.id)
            items.push({ ...structuredClone(entity.data), id: entity.id })
          } else {
            if (index === -1) throw Error('Unknown ID: ' + entity.id)
            if (action === 'remove') items.splice(index, 1)
            else items[index] = { ...items[index], ...structuredClone(entity.data), id: entity.id }
          }
        }
      }
      const errors = validateDiagram(diagram).filter(d => d.severity === 'error')
      if (errors.length) throw Error(JSON.stringify(errors))
    }
    return { state: { stream: state.stream, seq: e.seq, diagram, focus }, diagnostics: [] }
  } catch (error) {
    return { state, diagnostics: [error instanceof Error ? error.message : String(error)] }
  }
}
export interface ArcLiveSource { subscribe(listener: (envelope: ArcEnvelope) => void): () => void; requestResync?(): void }
