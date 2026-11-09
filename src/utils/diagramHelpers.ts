import type { AnchorPosition, ArrowHead, Connector, NodePosition, DiagramLayout, Point } from '../types/editor'
import { NODE_SIZES, NodeSizeKey, NodeDimensions } from './constants'

// Distance from box edge to arrow start/end (minimal gap for tight alignment)
const GAP = 0

// Extended node with computed dimensions
interface NodeWithDimensions extends NodePosition {
  width: number
  height: number
}

// Get node with merged position and size data
export function getNode(
  nodes: Record<string, NodePosition>,
  id: string
): NodeWithDimensions | null {
  const node = nodes[id]
  if (!node) return null
  const size: NodeDimensions = NODE_SIZES[node.size as NodeSizeKey] || NODE_SIZES.m
  // Custom width/height on the node override the size preset.
  return { ...size, ...node }
}

// Anchor point on an already-resolved node box. Shared by the editor canvas,
// the player, and the static export so the same anchor name lands on the same
// pixel everywhere.
export function anchorOnNode(
  n: { x: number; y: number; width: number; height: number },
  position: AnchorPosition
): Point {
  switch (position) {
    case 'left':
      return { x: n.x - GAP, y: n.y + n.height / 2 }
    case 'right':
      return { x: n.x + n.width + GAP, y: n.y + n.height / 2 }
    case 'top':
      return { x: n.x + n.width / 2, y: n.y - GAP }
    case 'bottom':
      return { x: n.x + n.width / 2, y: n.y + n.height + GAP }
    case 'bottomRight':
      return { x: n.x + n.width + GAP, y: n.y + n.height - 15 }
    case 'bottomLeft':
      return { x: n.x - GAP, y: n.y + n.height - 15 }
    case 'topRight':
      return { x: n.x + n.width + GAP, y: n.y + 15 }
    case 'topLeft':
      return { x: n.x - GAP, y: n.y + 15 }
    default:
      return { x: n.x + n.width / 2, y: n.y + n.height / 2 }
  }
}

// Advance of a monospace connector label: ~0.6em per glyph plus tracking.
export function monoLabelWidth(text: string, fontSize: number, letterSpacing = 0): number {
  return text.length * (fontSize * 0.6 + letterSpacing)
}

/**
 * Baseline of a centred connector label — the one that rides above the
 * midpoint of a horizontal run. That spot is only clear while the label fits
 * the span between the two boxes; a label wider than the gap lands on their
 * edges and arrowheads. Then it rises to sit above whichever box it would
 * cross, still centred on the gap. Shared by the player and the static export.
 */
export function centeredLabelBaseline(
  mid: Point,
  labelWidth: number,
  fontSize: number,
  boxes: Array<{ x: number; y: number; width: number; height: number }>,
  lift = 8,
): number {
  const baseline = mid.y - lift
  const pad = 3
  const left = mid.x - labelWidth / 2 - pad
  const right = mid.x + labelWidth / 2 + pad
  const top = baseline - fontSize * 0.8
  let y = baseline
  for (const b of boxes) {
    const crossesX = right > b.x && left < b.x + b.width
    const crossesY = baseline + pad > b.y && top < b.y + b.height
    if (crossesX && crossesY) y = Math.min(y, b.y - 6)
  }
  return y
}

// Calculate anchor point coordinates for a node
export function anchor(
  nodes: Record<string, NodePosition>,
  nodeId: string,
  position: AnchorPosition
): Point {
  const n = getNode(nodes, nodeId)
  if (!n) return { x: 0, y: 0 }
  return anchorOnNode(n, position)
}

const MAIN_ANCHORS: AnchorPosition[] = ['top', 'right', 'bottom', 'left']

/** Closest of the four main faces to a canvas-space point. */
export function nearestNodeAnchor(
  nodes: Record<string, NodePosition>,
  nodeId: string,
  canvasX: number,
  canvasY: number
): AnchorPosition {
  let best: AnchorPosition = 'right'
  let bestD = Infinity
  for (const face of MAIN_ANCHORS) {
    const p = anchor(nodes, nodeId, face)
    const d = (p.x - canvasX) ** 2 + (p.y - canvasY) ** 2
    if (d < bestD) {
      bestD = d
      best = face
    }
  }
  return best
}

/** Last matching node in 2D canvas space (later draw order wins). */
export function hitTestNode(
  nodes: Record<string, NodePosition>,
  nodeData: Record<string, unknown>,
  pt: Point
): string | null {
  let hit: string | null = null
  for (const [id, node] of Object.entries(nodes)) {
    if (!nodeData[id]) continue
    const size = NODE_SIZES[node.size as NodeSizeKey] || NODE_SIZES.m
    const w = node.width || size.width
    const h = node.height || size.height
    if (pt.x >= node.x && pt.x <= node.x + w && pt.y >= node.y && pt.y <= node.y + h) {
      hit = id
    }
  }
  return hit
}

// Calculate midpoint between two coordinates
export function midPoint(p1: Point, p2: Point): Point {
  return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
}

// Connector geometry — shared by the editor canvas and the static SVG export
// so both draw the same curve for the same connector.

/** Control-point offset along an anchor's natural direction: side anchors exit
 *  orthogonal to the node edge, corner anchors cut a 45° diagonal toward their
 *  corner. */
export function getConnectorControlOffset(anchor: AnchorPosition, distance: number): Point {
  const d = Math.abs(distance) * 0.5
  switch (anchor) {
    case 'top': return { x: 0, y: -d }
    case 'bottom': return { x: 0, y: d }
    case 'left': return { x: -d, y: 0 }
    case 'right': return { x: d, y: 0 }
    case 'topLeft': return { x: -d * 0.7, y: -d * 0.7 }
    case 'topRight': return { x: d * 0.7, y: -d * 0.7 }
    case 'bottomLeft': return { x: -d * 0.7, y: d * 0.7 }
    case 'bottomRight': return { x: d * 0.7, y: d * 0.7 }
    default: return { x: 0, y: 0 }
  }
}

/** Bezier control points for a connector (see generatePath semantics below). */
export function connectorControlPoints(
  from: Point, to: Point, fromAnchor: AnchorPosition, toAnchor: AnchorPosition,
  curve?: Connector['curve'], curveDepth = 40,
): { cp1: Point; cp2: Point } {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const distance = Math.sqrt(dx * dx + dy * dy)

  // Natural bezier - control points extend from anchors in their natural direction,
  // scaled by curveDepth (50 = 50% of the endpoint distance).
  if (curve === 'natural' || curve === 'down' || curve === 'up') {
    const scale = curveDepth / 50
    const fromOffset = getConnectorControlOffset(fromAnchor, distance)
    const toOffset = getConnectorControlOffset(toAnchor, distance)
    return {
      cp1: { x: from.x + fromOffset.x * scale, y: from.y + fromOffset.y * scale },
      cp2: { x: to.x + toOffset.x * scale, y: to.y + toOffset.y * scale },
    }
  }

  // Horizontal connections (right->left or left->right) pass through midX
  if ((fromAnchor === 'right' && toAnchor === 'left') || (fromAnchor === 'left' && toAnchor === 'right')) {
    const midX = (from.x + to.x) / 2
    return { cp1: { x: midX, y: from.y }, cp2: { x: midX, y: to.y } }
  }

  // Vertical connections (top->bottom or bottom->top) pass through midY
  if ((fromAnchor === 'bottom' && toAnchor === 'top') || (fromAnchor === 'top' && toAnchor === 'bottom')) {
    const midY = (from.y + to.y) / 2
    return { cp1: { x: from.x, y: midY }, cp2: { x: to.x, y: midY } }
  }

  // Any other pairing: gentle curve along both anchors' directions
  const fromOffset = getConnectorControlOffset(fromAnchor, distance)
  const toOffset = getConnectorControlOffset(toAnchor, distance)
  return {
    cp1: { x: from.x + fromOffset.x, y: from.y + fromOffset.y },
    cp2: { x: to.x + toOffset.x, y: to.y + toOffset.y },
  }
}

/** One drawable piece of a connector route. Flow animation samples distance
 *  along these instead of re-parsing SVG path text. */
export type ConnectorPathSegment =
  | { kind: 'line'; from: Point; to: Point }
  | { kind: 'quadratic'; from: Point; control: Point; to: Point }
  | { kind: 'cubic'; from: Point; cp1: Point; cp2: Point; to: Point }

export interface ConnectorGeometry {
  d: string
  segments: ConnectorPathSegment[]
  /** Direction the route leaves `from`, in canvas degrees. */
  startAngle: number
  /** Direction the route arrives at `to`, in canvas degrees. */
  endAngle: number
}

/** Degrees of a → b. */
export function angleBetween(a: Point, b: Point): number {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
}

// Generate SVG path for straight line
export function straightPath(from: Point, to: Point): string {
  return `M ${from.x} ${from.y} L ${to.x} ${to.y}`
}

function segmentStartAngle(segment: ConnectorPathSegment): number {
  const next = segment.kind === 'cubic' ? segment.cp1 : segment.kind === 'quadratic' ? segment.control : segment.to
  const angle = angleBetween(segment.from, next)
  return Number.isFinite(angle) ? angle : angleBetween(segment.from, segment.to)
}

function segmentEndAngle(segment: ConnectorPathSegment): number {
  const prev = segment.kind === 'cubic' ? segment.cp2 : segment.kind === 'quadratic' ? segment.control : segment.from
  const angle = angleBetween(prev, segment.to)
  return Number.isFinite(angle) ? angle : angleBetween(segment.from, segment.to)
}

export function connectorSegmentsPath(segments: ConnectorPathSegment[]): string {
  let d = ''
  for (const segment of segments) {
    if (d === '') d = `M ${segment.from.x} ${segment.from.y}`
    if (segment.kind === 'line') {
      d += ` L ${segment.to.x} ${segment.to.y}`
    } else if (segment.kind === 'quadratic') {
      d += ` Q ${segment.control.x} ${segment.control.y} ${segment.to.x} ${segment.to.y}`
    } else {
      d += ` C ${segment.cp1.x} ${segment.cp1.y}, ${segment.cp2.x} ${segment.cp2.y}, ${segment.to.x} ${segment.to.y}`
    }
  }
  return d
}

function horizontalAnchor(a?: AnchorPosition): boolean {
  return a === 'left' || a === 'right'
}

/** Polyline points for an orthogonal route ('step' curve). Corner anchors
 *  (topLeft, bottomRight…) exit vertically. */
export function elbowPolyline(
  from: Point,
  to: Point,
  fromAnchor?: AnchorPosition,
  toAnchor?: AnchorPosition,
): Point[] {
  const midX = (from.x + to.x) / 2
  const midY = (from.y + to.y) / 2
  const fH = horizontalAnchor(fromAnchor)
  const tH = horizontalAnchor(toAnchor)
  if (fH && tH) return [from, { x: midX, y: from.y }, { x: midX, y: to.y }, to]
  if (!fH && !tH) return [from, { x: from.x, y: midY }, { x: to.x, y: midY }, to]
  if (fH) return [from, { x: to.x, y: from.y }, to]
  return [from, { x: from.x, y: to.y }, to]
}

/** Line/quadratic segments for `roundedPolylineD`, corners rounded by `radius`. */
export function roundedPolylineSegments(pts: Point[], radius = 10): ConnectorPathSegment[] {
  if (pts.length < 2) return []
  if (pts.length === 2) return [{ kind: 'line', from: pts[0], to: pts[1] }]
  const segments: ConnectorPathSegment[] = []
  let cursor = pts[0]
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1]
    const cur = pts[i]
    const next = pts[i + 1]
    const lenIn = Math.hypot(cur.x - prev.x, cur.y - prev.y)
    const lenOut = Math.hypot(next.x - cur.x, next.y - cur.y)
    const r = Math.min(radius, lenIn / 2, lenOut / 2)
    if (r < 0.5 || lenIn === 0 || lenOut === 0) {
      if (cur.x !== cursor.x || cur.y !== cursor.y) {
        segments.push({ kind: 'line', from: cursor, to: cur })
        cursor = cur
      }
      continue
    }
    const inPoint = {
      x: cur.x - ((cur.x - prev.x) / lenIn) * r,
      y: cur.y - ((cur.y - prev.y) / lenIn) * r,
    }
    const outPoint = {
      x: cur.x + ((next.x - cur.x) / lenOut) * r,
      y: cur.y + ((next.y - cur.y) / lenOut) * r,
    }
    if (inPoint.x !== cursor.x || inPoint.y !== cursor.y) {
      segments.push({ kind: 'line', from: cursor, to: inPoint })
    }
    segments.push({ kind: 'quadratic', from: inPoint, control: cur, to: outPoint })
    cursor = outPoint
  }
  const last = pts[pts.length - 1]
  if (last.x !== cursor.x || last.y !== cursor.y) {
    segments.push({ kind: 'line', from: cursor, to: last })
  }
  return segments
}

/** SVG path through polyline points, corners rounded by `radius`. */
export function roundedPolylineD(pts: Point[], radius = 10): string {
  return connectorSegmentsPath(roundedPolylineSegments(pts, radius))
}

/** Shared connector geometry used by the canvas, export, and flow animation. */
export function connectorGeometry(
  from: Point, to: Point, fromAnchor: AnchorPosition, toAnchor: AnchorPosition,
  curve?: Connector['curve'], curveDepth = 40,
): ConnectorGeometry {
  let segments: ConnectorPathSegment[]
  if (curve === 'direct') {
    segments = [{ kind: 'line', from, to }]
  } else if (curve === 'step') {
    segments = roundedPolylineSegments(elbowPolyline(from, to, fromAnchor, toAnchor))
  } else {
    const { cp1, cp2 } = connectorControlPoints(from, to, fromAnchor, toAnchor, curve, curveDepth)
    segments = [{ kind: 'cubic', from, cp1, cp2, to }]
  }
  const first = segments[0]
  const last = segments[segments.length - 1]
  const fallback = angleBetween(from, to)
  return {
    d: connectorSegmentsPath(segments),
    segments,
    startAngle: first ? segmentStartAngle(first) : fallback,
    endAngle: last ? segmentEndAngle(last) : fallback,
  }
}

/** Smooth curved or routed path between two anchor points. */
export function connectorPath(
  from: Point, to: Point, fromAnchor: AnchorPosition, toAnchor: AnchorPosition,
  curve?: Connector['curve'], curveDepth = 40,
): string {
  return connectorGeometry(from, to, fromAnchor, toAnchor, curve, curveDepth).d
}

/** Degrees the path arrives at `to` — the route's end tangent, for arrowhead
 *  orientation (the endpoint secant mis-rotates heads on curved paths). */
export function connectorEndAngle(
  from: Point, to: Point, fromAnchor: AnchorPosition, toAnchor: AnchorPosition,
  curve?: Connector['curve'], curveDepth = 40,
): number {
  return connectorGeometry(from, to, fromAnchor, toAnchor, curve, curveDepth).endAngle
}

/** Degrees a bidirectional arrow at `from` points back into its node. */
export function connectorStartAngle(
  from: Point, to: Point, fromAnchor: AnchorPosition, toAnchor: AnchorPosition,
  curve?: Connector['curve'], curveDepth = 40,
): number {
  return connectorGeometry(from, to, fromAnchor, toAnchor, curve, curveDepth).startAngle + 180
}


// Curve direction type
type CurveDirection = 'down' | 'up'

// Generate SVG path for curved line
export function curvedPath(from: Point, to: Point, direction: CurveDirection = 'down'): string {
  const cp = 50
  if (direction === 'down') {
    return `M ${from.x} ${from.y} C ${from.x + cp} ${from.y + 50}, ${to.x - cp} ${to.y - 30}, ${to.x} ${to.y}`
  }
  return straightPath(from, to)
}

// Generate unique node ID
export function generateNodeId(): string {
  return `node_${crypto.randomUUID().slice(0, 8)}`
}

// Get center position of canvas for new nodes
export function getCanvasCenter(layout: DiagramLayout): Point {
  return {
    x: layout.width / 2 - NODE_SIZES.m.width / 2,
    y: layout.height / 2 - NODE_SIZES.m.height / 2,
  }
}

/** Bounding box of everything drawn — nodes, groups, images — in canvas
 *  coordinates. Returns null when the canvas is empty. */
export function getContentBounds(
  nodes: Record<string, NodePosition>,
  groups?: Array<{ x: number; y: number; width: number; height: number }>,
  images?: Array<{ x: number; y: number; width: number; height: number }>,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  let found = false

  for (const node of Object.values(nodes)) {
    const dims = NODE_SIZES[node.size as NodeSizeKey] || NODE_SIZES.m
    const w = node.width || dims.width
    const h = node.height || dims.height
    minX = Math.min(minX, node.x)
    minY = Math.min(minY, node.y)
    maxX = Math.max(maxX, node.x + w)
    maxY = Math.max(maxY, node.y + h)
    found = true
  }

  for (const g of groups || []) {
    minX = Math.min(minX, g.x)
    minY = Math.min(minY, g.y)
    maxX = Math.max(maxX, g.x + g.width)
    maxY = Math.max(maxY, g.y + g.height)
    found = true
  }

  for (const img of images || []) {
    minX = Math.min(minX, img.x)
    minY = Math.min(minY, img.y)
    maxX = Math.max(maxX, img.x + img.width)
    maxY = Math.max(maxY, img.y + img.height)
    found = true
  }

  return found ? { minX, minY, maxX, maxY } : null
}

// ============================================
// Connector appearance & routing
// ============================================

export interface ConnectorEndStyle {
  dashed?: boolean
  lineStyle?: 'solid' | 'dashed' | 'dotted'
  opacity?: number
  bidirectional?: boolean
  animated?: boolean
  showArrow?: boolean
  showEndpoints?: boolean
  fromArrow?: ArrowHead
  toArrow?: ArrowHead
  arrowSize?: number
  fromArrowSize?: number
  toArrowSize?: number
  arrowScale?: boolean
  strokeWidth?: number
}

/** Resolved stroke pattern — `lineStyle` wins over the legacy `dashed` flag. */
export function connectorLineStyle(style: ConnectorEndStyle): 'solid' | 'dashed' | 'dotted' {
  return style.lineStyle ?? (style.dashed ? 'dashed' : 'solid')
}

/** Arrowhead drawn at one end of a connector, honouring the legacy flags. */
export function connectorArrowAt(style: ConnectorEndStyle, end: 'from' | 'to'): ArrowHead {
  const explicit = end === 'from' ? style.fromArrow : style.toArrow
  if (explicit) return explicit
  if (end === 'to') return style.showArrow === false ? 'none' : 'arrow'
  return style.bidirectional ? 'arrow' : 'none'
}

/** Arrowhead length in px at one end. `arrowScale` makes it follow the
 *  stroke width; per-end overrides win over `arrowSize`. */
export function connectorArrowSize(style: ConnectorEndStyle, end: 'from' | 'to'): number {
  const size = (end === 'from' ? style.fromArrowSize : style.toArrowSize) ?? style.arrowSize
  if (size != null) return size
  if (style.arrowScale) return Math.max(4, (style.strokeWidth ?? 2) * 4)
  return 8
}

export interface ArrowShape {
  /** Path 'd' in local coords — +x is the direction of travel, origin at the tip. */
  d?: string
  /** Circle for the 'dot' end. */
  circle?: { cx: number; r: number }
  /** Filled polygon vs stroked path. */
  filled: boolean
}

/** Geometry for an arrowhead kind at a given size. */
export function arrowShape(kind: ArrowHead, size: number): ArrowShape | null {
  const s = size
  switch (kind) {
    case 'arrow':
      return { d: `M 0 0 L ${-s} ${-s / 2.6} L ${-s} ${s / 2.6} Z`, filled: true }
    case 'open':
      return { d: `M ${-s} ${-s / 2.4} L 0 0 L ${-s} ${s / 2.4}`, filled: false }
    case 'dart':
      // Filled swallowtail — reads crisply at small sizes where an open
      // chevron washes out to a bare caret.
      return { d: `M 0 0 L ${-s * 1.15} ${-s * 0.55} L ${-s * 0.7} 0 L ${-s * 1.15} ${s * 0.55} Z`, filled: true }
    case 'dot':
      return { circle: { cx: -s / 2, r: s / 2.8 }, filled: true }
    case 'diamond':
      return { d: `M 0 0 L ${-s * 0.5} ${-s * 0.3} L ${-s} 0 L ${-s * 0.5} ${s * 0.3} Z`, filled: true }
    case 'bar':
      return { d: `M ${-s * 0.15} ${-s * 0.5} L ${-s * 0.15} ${s * 0.5}`, filled: false }
    default:
      return null
  }
}
