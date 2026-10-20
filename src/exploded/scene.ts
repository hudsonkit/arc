import { depthOrder, explodedOutline, insetFootprint, pointsPath, projectExploded } from './geometry'
import { LABEL_INDENT, explodedReadingOrder, layoutExploded } from './layout'
import type { ExplodedDocument, ExplodedFootprint, ExplodedLayout, ExplodedPart, ExplodedPoint, ExplodedRenderOptions, ExplodedTone } from './types'

/** Restricted scene graph shared by React and standalone SVG serialization. */
export interface ExplodedSvgNode {
  tag: 'svg' | 'g' | 'path' | 'circle' | 'text' | 'title' | 'desc' | 'rect'
  attrs?: Record<string, string | number>
  children?: (ExplodedSvgNode | string)[]
}
const node = (tag: ExplodedSvgNode['tag'], attrs: ExplodedSvgNode['attrs'], children?: ExplodedSvgNode['children']): ExplodedSvgNode => ({ tag, attrs, children })
/**
 * Arc's drafting palette: warm paper and navy ink, with the mark's signal orange
 * as the single focal accent. Dark mode is the navy sheet from Arc's landing page.
 */
const palettes = {
  light: { background: '#f6f4ee', foreground: '#111720', line: '#7b838d', edge: '#2f3843', surface: '#e9e5dc', muted: '#c3c7cb', dark: '#25313f', accent: '#ff6a3d' },
  dark: { background: '#0d1726', foreground: '#eef1f5', line: '#6f86a3', edge: '#b0bfd2', surface: '#56677f', muted: '#34465e', dark: '#1a283b', accent: '#ff6a3d' },
}
/** The fill a part or detail resolves to: its material, else its tone. Useful for legends beside the scene. */
export function explodedColor(doc: ExplodedDocument, item: { tone?: ExplodedTone; material?: string }, mode: 'light' | 'dark' = 'light', fallback: ExplodedTone = 'surface'): string {
  return item.material ? doc.materials![item.material][mode] : palettes[mode][item.tone ?? fallback]
}
const SANS = "'Space Grotesk', system-ui, -apple-system, sans-serif"
const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Consolas, monospace"

function quad(a: ExplodedPoint, b: ExplodedPoint, c: ExplodedPoint, d: ExplodedPoint) { return pointsPath([a, b, c, d]) }
function top(box: ExplodedFootprint, z: number, samples?: number) { return explodedOutline(box, samples).map(p => projectExploded(p.x, p.y, z)) }
/** A slab, or a frustum when `taper` insets its top face. Small radii use fewer corner samples. */
function solid(box: ExplodedFootprint, z: number, height: number, color: string, edge: string, taper = 0): ExplodedSvgNode[] {
  const r = box.radius ?? 0, samples = r === 0 ? 2 : r <= 3 ? 5 : 13
  const world = explodedOutline(box, samples), lid = taper ? insetFootprint(box, taper) : box
  const upper = top(lid, z + height, samples), lower = top(box, z, samples)
  const faces: ExplodedSvgNode[] = []
  if (height) for (let i = 0; i < world.length; i++) {
    const j = (i + 1) % world.length, dx = world[j].x - world[i].x, dy = world[j].y - world[i].y
    if (dy - dx <= 0.0001) continue
    const d = quad(upper[i], upper[j], lower[j], lower[i])
    faces.push(node('path', { d, fill: color }), node('path', { d, fill: '#000000', opacity: dy > -dx ? 0.2 : 0.1 }))
  }
  faces.push(node('path', { d: pointsPath(upper), fill: color, stroke: edge, 'stroke-width': 0.6, 'stroke-opacity': 0.6 }))
  return faces
}

function housing(part: ExplodedPart, z: number, color: string, edge: string): { back: ExplodedSvgNode[]; front: ExplodedSvgNode[] } {
  const { wall, floor } = part.housing!
  // Keep equal corner samples even when an inset corner becomes square.
  const outer = explodedOutline(part)
  const inner = explodedOutline({ x: part.x + wall, y: part.y + wall, width: part.width - wall * 2, depth: part.depth - wall * 2, radius: Math.max(0, (part.radius ?? 0) - wall) })
  const at = (p: ExplodedPoint, height: number) => projectExploded(p.x, p.y, z + height)
  const back: ExplodedSvgNode[] = [node('path', { d: pointsPath(inner.map(p => at(p, floor))), fill: color }), node('path', { d: pointsPath(inner.map(p => at(p, floor))), fill: '#000000', opacity: 0.16 })]
  const front: ExplodedSvgNode[] = []
  for (let i = 0; i < outer.length; i++) {
    const j = (i + 1) % outer.length
    const facing = outer[j].y - outer[i].y - (outer[j].x - outer[i].x) > 0.0001
    const collection = facing ? front : back
    const side = facing
      ? quad(at(outer[i], part.height), at(outer[j], part.height), at(outer[j], 0), at(outer[i], 0))
      : quad(at(inner[i], part.height), at(inner[j], part.height), at(inner[j], floor), at(inner[i], floor))
    collection.push(node('path', { d: side, fill: color }), node('path', { d: side, fill: '#000000', opacity: facing ? 0.22 : 0.28 }))
    collection.push(node('path', { d: quad(at(outer[i], part.height), at(outer[j], part.height), at(inner[j], part.height), at(inner[i], part.height)), fill: color }))
  }
  front.push(node('path', { d: pointsPath(top(part, z + part.height)), fill: 'none', stroke: edge, 'stroke-width': 0.7, 'stroke-opacity': 0.6 }))
  return { back, front }
}

export function createExplodedScene(doc: ExplodedDocument, options: ExplodedRenderOptions = {}, prepared?: ExplodedLayout): ExplodedSvgNode {
  const progress = options.progress ?? 1
  if (!Number.isFinite(progress) || progress < 0 || progress > 1) throw new Error('Exploded progress must be between 0 and 1')
  const labels = options.labels !== false
  const layout = prepared ?? layoutExploded(doc, labels)
  const mode = options.mode ?? 'light'
  const palette = palettes[mode]
  const color = (item: { tone?: ExplodedTone; material?: string }, fallback?: ExplodedTone) => explodedColor(doc, item, mode, fallback)
  const children: ExplodedSvgNode[] = [node('title', {}, [doc.title]), node('desc', {}, [doc.description ?? `${doc.parts.length} parts, shown ${progress === 0 ? 'assembled' : 'separated'}.`])]
  const { bounds } = layout
  children.push(node('rect', { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, fill: palette.background }))
  if (options.guides !== false) {
    // Registration marks, as on Arc's technical plates: they frame the sheet without boxing it in.
    const inset = 12, arm = 9, { x, y, width: w, height: h } = bounds
    children.push(node('path', { 'data-layer': 'registration', d: [[x + inset, y + inset, 1, 1], [x + w - inset, y + inset, -1, 1], [x + w - inset, y + h - inset, -1, -1], [x + inset, y + h - inset, 1, -1]]
      .map(([cx, cy, sx, sy]) => `M${cx},${cy + sy * arm} V${cy} H${cx + sx * arm}`).join(' '), fill: 'none', stroke: palette.line, 'stroke-width': 0.8, opacity: 0.55 }))
  }
  if (options.guides !== false && progress > 0) {
    const root = layout.parts[0].part
    const maxZ = Math.max(...layout.parts.map(p => p.explodedZ + p.part.height))
    children.push(node('g', { 'data-layer': 'guides', opacity: progress * 0.3 }, [
      [root.x, root.y], [root.x + root.width, root.y + root.depth],
    ].map(([x, y]) => {
      const a = projectExploded(x, y, root.assembledZ), b = projectExploded(x, y, maxZ)
      return node('path', { d: `M${a.x},${a.y} L${b.x},${b.y}`, fill: 'none', stroke: palette.line, 'stroke-width': 0.8, 'stroke-dasharray': '3 6' })
    })))
  }
  const elevation = (part: ExplodedPart) => {
    const placed = layout.parts.find(p => p.part.id === part.id)!
    return part.assembledZ + (placed.explodedZ - part.assembledZ) * progress
  }
  const siblings = (containerId?: string) => layout.parts.filter(p => p.part.containerId === containerId)
    .sort((a, b) => elevation(a.part) - elevation(b.part) || a.part.x + a.part.y - b.part.x - b.part.y)
  const renderPart = (part: ExplodedPart): ExplodedSvgNode => {
    const z = elevation(part)
    const contents: ExplodedSvgNode[] = []
    if (part.housing) {
      const shell = housing(part, z, color(part), palette.edge)
      contents.push(node('g', { 'data-face': 'housing-back' }, shell.back))
      contents.push(...siblings(part.id).map(p => renderPart(p.part)))
      contents.push(node('g', { 'data-face': 'housing-front' }, shell.front))
    } else {
      const loose = part.body === 'none'
      if (!loose) contents.push(...solid(part, z, part.height, color(part), palette.edge, part.taper))
      const mount = loose ? z : z + part.height
      const details = depthOrder((part.details ?? []).map(detail => ({ ...detail, x: part.x + detail.x, y: part.y + detail.y, z: detail.z ?? 0 })))
      for (const detail of details) contents.push(...solid(detail, mount + detail.z, detail.height ?? 0, color(detail, 'muted'), palette.edge, detail.taper))
    }
    return node('g', { 'data-part': part.id, 'data-z': z }, contents)
  }
  children.push(...siblings().map(p => renderPart(p.part)))
  // Labels only belong to the settled exploded state; no leader crosses moving parts.
  if (labels && progress === 1) {
    const order = explodedReadingOrder(doc)
    children.push(node('g', { 'data-layer': 'labels', fill: palette.foreground }, layout.parts.flatMap(({ part, anchor }) => {
      const ink = part.tone === 'accent' ? palette.accent : palette.line
      const index = String(order.indexOf(part) + 1).padStart(2, '0')
      // Arc's mark in miniature: a square origin on the part, a round terminal at the label.
      return [
        node('path', { d: `M${anchor.x + 6},${anchor.y} H${layout.labelX - 9}`, fill: 'none', stroke: ink, 'stroke-width': 0.8 }),
        node('rect', { x: anchor.x - 2.25, y: anchor.y - 2.25, width: 4.5, height: 4.5, fill: ink }),
        node('circle', { cx: layout.labelX - 7, cy: anchor.y, r: 2.4, fill: ink }),
        node('text', { x: layout.labelX, y: anchor.y + 3.5, 'font-size': 10, 'font-family': MONO, fill: ink, 'letter-spacing': 0.6 }, [index]),
        node('text', { x: layout.labelX + LABEL_INDENT, y: anchor.y + 4.5, 'font-size': 14, 'font-weight': 600 }, [part.label]),
        ...(part.description ? [node('text', { x: layout.labelX + LABEL_INDENT, y: anchor.y + 21, 'font-size': 10.5, 'font-family': MONO, opacity: 0.72 }, [part.description])] : []),
      ]
    })))
    children.push(node('text', { 'data-layer': 'title-block', x: bounds.x + 26, y: bounds.y + bounds.height - 13, 'font-size': 9, 'font-family': MONO, 'letter-spacing': 1.2, fill: palette.line }, [`${doc.title.toUpperCase()} · ${doc.parts.length} PARTS`]))
  }
  return node('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`, width: bounds.width, height: bounds.height, role: 'img', 'aria-label': doc.title, 'font-family': SANS }, children)
}

function escape(value: string | number): string {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!)
}
export function serializeExplodedScene(scene: ExplodedSvgNode): string {
  return `<${scene.tag}${Object.entries(scene.attrs ?? {}).map(([k, v]) => ` ${k}="${escape(v)}"`).join('')}>${(scene.children ?? []).map(child => typeof child === 'string' ? escape(child) : serializeExplodedScene(child)).join('')}</${scene.tag}>`
}

/** Standalone, opaque SVG; no React, DOM, CSS, fonts, scripts, or remote assets required. */
export function renderExplodedSvg(doc: ExplodedDocument, options: ExplodedRenderOptions = {}): string {
  return serializeExplodedScene(createExplodedScene(doc, options))
}
