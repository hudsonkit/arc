import type { ArcCanvasOverlayNode } from '../../components/ArcDiagram'
import type { Connector, ConnectorStyle } from '../../types/diagram'
import type { LiveWorkScope } from '../../types/live'
import type { LiveBounds } from '../../utils/liveMotion'
import { anchorOnNode, connectorGeometry, type ConnectorPathSegment } from '../../utils/diagramHelpers'
import type { Point } from '../../types/editor'

/** Scope is authored before work; node scopes follow the displayed spring geometry. */
export function workScopeBounds(scope: LiveWorkScope, nodes: ArcCanvasOverlayNode[], canvas: LiveBounds): LiveBounds | null {
  if (scope.type === 'canvas') return canvas
  if (scope.type === 'region') return {
    minX: scope.x, minY: scope.y, maxX: scope.x + scope.width, maxY: scope.y + scope.height,
  }
  const selected = nodes.filter(node => scope.nodeIds.includes(node.id) && node.opacity > 0)
  if (!selected.length) return null
  return {
    minX: Math.min(...selected.map(node => node.x)),
    minY: Math.min(...selected.map(node => node.y)),
    maxX: Math.max(...selected.map(node => node.x + node.width)),
    maxY: Math.max(...selected.map(node => node.y + node.height)),
  }
}

/** Everything a work label must not sit on, in canvas units. */
export interface LabelObstacles {
  rects: LiveBounds[]
  /** Connector routes flattened to polylines. */
  paths: Point[][]
}

function samplePath(segments: ConnectorPathSegment[]): Point[] {
  const points: Point[] = []
  for (const segment of segments) {
    if (!points.length) points.push(segment.from)
    if (segment.kind === 'line') { points.push(segment.to); continue }
    const steps = 16
    for (let i = 1; i <= steps; i++) {
      const t = i / steps, u = 1 - t
      if (segment.kind === 'quadratic') {
        points.push({
          x: u * u * segment.from.x + 2 * u * t * segment.control.x + t * t * segment.to.x,
          y: u * u * segment.from.y + 2 * u * t * segment.control.y + t * t * segment.to.y,
        })
      } else {
        points.push({
          x: u * u * u * segment.from.x + 3 * u * u * t * segment.cp1.x + 3 * u * t * t * segment.cp2.x + t * t * t * segment.to.x,
          y: u * u * u * segment.from.y + 3 * u * u * t * segment.cp1.y + 3 * u * t * t * segment.cp2.y + t * t * t * segment.to.y,
        })
      }
    }
  }
  return points
}

/**
 * Displayed boxes, connector routes and the space reserved for connector
 * labels. Routes use the renderer's own geometry so a label can never be
 * placed on a line the canvas draws.
 */
export function workLabelObstacles(
  nodes: ArcCanvasOverlayNode[],
  connectors: readonly Connector[] = [],
  styles: Record<string, ConnectorStyle> = {},
): LabelObstacles {
  const visible = nodes.filter(node => node.opacity > 0)
  const byId = new Map(visible.map(node => [node.id, node]))
  const rects: LiveBounds[] = visible.map(node => ({ minX: node.x, minY: node.y, maxX: node.x + node.width, maxY: node.y + node.height }))
  const paths: Point[][] = []
  for (const connector of connectors) {
    const from = byId.get(connector.from), to = byId.get(connector.to)
    if (!from || !to) continue
    const start = anchorOnNode(from, connector.fromAnchor), end = anchorOnNode(to, connector.toAnchor)
    const route = samplePath(connectorGeometry(start, end, connector.fromAnchor, connector.toAnchor, connector.curve, connector.curveDepth ?? 40).segments)
    paths.push(route)
    const label = connector.label ?? styles[connector.style]?.label
    if (label) {
      // Connector labels sit beside the route's midpoint; reserve a box that
      // covers either side rather than modelling each renderer's offset.
      const mid = route[Math.floor(route.length / 2)]
      const half = label.length * 4 + 14
      rects.push({ minX: mid.x - half, minY: mid.y - 18, maxX: mid.x + half, maxY: mid.y + 18 })
    }
  }
  return { rects, paths }
}

function overlaps(a: LiveBounds, b: LiveBounds): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY
}

/** Liang–Barsky clip: does segment p→q cross the rectangle? */
function segmentHits(p: Point, q: Point, r: LiveBounds): boolean {
  let t0 = 0, t1 = 1
  const dx = q.x - p.x, dy = q.y - p.y
  const edges: Array<[number, number]> = [[-dx, p.x - r.minX], [dx, r.maxX - p.x], [-dy, p.y - r.minY], [dy, r.maxY - p.y]]
  for (const [edge, distance] of edges) {
    if (edge === 0) { if (distance < 0) return false; continue }
    const t = distance / edge
    if (edge < 0) { if (t > t1) return false; if (t > t0) t0 = t }
    else { if (t < t0) return false; if (t < t1) t1 = t }
  }
  return true
}

export type WorkLabelSide = 'above' | 'below' | 'inside'
const SIDES: WorkLabelSide[] = ['above', 'below', 'inside']

/** Where a label sits: a side of the region and its offset from the region's left edge. */
export interface WorkLabelPlacement { side: WorkLabelSide; offset: number }
export interface WorkLabelPosition { placement: WorkLabelPlacement; x: number; y: number; clear: boolean }

function pathBounds(path: Point[]): LiveBounds {
  return {
    minX: Math.min(...path.map(p => p.x)), minY: Math.min(...path.map(p => p.y)),
    maxX: Math.max(...path.map(p => p.x)), maxY: Math.max(...path.map(p => p.y)),
  }
}

/**
 * Choose where the work label goes around its region. Sides are tried in
 * reading order — above, then below, then just inside the top edge. On each
 * side the label first aligns with the region's left edge, then its right
 * edge, then slides to either side of whatever is in the way, as long as it
 * still overlaps the region enough to read as its caption. Every candidate is
 * slid back into the visible canvas. The first one that touches no node,
 * connector route, connector label or chrome wins; when none is clear, the one
 * with the fewest collisions does. A previous placement that is still clear is
 * kept so the label does not hop while boxes animate.
 *
 * All values are canvas units: `size` and `gap` are already divided by zoom.
 */
export function placeWorkLabel({ region, size, gap, obstacles, view, previous }: {
  region: LiveBounds
  size: { width: number; height: number }
  gap: number
  obstacles: LabelObstacles
  view?: LiveBounds
  previous?: WorkLabelPlacement
}): WorkLabelPosition {
  const pad = gap / 2
  const blockers = [...obstacles.rects, ...obstacles.paths.map(pathBounds)]
  const minOverlap = Math.min(size.width, region.maxX - region.minX) / 4
  const evaluate = (side: WorkLabelSide, wanted: number) => {
    let x = wanted
    const y = side === 'above' ? region.minY - gap - size.height
      : side === 'below' ? region.maxY + gap
        : region.minY + gap
    let offscreen = 0
    if (view) {
      const maxX = view.maxX - size.width
      x = maxX < view.minX ? view.minX : Math.max(view.minX, Math.min(x, maxX))
      if (y < view.minY || y + size.height > view.maxY) offscreen = 1
    }
    const box = { minX: x - pad, minY: y - pad, maxX: x + size.width + pad, maxY: y + size.height + pad }
    let hits = obstacles.rects.filter(rect => overlaps(box, rect)).length
    for (const path of obstacles.paths) {
      for (let i = 1; i < path.length; i++) {
        if (segmentHits(path[i - 1], path[i], box)) { hits++; break }
      }
    }
    const detached = Math.min(box.maxX, region.maxX) - Math.max(box.minX, region.minX) < minOverlap
    return { placement: { side, offset: x - region.minX }, x, y, hits, offscreen, detached, clear: hits === 0 && offscreen === 0 && !detached }
  }
  if (previous) {
    const kept = evaluate(previous.side, region.minX + previous.offset)
    if (kept.clear) return { placement: kept.placement, x: kept.x, y: kept.y, clear: true }
  }
  const candidates: ReturnType<typeof evaluate>[] = []
  for (const side of SIDES) {
    const band = evaluate(side, region.minX)
    const top = band.y - pad, bottom = band.y + size.height + pad
    const slides = blockers
      .filter(b => b.minY < bottom && b.maxY > top)
      .flatMap(b => [b.minX - gap - size.width, b.maxX + gap])
      .sort((a, b) => Math.abs(a - region.minX) - Math.abs(b - region.minX))
    for (const wanted of [region.minX, region.maxX - size.width, ...slides]) {
      const candidate = evaluate(side, wanted)
      if (candidate.clear) return { placement: candidate.placement, x: candidate.x, y: candidate.y, clear: true }
      candidates.push(candidate)
    }
  }
  const cost = (c: (typeof candidates)[number]) => c.offscreen * 100 + c.hits * 10 + (c.detached ? 1 : 0)
  const best = candidates.reduce((a, b) => cost(b) < cost(a) ? b : a)
  return { placement: best.placement, x: best.x, y: best.y, clear: false }
}
