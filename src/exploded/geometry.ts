import type { ExplodedBounds, ExplodedFootprint, ExplodedPoint } from './types'

/** Separate from Arc's existing 30-degree isometric projection. */
export function projectExploded(x: number, y: number, z = 0): ExplodedPoint {
  return { x: x - y, y: (x + y) / 2 - z }
}

/**
 * Clockwise world perimeter. Circular corners become 2:1 ellipses on screen.
 * `samples` points per corner (default 13); outlines that are joined face by
 * face, such as a housing's walls or a frustum's sides, must share it.
 */
export function explodedOutline(box: ExplodedFootprint, samples = 13): ExplodedPoint[] {
  const { x, y, width: w, depth: d } = box
  const r = box.radius ?? 0
  const centers = [[x + w - r, y + r], [x + w - r, y + d - r], [x + r, y + d - r], [x + r, y + r]]
  return centers.flatMap(([cx, cy], corner) => Array.from({ length: samples }, (_, step) => {
    const angle = (-90 + corner * 90 + step * 90 / (samples - 1)) * Math.PI / 180
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }
  }))
}

export function explodedBounds(points: ExplodedPoint[]): ExplodedBounds {
  const xs = points.map(p => p.x), ys = points.map(p => p.y)
  const x = Math.min(...xs), y = Math.min(...ys)
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
}

export function boundsCorners(b: ExplodedBounds): ExplodedPoint[] {
  return [{ x: b.x, y: b.y }, { x: b.x + b.width, y: b.y + b.height }]
}

export function outlineAt(box: ExplodedFootprint, z: number): ExplodedPoint[] {
  return explodedOutline(box).map(p => projectExploded(p.x, p.y, z))
}

export function pointsPath(points: ExplodedPoint[]): string {
  return points.map((p, i) => `${i ? 'L' : 'M'}${Number(p.x.toFixed(3))},${Number(p.y.toFixed(3))}`).join(' ') + ' Z'
}

/** The top face of a frustum: inset on every side, keeping as much of the corner radius as fits. */
export function insetFootprint(box: ExplodedFootprint, inset: number): ExplodedFootprint {
  const width = box.width - inset * 2, depth = box.depth - inset * 2
  return { x: box.x + inset, y: box.y + inset, width, depth, radius: Math.min(box.radius ?? 0, Math.min(width, depth) / 2) }
}

/**
 * Back-to-front paint order for boxes resting in one assembly. Footprints that are
 * disjoint along x or y are ordered by that axis (larger x or y is nearer the
 * viewer); overlapping footprints are stacked and ordered by elevation. A
 * deterministic topological sort, unlike a single sort key, keeps a wide spacebar
 * correct against the narrower keys beside and behind it.
 */
export function depthOrder<T extends ExplodedFootprint & { z: number }>(boxes: T[]): T[] {
  const eps = 1e-6
  const before = (a: T, b: T) => {
    if (a.x + a.width <= b.x + eps) return true
    if (b.x + b.width <= a.x + eps) return false
    if (a.y + a.depth <= b.y + eps) return true
    if (b.y + b.depth <= a.y + eps) return false
    return a.z < b.z
  }
  const key = (b: T) => b.x + b.y + b.width / 2 + b.depth / 2
  const rank = (a: number, b: number) => key(boxes[a]) - key(boxes[b]) || boxes[a].z - boxes[b].z || a - b
  const after = boxes.map(() => [] as number[]), blockers = boxes.map(() => 0)
  for (let i = 0; i < boxes.length; i++) for (let j = 0; j < boxes.length; j++) {
    if (i !== j && before(boxes[i], boxes[j])) { after[i].push(j); blockers[j]++ }
  }
  const done = boxes.map(() => false), result: T[] = []
  for (let n = 0; n < boxes.length; n++) {
    let next = -1
    for (let i = 0; i < boxes.length; i++) {
      if (done[i]) continue
      if (next < 0) { next = i; continue }
      const free = blockers[i] === 0, nextFree = blockers[next] === 0
      if (free !== nextFree ? free : rank(i, next) < 0) next = i
    }
    // A cycle cannot occur for disjoint boxes; if one does, the sort key breaks it.
    done[next] = true; result.push(boxes[next])
    for (const j of after[next]) blockers[j]--
  }
  return result
}

/** Convex hull (monotone chain), counter-clockwise on screen. A part's prism projects to the hull of its two outlines. */
export function convexHull(points: ExplodedPoint[]): ExplodedPoint[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  if (sorted.length < 3) return sorted
  const cross = (o: ExplodedPoint, a: ExplodedPoint, b: ExplodedPoint) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const chain = (list: ExplodedPoint[]) => list.reduce<ExplodedPoint[]>((hull, p) => {
    while (hull.length >= 2 && cross(hull[hull.length - 2], hull[hull.length - 1], p) <= 0) hull.pop()
    hull.push(p); return hull
  }, [])
  const lower = chain(sorted), upper = chain([...sorted].reverse())
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

/** Vertical extent of a convex polygon's portion at or right of `x`, or null when nothing reaches it. */
export function spanRightOf(polygon: ExplodedPoint[], x: number): { min: number; max: number } | null {
  const ys: number[] = []
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length]
    if (a.x >= x) ys.push(a.y)
    if ((a.x < x) !== (b.x < x)) ys.push(a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x))
  }
  return ys.length ? { min: Math.min(...ys), max: Math.max(...ys) } : null
}
