import { createElement, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react'
import { createPanelCubeScene, type PanelCubeSvgNode } from './render'
import { useRotationHandles } from './RotationHandles'
import type { PanelCubeDocument, PanelCubeRenderOptions, PanelCubeRotation } from './types'

export interface ArcPanelCubeProps extends PanelCubeRenderOptions {
  data: PanelCubeDocument
  onFaceChange?: (id: string | null) => void
  /** Explicit click/Enter/Space activation, separate from transient hover and focus. */
  onFaceSelect?: (id: string) => void
  /** Enables drag and arrow-key rotation. Angles are in degrees relative to the initial view. */
  onRotationChange?: (rotation: PanelCubeRotation) => void
  /** Reveals draggable Turn/Tilt rings on hover or keyboard focus when onRotationChange is supplied. */
  rotationHandles?: boolean
  /** Called when free drag crosses its threshold, a ring is grabbed, or a rotation key is pressed. */
  onRotateStart?: () => void
  className?: string
  style?: CSSProperties
}

/** Controlled and SSR-safe; the host decides animation, hover reveal and persistence. */
export function ArcPanelCube({ data, progress = 1, activeFace = null, onFaceChange, onFaceSelect, rotation = { yaw: 0, pitch: 0 }, onRotationChange, rotationHandles = false, onRotateStart, labels = true, className, style }: ArcPanelCubeProps) {
  const instance = useId()
  const prefix = `arc-panel-${instance.replace(/[^a-zA-Z0-9_-]/g, '_')}`
  const { yaw, pitch } = rotation
  const scene = useMemo(() => createPanelCubeScene(data, { progress, activeFace, labels, rotation: { yaw, pitch } }, prefix), [data, progress, activeFace, labels, yaw, pitch, prefix])
  const drag = useRef<{ pointer: number; x: number; y: number; rotation: PanelCubeRotation; moved: boolean } | null>(null)
  const suppressClick = useRef(false)
  const [dragging, setDragging] = useState(false)
  const handles = useRotationHandles({
    enabled: rotationHandles && Boolean(onRotationChange), compact: !labels, rotation, onRotationChange, onRotateStart,
    onHandleStart: () => { drag.current = null; setDragging(false); suppressClick.current = true; onFaceChange?.(null) },
  })
  const clampPitch = (pitch: number) => Math.max(-75, Math.min(75, pitch))
  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!onRotationChange || !event.isPrimary || event.button !== 0) return
    suppressClick.current = false
    drag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, rotation: { ...rotation }, moved: false }
  }
  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    const start = drag.current
    if (!start || start.pointer !== event.pointerId || !onRotationChange) return
    const dx = event.clientX - start.x, dy = event.clientY - start.y
    if (!start.moved && Math.hypot(dx, dy) < 5) return
    if (!start.moved) {
      // A host may still be auto-spinning while the pointer is held still.
      // Begin the drag from the current view, not its press-time orientation.
      start.rotation = { ...rotation }
      start.moved = true
      suppressClick.current = true
      setDragging(true)
      event.currentTarget.setPointerCapture(event.pointerId)
      event.currentTarget.focus({ preventScroll: true })
      onRotateStart?.()
      onFaceChange?.(null)
    }
    event.preventDefault()
    onRotationChange({ yaw: start.rotation.yaw + dx * 0.45, pitch: clampPitch(start.rotation.pitch - dy * 0.45) })
  }
  function pointerEnd(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointer !== event.pointerId) return
    drag.current = null
    setDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  function rotateKey(event: KeyboardEvent<HTMLDivElement>) {
    if (!onRotationChange || event.altKey || event.ctrlKey || event.metaKey) return
    const step = event.shiftKey ? 20 : 8
    let next: PanelCubeRotation
    switch (event.key) {
      case 'ArrowLeft': next = { ...rotation, yaw: rotation.yaw - step }; break
      case 'ArrowRight': next = { ...rotation, yaw: rotation.yaw + step }; break
      case 'ArrowUp': next = { ...rotation, pitch: clampPitch(rotation.pitch + step) }; break
      case 'ArrowDown': next = { ...rotation, pitch: clampPitch(rotation.pitch - step) }; break
      case 'Home': next = { yaw: 0, pitch: 0 }; break
      default: return
    }
    event.preventDefault()
    event.currentTarget.focus({ preventScroll: true })
    onRotateStart?.()
    onRotationChange(next)
  }
  const render = (entry: PanelCubeSvgNode, key = 'root'): ReactNode => {
    const props: Record<string, unknown> = { key }
    for (const [name, value] of Object.entries(entry.attrs ?? {})) {
      props[name.startsWith('aria-') || name.startsWith('data-') ? name : name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value
    }
    const faceId = entry.attrs?.['data-front-face'] as string | undefined
    if (faceId && (onFaceChange || onFaceSelect)) {
      const face = data.faces.find(item => item.id === faceId)!
      Object.assign(props, {
        role: 'button', tabIndex: 0, 'aria-label': `${face.label}${face.description ? `. ${face.description}` : ''}`,
        'aria-pressed': activeFace === faceId, style: { cursor: 'pointer' },
        onPointerEnter: () => { if (!drag.current?.moved && !handles.activeAxis) onFaceChange?.(faceId) },
        onPointerLeave: (event: PointerEvent<SVGGElement>) => {
          if (event.currentTarget !== event.currentTarget.ownerDocument.activeElement) onFaceChange?.(null)
        },
        onFocus: () => onFaceChange?.(faceId), onBlur: () => onFaceChange?.(null),
        onClick: () => onFaceSelect ? onFaceSelect(faceId) : onFaceChange?.(faceId),
        onKeyDown: (event: KeyboardEvent<SVGGElement>) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            if (onFaceSelect) onFaceSelect(faceId)
            else onFaceChange?.(faceId)
          }
          if (event.key === 'Escape') { event.preventDefault(); onFaceChange?.(null) }
        },
      })
    }
    const children = (entry.children ?? []).flatMap((child, i): ReactNode[] => {
      if (typeof child === 'string') return [child]
      const panel = child.attrs?.['data-panel']
      const callout = child.attrs?.['data-callout']
      const rendered = render(child, panel ? `panel-${panel}-${child.attrs?.['data-back']}` : callout ? `callout-${callout}` : `${key}-${i}`)
      if (entry.tag !== 'svg' || !panel) return [rendered]
      const before = entry.children?.[i - 1], after = entry.children?.[i + 1]
      return [
        ...(!before || typeof before === 'string' || !before.attrs?.['data-panel'] ? [handles.rear] : []),
        rendered,
        ...(!after || typeof after === 'string' || !after.attrs?.['data-panel'] ? [handles.front] : []),
      ]
    })
    return createElement(entry.tag, props, ...children)
  }
  return <div
    className={['arc-panel-cube', className].filter(Boolean).join(' ')}
    style={{ ...style, ...(onRotationChange ? { touchAction: 'none', userSelect: 'none', cursor: dragging || handles.activeAxis ? 'grabbing' : 'grab' } : {}) }}
    {...(onRotationChange ? {
      role: 'group', tabIndex: 0,
      'aria-label': `${data.title}. Drag to rotate, or use the arrow keys. Home resets the view.`,
      'aria-keyshortcuts': 'ArrowLeft ArrowRight ArrowUp ArrowDown Home',
      'data-yaw': rotation.yaw, 'data-pitch': rotation.pitch, 'data-dragging': String(dragging || Boolean(handles.activeAxis)),
      ...(handles.activeAxis ? { 'data-rotation-axis': handles.activeAxis } : {}),
      onPointerDown: pointerDown, onPointerMove: pointerMove, onPointerUp: pointerEnd,
      onPointerCancel: pointerEnd,
      onLostPointerCapture: (event: PointerEvent<HTMLDivElement>) => {
        // Touch begins with implicit capture on the hit panel; transferring it
        // to this wrapper must not cancel the drag we just started.
        if (event.target === event.currentTarget) pointerEnd(event)
      },
      onPointerLeave: () => { if (drag.current && !drag.current.moved) drag.current = null },
      onKeyDown: rotateKey,
      onClickCapture: (event: MouseEvent<HTMLDivElement>) => {
        if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false }
      },
    } : {})}
  >{render({ ...scene, attrs: { ...scene.attrs, width: '100%', height: '100%', ...(onFaceChange || onFaceSelect || rotationHandles && onRotationChange ? { role: 'group' } : {}) } })}</div>
}
