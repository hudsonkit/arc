import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react'
import { animate, motionValue, type MotionValue } from 'motion/react'
import type { ArcDiagramData, NodePosition } from '../components/ArcDiagram'
import { NODE_SIZES } from '../utils/constants'
import type { LiveCamera } from '../utils/liveMotion'

export interface LiveNodeMotion {
  x: MotionValue<number>
  y: MotionValue<number>
  width: MotionValue<number>
  height: MotionValue<number>
  opacity: MotionValue<number>
}
export interface LiveCameraMotion {
  x: MotionValue<number>
  y: MotionValue<number>
  zoom: MotionValue<number>
}
export interface LiveCanvasMotion {
  nodes: Record<string, LiveNodeMotion>
  camera: LiveCameraMotion
}

// Motion owns the spring, interruption/velocity continuity and frame scheduler.
// Only membership changes enter React; geometry updates go straight to the DOM.
export const LIVE_SPRING = { type: 'spring' as const, stiffness: 440, damping: 36, mass: 1, restDelta: 0.02, restSpeed: 0.02 }

export function useReducedDiagramMotion() {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(preference.matches)
    update()
    preference.addEventListener('change', update)
    return () => preference.removeEventListener('change', update)
  }, [])
  return reduced
}

export function createNodeMotion(node: Pick<NodePosition, 'x' | 'y'> & { width: number; height: number }, entering = false): LiveNodeMotion {
  return {
    x: motionValue(node.x), y: motionValue(node.y + (entering ? 10 : 0)),
    width: motionValue(node.width), height: motionValue(node.height), opacity: motionValue(entering ? 0 : 1),
  }
}

export function readNodeMotion(node: NodePosition, values: LiveNodeMotion): NodePosition {
  return { ...node, x: values.x.get(), y: values.y.get(), width: values.width.get(), height: values.height.get() }
}

function drive(value: MotionValue<number>, next: number, enabled: boolean) {
  if (!enabled) { value.jump(next); return }
  if (value.get() === next && !value.isAnimating()) return
  animate(value, next, { ...LIVE_SPRING, velocity: value.getVelocity() })
}

class DiagramMotionRegistry {
  readonly nodes = new Map<string, { values: LiveNodeMotion; node: NodePosition; data: ArcDiagramData['nodeData'][string]; exit: number; exiting: boolean }>()
  readonly groups = new Map<string, LiveNodeMotion>()
  readonly ready = new Set<string>()
  constructor(readonly id: string) {}

  update(current: () => ArcDiagramData, animated: boolean, changed: () => void) {
      for (const [id, entry] of this.nodes) {
        const node = current().nodes[id]
        if (node) {
          entry.exit++
          entry.exiting = false
          entry.node = node
          entry.data = current().nodeData[id]
          const geometry = { ...NODE_SIZES[node.size], ...node }
          for (const key of ['x', 'y', 'width', 'height'] as const) drive(entry.values[key], geometry[key], animated)
          drive(entry.values.opacity, 1, animated)
        } else if (!animated) {
          for (const value of Object.values(entry.values)) value.stop()
          this.nodes.delete(id)
          changed()
        } else if (!entry.exiting) {
          entry.exiting = true
          const ticket = ++entry.exit
          animate(entry.values.opacity, 0, { duration: 0.18, ease: 'easeOut', onComplete: () => {
            if (entry.exit !== ticket || current().nodes[id]) return
            for (const value of Object.values(entry.values)) value.stop()
            this.nodes.delete(id)
            changed()
          } })
        }
      }
      for (const group of current().groups ?? []) {
        const values = this.groups.get(group.id)
        if (values) for (const key of ['x', 'y', 'width', 'height'] as const) drive(values[key], group[key], animated)
      }
      const groupIds = new Set((current().groups ?? []).map(group => group.id))
      for (const [id, values] of this.groups.entries()) if (!groupIds.has(id)) {
        for (const value of Object.values(values)) value.stop()
        this.groups.delete(id)
      }
  }
}

export function useLiveDiagramMotion(target: ArcDiagramData, enabled: boolean | undefined) {
  const [, changed] = useReducer(value => value + 1, 0)
  const store = useMemo(() => new DiagramMotionRegistry(target.id), [target.id])
  const latest = useRef(target)
  const animateUpdates = !!enabled

  // Existing values survive revisions, keeping connector/overlay subscriptions.
  for (const [id, node] of Object.entries(target.nodes)) {
    if (!store.nodes.has(id)) store.nodes.set(id, {
      values: createNodeMotion({ ...NODE_SIZES[node.size], ...node }, store.ready.size > 0 && animateUpdates),
      node, data: target.nodeData[id], exit: 0, exiting: false,
    })
  }
  for (const group of target.groups ?? []) {
    if (!store.groups.has(group.id)) store.groups.set(group.id, createNodeMotion(group))
  }

  useLayoutEffect(() => {
    latest.current = target
    store.ready.add(target.id)
    const update = (animated: boolean) => store.update(() => latest.current, animated, changed)
    update(animateUpdates && !document.hidden)
    const visibility = () => { if (document.hidden) update(false) }
    document.addEventListener('visibilitychange', visibility)
    return () => document.removeEventListener('visibilitychange', visibility)
  }, [target, animateUpdates, store])

  useEffect(() => () => {
    for (const entry of store.nodes.values()) for (const value of Object.values(entry.values)) value.stop()
    for (const values of store.groups.values()) for (const value of Object.values(values)) value.stop()
  }, [store])

  const nodes = { ...target.nodes }, nodeData = { ...target.nodeData }
  const motionNodes: Record<string, LiveNodeMotion> = {}
  for (const [id, entry] of store.nodes) {
    motionNodes[id] = entry.values
    if (animateUpdates && !nodes[id]) { nodes[id] = entry.node; nodeData[id] = entry.data }
  }
  return { data: { ...target, nodes, nodeData }, nodes: motionNodes, groups: Object.fromEntries(store.groups) }
}

export function readCameraMotion(camera: LiveCameraMotion): LiveCamera {
  return { x: camera.x.get(), y: camera.y.get(), zoom: camera.zoom.get() }
}

/** DOM styles consume these values directly. Read/stop them at the gesture
 * boundary so manual control starts at the exact displayed camera. */
export function useLiveCamera(target: LiveCamera, enabled: boolean | undefined, freezeOnDisable = false) {
  const [values] = useState<LiveCameraMotion>(() => ({ x: motionValue(target.x), y: motionValue(target.y), zoom: motionValue(target.zoom) }))
  const { x, y, zoom } = target
  const previous = useRef({ x, y, zoom, enabled })
  useLayoutEffect(() => {
    const before = previous.current
    previous.current = { x, y, zoom, enabled }
    const sameTarget = before.x === x && before.y === y && before.zoom === zoom
    const update = (animated: boolean) => {
      drive(values.x, x, animated)
      drive(values.y, y, animated)
      drive(values.zoom, zoom, animated)
    }
    // A host disabling Follow has no new target. Preserve the displayed
    // values until its ownership effect reads them; accessibility/off changes
    // still jump to the authored target.
    if (before.enabled && !enabled && freezeOnDisable && sameTarget && !document.hidden) {
      values.x.stop(); values.y.stop(); values.zoom.stop()
    } else update(!!enabled && !document.hidden)
    const visibility = () => { if (document.hidden) update(false) }
    document.addEventListener('visibilitychange', visibility)
    return () => document.removeEventListener('visibilitychange', visibility)
  }, [x, y, zoom, enabled, freezeOnDisable, values])
  useEffect(() => () => { values.x.stop(); values.y.stop(); values.zoom.stop() }, [values])
  return values
}
