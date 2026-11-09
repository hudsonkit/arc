import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Check } from 'lucide-react'
import { useAnimate } from 'motion/react-mini'
import { motion as motionElement, useTransform } from 'motion/react'
import type { ArcCanvasOverlayContext, ArcCanvasOverlayNode } from '../../components/ArcDiagram'
import { useReducedDiagramMotion, type LiveCanvasMotion } from '../../hooks/useLiveDiagramMotion'
import type { EditPresence } from './editPresence'
import type { LiveDiagramActor, LiveDiagramWork } from '../../types/live'
import { actorLabel, type PresenceState } from './presence'
import type { LiveBounds } from '../../utils/liveMotion'
import { placeWorkLabel, workLabelObstacles, workScopeBounds, type WorkLabelPlacement } from './workPresence'
import type { Connector, ConnectorStyle } from '../../types/diagram'

function monogram(label: string): string {
  const words = label.split(/[\s_\-./]+/).filter(w => /[a-z0-9]/i.test(w))
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return (words[0]?.[0] ?? '?').toUpperCase()
}

function actorDetails(actor: LiveDiagramActor, simulated = false): string {
  if (simulated) return 'Sample agent for local motion playback'
  const lines = [`MCP client: ${actor.name}${actor.version ? ` ${actor.version}` : ''}`, `Connection: ${actor.id}`]
  if (actor.harness) lines.push('Harness and name are declared by the caller.')
  return lines.join('\n')
}

function subscribeVisibility(listener: () => void) {
  document.addEventListener('visibilitychange', listener)
  return () => document.removeEventListener('visibilitychange', listener)
}

const isPageVisible = () => document.visibilityState === 'visible'
const isServerVisible = () => false

export function AgentCoin({ actor, state, simulated = false }: { actor: LiveDiagramActor; state: PresenceState; simulated?: boolean }) {
  const label = actorLabel(actor)
  const visible = useSyncExternalStore(subscribeVisibility, isPageVisible, isServerVisible)
  return (
    <span className="arc-live-coin" data-state={state} data-visible={visible} title={actorDetails(actor, simulated)} aria-hidden="true">
      <span className="arc-live-coin-face">{monogram(label)}</span>
      <span className="arc-live-coin-pip" />
    </span>
  )
}

export function AgentIdentity({ actor, state, status, simulated = false }: { actor: LiveDiagramActor; state: PresenceState; status: string; simulated?: boolean }) {
  const label = actorLabel(actor)
  return (
    <span className="arc-live-identity" title={actorDetails(actor, simulated)}>
      <strong>{label}{actor.displayName && <span className="arc-live-agent-name"> · {actor.displayName}</span>}</strong>
      {status && <span data-state={state}>{status}</span>}
    </span>
  )
}

// Non-spatial phases keep small batches busy without turning the grid into a
// traveling wave. Every cell completes one bright/settled/rest cycle per loop.
const MATRIX_PHASES = [0, 5, 2, 7, 3, 6, 1, 4, 6, 2, 5, 0, 4, 1, 7, 3, 2, 7, 0, 5]

/** An activity signal, not a progress estimate or a count of MCP operations. */
export function ActivityMatrix({ state, animate, variant = 'compact' }: { state: PresenceState; animate: boolean; variant?: 'compact' | 'canvas' }) {
  const visible = useSyncExternalStore(subscribeVisibility, isPageVisible, isServerVisible)
  const reducedMotion = useReducedDiagramMotion()
  const [scope, animateCells] = useAnimate<HTMLSpanElement>()
  const canvas = variant === 'canvas'
  const columns = canvas ? 12 : 5
  const rows = canvas ? 5 : 3
  const running = state === 'working' && animate && visible && !reducedMotion

  useEffect(() => {
    if (!running || !scope.current) return
    // Resolve the palette once; Motion mini passes numeric opacity keyframes to
    // the browser's animation API without per-frame React renders.
    const styles = getComputedStyle(scope.current)
    const low = Number(styles.getPropertyValue('--dot-low'))
    const high = Number(styles.getPropertyValue('--dot-high'))
    const settled = Number(styles.getPropertyValue('--dot-settled'))
    const duration = parseFloat(styles.getPropertyValue('--dot-cycle')) / 1000
    const playback = animateCells('span', { opacity: [low, high, high, settled, low, low] }, {
      duration,
      times: [0, 0.04, 0.1, 0.2, 0.35, 1],
      ease: 'linear',
      repeat: Infinity,
      delay: index => {
        const phase = MATRIX_PHASES[canvas ? Math.floor(index / columns) * 4 + Math.floor(index % columns / 3) : index]
        return -phase * duration / 8
      },
    })
    // Cancel restores the static CSS state instead of committing a lit cell
    // into a completed or disconnected session.
    return () => playback.cancel()
  }, [running, canvas, columns, scope, animateCells])

  return (
    <span ref={scope} className="arc-live-matrix" data-variant={variant} data-state={state} data-animate={running} aria-hidden="true">
      {Array.from({ length: columns * rows }, (_, i) => <span key={i} />)}
    </span>
  )
}

// Screen-space margin the label keeps from the edge of the canvas. Chrome that
// floats over the canvas (toolbar, presence, zoom controls, title block) is
// measured instead, so it is avoided wherever it happens to be.
const LABEL_VIEW_INSET = 12

/** Viewer chrome over the canvas, in CSS pixels relative to the diagram root. */
function measureChrome(from: Element): LiveBounds[] {
  const root = from.closest('[data-arc-diagram]')
  if (!root) return []
  const origin = root.getBoundingClientRect()
  const area = origin.width * origin.height
  const camera = root.querySelector('[data-arc-camera]')
  const toolbar = root.closest('[data-arc-live-stage]')?.querySelectorAll('.arc-live-toolbar > *') ?? []
  return [...Array.from(root.children), ...Array.from(toolbar)].flatMap(element => {
    if (camera && (element === camera || element.contains(camera))) return []
    const rect = element.getBoundingClientRect()
    // Frames and backdrops span the canvas; they are decoration, not chrome.
    if (rect.width <= 0 || rect.height <= 0 || rect.width * rect.height > area * 0.4) return []
    return [{ minX: rect.left - origin.left, minY: rect.top - origin.top, maxX: rect.right - origin.left, maxY: rect.bottom - origin.top }]
  })
}

const REGION_PAD = 10
const LABEL_GAP = 9

/**
 * The announced scope appears before the edit, independently of changed boxes.
 * Its label says what the work is — the toolbar already says who is doing it —
 * and is placed clear of every displayed box, connector and connector label.
 */
export function CanvasWorkPresence({ nodes, connectors, connectorStyles, bounds, zoom, camera, viewport, motion, work, animate }: {
  nodes: ArcCanvasOverlayNode[]
  connectors?: readonly Connector[]
  connectorStyles?: Record<string, ConnectorStyle>
  bounds: LiveBounds
  zoom: number
  camera: ArcCanvasOverlayContext['camera']
  viewport: ArcCanvasOverlayContext['viewport']
  motion?: LiveCanvasMotion
  work: LiveDiagramWork
  animate: boolean
}) {
  const labelRef = useRef<HTMLSpanElement>(null)
  const [labelSize, setLabelSize] = useState({ width: 280, height: 30 })
  const placement = useRef<WorkLabelPlacement | undefined>(undefined)
  const chrome = useRef<LiveBounds[]>([])
  // Chrome does not follow the camera, so it is measured on render and resize
  // rather than per frame.
  useLayoutEffect(() => { if (labelRef.current) chrome.current = measureChrome(labelRef.current) })
  useLayoutEffect(() => {
    const element = labelRef.current
    if (!element) return
    const root = element.closest('[data-arc-diagram]')
    const observer = new ResizeObserver(() => { chrome.current = measureChrome(element) })
    if (root) observer.observe(root)
    return () => observer.disconnect()
  }, [])
  useLayoutEffect(() => {
    const element = labelRef.current
    if (!element) return
    // Layout size is unaffected by the anchor's 1/zoom transform: CSS pixels.
    const measure = () => setLabelSize(size => size.width === element.offsetWidth && size.height === element.offsetHeight
      ? size : { width: element.offsetWidth, height: element.offsetHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  // Displayed geometry, including entry/exit opacity, so the scope and the
  // label's obstacles follow boxes mid-spring.
  const displayed = () => nodes.map(node => {
    const values = motion?.nodes[node.id]
    return values ? {
      ...node, x: values.x.get(), y: values.y.get(), width: values.width.get(),
      height: values.height.get(), opacity: values.opacity.get(),
    } : node
  })
  // Explicit regions and canvas scopes keep their authored extent.
  const area = useTransform(() => workScopeBounds(work.scope, work.scope.type === 'nodes' ? displayed() : nodes, bounds))
  const scale = useTransform(() => 1 / Math.max(motion?.camera.zoom.get() ?? zoom, 0.01))
  const x = useTransform(() => (area.get()?.minX ?? 0) - REGION_PAD * scale.get())
  const y = useTransform(() => (area.get()?.minY ?? 0) - REGION_PAD * scale.get())
  const width = useTransform(() => {
    const value = area.get()
    return value ? value.maxX - value.minX + 2 * REGION_PAD * scale.get() : 0
  })
  const height = useTransform(() => {
    const value = area.get()
    return value ? value.maxY - value.minY + 2 * REGION_PAD * scale.get() : 0
  })
  const opacity = useTransform(() => area.get() ? 1 : 0)
  const labelWidth = viewport.width > 0 ? Math.min(340, Math.max(0, viewport.width - 24)) : 340
  const label = useTransform(() => {
    const s = scale.get()
    const region = { minX: x.get(), minY: y.get(), maxX: x.get() + width.get(), maxY: y.get() + height.get() }
    const camX = motion?.camera.x.get() ?? camera.x
    const camY = motion?.camera.y.get() ?? camera.y
    const toCanvas = (b: LiveBounds) => ({ minX: (b.minX - camX) * s, minY: (b.minY - camY) * s, maxX: (b.maxX - camX) * s, maxY: (b.maxY - camY) * s })
    const view = viewport.width > 0 && viewport.height > 0 ? toCanvas({
      minX: LABEL_VIEW_INSET, minY: LABEL_VIEW_INSET,
      maxX: viewport.width - LABEL_VIEW_INSET, maxY: viewport.height - LABEL_VIEW_INSET,
    }) : undefined
    const obstacles = workLabelObstacles(displayed(), connectors, connectorStyles)
    obstacles.rects.push(...chrome.current.map(toCanvas))
    const position = placeWorkLabel({
      region, view, previous: placement.current, gap: LABEL_GAP * s,
      size: { width: labelSize.width * s, height: labelSize.height * s }, obstacles,
    })
    placement.current = position.placement
    return { x: position.x - region.minX, y: position.y - region.minY }
  })
  const labelX = useTransform(() => label.get().x)
  const labelY = useTransform(() => label.get().y)
  return (
    <motionElement.div className="arc-live-work-region" data-arc-work-id={work.id} data-arc-work-scope={work.scope.type} aria-hidden="true" style={{
      left: 0, top: 0, x, y, width, height, opacity, borderWidth: scale,
    }}>
      <motionElement.div className="arc-live-work-anchor" style={{ x: labelX, y: labelY, scale }}>
        <span ref={labelRef} className="arc-live-work-label" style={{ maxWidth: labelWidth }}>
          <ActivityMatrix state="working" animate={animate} variant="canvas" />
          <span>{work.summary}</span>
        </span>
      </motionElement.div>
    </motionElement.div>
  )
}

/** A quiet receipt for a completed change. It never animates the working dots. */
export function CanvasEditPresence({ node, zoom, motion, actor, action }: {
  node: ArcCanvasOverlayNode
  zoom: number
  motion?: LiveCanvasMotion
  actor: LiveDiagramActor
  action: EditPresence['action']
}) {
  const values = motion?.nodes[node.id]
  const scale = useTransform(() => 1 / Math.max(motion?.camera.zoom.get() ?? zoom, 0.01))
  const offset = useTransform(() => 3 * scale.get())
  const labelLeft = useTransform(() => (values?.width.get() ?? node.width) / 2)
  return (
    <motionElement.div className="arc-live-edit" data-arc-edit-node={node.id} aria-hidden="true" style={{
      left: 0, top: 0, x: values?.x ?? node.x, y: values?.y ?? node.y,
      width: values?.width ?? node.width, height: values?.height ?? node.height,
      opacity: values?.opacity ?? node.opacity, outlineWidth: scale, outlineOffset: offset,
    }}>
      <motionElement.div className="arc-live-edit-anchor" style={{ left: 0, x: labelLeft, scale }}>
        <span className="arc-live-edit-label">
          <Check size={11} strokeWidth={1.5} />
          <span>{action} by</span>
          <strong>{actor.displayName || actorLabel(actor)}</strong>
        </span>
      </motionElement.div>
    </motionElement.div>
  )
}
