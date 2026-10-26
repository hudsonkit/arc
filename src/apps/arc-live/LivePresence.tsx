import { useEffect, useSyncExternalStore } from 'react'
import { Check } from 'lucide-react'
import { useAnimate } from 'motion/react-mini'
import { motion as motionElement, useTransform } from 'motion/react'
import type { ArcCanvasOverlayContext, ArcCanvasOverlayNode } from '../../components/ArcDiagram'
import { useReducedDiagramMotion, type LiveCanvasMotion } from '../../hooks/useLiveDiagramMotion'
import type { EditPresence } from './editPresence'
import type { LiveDiagramActor, LiveDiagramWork } from '../../types/live'
import { actorLabel, type PresenceState } from './presence'
import type { LiveBounds } from '../../utils/liveMotion'
import { workScopeBounds } from './workPresence'

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

/** The announced scope appears before the edit, independently of changed boxes. */
export function CanvasWorkPresence({ nodes, bounds, zoom, camera, viewport, motion, actor, work, animate }: {
  nodes: ArcCanvasOverlayNode[]
  bounds: LiveBounds
  zoom: number
  camera: ArcCanvasOverlayContext['camera']
  viewport: ArcCanvasOverlayContext['viewport']
  motion?: LiveCanvasMotion
  actor: LiveDiagramActor
  work: LiveDiagramWork
  animate: boolean
}) {
  // A node scope follows displayed geometry, including entry/exit opacity.
  // Explicit regions and canvas scopes keep their authored extent.
  const area = useTransform(() => workScopeBounds(work.scope, work.scope.type === 'nodes' ? nodes.map(node => {
    const values = motion?.nodes[node.id]
    return values ? {
      ...node, x: values.x.get(), y: values.y.get(), width: values.width.get(),
      height: values.height.get(), opacity: values.opacity.get(),
    } : node
  }) : nodes, bounds))
  const scale = useTransform(() => 1 / Math.max(motion?.camera.zoom.get() ?? zoom, 0.01))
  const x = useTransform(() => (area.get()?.minX ?? 0) - 10 * scale.get())
  const y = useTransform(() => (area.get()?.minY ?? 0) - 10 * scale.get())
  const width = useTransform(() => {
    const value = area.get()
    return value ? value.maxX - value.minX + 20 * scale.get() : 0
  })
  const height = useTransform(() => {
    const value = area.get()
    return value ? value.maxY - value.minY + 20 * scale.get() : 0
  })
  const opacity = useTransform(() => area.get() ? 1 : 0)
  const labelWidth = viewport.width > 0 ? Math.min(300, Math.max(0, viewport.width - 24)) : 300
  const labelLeft = useTransform(() => {
    if (viewport.width <= 0) return 0
    const screenLeft = (motion?.camera.x.get() ?? camera.x) + x.get() / scale.get()
    return (Math.max(12, Math.min(screenLeft, viewport.width - labelWidth - 12)) - screenLeft) * scale.get()
  })
  return (
    <motionElement.div className="arc-live-work-region" data-arc-work-id={work.id} data-arc-work-scope={work.scope.type} aria-hidden="true" style={{
      left: 0, top: 0, x, y, width, height, opacity, borderWidth: scale,
    }}>
      <motionElement.div className="arc-live-work-anchor" style={{ x: labelLeft, scale }}>
        <span className="arc-live-work-label" style={{ maxWidth: labelWidth }}>
          <ActivityMatrix state="working" animate={animate} variant="canvas" />
          <span><strong>{actorLabel(actor)}{actor.displayName ? ` · ${actor.displayName}` : ''}</strong><span>{work.summary}</span></span>
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
