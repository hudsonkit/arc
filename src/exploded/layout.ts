import { boundsCorners, convexHull, explodedBounds, explodedOutline, insetFootprint, outlineAt, projectExploded, spanRightOf } from './geometry'
import type { ExplodedDocument, ExplodedFootprint, ExplodedLayout, ExplodedPart, ExplodedPlacedPart } from './types'

const tones = new Set(['surface', 'muted', 'dark', 'accent'])
function fail(message: string): never { throw new Error(`Invalid exploded document: ${message}`) }
function finite(value: unknown, name: string, minimum = -Infinity): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || Math.abs(value) > 1e6) fail(`${name} must be finite and between ${minimum} and 1000000`)
}
function footprint(box: ExplodedFootprint, name: string) {
  if (!box || typeof box !== 'object') fail(`${name} must be an object`)
  finite(box.x, `${name}.x`); finite(box.y, `${name}.y`)
  finite(box.width, `${name}.width`, 0.001); finite(box.depth, `${name}.depth`, 0.001)
  if (box.radius !== undefined) {
    finite(box.radius, `${name}.radius`, 0)
    if (box.radius > Math.min(box.width, box.depth) / 2) fail(`${name}.radius exceeds half the smaller dimension`)
  }
}
function text(value: unknown, name: string, optional = false) {
  if (optional && value === undefined) return
  if (typeof value !== 'string' || !value.trim() || value.length > 500) fail(`${name} must be a nonempty string of at most 500 characters`)
}

function contains(outer: ExplodedFootprint, inner: ExplodedFootprint): boolean {
  const r = outer.radius ?? 0
  return explodedOutline(inner).every(p => {
    if (p.x < outer.x - 1e-6 || p.y < outer.y - 1e-6 || p.x > outer.x + outer.width + 1e-6 || p.y > outer.y + outer.depth + 1e-6) return false
    const cx = Math.max(outer.x + r, Math.min(p.x, outer.x + outer.width - r))
    const cy = Math.max(outer.y + r, Math.min(p.y, outer.y + outer.depth - r))
    return Math.hypot(p.x - cx, p.y - cy) <= r + 1e-6
  })
}

/** Validate JSON at the public boundary. Throws with a part/field-specific error. */
export function validateExplodedDocument(value: unknown): asserts value is ExplodedDocument {
  const doc = value as ExplodedDocument
  if (!doc || doc.kind !== 'exploded' || doc.version !== 1) fail('expected kind "exploded" and version 1')
  text(doc.id, 'id'); text(doc.title, 'title'); text(doc.description, 'description', true)
  if (!Array.isArray(doc.parts) || !doc.parts.length || doc.parts.length > 100) fail('parts must contain 1–100 parts')
  if (doc.gap !== undefined) finite(doc.gap, 'gap', 0)
  const materials = new Set<string>()
  if (doc.materials !== undefined) {
    if (!doc.materials || typeof doc.materials !== 'object' || Array.isArray(doc.materials) || Object.keys(doc.materials).length > 16) fail('materials must be an object with at most 16 entries')
    for (const [name, value] of Object.entries(doc.materials)) {
      if (!/^[a-z][a-z0-9-]{0,31}$/.test(name)) fail(`material "${name}" must be a lowercase identifier`)
      for (const mode of ['light', 'dark'] as const) if (typeof value?.[mode] !== 'string' || !/^#[0-9a-f]{6}$/i.test(value[mode])) fail(`materials.${name}.${mode} must be a #rrggbb color`)
      materials.add(name)
    }
  }
  const finish = (item: { tone?: unknown; material?: unknown }, name: string) => {
    if (item.tone !== undefined && !tones.has(item.tone as string)) fail(`${name}.tone is unknown`)
    if (item.material !== undefined && !materials.has(item.material as string)) fail(`${name}.material must reference document materials`)
  }
  const taper = (box: ExplodedFootprint & { taper?: number }, name: string) => {
    if (box.taper === undefined) return
    finite(box.taper, `${name}.taper`, 0)
    if (box.taper * 2 >= Math.min(box.width, box.depth)) fail(`${name}.taper must leave a top face`)
  }
  const ids = new Map<string, ExplodedPart>()
  for (const p of doc.parts) {
    footprint(p, 'part'); text(p.id, 'part.id'); text(p.label, `${p.id}.label`); text(p.description, `${p.id}.description`, true)
    if (ids.has(p.id)) fail(`duplicate part id "${p.id}"`)
    ids.set(p.id, p)
    finite(p.level, `${p.id}.level`, 0)
    if (!Number.isInteger(p.level)) fail(`${p.id}.level must be an integer`)
    finite(p.assembledZ, `${p.id}.assembledZ`, 0); finite(p.height, `${p.id}.height`, 0.001)
    finish(p, p.id); taper(p, p.id)
    if (p.body !== undefined && p.body !== 'solid' && p.body !== 'none') fail(`${p.id}.body must be "solid" or "none"`)
    if (p.body === 'none' && (p.housing || p.taper !== undefined || !p.details?.length)) fail(`${p.id}: a body of "none" needs details and no housing or taper`)
    if (p.housing) {
      finite(p.housing.wall, `${p.id}.housing.wall`, 0.001); finite(p.housing.floor, `${p.id}.housing.floor`, 0.001)
      if (p.housing.wall * 2 >= Math.min(p.width, p.depth) || p.housing.floor >= p.height) fail(`${p.id}.housing must leave an open cavity`)
      if (p.details?.length || p.taper !== undefined) fail(`${p.id}: a housing takes no details or taper; place contents in separate parts using containerId`)
    }
    if (p.details !== undefined && (!Array.isArray(p.details) || p.details.length > 100)) fail(`${p.id}.details must contain at most 100 marks`)
    // Details are local to the part's origin; a tapered body mounts them on its smaller top face.
    const face = p.taper ? insetFootprint({ ...p, x: 0, y: 0 }, p.taper) : { ...p, x: 0, y: 0 }
    for (const detail of p.details ?? []) {
      footprint(detail, `${p.id}.detail`)
      finite(detail.height ?? 0, `${p.id}.detail.height`, 0); finite(detail.z ?? 0, `${p.id}.detail.z`, 0)
      finish(detail, `${p.id}.detail`); taper(detail, `${p.id}.detail`)
      if (!contains(face, detail)) fail(`${p.id}.detail lies outside its parent footprint`)
      if (p.body === 'none' && (detail.z ?? 0) + (detail.height ?? 0) > p.height + 1e-6) fail(`${p.id}.detail rises above the part's height`)
    }
  }
  for (const p of doc.parts) {
    if (p.containerId === undefined) continue
    text(p.containerId, `${p.id}.containerId`)
    const parent = ids.get(p.containerId)
    if (!parent?.housing) fail(`${p.id}.containerId must reference a housing`)
    // Strict level ordering also makes cycles impossible.
    if (parent.level >= p.level) fail(`${p.id} must be above its container's separation level`)
    const wall = parent.housing.wall
    if (!contains({ x: parent.x + wall, y: parent.y + wall, width: parent.width - wall * 2, depth: parent.depth - wall * 2, radius: Math.max(0, (parent.radius ?? 0) - wall) }, p) || p.assembledZ < parent.assembledZ + parent.housing.floor || p.assembledZ + partHeight(p) > parent.assembledZ + parent.height) fail(`${p.id} must fit inside ${parent.id}'s assembled cavity`)
  }
}

/** Overall height: a solid body plus its tallest detail, or a loose set's envelope. */
/** Horizontal offset from a callout's index number to its label text. */
export const LABEL_INDENT = 24

/** Callout numbering: top separation level first, and top of the screen first within a level. */
export function explodedReadingOrder(doc: ExplodedDocument): ExplodedPart[] {
  return [...doc.parts].sort((a, b) => b.level - a.level || (a.x + a.y) - (b.x + b.y) || doc.parts.indexOf(a) - doc.parts.indexOf(b))
}

export function partHeight(p: ExplodedPart): number {
  return p.body === 'none' ? p.height : p.height + Math.max(0, ...(p.details ?? []).map(d => (d.z ?? 0) + (d.height ?? 0)))
}
function place(doc: ExplodedDocument, gap: number): ExplodedPlacedPart[] {
  const levels = [...new Set(doc.parts.map(p => p.level))].sort((a, b) => a - b)
  const shifts = new Map<number, number>()
  let z = Math.min(...doc.parts.filter(p => p.level === levels[0]).map(p => p.assembledZ))
  for (const level of levels) {
    const group = doc.parts.filter(p => p.level === level)
    const base = Math.min(...group.map(p => p.assembledZ))
    shifts.set(level, z - base)
    z += Math.max(...group.map(p => p.assembledZ + partHeight(p))) - base + gap
  }
  return [...doc.parts].sort((a, b) => a.level - b.level || (a.x + a.y) - (b.x + b.y) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map(part => {
    const explodedZ = part.assembledZ + shifts.get(part.level)!
    const outline = outlineAt(part, explodedZ + part.height / 2)
    const anchor = outline.reduce((a, p) => p.x > a.x ? p : a)
    const solid = [...outlineAt(part, explodedZ), ...outlineAt(part, explodedZ + partHeight(part))]
    return { part, explodedZ, anchor, bounds: explodedBounds(solid), silhouette: convexHull(solid) }
  })
}
interface Conflict { low: ExplodedPlacedPart; high: ExplodedPlacedPart; /** Extra screen separation needed between their levels. */ need: number }
function conflicts(parts: ExplodedPlacedPart[]): Conflict[] {
  const result: Conflict[] = []
  const pair = (a: ExplodedPlacedPart, b: ExplodedPlacedPart) => a.part.level < b.part.level || (a.part.level === b.part.level && a.anchor.y > b.anchor.y) ? { low: a, high: b } : { low: b, high: a }
  for (let i = 0; i < parts.length; i++) {
    const a = parts[i]
    for (let j = i + 1; j < parts.length; j++) {
      const b = parts[j]
      if (Math.abs(a.anchor.y - b.anchor.y) < 40) { const { low, high } = pair(a, b); result.push({ low, high, need: 40 - (low.anchor.y - high.anchor.y) }) }
    }
    for (const b of parts) {
      if (a === b) continue
      // A leader runs right from its anchor; it must clear every other part's projected silhouette.
      const region = spanRightOf(b.silhouette, a.anchor.x + 1)
      if (!region || a.anchor.y < region.min - 3 || a.anchor.y > region.max + 3) continue
      const { low, high } = pair(a, b)
      result.push({ low, high, need: a === low ? region.max + 4 - a.anchor.y : a.anchor.y + 4 - region.min })
    }
  }
  return result
}

/** Pure layout. Does not mutate source, and never adapts Arc's existing graph/iso data. */
export function layoutExploded(doc: ExplodedDocument, labels = true): ExplodedLayout {
  validateExplodedDocument(doc)
  const projectedHeight = Math.max(...doc.parts.map(p => (p.width + p.depth) / 2))
  const solidHeight = Math.max(0, ...doc.parts.filter(p => !p.housing).map(partHeight))
  let gap = Math.ceil(Math.max(doc.gap ?? 0, projectedHeight * 0.5, solidHeight * 3) / 4) * 4
  let parts = place(doc, gap)
  if (labels) {
    for (let attempt = 0; ; attempt++) {
      const pairs = conflicts(parts)
      if (!pairs.length) break
      const sameLevel = pairs.find(({ low, high }) => low.part.level === high.part.level)
      if (sameLevel) fail(`labels for "${sameLevel.high.part.id}" and "${sameLevel.low.part.id}" conflict on the same level; reposition these parts or render with labels=false`)
      if (attempt >= doc.parts.length) fail('could not find a readable separation gap; simplify the assembly or render with labels=false')
      const levels = [...new Set(parts.map(p => p.part.level))].sort((a, b) => a - b)
      // Anchor and silhouette y coordinates are affine in gap. Jump directly past each
      // conflict instead of iterating once per world unit (large models stay bounded).
      const increase = Math.max(...pairs.map(({ low, high, need }) => need / (levels.indexOf(high.part.level) - levels.indexOf(low.part.level))))
      gap += Math.max(4, Math.ceil(increase / 4) * 4)
      parts = place(doc, gap)
    }
  }
  const geometry = parts.flatMap(p => [...boundsCorners(p.bounds), ...outlineAt(p.part, p.part.assembledZ), ...outlineAt(p.part, p.part.assembledZ + partHeight(p.part))])
  const root = parts[0].part
  const guideTop = Math.max(...parts.map(p => p.explodedZ + p.part.height))
  geometry.push(projectExploded(root.x, root.y, guideTop), projectExploded(root.x + root.width, root.y + root.depth, guideTop))
  const content = explodedBounds(geometry)
  const labelX = content.x + content.width + 48
  // Conservative text measure for SVG's system-font fallback, including wide glyphs.
  if (labels) for (const { part, anchor } of parts) {
    geometry.push({ x: labelX, y: anchor.y - 12 }, { x: labelX + LABEL_INDENT + Math.max(part.label.length * 9, (part.description?.length ?? 0) * 7.2), y: anchor.y + 22 })
  }
  const box = explodedBounds(geometry)
  const bounds = { x: box.x - 28, y: box.y - 28, width: box.width + 56, height: box.height + 56 }
  // The title block runs along the bottom margin; widen the sheet if a long title needs it.
  if (labels) bounds.width = Math.max(bounds.width, 52 + `${doc.title} · ${doc.parts.length} parts`.length * 6.8)
  return { parts, gap, labelX, bounds }
}
