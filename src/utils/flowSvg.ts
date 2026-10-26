import type { ArcDiagramData, DiagramFlow } from '../types/diagram'
import type { Theme } from './themes'
import {
  flowAnimationEnd,
  flowPointAtDistance,
  flowPositionAt,
  flowTrailPositionsAt,
  resolveDiagramFlow,
  type FlowPosition,
  type ResolvedFlow,
} from './flowAnimation'

export interface FlowSvgOptions {
  /** Canvas theme palette; resolves authored palette colors to rendered ink. */
  themeColors?: Theme['light'] | Theme['dark'] | null
  /** Font family for flow captions. */
  fontFamily?: string
  /** Canvas fill behind the layer; used as the label halo so captions stay legible. */
  backgroundColor?: string
  /** Render a deterministic still at this route time instead of SMIL. */
  flowTime?: number
  /** Set false to omit SMIL and render the flow at `flowTime ?? 0`. */
  animate?: boolean
  /** Retain hidden still markers so the live viewer can update geometry in place. */
  geometryBindings?: boolean
}

type FlowColorName = NonNullable<DiagramFlow['color']>

const fallbackFlowColors: Record<FlowColorName, string> = {
  violet: '#a78bfa',
  emerald: '#34d399',
  blue: '#60a5fa',
  amber: '#fbbf24',
  sky: '#38bdf8',
  zinc: '#71717a',
  rose: '#f43f5e',
  orange: '#f97316',
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function seconds(value: number): string {
  return `${Math.max(0, Math.round(value * 1000) / 1000)}s`
}

function keyNumber(value: number): string {
  return String(Math.max(0, Math.min(1, Math.round(value * 10000) / 10000)))
}

function easingSpline(easing: ResolvedFlow['easing']): string {
  switch (easing) {
    case 'ease-in': return '0.42 0 1 1'
    case 'ease-out': return '0 0 0.58 1'
    case 'ease-in-out': return '0.42 0 0.58 1'
    default: return '0 0 1 1'
  }
}

function markerMarkup(marker: ResolvedFlow['marker'], size: number, color: string, pulsePhase = 0): string {
  const r = size / 2
  if (marker === 'packet') {
    const w = size * 1.45
    const h = size * 0.86
    return `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="${size * 0.22}" fill="${color}"/><rect x="${-w * 0.22}" y="${-h * 0.28}" width="${w * 0.44}" height="${h * 0.56}" rx="${size * 0.08}" fill="#ffffff" opacity="0.35"/>`
  }
  if (marker === 'arrow') {
    return `<path d="M ${size * 0.72} 0 L ${-size * 0.52} ${-size * 0.4} L ${-size * 0.28} 0 L ${-size * 0.52} ${size * 0.4} Z" fill="${color}"/>`
  }
  if (marker === 'pulse') {
    const phase = ((pulsePhase % 1) + 1) % 1
    const ring = r + size * 0.8 * phase
    return `<circle r="${ring}" fill="none" stroke="${color}" stroke-width="${Math.max(1, size * 0.12)}" opacity="${(0.55 * (1 - phase)).toFixed(3)}"/><circle r="${r * 0.72}" fill="${color}"/>`
  }
  return `<circle r="${r * 1.45}" fill="${color}" opacity="0.16"/><circle r="${r}" fill="${color}"/>`
}

function repeatCount(flow: ResolvedFlow): string {
  return flow.repeat === 'indefinite' ? 'indefinite' : String(flow.repeat)
}

function motionKeys(flow: ResolvedFlow): { keyTimes: string; keyPoints: string; keySplines: string } {
  const times = [0]
  const points = [0]
  const splines: string[] = []
  for (const span of flow.intervals) {
    times.push(span.end / flow.cycleDuration)
    points.push(span.toDistance / flow.routeLength)
    splines.push(easingSpline(span.easing))
  }
  if (flow.hold > 0) {
    times.push(1)
    points.push(1)
    splines.push('0 0 1 1')
  } else {
    times[times.length - 1] = 1
  }
  return {
    keyTimes: times.map(keyNumber).join(';'),
    keyPoints: points.map(keyNumber).join(';'),
    keySplines: splines.join(';'),
  }
}

function shiftedKeyPoints(flow: ResolvedFlow, offset: number): string {
  return motionKeys(flow)
    .keyPoints
    .split(';')
    .map(value => keyNumber(Number(value) - offset))
    .join(';')
}

function visibilityGate(flow: ResolvedFlow): string {
  const visibleEnd = keyNumber(flow.duration / flow.cycleDuration)
  const fadeInEnd = keyNumber(Math.min(0.015, flow.duration / flow.cycleDuration))
  return `<animate attributeName="opacity" calcMode="discrete" values="0;1;0" keyTimes="0;${fadeInEnd};${visibleEnd}" dur="${seconds(flow.cycleDuration)}" begin="${seconds(flow.delay)}" repeatCount="${repeatCount(flow)}"/>`
}

function animatedMarker(
  flow: ResolvedFlow,
  color: string,
  marker: ResolvedFlow['marker'],
  size: number,
  opacity: number,
  distanceOffset = 0,
): string {
  const keys = motionKeys(flow)
  const keyPoints = distanceOffset > 0 ? shiftedKeyPoints(flow, distanceOffset / flow.routeLength) : keys.keyPoints
  const rotate = marker === 'arrow' || marker === 'packet' ? 'auto' : '0'
  const pulse = marker === 'pulse'
    ? `<animate attributeName="opacity" values="1;0.35;1" dur="0.8s" begin="${seconds(flow.delay)}" repeatCount="indefinite"/>`
    : ''
  return `<g>${visibilityGate(flow)}<g opacity="${opacity}"><g><animateMotion dur="${seconds(flow.cycleDuration)}" begin="${seconds(flow.delay)}" repeatCount="${repeatCount(flow)}" rotate="${rotate}" calcMode="spline" keyPoints="${keyPoints}" keyTimes="${keys.keyTimes}" keySplines="${keys.keySplines}" path="${escapeXml(flow.routePath)}"/>${markerMarkup(marker, size, color)}${pulse}</g></g></g>`
}

function trailSpacing(flow: ResolvedFlow): number {
  return flow.trail === 'wake' ? Math.max(10, flow.size * 1.15) : Math.max(18, flow.size * 2.2)
}

function flowLabelPosition(flow: ResolvedFlow): { x: number; y: number } | null {
  const firstLeg = flow.legs[0]
  if (!firstLeg) return null
  // Sit early on the first leg and well off the line — connector labels own
  // the midpoint, so the flow caption must not stack on top of them.
  const point = flowPointAtDistance(flow, firstLeg.routeStart + (firstLeg.routeEnd - firstLeg.routeStart) * 0.28)
  if (!point) return null
  const radians = (point.angle * Math.PI) / 180
  const nx = Math.sin(radians)
  const ny = -Math.cos(radians)
  return { x: point.x + nx * 18, y: point.y + ny * 18 }
}

function flowLabel(flow: ResolvedFlow, color: string, fontFamily: string, backgroundColor?: string): string {
  if (!flow.flow.label) return ''
  const point = flowLabelPosition(flow)
  if (!point) return ''
  const { x, y } = point
  const halo = backgroundColor ? ` stroke="${escapeXml(backgroundColor)}" stroke-width="3" paint-order="stroke" stroke-linejoin="round"` : ''
  return `<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" text-anchor="middle" fill="${color}" opacity="0.85" font-size="8.5" font-family="${escapeXml(fontFamily)}" letter-spacing="0.8"${halo}>${escapeXml(flow.flow.label)}</text>`
}

function wakePath(flow: ResolvedFlow, color: string): string {
  if (flow.trail !== 'wake') return ''
  const keys = motionKeys(flow)
  const wake = Math.min(0.28, Math.max(0.08, (flow.size * 4) / flow.routeLength))
  const values = keys.keyPoints.split(';').map(point => keyNumber(wake - Number(point))).join(';')
  return `<path d="${escapeXml(flow.routePath)}" pathLength="1" fill="none" stroke="${color}" stroke-width="${Math.max(1.5, flow.size * 0.38)}" stroke-linecap="round" stroke-opacity="0.18" stroke-dasharray="${wake} 1"><animate attributeName="stroke-dashoffset" dur="${seconds(flow.cycleDuration)}" begin="${seconds(flow.delay)}" repeatCount="${repeatCount(flow)}" calcMode="linear" values="${values}" keyTimes="${keys.keyTimes}"/></path>`
}

function animatedFlow(flow: ResolvedFlow, data: ArcDiagramData, options: FlowSvgOptions): string {
  const color = resolveFlowColor(flow, data, options.themeColors)
  const ghosts = flow.trail === 'wake' ? 4 : flow.trail === 'fade' ? 2 : 0
  const spacing = trailSpacing(flow)
  let out = `<g data-arc-flow="${escapeXml(flow.flow.id)}" pointer-events="none">${wakePath(flow, color)}`
  for (let i = ghosts; i >= 1; i--) {
    const opacity = flow.trail === 'wake' ? 0.08 + (ghosts - i) * 0.055 : 0.1 + (ghosts - i) * 0.18
    out += animatedMarker(flow, color, flow.marker, Math.max(1, flow.size * (1 - i * 0.12)), opacity, spacing * i)
  }
  out += animatedMarker(flow, color, flow.marker, flow.size, 0.95)
  out += `${flowLabel(flow, color, options.fontFamily ?? 'ui-sans-serif, system-ui, sans-serif', options.backgroundColor)}</g>`
  return out
}

function staticMarkerTransform(position: FlowPosition, flow: ResolvedFlow): string {
  const rotate = flow.marker === 'arrow' || flow.marker === 'packet' ? ` rotate(${position.angle.toFixed(2)})` : ''
  return `translate(${position.x.toFixed(2)} ${position.y.toFixed(2)})${rotate}`
}

function staticMarkerAt(position: FlowPosition | null, flow: ResolvedFlow, color: string, size: number, opacity: number, pulsePhase = 0, binding?: number): string {
  const attrs = binding === undefined ? '' : ` data-arc-flow-static="${binding}"`
  return `<g${attrs}${position ? ` transform="${staticMarkerTransform(position, flow)}"` : ' display="none"'} opacity="${opacity}">${markerMarkup(flow.marker, size, color, pulsePhase)}</g>`
}

function staticFlow(flow: ResolvedFlow, data: ArcDiagramData, options: FlowSvgOptions): string {
  const time = options.flowTime ?? 0
  const position = flowPositionAt(flow, time)
  const color = resolveFlowColor(flow, data, options.themeColors)
  let out = `<g data-arc-flow="${escapeXml(flow.flow.id)}" pointer-events="none">`
  if (position || options.geometryBindings) {
    const ghosts = flow.trail === 'wake' ? 4 : flow.trail === 'fade' ? 2 : 0
    const spacing = trailSpacing(flow)
    const ghostPositions = flowTrailPositionsAt(flow, time, spacing, ghosts)
    for (let i = (options.geometryBindings ? ghosts : ghostPositions.length) - 1; i >= 0; i--) {
      const distance = i + 1
      const opacity = flow.trail === 'wake' ? 0.08 + (ghostPositions.length - distance) * 0.055 : 0.1 + (ghostPositions.length - distance) * 0.18
      out += staticMarkerAt(ghostPositions[i] ?? null, flow, color, Math.max(1, flow.size * (1 - distance * 0.12)), opacity, time * 1.25, options.geometryBindings ? distance : undefined)
    }
    if (flow.trail === 'wake') {
      const wake = Math.min(0.28, Math.max(0.08, (flow.size * 4) / flow.routeLength))
      out += `<path d="${escapeXml(flow.routePath)}" pathLength="1" fill="none" stroke="${color}" stroke-width="${Math.max(1.5, flow.size * 0.38)}" stroke-linecap="round" stroke-opacity="0.18" stroke-dasharray="${wake} 1" stroke-dashoffset="${keyNumber(wake - (position?.progress ?? 0))}"${position ? '' : ' display="none"'}/>`
    }
    out += staticMarkerAt(position, flow, color, flow.size, 1, time * 1.25, options.geometryBindings ? 0 : undefined)
  }
  out += `${flowLabel(flow, color, options.fontFamily ?? 'ui-sans-serif, system-ui, sans-serif', options.backgroundColor)}</g>`
  return out
}

function resolveFlowColor(flow: ResolvedFlow, data: ArcDiagramData, themeColors?: Theme['light'] | Theme['dark'] | null): string {
  const first = flow.legs[0]
  const authored = flow.flow.color ?? (first ? data.connectorStyles[data.connectors[first.connectorIndex]?.style ?? '']?.color : undefined) ?? 'blue'
  const palette = themeColors?.palette?.[authored as keyof NonNullable<Theme['light']['palette']>]
  return palette?.stroke ?? fallbackFlowColors[authored] ?? fallbackFlowColors.blue
}

/** SVG markup for the flow layer. Draw it after connectors and before nodes so
 *  handoffs disappear under the destination node instead of floating on top. */
export function renderFlowLayer(data: ArcDiagramData, options: FlowSvgOptions = {}): string {
  const animated = options.animate !== false && options.flowTime === undefined
  let out = '<g data-arc-flows="true">'
  for (const source of data.flows ?? []) {
    const flow = resolveDiagramFlow(data, source)
    if (!flow) continue
    out += animated ? animatedFlow(flow, data, options) : staticFlow(flow, data, options)
  }
  return `${out}</g>`
}

/** Bind existing SVG once, then update only geometry attributes. Animated
 * elements keep their identity and begin time as nodes move. No markup parsing
 * or animation restarts are needed on a Motion frame. */
export function bindFlowLayerGeometry(root: Element, options: FlowSvgOptions = {}): (data: ArcDiagramData) => void {
  const bindings = Array.from(root.querySelectorAll('[data-arc-flow]')).map(group => ({
    id: group.getAttribute('data-arc-flow')!, group,
    motions: Array.from(group.querySelectorAll('animateMotion')),
    gates: Array.from(group.querySelectorAll('animate[values="0;1;0"]')),
    wake: Array.from(group.children).find(child => child.tagName.toLowerCase() === 'path'),
    label: Array.from(group.children).find(child => child.tagName.toLowerCase() === 'text'),
    markers: Array.from(group.querySelectorAll('[data-arc-flow-static]')).map(element => ({
      element, distance: Number(element.getAttribute('data-arc-flow-static')),
    })),
  }))
  const set = (element: Element, name: string, value: string) => {
    if (element.getAttribute(name) !== value) element.setAttribute(name, value)
  }
  const show = (element: Element, visible: boolean) => {
    if (visible) element.removeAttribute('display')
    else set(element, 'display', 'none')
  }
  return data => {
    const sources = new Map((data.flows ?? []).map(source => [source.id, source]))
    for (const binding of bindings) {
      const source = sources.get(binding.id)
      const flow = source && resolveDiagramFlow(data, source)
      show(binding.group, !!flow)
      if (!flow) continue
      const keys = motionKeys(flow)
      const spacing = trailSpacing(flow)
      binding.motions.forEach((element, index) => {
        const offset = (binding.motions.length - index - 1) * spacing / flow.routeLength
        set(element, 'path', flow.routePath)
        set(element, 'keyPoints', offset > 0 ? shiftedKeyPoints(flow, offset) : keys.keyPoints)
        set(element, 'keyTimes', keys.keyTimes)
        set(element, 'keySplines', keys.keySplines)
      })
      // Keep the existing SMIL clock/duration while its route is being edited.
      // A changed authored timing option rebuilds the structural layer instead.
      const visibleEnd = keyNumber(flow.duration / flow.cycleDuration)
      const fadeInEnd = keyNumber(Math.min(0.015, flow.duration / flow.cycleDuration))
      for (const gate of binding.gates) set(gate, 'keyTimes', `0;${fadeInEnd};${visibleEnd}`)
      const position = binding.markers.length ? flowPositionAt(flow, options.flowTime ?? 0) : null
      if (binding.wake) {
        const wake = Math.min(0.28, Math.max(0.08, (flow.size * 4) / flow.routeLength))
        set(binding.wake, 'd', flow.routePath)
        set(binding.wake, 'stroke-dasharray', `${wake} 1`)
        const animation = binding.wake.firstElementChild
        if (animation) {
          set(animation, 'values', keys.keyPoints.split(';').map(point => keyNumber(wake - Number(point))).join(';'))
          set(animation, 'keyTimes', keys.keyTimes)
        } else {
          show(binding.wake, !!position)
          if (position) set(binding.wake, 'stroke-dashoffset', keyNumber(wake - position.progress))
        }
      }
      const ghosts = flowTrailPositionsAt(flow, options.flowTime ?? 0, spacing, flow.trail === 'wake' ? 4 : flow.trail === 'fade' ? 2 : 0)
      for (const { element, distance } of binding.markers) {
        const point = distance === 0 ? position : ghosts[distance - 1]
        show(element, !!point)
        if (!point) continue
        set(element, 'transform', staticMarkerTransform(point, flow))
        if (distance > 0) set(element, 'opacity', String(flow.trail === 'wake'
          ? 0.08 + (ghosts.length - distance) * 0.055 : 0.1 + (ghosts.length - distance) * 0.18))
      }
      const labelPoint = binding.label && flowLabelPosition(flow)
      if (binding.label && labelPoint) {
        set(binding.label, 'x', labelPoint.x.toFixed(2))
        set(binding.label, 'y', labelPoint.y.toFixed(2))
      }
    }
  }
}

/** Total seconds needed to show every flow once (or one loop for indefinite flows). */
export function diagramFlowDuration(data: ArcDiagramData): number {
  let end = 0
  for (const source of data.flows ?? []) {
    const flow = resolveDiagramFlow(data, source)
    if (flow) end = Math.max(end, flowAnimationEnd(flow))
  }
  return end
}
