import { layoutPanelCube, panelDepthAt, PANEL_CUBE_COMPACT_VIEWBOX, PANEL_CUBE_VIEWBOX, roundedPanelPath, validatePanelCubeDocument, validatePanelCubeOptions } from './geometry'
import type { PanelCubeDocument, PanelCubePlate, PanelCubePoint, PanelCubeRenderOptions } from './types'

/** Small, inert SVG vocabulary shared by React and standalone export. */
export interface PanelCubeSvgNode {
  tag: 'svg' | 'g' | 'defs' | 'linearGradient' | 'radialGradient' | 'stop' | 'path' | 'ellipse' | 'circle' | 'text' | 'tspan' | 'title' | 'desc'
  attrs?: Record<string, string | number>
  children?: Array<PanelCubeSvgNode | string>
}
const node = (tag: PanelCubeSvgNode['tag'], attrs: PanelCubeSvgNode['attrs'] = {}, children?: PanelCubeSvgNode['children']): PanelCubeSvgNode => ({ tag, attrs, children })
const ink = '#30343a'
const palettes = {
  top: ['#393b3e', '#222325', '#101113'],
  left: ['#27292b', '#111214', '#070809'],
  right: ['#242628', '#111214', '#08090a'],
}
const stops = (colors: string[]) => colors.map((color, i) => node('stop', { offset: `${i * 100 / (colors.length - 1)}%`, 'stop-color': color }))
const format = (n: number) => Math.round(n * 1000) / 1000

function wrap(text: string, width: number): string[] {
  const result: string[] = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    if (line && (line + ' ' + word).length > width) { result.push(line); line = '' }
    // A single long identifier must not overflow the fixed label margin.
    const chunks = word.match(new RegExp(`.{1,${width}}`, 'gu')) ?? ['']
    for (let i = 0; i < chunks.length; i++) {
      if (i) { result.push(line); line = '' }
      line += (line ? ' ' : '') + chunks[i]
    }
  }
  if (line) result.push(line)
  return result
}

interface Callout { x: number; y: number; right: boolean; path: string; anchor: PanelCubePoint; heading: string[]; description: string[] }

function positionCallouts(plates: PanelCubePlate[]): Map<string, Callout> {
  const result = new Map<string, Callout>(), visible = plates.filter(plate => plate.exposed)
  // The same nearby columns serve every angle; only label collisions displace
  // their natural position beside the face. Leaders never orbit the silhouette.
  for (const right of [false, true]) {
    const column = visible.filter(plate => (plate.normal.x >= 0) === right).sort((a, b) => a.center.y - b.center.y).map(plate => {
      const heading = wrap(plate.face.label, 20), description = wrap(plate.face.description ?? '', 25)
      const height = 14 + (heading.length - 1) * 19 + (description.length ? 20 + (description.length - 1) * 16 : 0)
      return { plate, heading, description, height, y: Math.max(32, Math.min(468 - height, plate.center.y - height / 2)) }
    })
    for (let i = 1; i < column.length; i++) column[i].y = Math.max(column[i].y, column[i - 1].y + column[i - 1].height + 26)
    for (let i = column.length - 1; i >= 0; i--) {
      const bottom = i + 1 < column.length ? column[i + 1].y - 26 : 468
      column[i].y = Math.min(column[i].y, bottom - column[i].height)
    }
    column.forEach(({ plate, heading, description, y }) => {
      const crossings = plate.points.flatMap((point, i) => {
        const next = plate.points[(i + 1) % plate.points.length], dy = next.y - point.y
        const fraction = Math.abs(dy) < 1e-8 ? -1 : (plate.center.y - point.y) / dy
        return fraction >= 0 && fraction <= 1 ? [point.x + (next.x - point.x) * fraction] : []
      })
      const edgeX = crossings.length ? (right ? Math.max(...crossings) : Math.min(...crossings)) : plate.center.x
      const candidate = { x: plate.center.x * 0.6 + edgeX * 0.4, y: plate.center.y }
      const depth = panelDepthAt(plate, candidate) ?? plate.depth
      const anchor = plates.some(other => other !== plate && (panelDepthAt(other, candidate) ?? -Infinity) > depth + 0.1) ? plate.center : candidate
      const lineY = y + 10, start = right ? 596 : 204, elbow = right ? 570 : 230
      result.set(plate.face.id, { x: right ? 615 : 185, y, right, heading, description, anchor, path: `M${start},${format(lineY)} H${elbow} L${format(anchor.x)},${format(anchor.y)}` })
    })
  }
  return result
}

function labelNodes(plate: PanelCubePlate, label: Callout, active: boolean, opacity: number): PanelCubeSvgNode {
  const { heading, description, anchor } = label
  return node('g', { 'data-callout': plate.face.id, opacity, 'pointer-events': 'none', 'text-anchor': label.right ? 'start' : 'end' }, [
    node('path', { d: label.path, fill: 'none', stroke: active ? '#626974' : '#aeb3ba', 'stroke-width': active ? 1.2 : 0.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
    node('circle', { cx: format(anchor.x), cy: format(anchor.y), r: 2.3, fill: active ? '#ffffff' : '#aeb3ba' }),
    node('text', { x: label.x, y: format(label.y + 14), fill: ink, 'font-size': 14, 'font-weight': 600 }, heading.map((line, i) => node('tspan', { x: label.x, dy: i ? 19 : 0 }, [line]))),
    node('text', { x: label.x, y: format(label.y + 34 + (heading.length - 1) * 19), fill: '#626973', 'font-size': 11.5 }, description.map((line, i) => node('tspan', { x: label.x, dy: i ? 16 : 0 }, [line]))),
  ])
}

function plateNodes(plate: PanelCubePlate, prefix: string, active: boolean): PanelCubeSvgNode {
  const path = roundedPanelPath(plate.points, plate.back ? 0 : 3)
  const side = plate.face.side, exterior = plate.facing > 0
  return node('g', {
    'data-panel': plate.face.id, 'data-side': side, 'data-back': String(plate.back),
    ...(plate.exposed ? { 'data-front-face': plate.face.id } : {}),
  }, [
    node('path', { d: path, transform: 'translate(0 1.6)', fill: '#050607', opacity: exterior ? 1 : 0.75 }),
    node('path', { d: path, fill: exterior ? `url(#${prefix}-${side})` : '#08090b', stroke: exterior ? '#5d6269' : '#46494e', 'stroke-width': exterior ? 1.05 : 0.65, 'stroke-opacity': exterior ? 0.68 : 0.48 }),
    ...(exterior ? [
      node('path', { d: path, fill: `url(#${prefix}-sheen)`, 'pointer-events': 'none' }),
      node('path', { d: path, fill: 'none', stroke: `url(#${prefix}-rim)`, 'stroke-width': active ? 1.7 : 1, 'pointer-events': 'none' }),
      ...(active ? [node('path', { d: path, fill: '#ffffff', 'fill-opacity': 0.035, stroke: '#e5e9ee', 'stroke-width': 1.25, 'stroke-opacity': 0.72, 'pointer-events': 'none' })] : []),
    ] : []),
  ])
}

export function createPanelCubeScene(data: PanelCubeDocument, options: PanelCubeRenderOptions = {}, prefix = 'arc-panel-cube'): PanelCubeSvgNode {
  const progress = options.progress ?? 1, plates = layoutPanelCube(data, progress, options.rotation)
  validatePanelCubeOptions(data, options)
  if (!/^[a-zA-Z][\w-]*$/.test(prefix)) throw new Error('Invalid panel cube SVG prefix')
  const { x, y, width, height } = options.labels === false ? PANEL_CUBE_COMPACT_VIEWBOX : PANEL_CUBE_VIEWBOX
  const definitions: PanelCubeSvgNode[] = (['top', 'left', 'right'] as const).map(side =>
    node('linearGradient', { id: `${prefix}-${side}`, x1: '15%', y1: '0%', x2: '85%', y2: '100%' }, stops(palettes[side])))
  definitions.push(
    node('linearGradient', { id: `${prefix}-rim`, x1: '0%', y1: '0%', x2: '80%', y2: '100%' }, [
      node('stop', { offset: '0%', 'stop-color': '#e6eaf0', 'stop-opacity': 0.6 }),
      node('stop', { offset: '38%', 'stop-color': '#818791', 'stop-opacity': 0.14 }),
      node('stop', { offset: '100%', 'stop-color': '#c3c8cf', 'stop-opacity': 0.05 }),
    ]),
    node('linearGradient', { id: `${prefix}-sheen`, x1: '0%', y1: '0%', x2: '100%', y2: '65%' }, [
      node('stop', { offset: '0%', 'stop-color': '#ffffff', 'stop-opacity': 0.08 }),
      node('stop', { offset: '48%', 'stop-color': '#ffffff', 'stop-opacity': 0 }),
      node('stop', { offset: '100%', 'stop-color': '#ffffff', 'stop-opacity': 0.015 }),
    ]),
    node('radialGradient', { id: `${prefix}-shadow` }, [
      node('stop', { offset: '0%', 'stop-color': '#15181d', 'stop-opacity': 0.16 }),
      node('stop', { offset: '55%', 'stop-color': '#15181d', 'stop-opacity': 0.07 }),
      node('stop', { offset: '100%', 'stop-color': '#15181d', 'stop-opacity': 0 }),
    ]),
  )
  const labelOpacity = Math.max(0, Math.min(1, (progress - 0.35) / 0.65))
  const labels = positionCallouts(plates)
  return node('svg', {
    xmlns: 'http://www.w3.org/2000/svg', viewBox: `${x} ${y} ${width} ${height}`, width, height,
    role: 'img', 'aria-label': data.title, 'font-family': 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  }, [
    node('title', {}, [data.title]), node('desc', {}, [data.description ?? 'A conceptual cube with three opening front plates and a closed rear shell.']),
    node('defs', {}, definitions),
    node('ellipse', { 'data-layer': 'ambient-shadow', cx: 400, cy: 362, rx: 210 + 10 * progress, ry: 112 + 8 * progress, fill: `url(#${prefix}-shadow)`, 'pointer-events': 'none' }),
    ...plates.map(plate => plateNodes(plate, prefix, options.activeFace === plate.face.id && plate.exposed)),
    ...(options.labels === false || labelOpacity === 0 ? [] : plates.filter(plate => plate.exposed).map(plate => labelNodes(plate, labels.get(plate.face.id)!, options.activeFace === plate.face.id, labelOpacity * Math.min(1, plate.facing / 0.2)))),
  ])
}

function escape(value: string | number): string {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]!)
}
function serialize(scene: PanelCubeSvgNode): string {
  return `<${scene.tag}${Object.entries(scene.attrs ?? {}).map(([key, value]) => ` ${key}="${escape(value)}"`).join('')}>${(scene.children ?? []).map(child => typeof child === 'string' ? escape(child) : serialize(child)).join('')}</${scene.tag}>`
}
function hashId(value: string): string {
  let hash = 2166136261
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  return (hash >>> 0).toString(36)
}

/** Standalone SVG uses the same scene as React, without scripts, DOM or server React. */
export function renderPanelCubeSvg(data: PanelCubeDocument, options: PanelCubeRenderOptions = {}): string {
  validatePanelCubeDocument(data)
  return serialize(createPanelCubeScene(data, options, `arc-panel-${hashId(data.id ?? '')}`))
}
