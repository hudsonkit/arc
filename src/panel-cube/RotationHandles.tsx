import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import type { PanelCubeRotation } from './types'

type Axis = keyof PanelCubeRotation
const center = { x: 400, y: 290 }
const rings = {
  yaw: { name: 'Turn', color: '#a65f43', rx: 185, ry: 55, grip: { x: 215, y: 290 }, label: { x: 215, y: 261 }, front: 'M215,290 A185,55 0 0,0 585,290', back: 'M215,290 A185,55 0 0,1 585,290' },
  pitch: { name: 'Tilt', color: '#627c8a', rx: 60, ry: 160, grip: { x: 400, y: 450 }, label: { x: 434, y: 454 }, front: 'M400,130 A60,160 0 0,1 400,450', back: 'M400,130 A60,160 0 0,0 400,450' },
}
const clampPitch = (value: number) => Math.max(-75, Math.min(75, value))
const wrappedDegrees = (value: number) => ((value + 180) % 360 + 360) % 360 - 180

const handleStyles = `
.arc-panel-cube {
  --arc-panel-ring-opacity: 0;
  --arc-panel-ring-hit: none;
  --arc-panel-grip-hit: none;
}
.arc-panel-cube:is(:hover, :focus-visible, :has(:focus-visible), [data-dragging="true"]) {
  --arc-panel-ring-opacity: 1;
  --arc-panel-ring-hit: stroke;
  --arc-panel-grip-hit: all;
}
.arc-panel-cube [data-rotation-layer] {
  opacity: var(--arc-panel-ring-opacity);
  transition: opacity 180ms ease-out;
  pointer-events: none;
}
.arc-panel-cube .arc-panel-rotation-hit {
  stroke-width: 14px;
  pointer-events: var(--arc-panel-ring-hit);
}
.arc-panel-cube [data-rotation-grip] { pointer-events: var(--arc-panel-grip-hit); }
@media (hover: none), (pointer: coarse) {
  .arc-panel-cube {
    --arc-panel-ring-opacity: 1;
    --arc-panel-ring-hit: stroke;
    --arc-panel-grip-hit: all;
  }
}
@media (pointer: coarse) { .arc-panel-cube .arc-panel-rotation-hit { stroke-width: 44px; } }
@media (prefers-reduced-motion: reduce) {
  .arc-panel-cube [data-rotation-layer] { transition: none; }
}
`

interface Props {
  enabled: boolean
  compact: boolean
  rotation: PanelCubeRotation
  onRotationChange?: (rotation: PanelCubeRotation) => void
  onRotateStart?: () => void
  onHandleStart: () => void
}

/** React-only orbit controls; the static SVG scene remains an illustration. */
export function useRotationHandles({ enabled, compact, rotation, onRotationChange, onRotateStart, onHandleStart }: Props) {
  const drag = useRef<{ pointer: number; axis: Axis; previous: number; accumulated: number; rotation: PanelCubeRotation } | null>(null)
  const focusTargets = useRef<Partial<Record<Axis, SVGGElement | null>>>({})
  const [activeAxis, setActiveAxis] = useState<Axis | null>(null)
  const [focusedAxis, setFocusedAxis] = useState<Axis | null>(null)
  const [hoveredAxis, setHoveredAxis] = useState<Axis | null>(null)

  function angle(event: PointerEvent<SVGGElement>, axis: Axis) {
    const svg = event.currentTarget.ownerSVGElement, transform = svg?.getScreenCTM()
    if (!svg || !transform) return null
    const point = svg.createSVGPoint()
    point.x = event.clientX; point.y = event.clientY
    const local = point.matrixTransform(transform.inverse()), ring = rings[axis]
    return Math.atan2((local.y - center.y) / ring.ry, (local.x - center.x) / ring.rx)
  }
  function start(event: PointerEvent<SVGGElement>, axis: Axis) {
    if (!enabled || !onRotationChange || !event.isPrimary || event.button !== 0) return
    const previous = angle(event, axis)
    if (previous === null) return
    event.preventDefault(); event.stopPropagation()
    drag.current = { pointer: event.pointerId, axis, previous, accumulated: 0, rotation: { ...rotation } }
    setActiveAxis(axis)
    event.currentTarget.setPointerCapture(event.pointerId)
    focusTargets.current[axis]?.focus({ preventScroll: true })
    onHandleStart()
    onRotateStart?.()
  }
  function move(event: PointerEvent<SVGGElement>) {
    const current = drag.current
    if (!current || event.pointerId !== current.pointer || !onRotationChange) return
    const next = angle(event, current.axis)
    if (next === null) return
    event.preventDefault(); event.stopPropagation()
    // Accumulate the shortest angular step, so crossing ±π never jumps.
    let delta = next - current.previous
    if (delta > Math.PI) delta -= Math.PI * 2
    if (delta < -Math.PI) delta += Math.PI * 2
    current.previous = next
    current.accumulated -= delta * 180 / Math.PI
    const value = current.rotation[current.axis] + current.accumulated
    const applied = current.axis === 'pitch' ? clampPitch(value) : value
    current.accumulated = applied - current.rotation[current.axis]
    onRotationChange({ ...current.rotation, [current.axis]: applied })
  }
  function end(event: PointerEvent<SVGGElement>) {
    if (drag.current?.pointer !== event.pointerId) return
    event.stopPropagation()
    drag.current = null
    setActiveAxis(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  function key(event: KeyboardEvent<SVGGElement>, axis: Axis) {
    if (!onRotationChange || event.altKey || event.ctrlKey || event.metaKey) return
    const step = event.shiftKey ? 20 : 8
    let value: number
    switch (event.key) {
      case 'ArrowUp': case 'ArrowRight': value = rotation[axis] + step; break
      case 'ArrowDown': case 'ArrowLeft': value = rotation[axis] - step; break
      case 'Home': value = 0; break
      default: return
    }
    event.preventDefault(); event.stopPropagation()
    onRotateStart?.()
    onRotationChange({ ...rotation, [axis]: axis === 'pitch' ? clampPitch(value) : value })
  }
  const pointerProps = (axis: Axis) => ({
    onPointerDown: (event: PointerEvent<SVGGElement>) => start(event, axis),
    onPointerMove: move, onPointerUp: end, onPointerCancel: end,
    onLostPointerCapture: (event: PointerEvent<SVGGElement>) => { if (event.target === event.currentTarget) end(event) },
    onPointerEnter: () => setHoveredAxis(axis), onPointerLeave: () => setHoveredAxis(null),
    onClick: (event: React.MouseEvent<SVGGElement>) => { event.preventDefault(); event.stopPropagation() },
    style: { cursor: activeAxis === axis ? 'grabbing' : 'grab', outline: 'none', touchAction: 'none' } as const,
  })
  const rear = enabled ? <g key="rotation-rear" data-rotation-layer="rear">
    <style>{handleStyles}</style>
    {(Object.keys(rings) as Axis[]).map(axis => {
      const ring = rings[axis]
      return <g key={axis} data-rotation-axis={axis} {...pointerProps(axis)}>
        <path d={ring.back} fill="none" stroke={ring.color} strokeWidth={1} strokeOpacity={0.35} strokeDasharray="3 5" vectorEffect="non-scaling-stroke" pointerEvents="none" />
        <path className="arc-panel-rotation-hit" d={ring.back} fill="none" stroke="transparent" vectorEffect="non-scaling-stroke" pointerEvents="stroke" />
      </g>
    })}
  </g> : null
  const front = enabled ? <g key="rotation-front" data-rotation-layer="front">
    {(Object.keys(rings) as Axis[]).map(axis => {
      const ring = rings[axis], emphasis = activeAxis === axis || focusedAxis === axis || hoveredAxis === axis
      const value = axis === 'yaw' ? wrappedDegrees(rotation.yaw) : rotation.pitch
      return <g key={axis}
        ref={element => { focusTargets.current[axis] = element }}
        data-rotation-axis={axis} role="slider" tabIndex={0} aria-label={ring.name}
        aria-valuemin={axis === 'yaw' ? -180 : -75} aria-valuemax={axis === 'yaw' ? 180 : 75}
        aria-valuenow={Math.round(value)} aria-valuetext={`${Math.round(value)} degrees`}
        aria-orientation={axis === 'yaw' ? 'horizontal' : 'vertical'}
        aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Home"
        onKeyDown={event => key(event, axis)}
        onFocus={() => setFocusedAxis(axis)} onBlur={() => setFocusedAxis(null)}
        {...pointerProps(axis)}
      >
        <title>{`${ring.name}: drag the ring, or use arrow keys. Home resets this axis.`}</title>
        <path d={ring.front} fill="none" stroke={ring.color} strokeOpacity={emphasis ? 0.95 : 0.68} strokeWidth={emphasis ? 1.6 : 1.15} vectorEffect="non-scaling-stroke" pointerEvents="none" />
        <path data-rotation-ring={axis} className="arc-panel-rotation-hit" d={ring.front} fill="none" stroke="transparent" vectorEffect="non-scaling-stroke" pointerEvents="stroke" />
        {focusedAxis === axis && <circle cx={ring.grip.x} cy={ring.grip.y} r={15} fill="none" stroke={ring.color} strokeWidth={2} strokeOpacity={0.8} vectorEffect="non-scaling-stroke" pointerEvents="none" />}
        <circle cx={ring.grip.x} cy={ring.grip.y} r={8} fill="#f7f7f4" stroke={ring.color} strokeWidth={1.8} vectorEffect="non-scaling-stroke" pointerEvents="none" />
        <circle cx={ring.grip.x} cy={ring.grip.y} r={2.5} fill={ring.color} pointerEvents="none" />
        <text x={ring.label.x} y={ring.label.y} textAnchor="middle" fontSize={compact ? 16 : 11} fontWeight={600} fill={ring.color} stroke="#f7f7f4" strokeWidth={3} paintOrder="stroke" strokeLinejoin="round" pointerEvents="none">{ring.name}</text>
        <circle data-rotation-grip={axis} cx={ring.grip.x} cy={ring.grip.y} r={10} fill="transparent" stroke="transparent" strokeWidth={44} vectorEffect="non-scaling-stroke" pointerEvents="all" />
      </g>
    })}
  </g> : null
  return { rear, front, activeAxis }
}
