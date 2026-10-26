import type { ArcDiagramData } from '../types/diagram'
import { validateDiagram } from './diagramDiagnostics'

const MAX_DIAGRAM_BYTES = 2 * 1024 * 1024

type Fields = Record<string, unknown>

function record(value: unknown, path: string): Fields {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object`)
  return value as Fields
}

function optionalFields(value: object, path: string, type: 'string' | 'boolean' | 'number', names: string[]) {
  const fields = value as Fields
  for (const name of names) {
    const field = fields[name]
    if (field !== undefined && (typeof field !== type || (type === 'number' && !Number.isFinite(field)))) {
      throw new Error(`${path}.${name} must be ${type === 'number' ? 'a finite number' : `a ${type}`}`)
    }
  }
}

function focusFields(value: unknown, path: string) {
  const fields = record(value, path)
  optionalFields(fields, path, 'string', ['node', 'caption'])
  if (fields.mode !== undefined && fields.mode !== 'append' && fields.mode !== 'replace') {
    throw new Error(`${path}.mode must be append or replace`)
  }
  if (fields.nodes !== undefined && (!Array.isArray(fields.nodes) || fields.nodes.some(node => typeof node !== 'string'))) {
    throw new Error(`${path}.nodes must be an array of node IDs`)
  }
  if (fields.connectors !== undefined) {
    if (!Array.isArray(fields.connectors)) throw new Error(`${path}.connectors must be an array`)
    fields.connectors.forEach((value, index) => {
      const refPath = `${path}.connectors[${index}]`
      const ref = record(value, refPath)
      optionalFields(ref, refPath, 'string', ['id', 'from', 'to'])
      if (!ref.id && !(ref.from && ref.to)) throw new Error(`${refPath} needs an id or from/to pair`)
    })
  }
  if (fields.steps !== undefined) {
    if (!Array.isArray(fields.steps)) throw new Error(`${path}.steps must be an array`)
    fields.steps.forEach((value, index) => {
      const stepPath = `${path}.steps[${index}]`
      const step = record(value, stepPath)
      if (typeof step.icon !== 'string' || typeof step.label !== 'string') {
        throw new Error(`${stepPath} needs string icon and label fields`)
      }
    })
  }
}

export function normalizeLiveDiagram(value: unknown): ArcDiagramData {
  // Validate before touching the current revision. Keep the retained state detached
  // from callers and reject non-JSON/oversized input before broadcasting it.
  const serialized = JSON.stringify(value)
  if (!serialized || new TextEncoder().encode(serialized).byteLength > MAX_DIAGRAM_BYTES) {
    throw new Error('Live diagrams must be JSON documents smaller than 2 MiB')
  }
  const parsed: unknown = JSON.parse(serialized)
  const data = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? { ...parsed, connectors: (parsed as ArcDiagramData).connectors ?? [], connectorStyles: (parsed as ArcDiagramData).connectorStyles ?? {} }
    : parsed
  const error = validateDiagram(data).find(diagnostic => diagnostic.severity === 'error')
  if (error) throw new Error(`${error.code}: ${error.message}`)
  const diagram = data as ArcDiagramData
  // Diagnostics cover diagram semantics. Live updates also have to be safe for
  // immediate rendering: React children and focus stories cannot accept arbitrary
  // JSON even when the required graph fields are otherwise valid.
  optionalFields(diagram, 'diagram', 'string', ['id'])
  if (![diagram.layout.width, diagram.layout.height].every(value => Number.isFinite(value) && value > 0)) {
    throw new Error('Live diagram layout width and height must be finite, positive numbers')
  }
  for (const [id, node] of Object.entries(diagram.nodes)) {
    if (!['xs', 's', 'm', 'l'].includes(node.size)) throw new Error(`Node "${id}" has an unsupported size`)
    if (![node.x, node.y].every(Number.isFinite)) throw new Error(`Node "${id}" needs finite x and y coordinates`)
    if ([node.width, node.height].some(value => value != null && (!Number.isFinite(value) || value <= 0))) {
      throw new Error(`Node "${id}" needs positive custom dimensions`)
    }
  }
  for (const [id, node] of Object.entries(diagram.nodeData)) {
    optionalFields(node, `nodeData.${id}`, 'string', ['name', 'subtitle', 'description', 'icon', 'color', 'kind', 'shape'])
  }
  diagram.connectors.forEach((connector, index) => {
    optionalFields(connector, `connectors[${index}]`, 'string', ['id', 'label', 'fromRole', 'toRole', 'kind', 'curve'])
    optionalFields(connector, `connectors[${index}]`, 'number', ['curveDepth'])
  })
  for (const [id, style] of Object.entries(diagram.connectorStyles)) {
    const path = `connectorStyles.${id}`
    optionalFields(style, path, 'string', ['color', 'label', 'labelAlign', 'lineStyle', 'fromArrow', 'toArrow'])
    optionalFields(style, path, 'number', ['strokeWidth', 'opacity', 'arrowSize', 'fromArrowSize', 'toArrowSize'])
    optionalFields(style, path, 'boolean', ['dashed', 'bidirectional', 'animated', 'showArrow', 'showEndpoints', 'arrowScale'])
  }
  diagram.groups?.forEach((group, index) => {
    const path = `groups[${index}]`
    optionalFields(group, path, 'string', ['label', 'color'])
    optionalFields(group, path, 'boolean', ['dashed'])
    if (![group.x, group.y].every(Number.isFinite) || ![group.width, group.height].every(value => Number.isFinite(value) && value > 0)) {
      throw new Error(`${path} needs finite coordinates and positive dimensions`)
    }
  })
  diagram.flows?.forEach((flow, index) => optionalFields(flow, `flows[${index}]`, 'string', ['label']))
  if (diagram.focusTargets !== undefined) {
    for (const [id, target] of Object.entries(record(diagram.focusTargets, 'focusTargets'))) {
      focusFields(target, `focusTargets.${id}`)
    }
  }
  if (diagram.views !== undefined) {
    if (!Array.isArray(diagram.views)) throw new Error('views must be an array')
    diagram.views.forEach((view, index) => focusFields(view, `views[${index}]`))
  }
  return diagram
}
