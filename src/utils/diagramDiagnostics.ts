// Coded, repairable validation for Arc diagrams.
//
// `validateDiagramShape` answers "is this a diagram?" with one sentence — enough
// for file-open. `validateDiagram` answers "what exactly is wrong?" with stable
// `code`s an agent can consume: each diagnostic names the `subject`, carries
// measured `evidence`, and lists `supportedFixes` that would clear it.
//
// Checks run in layers — shape, semantic, geometry. A failure in the shape
// layer stops the run: the later layers would only be inspecting a
// non-diagram. Malformed entries inside an otherwise-valid diagram are flagged
// under `shape/*` too, but only that entry is skipped — the rest of the
// document is still inspected.

import { connectorKey } from '../types/diagram'
import { isValidLocale } from './locale'
import type {
  AnchorPosition,
  Connector,
  DiagramColor,
  FlowDirection,
  FlowEasing,
  FlowMarker,
  FlowTrail,
  NodeKind,
  NodePosition,
  NodeShape,
  NodeSize,
} from '../types/diagram'
import { NODE_SIZES } from './constants'
import { NODE_SHAPES } from './nodeShape'
import { NODE_KINDS, isNodeKind, suggestKind } from './nodeKinds'
import { DEFAULT_FLOW_TRANSIT } from './flowAnimation'
import { anchor, connectorControlPoints } from './diagramHelpers'
import { validateDiagramShape } from './diagramValidation'

export type DiagnosticSeverity = 'error' | 'warning'

export interface DiagnosticSubject {
  type: 'diagram' | 'node' | 'connector' | 'group' | 'style' | 'image' | 'flow'
  id?: string
  index?: number
}

/** A machine-actionable repair for a diagnostic. */
export type Fix =
  | { kind: 'auto-layout' }
  | { kind: 'add-node'; nodeId: string }
  | { kind: 'remove-node'; nodeId: string }
  | { kind: 'add-node-data'; nodeId: string }
  | { kind: 'remove-node-data'; nodeId: string }
  | { kind: 'remove-connector' }
  | { kind: 'retarget'; end: 'from' | 'to'; to: string }
  | { kind: 'set-connector-id'; id: string }
  | { kind: 'add-style' }
  | { kind: 'set-style'; style: string }
  | { kind: 'remove-style' }
  | { kind: 'set-color'; color: DiagramColor }
  | { kind: 'set-kind'; value: NodeKind }
  | { kind: 'set-size'; size: NodeSize }
  | { kind: 'set-shape'; shape: NodeShape }
  | { kind: 'set-anchor'; field: 'fromAnchor' | 'toAnchor'; anchor: AnchorPosition }
  | { kind: 'remove-ref' }
  | { kind: 'remove-source' }
  | { kind: 'remove-watches' }
  | { kind: 'set-legend'; legend: 'auto' | 'all' | 'hidden' }
  | { kind: 'remove-meta' }
  | { kind: 'remove-flow' }
  | { kind: 'set-flow-id'; id: string }
  | { kind: 'set-flow-direction'; direction: FlowDirection }
  | { kind: 'set-flow-easing'; easing: FlowEasing }
  | { kind: 'set-flow-marker'; marker: FlowMarker }
  | { kind: 'set-flow-trail'; trail: FlowTrail }
  | { kind: 'set-flow-color'; color: DiagramColor }
  | { kind: 'set-flow-timing'; field: 'speed' | 'duration' | 'delay' | 'hold' | 'pause' | 'size'; value: number }
  | { kind: 'set-flow-repeat'; repeat: number | 'indefinite' }
  | { kind: 'set-flow-leg-id'; id: string }

export interface Diagnostic {
  code: string
  severity: DiagnosticSeverity
  subject: DiagnosticSubject
  message: string
  evidence?: Record<string, unknown>
  supportedFixes?: Fix[]
}

const DIAGRAM_COLORS: DiagramColor[] = [
  'violet', 'emerald', 'blue', 'amber', 'sky', 'zinc', 'rose', 'orange',
]
const NODE_SIZE_KEYS: NodeSize[] = ['xs', 's', 'm', 'l']
const ANCHORS: AnchorPosition[] = [
  'left', 'right', 'top', 'bottom',
  'bottomLeft', 'bottomRight', 'topLeft', 'topRight',
]
const NODE_SHAPE_KEYS = NODE_SHAPES.map(s => s.id)

type Rec = Record<string, unknown>
const isObject = (v: unknown): v is Rec =>
  !!v && typeof v === 'object' && !Array.isArray(v)

/** Repo-relative glob list: non-empty strings, no absolute paths, no `..`. */
function watchProblems(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) return ['it must be a non-empty array of glob strings']
  const problems: string[] = []
  value.forEach((entry, index) => {
    if (typeof entry !== 'string' || entry.trim() === '') {
      problems.push(`entry ${index} must be a non-empty string`)
      return
    }
    if (entry.startsWith('/') || /^[A-Za-z]:[\\/]/.test(entry)) {
      problems.push(`entry ${index} must be a repo-relative glob`)
    }
    if (entry.split(/[/\\]/).includes('..')) {
      problems.push(`entry ${index} must not contain '..'`)
    }
  })
  return problems
}

function levenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const t = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = t
    }
  }
  return row[b.length]
}

/** Closest candidate by edit distance — the value a `set-*` fix proposes. */
function closest<T extends string>(value: string, candidates: T[]): T | undefined {
  let best: T | undefined
  let bestD = Infinity
  for (const c of candidates) {
    const d = levenshtein(value.toLowerCase(), c.toLowerCase())
    if (d < bestD) {
      bestD = d
      best = c
    }
  }
  return best
}

/** Map the shape layer's sentence onto a stable code. */
function shapeDiagnostic(problem: string): Diagnostic {
  const base = { severity: 'error' as const, message: problem }
  switch (problem) {
    case 'Expected an object':
      return { ...base, code: 'shape/not-object', subject: { type: 'diagram' } }
    case 'Missing `layout`':
      return { ...base, code: 'shape/missing-layout', subject: { type: 'diagram' } }
    case '`layout` needs numeric `width` and `height`':
      return { ...base, code: 'shape/invalid-layout', subject: { type: 'diagram' } }
    case 'Missing `nodes`':
      return { ...base, code: 'shape/missing-nodes', subject: { type: 'diagram' } }
    case 'Missing `nodeData`':
      return { ...base, code: 'shape/missing-node-data', subject: { type: 'diagram' } }
    case '`connectors` must be an array':
      return { ...base, code: 'shape/invalid-connectors', subject: { type: 'diagram' } }
    case '`groups` must be an array':
      return { ...base, code: 'shape/invalid-groups', subject: { type: 'diagram' } }
    case '`images` must be an array':
      return { ...base, code: 'shape/invalid-images', subject: { type: 'diagram' } }
    case '`flows` must be an array':
      return { ...base, code: 'shape/invalid-flows', subject: { type: 'diagram' } }
    default: {
      const id = /entry for "([^"]+)"/.exec(problem)?.[1]
      return {
        ...base,
        code: 'shape/missing-node-data-entry',
        subject: { type: 'node', id },
        evidence: { nodeId: id },
        supportedFixes: id
          ? [{ kind: 'add-node-data', nodeId: id }, { kind: 'remove-node', nodeId: id }]
          : undefined,
      }
    }
  }
}

/** Fields an entry needs before semantic or geometry checks can trust it. */
function missingFields(entry: Rec, fields: [string, string][]): string[] {
  return fields
    .filter(([name, type]) =>
      type === 'object' ? !isObject(entry[name]) : typeof entry[name] !== type)
    .map(([name]) => name)
}

interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** Rendered footprint — same fallback (`NODE_SIZES.m`) the renderer uses. */
function nodeBox(node: Rec): Box | null {
  if (typeof node.x !== 'number' || typeof node.y !== 'number') return null
  const dims = NODE_SIZES[node.size as keyof typeof NODE_SIZES] || NODE_SIZES.m
  return {
    x: node.x,
    y: node.y,
    w: typeof node.width === 'number' ? node.width : dims.width,
    h: typeof node.height === 'number' ? node.height : dims.height,
  }
}

interface Pt {
  x: number
  y: number
}

// Uses the shared connector geometry so the checked path is the path actually
// drawn — a cubic bezier, sampled into a polyline.
function connectorCurve(c: Rec, nodes: Record<string, NodePosition>): [Pt, Pt, Pt, Pt] {
  const from = anchor(nodes, c.from as string, c.fromAnchor as AnchorPosition)
  const to = anchor(nodes, c.to as string, c.toAnchor as AnchorPosition)
  const { cp1, cp2 } = connectorControlPoints(
    from, to,
    c.fromAnchor as AnchorPosition, c.toAnchor as AnchorPosition,
    c.curve as Connector['curve'] | undefined,
    typeof c.curveDepth === 'number' ? c.curveDepth : 40,
  )
  return [from, cp1, cp2, to]
}

const SAMPLES = 24

function connectorPolyline(c: Rec, nodes: Record<string, NodePosition>): Pt[] {
  const [p0, p1, p2, p3] = connectorCurve(c, nodes)
  const pts: Pt[] = []
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES
    const u = 1 - t
    pts.push({
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    })
  }
  return pts
}

function segSeg(p1: Pt, p2: Pt, p3: Pt, p4: Pt): Pt | null {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x)
  if (d === 0) return null
  const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d
  const u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d
  if (t < 0 || t > 1 || u < 0 || u > 1) return null
  return { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) }
}

// The box is inset by 1px so a segment grazing an edge doesn't report a crossing.
function segBoxHit(a: Pt, b: Pt, r: Box): Pt | null {
  const x1 = r.x + 1
  const y1 = r.y + 1
  const x2 = r.x + r.w - 1
  const y2 = r.y + r.h - 1
  if (x2 <= x1 || y2 <= y1) return null
  const inside = (p: Pt) => p.x > x1 && p.x < x2 && p.y > y1 && p.y < y2
  if (inside(a)) return a
  if (inside(b)) return b
  const corners: [Pt, Pt][] = [
    [{ x: x1, y: y1 }, { x: x2, y: y1 }],
    [{ x: x2, y: y1 }, { x: x2, y: y2 }],
    [{ x: x2, y: y2 }, { x: x1, y: y2 }],
    [{ x: x1, y: y2 }, { x: x1, y: y1 }],
  ]
  for (const [e1, e2] of corners) {
    const hit = segSeg(a, b, e1, e2)
    if (hit) return hit
  }
  return null
}

/**
 * Validate a diagram payload and return every problem found, coded for
 * machine consumption. Shape errors short-circuit; semantic and geometry
 * findings accumulate.
 */
export function validateDiagram(value: unknown): Diagnostic[] {
  const shapeProblem = validateDiagramShape(value)
  if (shapeProblem) return [shapeDiagnostic(shapeProblem)]

  const d = value as Rec
  const diagnostics: Diagnostic[] = []
  const push = (diag: Diagnostic) => diagnostics.push(diag)

  const nodes = d.nodes as Rec
  const nodeData = d.nodeData as Rec
  const connectors = Array.isArray(d.connectors) ? d.connectors : []
  const groups = Array.isArray(d.groups) ? d.groups : []
  const images = Array.isArray(d.images) ? d.images : []
  const flows = Array.isArray(d.flows) ? d.flows : []
  const connectorStyles = isObject(d.connectorStyles) ? d.connectorStyles : null

  if (d.connectorStyles != null && !connectorStyles) {
    push({
      code: 'shape/invalid-connector-styles',
      severity: 'error',
      subject: { type: 'diagram' },
      message: '`connectorStyles` must be an object',
    })
  } else if (connectorStyles == null && connectors.length > 0) {
    push({
      code: 'shape/missing-connector-styles',
      severity: 'error',
      subject: { type: 'diagram' },
      message: 'Connectors reference styles but `connectorStyles` is missing',
      supportedFixes: [{ kind: 'add-style' }],
    })
  }

  // -- entry shape: malformed entries are flagged and skipped -------------

  const validNodes = new Set<string>()
  for (const [id, raw] of Object.entries(nodes)) {
    if (!isObject(raw)) {
      push({ code: 'shape/invalid-node', severity: 'error', subject: { type: 'node', id }, message: `Node "${id}" is not an object`, evidence: { value: raw } })
      continue
    }
    const missing = missingFields(raw, [['x', 'number'], ['y', 'number'], ['size', 'string']])
    if (missing.length) {
      push({ code: 'shape/invalid-node', severity: 'error', subject: { type: 'node', id }, message: `Node "${id}" is missing ${missing.map(f => `\`${f}\``).join(', ')}`, evidence: { missing } })
      continue
    }
    validNodes.add(id)
  }

  for (const [id, raw] of Object.entries(nodeData)) {
    if (!isObject(raw)) {
      push({ code: 'shape/invalid-node-data', severity: 'error', subject: { type: 'node', id }, message: `nodeData["${id}"] is not an object`, evidence: { value: raw } })
      continue
    }
    // `kind` supplies default icon and color, so a valid kind waives those
    // requirements; a missing or misspelled kind gets no such waiver.
    const missing = missingFields(raw, isNodeKind(raw.kind)
      ? [['name', 'string']]
      : [['icon', 'string'], ['name', 'string'], ['color', 'string']])
    if (missing.length) {
      const suggestion = suggestKind(raw.name)
      push({
        code: 'shape/invalid-node-data',
        severity: 'error',
        subject: { type: 'node', id },
        message: `nodeData["${id}"] is missing ${missing.map(f => `\`${f}\``).join(', ')}`,
        evidence: { missing },
        supportedFixes: suggestion ? [{ kind: 'set-kind', value: suggestion }] : undefined,
      })
    }
  }

  const connectorSubject = (c: Rec, index: number): DiagnosticSubject => ({
    type: 'connector',
    id: (typeof c.id === 'string' ? c.id : undefined) ?? connectorKey({
      from: c.from as string,
      to: c.to as string,
      id: c.id as string | undefined,
    }),
    index,
  })

  const validConnectors: { c: Rec; index: number }[] = []
  connectors.forEach((raw, index) => {
    if (!isObject(raw)) {
      push({ code: 'shape/invalid-connector', severity: 'error', subject: { type: 'connector', index }, message: `Connector ${index} is not an object`, evidence: { value: raw } })
      return
    }
    const missing = missingFields(raw, [
      ['from', 'string'], ['to', 'string'],
      ['fromAnchor', 'string'], ['toAnchor', 'string'], ['style', 'string'],
    ])
    if (missing.length) {
      push({ code: 'shape/invalid-connector', severity: 'error', subject: connectorSubject(raw, index), message: `Connector ${index} is missing ${missing.map(f => `\`${f}\``).join(', ')}`, evidence: { missing } })
      return
    }
    validConnectors.push({ c: raw, index })
  })

  const validStyles = new Map<string, Rec>()
  for (const [key, raw] of Object.entries(connectorStyles ?? {})) {
    if (!isObject(raw)) {
      push({ code: 'shape/invalid-connector-style', severity: 'error', subject: { type: 'style', id: key }, message: `connectorStyles["${key}"] is not an object`, evidence: { value: raw } })
      continue
    }
    const missing = missingFields(raw, [['color', 'string'], ['strokeWidth', 'number']])
    if (missing.length) {
      push({ code: 'shape/invalid-connector-style', severity: 'error', subject: { type: 'style', id: key }, message: `connectorStyles["${key}"] is missing ${missing.map(f => `\`${f}\``).join(', ')}`, evidence: { missing } })
      continue
    }
    validStyles.set(key, raw)
  }

  const validGroups = new Map<string, Rec>()
  groups.forEach((raw, index) => {
    if (!isObject(raw)) {
      push({ code: 'shape/invalid-group', severity: 'error', subject: { type: 'group', index }, message: `Group ${index} is not an object`, evidence: { value: raw } })
      return
    }
    const missing = missingFields(raw, [
      ['id', 'string'], ['x', 'number'], ['y', 'number'],
      ['width', 'number'], ['height', 'number'],
    ])
    if (missing.length || (raw.type !== 'rect' && raw.type !== 'circle')) {
      push({ code: 'shape/invalid-group', severity: 'error', subject: { type: 'group', id: typeof raw.id === 'string' ? raw.id : undefined, index }, message: `Group ${index} is malformed`, evidence: { missing, type: raw.type } })
      return
    }
    validGroups.set(raw.id as string, raw)
  })

  images.forEach((raw, index) => {
    if (!isObject(raw)) {
      push({ code: 'shape/invalid-image', severity: 'error', subject: { type: 'image', index }, message: `Image ${index} is not an object`, evidence: { value: raw } })
    }
  })

  // -- semantic: references and enums -------------------------------------

  const LEGEND_MODES = ['auto', 'all', 'hidden'] as const

  if (d.watches !== undefined) {
    const problems = watchProblems(d.watches)
    if (problems.length) {
      push({
        code: 'semantic/invalid-watches',
        severity: 'error',
        subject: { type: 'diagram' },
        message: `Diagram \`watches\` is invalid — ${problems.join('; ')}`,
        evidence: { watches: d.watches },
        supportedFixes: [{ kind: 'remove-watches' }],
      })
    }
  }

  if (d.legend !== undefined && !LEGEND_MODES.includes(d.legend as (typeof LEGEND_MODES)[number])) {
    const nearest = typeof d.legend === 'string' ? closest(d.legend, [...LEGEND_MODES]) : undefined
    push({
      code: 'semantic/unknown-legend',
      severity: 'error',
      subject: { type: 'diagram' },
      message: `Unknown \`legend\` "${String(d.legend)}" — expected ${LEGEND_MODES.map(m => `'${m}'`).join(', ')}`,
      evidence: { field: 'legend', value: d.legend, known: LEGEND_MODES },
      supportedFixes: nearest ? [{ kind: 'set-legend', legend: nearest }] : undefined,
    })
  }

  if (d._meta !== undefined) {
    if (!isObject(d._meta)) {
      push({
        code: 'semantic/invalid-meta',
        severity: 'error',
        subject: { type: 'diagram' },
        message: '`_meta` must be an object',
        evidence: { value: d._meta },
        supportedFixes: [{ kind: 'remove-meta' }],
      })
    } else if (d._meta.locale !== undefined && (typeof d._meta.locale !== 'string' || !isValidLocale(d._meta.locale))) {
      push({
        code: 'semantic/invalid-locale',
        severity: 'error',
        subject: { type: 'diagram' },
        message: `\`_meta.locale\` "${String(d._meta.locale)}" is not a valid BCP-47 tag`,
        evidence: { field: '_meta.locale', value: d._meta.locale },
        supportedFixes: [{ kind: 'remove-meta' }],
      })
    }
  }

  const nodeIds = Object.keys(nodes)

  for (const [id, raw] of Object.entries(nodeData)) {
    if (!Object.prototype.hasOwnProperty.call(nodes, id)) {
      push({
        code: 'semantic/orphan-node-data',
        severity: 'warning',
        subject: { type: 'node', id },
        message: `nodeData["${id}"] has no matching entry in \`nodes\``,
        supportedFixes: [{ kind: 'remove-node-data', nodeId: id }, { kind: 'add-node', nodeId: id }],
      })
      continue
    }
    if (!isObject(raw)) continue

    if (typeof raw.color === 'string' && !DIAGRAM_COLORS.includes(raw.color as DiagramColor)) {
      push({
        code: 'semantic/unknown-color',
        severity: 'error',
        subject: { type: 'node', id },
        message: `Node "${id}" uses unknown color "${raw.color}"`,
        evidence: { field: 'color', value: raw.color, known: DIAGRAM_COLORS },
        supportedFixes: closest(raw.color, DIAGRAM_COLORS)
          ? [{ kind: 'set-color', color: closest(raw.color, DIAGRAM_COLORS)! }]
          : undefined,
      })
    }
    if (raw.kind != null && !isNodeKind(raw.kind)) {
      const fixes: Fix[] = []
      if (typeof raw.kind === 'string') {
        const near = closest(raw.kind, NODE_KINDS)
        if (near) fixes.push({ kind: 'set-kind', value: near })
      }
      const suggestion = suggestKind(raw.name)
      if (suggestion && !fixes.some(f => f.kind === 'set-kind' && f.value === suggestion)) {
        fixes.push({ kind: 'set-kind', value: suggestion })
      }
      push({
        code: 'semantic/unknown-kind',
        severity: 'error',
        subject: { type: 'node', id },
        message: `Node "${id}" uses unknown kind "${String(raw.kind)}"`,
        evidence: { field: 'kind', value: raw.kind, known: NODE_KINDS },
        supportedFixes: fixes.length ? fixes : undefined,
      })
    }
    if (raw.shape != null && !NODE_SHAPE_KEYS.includes(raw.shape as NodeShape)) {
      push({
        code: 'semantic/unknown-node-shape',
        severity: 'error',
        subject: { type: 'node', id },
        message: `Node "${id}" uses unknown shape "${String(raw.shape)}"`,
        evidence: { field: 'shape', value: raw.shape, known: NODE_SHAPE_KEYS },
        supportedFixes: typeof raw.shape === 'string' && closest(raw.shape, NODE_SHAPE_KEYS)
          ? [{ kind: 'set-shape', shape: closest(raw.shape, NODE_SHAPE_KEYS)! }]
          : undefined,
      })
    }

    if (raw.watches !== undefined) {
      const problems = watchProblems(raw.watches)
      if (problems.length) {
        push({
          code: 'semantic/invalid-watches',
          severity: 'error',
          subject: { type: 'node', id },
          message: `Node "${id}" has invalid \`watches\` — ${problems.join('; ')}`,
          evidence: { watches: raw.watches },
          supportedFixes: [{ kind: 'remove-watches' }],
        })
      }
    }

    if (raw.child !== undefined && (typeof raw.child !== 'string' || raw.child.length === 0)) {
      push({
        code: 'semantic/invalid-child',
        severity: 'error',
        subject: { type: 'node', id },
        message: `Node "${id}" has invalid \`child\` — it must be a non-empty diagram id`,
        evidence: { child: raw.child },
      })
    }

    if (raw.source != null) {
      const s = raw.source
      const problems: string[] = []
      if (!isObject(s)) {
        problems.push('it must be an object')
      } else {
        if (typeof s.path !== 'string' || s.path.length === 0) {
          problems.push('`path` must be a non-empty string')
        }
        for (const field of ['line', 'endLine'] as const) {
          if (s[field] !== undefined && (!Number.isInteger(s[field]) || (s[field] as number) < 1)) {
            problems.push(`\`${field}\` must be a positive integer`)
          }
        }
        if (Number.isInteger(s.line) && Number.isInteger(s.endLine) && (s.endLine as number) < (s.line as number)) {
          problems.push('`endLine` is before `line`')
        }
        if (s.commit !== undefined && typeof s.commit !== 'string') {
          problems.push('`commit` must be a string')
        }
      }
      if (problems.length) {
        push({
          code: 'semantic/invalid-source',
          severity: 'error',
          subject: { type: 'node', id },
          message: `Node "${id}" has invalid \`source\` — ${problems.join('; ')}`,
          evidence: { source: raw.source },
          supportedFixes: [{ kind: 'remove-source' }],
        })
      }
    }
  }

  for (const [id, raw] of Object.entries(nodes)) {
    if (!isObject(raw)) continue
    if (typeof raw.size === 'string' && !NODE_SIZE_KEYS.includes(raw.size as NodeSize)) {
      push({
        code: 'semantic/unknown-node-size',
        severity: 'error',
        subject: { type: 'node', id },
        message: `Node "${id}" uses unknown size "${raw.size}"`,
        evidence: { field: 'size', value: raw.size, known: NODE_SIZE_KEYS },
        supportedFixes: closest(raw.size, NODE_SIZE_KEYS)
          ? [{ kind: 'set-size', size: closest(raw.size, NODE_SIZE_KEYS)! }]
          : undefined,
      })
    }
  }

  const usedStyles = new Set<string>()
  const seenConnectorIds = new Map<string, number>()
  for (const { c, index } of validConnectors) {
    const subject = connectorSubject(c, index)
    usedStyles.add(c.style as string)

    if (typeof c.id === 'string') {
      const first = seenConnectorIds.get(c.id)
      if (first !== undefined) {
        push({
          code: 'semantic/duplicate-connector-id',
          severity: 'error',
          subject,
          message: `Connector id "${c.id}" is used by both connectors ${first} and ${index}`,
          evidence: { id: c.id, firstIndex: first },
          supportedFixes: [{ kind: 'set-connector-id', id: `${c.id}-2` }],
        })
      } else {
        seenConnectorIds.set(c.id, index)
      }
    }

    for (const end of ['from', 'to'] as const) {
      const ref = c[end] as string
      if (!Object.prototype.hasOwnProperty.call(nodes, ref)) {
        const retarget = closest(ref, nodeIds)
        push({
          code: 'semantic/dangling-connector-endpoint',
          severity: 'error',
          subject,
          message: `Connector "${connectorKey({ from: c.from as string, to: c.to as string, id: c.id as string | undefined })}" references missing node "${ref}" at \`${end}\``,
          evidence: { end, value: ref },
          supportedFixes: [
            ...(retarget ? [{ kind: 'retarget', end, to: retarget } as Fix] : []),
            { kind: 'remove-connector' },
          ],
        })
      }
    }

    if (connectorStyles && !Object.prototype.hasOwnProperty.call(connectorStyles, c.style as string)) {
      const nearest = closest(c.style as string, Object.keys(connectorStyles))
      push({
        code: 'semantic/unknown-connector-style',
        severity: 'error',
        subject,
        message: `Connector "${subject.id}" uses unknown style "${c.style}" — not defined in \`connectorStyles\``,
        evidence: { value: c.style, known: Object.keys(connectorStyles) },
        supportedFixes: [
          { kind: 'add-style' },
          ...(nearest ? [{ kind: 'set-style', style: nearest } as Fix] : []),
        ],
      })
    }

    for (const field of ['fromAnchor', 'toAnchor'] as const) {
      const a = c[field] as string
      if (!ANCHORS.includes(a as AnchorPosition)) {
        const nearest = closest(a, ANCHORS)
        push({
          code: 'semantic/unknown-anchor',
          severity: 'error',
          subject,
          message: `Connector "${subject.id}" has unknown \`${field}\` "${a}"`,
          evidence: { field, value: a, known: ANCHORS },
          supportedFixes: nearest ? [{ kind: 'set-anchor', field, anchor: nearest }] : undefined,
        })
      }
    }
  }

  if (connectorStyles) {
    for (const [key, style] of validStyles) {
      if (!usedStyles.has(key)) {
        push({
          code: 'semantic/unused-connector-style',
          severity: 'warning',
          subject: { type: 'style', id: key },
          message: `connectorStyles["${key}"] is never used by a connector`,
          supportedFixes: [{ kind: 'remove-style' }],
        })
      }
      if (typeof style.color === 'string' && !DIAGRAM_COLORS.includes(style.color as DiagramColor)) {
        push({
          code: 'semantic/unknown-color',
          severity: 'error',
          subject: { type: 'style', id: key },
          message: `connectorStyles["${key}"] uses unknown color "${style.color}"`,
          evidence: { field: 'color', value: style.color, known: DIAGRAM_COLORS },
          supportedFixes: closest(style.color, DIAGRAM_COLORS)
            ? [{ kind: 'set-color', color: closest(style.color, DIAGRAM_COLORS)! }]
            : undefined,
        })
      }
    }
  }

  for (const [id, group] of validGroups) {
    if (typeof group.color === 'string' && !DIAGRAM_COLORS.includes(group.color as DiagramColor)) {
      push({
        code: 'semantic/unknown-color',
        severity: 'error',
        subject: { type: 'group', id },
        message: `Group "${id}" uses unknown color "${group.color}"`,
        evidence: { field: 'color', value: group.color, known: DIAGRAM_COLORS },
        supportedFixes: closest(group.color, DIAGRAM_COLORS)
          ? [{ kind: 'set-color', color: closest(group.color, DIAGRAM_COLORS)! }]
          : undefined,
      })
    }
  }

  // flows: typed routes over connectors. They reference connector ids when
  // available, falling back to endpoint pairs only for documents without ids.
  const FLOW_DIRECTIONS: FlowDirection[] = ['forward', 'reverse']
  const FLOW_EASINGS: FlowEasing[] = ['linear', 'ease-in', 'ease-out', 'ease-in-out']
  const FLOW_MARKERS: FlowMarker[] = ['dot', 'packet', 'pulse', 'arrow']
  const FLOW_TRAILS: FlowTrail[] = ['none', 'fade', 'wake']
  const seenFlowIds = new Map<string, number>()
  const connectorMatches = (leg: Rec): { c: Rec; index: number }[] => {
    if (typeof leg.id === 'string') {
      return validConnectors.filter(({ c }) => c.id === leg.id)
    }
    if (typeof leg.from === 'string' && typeof leg.to === 'string') {
      return validConnectors.filter(({ c }) => c.from === leg.from && c.to === leg.to)
    }
    return []
  }

  flows.forEach((raw, index) => {
    const subject = { type: 'flow' as const, id: isObject(raw) && typeof raw.id === 'string' ? raw.id : undefined, index }
    if (!isObject(raw)) {
      push({ code: 'shape/invalid-flow', severity: 'error', subject, message: `Flow ${index} is not an object`, evidence: { value: raw }, supportedFixes: [{ kind: 'remove-flow' }] })
      return
    }
    if (typeof raw.id !== 'string' || raw.id.length === 0) {
      push({
        code: 'shape/invalid-flow',
        severity: 'error',
        subject,
        message: `Flow ${index} is missing a non-empty \`id\``,
        supportedFixes: [{ kind: 'set-flow-id', id: `flow-${index + 1}` }],
      })
    } else {
      const first = seenFlowIds.get(raw.id)
      if (first !== undefined) {
        push({
          code: 'semantic/duplicate-flow-id',
          severity: 'error',
          subject,
          message: `Flow id "${raw.id}" is used by both flows ${first} and ${index}`,
          evidence: { id: raw.id, firstIndex: first },
          supportedFixes: [{ kind: 'set-flow-id', id: `${raw.id}-2` }],
        })
      } else {
        seenFlowIds.set(raw.id, index)
      }
    }
    if (!Array.isArray(raw.legs) || raw.legs.length === 0) {
      push({
        code: 'shape/invalid-flow',
        severity: 'error',
        subject,
        message: `Flow "${subject.id ?? index}" needs a non-empty \`legs\` array`,
        supportedFixes: [{ kind: 'remove-flow' }],
      })
      return
    }
    const legs = raw.legs

    for (const field of ['direction'] as const) {
      const value = raw[field]
      if (value !== undefined && !FLOW_DIRECTIONS.includes(value as FlowDirection)) {
        const nearest = typeof value === 'string' ? closest(value, FLOW_DIRECTIONS) : undefined
        push({
          code: 'semantic/unknown-flow-direction',
          severity: 'error',
          subject,
          message: `Flow "${subject.id ?? index}" uses unknown direction "${String(value)}"`,
          evidence: { field, value, known: FLOW_DIRECTIONS },
          supportedFixes: nearest ? [{ kind: 'set-flow-direction', direction: nearest }] : undefined,
        })
      }
    }
    const easing = raw.easing
    if (easing !== undefined && !FLOW_EASINGS.includes(easing as FlowEasing)) {
      const nearest = typeof easing === 'string' ? closest(easing, FLOW_EASINGS) : undefined
      push({
        code: 'semantic/unknown-flow-easing',
        severity: 'error',
        subject,
        message: `Flow "${subject.id ?? index}" uses unknown easing "${String(easing)}"`,
        evidence: { field: 'easing', value: easing, known: FLOW_EASINGS },
        supportedFixes: nearest ? [{ kind: 'set-flow-easing', easing: nearest }] : undefined,
      })
    }
    const marker = raw.marker
    if (marker !== undefined && !FLOW_MARKERS.includes(marker as FlowMarker)) {
      const nearest = typeof marker === 'string' ? closest(marker, FLOW_MARKERS) : undefined
      push({
        code: 'semantic/unknown-flow-marker',
        severity: 'error',
        subject,
        message: `Flow "${subject.id ?? index}" uses unknown marker "${String(marker)}"`,
        evidence: { field: 'marker', value: marker, known: FLOW_MARKERS },
        supportedFixes: nearest ? [{ kind: 'set-flow-marker', marker: nearest }] : undefined,
      })
    }
    const trail = raw.trail
    if (trail !== undefined && !FLOW_TRAILS.includes(trail as FlowTrail)) {
      const nearest = typeof trail === 'string' ? closest(trail, FLOW_TRAILS) : undefined
      push({
        code: 'semantic/unknown-flow-trail',
        severity: 'error',
        subject,
        message: `Flow "${subject.id ?? index}" uses unknown trail "${String(trail)}"`,
        evidence: { field: 'trail', value: trail, known: FLOW_TRAILS },
        supportedFixes: nearest ? [{ kind: 'set-flow-trail', trail: nearest }] : undefined,
      })
    }
    const color = raw.color
    if (color !== undefined && (typeof color !== 'string' || !DIAGRAM_COLORS.includes(color as DiagramColor))) {
      const nearest = typeof color === 'string' ? closest(color, DIAGRAM_COLORS) : undefined
      push({
        code: 'semantic/unknown-color',
        severity: 'error',
        subject,
        message: `Flow "${subject.id ?? index}" uses unknown color "${String(color)}"`,
        evidence: { field: 'color', value: color, known: DIAGRAM_COLORS },
        supportedFixes: nearest ? [{ kind: 'set-flow-color', color: nearest }] : undefined,
      })
    }
    const repeat = raw.repeat
    if (repeat !== undefined && repeat !== 'indefinite' && (!Number.isInteger(repeat) || (repeat as number) < 1)) {
      push({
        code: 'semantic/invalid-flow-timing',
        severity: 'error',
        subject,
        message: `Flow "${subject.id ?? index}" repeat must be a positive integer or "indefinite"`,
        evidence: { field: 'repeat', value: repeat },
        supportedFixes: [{ kind: 'set-flow-repeat', repeat: 'indefinite' }],
      })
    }
    for (const field of ['speed', 'delay', 'hold', 'size'] as const) {
      const value = raw[field]
      if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (field === 'speed' && value === 0) || (field === 'size' && value === 0))) {
        push({
          code: 'semantic/invalid-flow-timing',
          severity: 'error',
          subject,
          message: `Flow "${subject.id ?? index}" \`${field}\` must be a non-negative finite number${field === 'speed' || field === 'size' ? ' greater than zero' : ''}`,
          evidence: { field, value },
          supportedFixes: [{ kind: 'set-flow-timing', field, value: field === 'speed' ? 160 : field === 'size' ? 10 : 0 }],
        })
      }
    }
    let pauseTotal = 0
    legs.forEach((leg, legIndex) => {
      if (!isObject(leg)) {
        push({
          code: 'shape/invalid-flow-leg',
          severity: 'error',
          subject,
          message: `Flow "${subject.id ?? index}" leg ${legIndex} is not an object`,
          evidence: { legIndex, value: leg },
          supportedFixes: [{ kind: 'remove-ref' }],
        })
        return
      }
      if (leg.pause !== undefined) {
        if (typeof leg.pause !== 'number' || !Number.isFinite(leg.pause) || leg.pause < 0) {
          push({
            code: 'semantic/invalid-flow-timing',
            severity: 'error',
            subject,
            message: `Flow "${subject.id ?? index}" leg ${legIndex} pause must be a non-negative finite number`,
            evidence: { legIndex, field: 'pause', value: leg.pause },
            supportedFixes: [{ kind: 'set-flow-timing', field: 'pause', value: DEFAULT_FLOW_TRANSIT }],
          })
        } else {
          pauseTotal += Math.max(0.02, leg.pause)
        }
      } else if (legIndex < legs.length - 1) {
        pauseTotal += DEFAULT_FLOW_TRANSIT
      }
      if (leg.direction !== undefined && !FLOW_DIRECTIONS.includes(leg.direction as FlowDirection)) {
        const nearest = typeof leg.direction === 'string' ? closest(leg.direction, FLOW_DIRECTIONS) : undefined
        push({
          code: 'semantic/unknown-flow-direction',
          severity: 'error',
          subject,
          message: `Flow "${subject.id ?? index}" leg ${legIndex} uses unknown direction "${String(leg.direction)}"`,
          evidence: { legIndex, field: 'direction', value: leg.direction, known: FLOW_DIRECTIONS },
          supportedFixes: nearest ? [{ kind: 'set-flow-direction', direction: nearest }] : undefined,
        })
      }
      const hasId = typeof leg.id === 'string' && leg.id.length > 0
      const hasPair = typeof leg.from === 'string' && typeof leg.to === 'string'
      if (!hasId && !hasPair) {
        push({
          code: 'semantic/invalid-flow-ref',
          severity: 'error',
          subject,
          message: `Flow "${subject.id ?? index}" leg ${legIndex} needs either connector \`id\` or a \`from\`/\`to\` pair`,
          evidence: { legIndex, leg },
          supportedFixes: [{ kind: 'remove-ref' }],
        })
        return
      }
      const matches = connectorMatches(leg)
      if (matches.length === 0) {
        push({
          code: 'semantic/flow-missing-connector',
          severity: 'error',
          subject,
          message: `Flow "${subject.id ?? index}" leg ${legIndex} does not match a connector`,
          evidence: { legIndex, leg },
          supportedFixes: [{ kind: 'remove-ref' }, { kind: 'remove-flow' }],
        })
      } else if (matches.length > 1 && !hasId) {
        const first = matches[0].c.id
        push({
          code: 'semantic/ambiguous-flow-connector',
          severity: 'warning',
          subject,
          message: `Flow "${subject.id ?? index}" leg ${legIndex} matches ${matches.length} connectors by endpoint pair — pin a connector \`id\``,
          evidence: { legIndex, matches: matches.map(match => match.index), connectorIds: matches.map(match => match.c.id).filter(Boolean) },
          supportedFixes: typeof first === 'string' ? [{ kind: 'set-flow-leg-id', id: first }] : undefined,
        })
      }
    })
    const duration = raw.duration
    if (duration !== undefined) {
      if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0) {
        push({
          code: 'semantic/invalid-flow-timing',
          severity: 'error',
          subject,
          message: `Flow "${subject.id ?? index}" duration must be a positive finite number`,
          evidence: { field: 'duration', value: duration },
          supportedFixes: [{ kind: 'set-flow-timing', field: 'duration', value: Math.max(1, pauseTotal + 1) }],
        })
      } else if (pauseTotal > 0 && duration <= pauseTotal) {
        push({
          code: 'semantic/invalid-flow-timing',
          severity: 'error',
          subject,
          message: `Flow "${subject.id ?? index}" duration (${duration}s) must exceed its ${pauseTotal.toFixed(2)}s of leg pauses`,
          evidence: { field: 'duration', value: duration, pauseTotal },
          supportedFixes: [{ kind: 'set-flow-timing', field: 'duration', value: pauseTotal + 1 }],
        })
      }
    }
  })

  // focusTargets: keyed by the node that activates the story.
  const focusTargets = d.focusTargets
  if (focusTargets != null && !isObject(focusTargets)) {
    push({ code: 'shape/invalid-focus-targets', severity: 'error', subject: { type: 'diagram' }, message: '`focusTargets` must be an object' })
  } else if (isObject(focusTargets)) {
    for (const [key, raw] of Object.entries(focusTargets)) {
      if (!Object.prototype.hasOwnProperty.call(nodes, key)) {
        push({
          code: 'semantic/focus-target-missing-node',
          severity: 'warning',
          subject: { type: 'node', id: key },
          message: `focusTargets["${key}"] targets a node that does not exist`,
          evidence: { focusTarget: key, via: 'key' },
          supportedFixes: [{ kind: 'remove-ref' }],
        })
      }
      if (!isObject(raw)) continue
      if (Array.isArray(raw.nodes)) {
        for (const ref of raw.nodes) {
          if (typeof ref === 'string' && !Object.prototype.hasOwnProperty.call(nodes, ref)) {
            push({
              code: 'semantic/focus-target-missing-node',
              severity: 'warning',
              subject: { type: 'node', id: ref },
              message: `focusTargets["${key}"].nodes references missing node "${ref}"`,
              evidence: { focusTarget: key, via: 'nodes', value: ref },
              supportedFixes: [{ kind: 'remove-ref' }],
            })
          }
        }
      }
      if (Array.isArray(raw.connectors)) {
        for (const ref of raw.connectors) {
          if (!isObject(ref)) continue
          const matched = validConnectors.some(({ c }) =>
            typeof ref.id === 'string'
              ? c.id === ref.id
              : c.from === ref.from && c.to === ref.to)
          if (!matched) {
            push({
              code: 'semantic/focus-target-missing-connector',
              severity: 'warning',
              subject: { type: 'connector', id: typeof ref.id === 'string' ? ref.id : `${String(ref.from)}->${String(ref.to)}` },
              message: `focusTargets["${key}"].connectors references a connector that does not exist`,
              evidence: { focusTarget: key, ref },
              supportedFixes: [{ kind: 'remove-ref' }],
            })
          }
        }
      }
    }
  }

  // views: ordered guided tour entries; same reference rules as focusTargets.
  const views = d.views
  if (views != null && !Array.isArray(views)) {
    push({ code: 'shape/invalid-views', severity: 'error', subject: { type: 'diagram' }, message: '`views` must be an array' })
  } else if (Array.isArray(views)) {
    const seenViewIds = new Set<string>()
    views.forEach((raw, index) => {
      if (!isObject(raw)) {
        push({ code: 'shape/invalid-view', severity: 'error', subject: { type: 'diagram' }, message: `views[${index}] must be an object`, evidence: { index } })
        return
      }
      const viewId = typeof raw.id === 'string' ? raw.id : String(raw.id ?? index)
      if (typeof raw.id !== 'string' || raw.id.length === 0 || typeof raw.title !== 'string' || raw.title.length === 0) {
        push({
          code: 'shape/invalid-view',
          severity: 'error',
          subject: { type: 'diagram' },
          message: `views[${index}] requires non-empty string "id" and "title"`,
          evidence: { index, id: raw.id, title: raw.title },
        })
      } else if (seenViewIds.has(raw.id)) {
        push({
          code: 'semantic/duplicate-view-id',
          severity: 'warning',
          subject: { type: 'diagram' },
          message: `views[${index}] duplicates view id "${raw.id}" — deep links and the rail select the first`,
          evidence: { index, id: raw.id },
        })
      } else {
        seenViewIds.add(raw.id)
      }
      if (typeof raw.node === 'string' && !Object.prototype.hasOwnProperty.call(nodes, raw.node)) {
        push({
          code: 'semantic/view-missing-node',
          severity: 'warning',
          subject: { type: 'node', id: raw.node },
          message: `views["${viewId}"].node references a node that does not exist`,
          evidence: { view: viewId, via: 'node', value: raw.node },
          supportedFixes: [{ kind: 'remove-ref' }],
        })
      }
      if (Array.isArray(raw.nodes)) {
        for (const ref of raw.nodes) {
          if (typeof ref === 'string' && !Object.prototype.hasOwnProperty.call(nodes, ref)) {
            push({
              code: 'semantic/view-missing-node',
              severity: 'warning',
              subject: { type: 'node', id: ref },
              message: `views["${viewId}"].nodes references missing node "${ref}"`,
              evidence: { view: viewId, via: 'nodes', value: ref },
              supportedFixes: [{ kind: 'remove-ref' }],
            })
          }
        }
      }
      if (Array.isArray(raw.connectors)) {
        for (const ref of raw.connectors) {
          if (!isObject(ref)) continue
          const matched = validConnectors.some(({ c }) =>
            typeof ref.id === 'string'
              ? c.id === ref.id
              : c.from === ref.from && c.to === ref.to)
          if (!matched) {
            push({
              code: 'semantic/view-missing-connector',
              severity: 'warning',
              subject: { type: 'connector', id: typeof ref.id === 'string' ? ref.id : `${String(ref.from)}->${String(ref.to)}` },
              message: `views["${viewId}"].connectors references a connector that does not exist`,
              evidence: { view: viewId, ref },
              supportedFixes: [{ kind: 'remove-ref' }],
            })
          }
        }
      }
    })
  }

  // layoutHints: group membership lives on the node hint — a group "owns" the
  // nodes that name it, per docs/group-layout.md.
  const layoutHints = d.layoutHints
  if (layoutHints != null && !isObject(layoutHints)) {
    push({ code: 'shape/invalid-layout-hints', severity: 'error', subject: { type: 'diagram' }, message: '`layoutHints` must be an object' })
  } else if (isObject(layoutHints)) {
    if (isObject(layoutHints.nodes)) {
      for (const [nodeId, raw] of Object.entries(layoutHints.nodes)) {
        if (!Object.prototype.hasOwnProperty.call(nodes, nodeId)) {
          push({
            code: 'semantic/layout-hint-missing-node',
            severity: 'warning',
            subject: { type: 'node', id: nodeId },
            message: `layoutHints.nodes["${nodeId}"] refers to a node that does not exist`,
            evidence: { nodeId },
            supportedFixes: [{ kind: 'remove-ref' }],
          })
        }
        const groupId = isObject(raw) ? raw.group : undefined
        if (typeof groupId === 'string' && !validGroups.has(groupId)) {
          push({
            code: 'semantic/layout-hint-missing-group',
            severity: 'warning',
            subject: { type: 'node', id: nodeId },
            message: `layoutHints.nodes["${nodeId}"].group references missing group "${groupId}"`,
            evidence: { nodeId, group: groupId },
            supportedFixes: [{ kind: 'remove-ref' }],
          })
        }
      }
    }
    if (isObject(layoutHints.groups)) {
      for (const groupId of Object.keys(layoutHints.groups)) {
        if (!validGroups.has(groupId)) {
          push({
            code: 'semantic/layout-hint-missing-group',
            severity: 'warning',
            subject: { type: 'group', id: groupId },
            message: `layoutHints.groups["${groupId}"] refers to a group that does not exist`,
            evidence: { group: groupId },
            supportedFixes: [{ kind: 'remove-ref' }],
          })
        }
      }
    }
  }

  // -- geometry: what it would look like -----------------------------------

  const boxes = new Map<string, Box>()
  for (const id of validNodes) {
    const box = nodeBox(nodes[id] as Rec)
    if (box) boxes.set(id, box)
  }

  const layout = d.layout as { width: number; height: number }
  for (const [id, b] of boxes) {
    const overflow = {
      left: Math.max(0, -b.x),
      top: Math.max(0, -b.y),
      right: Math.max(0, b.x + b.w - layout.width),
      bottom: Math.max(0, b.y + b.h - layout.height),
    }
    if (overflow.left || overflow.top || overflow.right || overflow.bottom) {
      push({
        code: 'geometry/node-outside-layout',
        severity: 'error',
        subject: { type: 'node', id },
        message: `Node "${id}" extends past the ${layout.width}×${layout.height} layout bounds`,
        evidence: { box: b, layout, overflow },
        supportedFixes: [{ kind: 'auto-layout' }],
      })
    }
  }

  const boxIds = [...boxes.keys()]
  for (let i = 0; i < boxIds.length; i++) {
    for (let j = i + 1; j < boxIds.length; j++) {
      const a = boxes.get(boxIds[i])!
      const b = boxes.get(boxIds[j])!
      const ow = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
      const oh = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
      if (ow > 0 && oh > 0) {
        push({
          code: 'geometry/node-overlap',
          severity: 'error',
          subject: { type: 'node', id: boxIds[j] },
          message: `Node "${boxIds[j]}" overlaps "${boxIds[i]}" by ${Math.round(ow)}×${Math.round(oh)}px`,
          evidence: {
            other: boxIds[i],
            box: b,
            otherBox: a,
            overlap: { width: ow, height: oh, area: ow * oh },
          },
          supportedFixes: [{ kind: 'auto-layout' }],
        })
      }
    }
  }

  for (const { c, index } of validConnectors) {
    if (
      !boxes.has(c.from as string) || !boxes.has(c.to as string) ||
      !ANCHORS.includes(c.fromAnchor as AnchorPosition) ||
      !ANCHORS.includes(c.toAnchor as AnchorPosition)
    ) continue
    const polyline = connectorPolyline(c, nodes as Record<string, NodePosition>)
    for (const [nodeId, box] of boxes) {
      if (nodeId === c.from || nodeId === c.to) continue
      for (let s = 0; s < polyline.length - 1; s++) {
        const hit = segBoxHit(polyline[s], polyline[s + 1], box)
        if (hit) {
          push({
            code: 'geometry/connector-through-node',
            severity: 'error',
            subject: connectorSubject(c, index),
            message: `Connector "${connectorSubject(c, index).id}" passes through node "${nodeId}"`,
            evidence: {
              node: nodeId,
              at: { x: Math.round(hit.x), y: Math.round(hit.y) },
              path: 'routed-bezier',
              samples: SAMPLES,
            },
            supportedFixes: [{ kind: 'auto-layout' }],
          })
          break
        }
      }
    }
  }

  // Composition — advisory readings of the authoring contract (see
  // skills/arc-diagrams/SKILL.md "Layout judgment"): budgets, not faults.
  const nodeCount = Object.keys(nodes).length
  const groupHints = isObject(d.layoutHints) ? (d.layoutHints as Rec).groups : undefined
  const chaptered =
    (Array.isArray(d.views) && d.views.length > 0) ||
    (Array.isArray(d.groups) && d.groups.length > 0) ||
    (isObject(groupHints) && Object.keys(groupHints).length > 0)
  if (nodeCount > 16 && !chaptered) {
    push({
      code: 'composition/too-dense',
      severity: 'warning',
      subject: { type: 'diagram' },
      message: `${nodeCount} nodes in one flat view — chapter it with views[] or group frames`,
      evidence: { nodeCount, budget: 16 },
      supportedFixes: [{ kind: 'auto-layout' }],
    })
  }

  // Label budget: the name row is the node's header — icon + padding leave
  // roughly (width − 48)px of text; ~6.5px/char at the 10–11px name size.
  const LABEL_BUDGET: Record<string, number> = { xs: 5, s: 9, m: 17, l: 26 }
  for (const [id, raw] of Object.entries(nodeData)) {
    if (!isObject(raw) || typeof raw.name !== 'string') continue
    const name = raw.name
    const pos = nodes[id]
    const size = isObject(pos) && typeof pos.size === 'string' ? pos.size : 'm'
    const budget = LABEL_BUDGET[size] ?? LABEL_BUDGET.m
    if (name.length <= budget) continue
    const fits = (NODE_SIZE_KEYS as string[]).find(s => (LABEL_BUDGET[s] ?? 0) >= name.length)
    push({
      code: 'composition/label-overflow',
      severity: 'warning',
      subject: { type: 'node', id },
      message: `Node "${id}" name "${name}" (${name.length} chars) overflows its ${size} box (~${budget} char budget)`,
      evidence: { name, length: name.length, size, budget },
      supportedFixes: fits ? [{ kind: 'set-size', size: fits as NodeSize }] : undefined,
    })
  }

  return diagnostics
}
