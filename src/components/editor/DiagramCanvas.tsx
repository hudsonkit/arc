import { HOST_THEME_CSS } from '../../../packages/viewer/src/theme/host'
import { useRef, useCallback, useState, useEffect, useMemo } from 'react'
import { useEditor, useDiagram, useEditorState, useTemplate, useViewMode, useIsoStyle, useMeta, useResolvedTheme, useResolvedBrand } from './EditorProvider'
import { NODE_SIZES } from '../../utils/constants'
import { getContentBounds, nearestNodeAnchor, hitTestNode, anchor } from '../../utils/diagramHelpers'
import { getTemplate } from '../../utils/templates'
import { canvasToIsoFloor, isoFloorRect, isoFloorEllipse } from '../../utils/isometric'
import { useCanvasTransform } from '../../hooks/useCanvasTransform'
import EditableNode from './EditableNode'
import ConnectorLayer from './ConnectorLayer'
import AnchorPoints from './AnchorPoints'
import IsoAnchorPoints from './IsoAnchorPoints'
import GroupLayer from './GroupLayer'
import ImageLayer from './ImageLayer'
import MiniMap from './MiniMap'
import ExportZoneLayer from './ExportZoneLayer'
import InfiniteGrid from './InfiniteGrid'
import ZoomControls from './ZoomControls'
import ViewModeToggle from './ViewModeToggle'
import { getTheme } from '../../utils/themes'
import IsometricNodeLayer from './IsometricNodeLayer'
import IsometricConnectorLayer from './IsometricConnectorLayer'
import TechnicalBackdrop from '../technical/TechnicalBackdrop'
import TechnicalPlate from '../technical/TechnicalPlate'
import { getIsoStyle } from '../../utils/isoStyles'
import { resolveNodeColor } from '../../utils/nodeKinds'
import { isoContentBounds, isoPlateBounds, buildNodeIndex, isoNodeDims, nearestIsoAnchor, isoNodeScreenBounds, hitTestIsoNode, isoNodeAnchor } from '../../utils/isoBlueprint'
import type { EmbedConfig, ZoomConfig, NodePosition } from '../../types/editor'
import { CanvasContextMenu, type CtxMenuState, type CtxTarget } from './CanvasContextMenu'
import { IsoOriginHud } from './IsoOriginEditor'

// Default embed configuration
const DEFAULT_EMBED_CONFIG: Required<EmbedConfig> = {
  defaultViewMode: '2d',
  defaultIsoStyle: 'solid',
  enableViewModeToggle: false,
  enableZoom: true,
  enablePan: true,
  enableDrag: true,
  enableSelection: true,
  showZoomControls: true,
  showMiniMap: true,
  showGrid: true,
}

interface DiagramCanvasProps {
  onViewportChange?: (bounds: { x: number; y: number; width: number; height: number }) => void
  embedConfig?: EmbedConfig
  zoomConfig?: ZoomConfig
  /** Workspace backdrop: 'theme' paints the diagram theme's container (embeds,
   *  where the frame is part of the artifact), 'chrome' paints the app canvas
   *  so the editor's infinite surface matches the shell skin. */
  surface?: 'theme' | 'chrome'
  /** Override canvas background with an Arc theme. */
  themeOverride?: string
  isDark?: boolean
}

function DrawingGroupPreview({
  drawing,
  layout,
  isoOrigin,
}: {
  drawing: { type: 'rect' | 'circle'; startX: number; startY: number; currentX: number; currentY: number }
  layout: { width: number; height: number }
  isoOrigin: { x: number; y: number } | null
}) {
  const x = Math.min(drawing.startX, drawing.currentX)
  const y = Math.min(drawing.startY, drawing.currentY)
  const width = Math.abs(drawing.currentX - drawing.startX)
  const height = Math.abs(drawing.currentY - drawing.startY)
  const fill = 'rgba(113, 113, 122, 0.1)'
  const stroke = 'rgba(113, 113, 122, 0.5)'
  const path = isoOrigin
    ? drawing.type === 'circle'
      ? isoFloorEllipse(x + width / 2, y + height / 2, width / 2, height / 2, isoOrigin.x, isoOrigin.y)
      : isoFloorRect(x, y, width, height, isoOrigin.x, isoOrigin.y, 6)
    : null

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox={isoOrigin ? undefined : `0 0 ${layout.width} ${layout.height}`}
      style={{ overflow: 'visible' }}
    >
      {path ? (
        <path d={path} fill={fill} stroke={stroke} strokeWidth={2} strokeDasharray="8 4" />
      ) : drawing.type === 'circle' ? (
        <ellipse
          cx={x + width / 2}
          cy={y + height / 2}
          rx={width / 2}
          ry={height / 2}
          fill={fill}
          stroke={stroke}
          strokeWidth={2}
          strokeDasharray="8 4"
        />
      ) : (
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          rx={6}
          fill={fill}
          stroke={stroke}
          strokeWidth={2}
          strokeDasharray="8 4"
        />
      )}
    </svg>
  )
}

export default function DiagramCanvas({ onViewportChange, embedConfig, zoomConfig, surface = 'theme', themeOverride, isDark }: DiagramCanvasProps) {
  const { actions } = useEditor()
  const diagram = useDiagram()
  const editor = useEditorState()
  const templateId = useTemplate()
  const viewMode = useViewMode()
  const isoStyleId = useIsoStyle()
  const isoStyle = getIsoStyle(isoStyleId)
  const meta = useMeta()
  const template = getTemplate(templateId)
  const themeColors = useResolvedTheme()
  const brand = useResolvedBrand()
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [retarget, setRetarget] = useState<{ index: number; end: 'from' | 'to' } | null>(null)
  const [retargetPt, setRetargetPt] = useState<{ x: number; y: number } | null>(null)

  // Merge embed config with defaults
  const config = { ...DEFAULT_EMBED_CONFIG, ...embedConfig }

  // The actual drawing extent — nodes, groups, images — for fitting the
  // viewport on the drawing rather than the layout box it sits on.
  const contentBounds = useMemo(
    () => getContentBounds(diagram.nodes, diagram.groups, diagram.images),
    [diagram.nodes, diagram.groups, diagram.images]
  )

  const {
    containerRef,
    zoom,
    pan,
    isPanning,
    minZoom,
    maxZoom,
    setZoom,
    zoomIn,
    zoomOut,
    resetTransform,
    fitToView,
    fitToRect,
    setPan,
    screenToCanvas,
    transformStyle,
  } = useCanvasTransform({
    initialZoom: zoomConfig?.defaultZoom ?? 1,
    initialPan: { x: 0, y: 0 },
    panModeActive: editor.mode === 'pan',
    contentSize: diagram.layout,
    contentBounds,
    zoomLevels: zoomConfig?.zoomLevels,
    zoomStep: zoomConfig?.zoomStep,
    maxFitZoom: zoomConfig?.maxFitZoom ?? (surface === 'chrome' ? 2 : 1),
  })

  const canvasRef = useRef<HTMLDivElement>(null)
  const prevViewModeRef = useRef<string | null>(null)
  const prevIsoStyleRef = useRef(isoStyleId)

  // Embed-time view defaults, applied once. A diagram's own _meta wins: the
  // provider has already seeded state from it before this runs.
  const appliedEmbedDefaults = useRef(false)
  useEffect(() => {
    if (appliedEmbedDefaults.current) return
    appliedEmbedDefaults.current = true
    if (embedConfig?.defaultViewMode && embedConfig.defaultViewMode !== viewMode) {
      actions.setViewMode(embedConfig.defaultViewMode)
    }
    if (embedConfig?.defaultIsoStyle && embedConfig.defaultIsoStyle !== isoStyleId) {
      actions.setIsoStyle(embedConfig.defaultIsoStyle)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // What the isometric view should frame: the boxes themselves, or — for the
  // technical styles — the whole plate, so the frame, component index, and
  // title block sit inside the viewport too.
  const isoOrigin = { x: diagram.layout.width / 2, y: diagram.layout.height - 100 }
  const getIsoBounds = useCallback(() => {
    if (isoStyle.technical) {
      return isoPlateBounds(diagram.nodes, diagram.nodeData, isoOrigin.x, isoOrigin.y, diagram.layout, diagram.groups)
    }
    const bounds = isoContentBounds(diagram.nodes, diagram.nodeData, isoOrigin.x, isoOrigin.y, diagram.groups)
    if (!bounds) return null
    const pad = 60
    return {
      minX: bounds.minX - pad,
      minY: bounds.minY - pad,
      maxX: bounds.maxX + pad,
      maxY: bounds.maxY + pad,
    }
  }, [isoStyle.technical, diagram.nodes, diagram.nodeData, diagram.groups, diagram.layout, isoOrigin.x, isoOrigin.y])

  const canvasToWorld = useCallback(
    (canvasPoint: { x: number; y: number }) => {
      if (viewMode !== 'isometric') return canvasPoint
      return canvasToIsoFloor(canvasPoint.x, canvasPoint.y, isoOrigin.x, isoOrigin.y)
    },
    [viewMode, isoOrigin.x, isoOrigin.y]
  )

  const pointerToWorld = useCallback(
    (clientX: number, clientY: number) => canvasToWorld(screenToCanvas({ x: clientX, y: clientY })),
    [canvasToWorld, screenToCanvas]
  )

  // Centre the isometric view when entering it, or when the style change moves
  // what counts as the drawing's extent. Fit zoom and pan together — a pan
  // computed from the pre-fit zoom races the mount-time 2D fit and sticks.
  useEffect(() => {
    const isFirstRun = prevViewModeRef.current === null
    const viewModeChanged = prevViewModeRef.current !== viewMode
    const isoStyleChanged = prevIsoStyleRef.current !== isoStyleId
    if (!viewModeChanged && !isoStyleChanged) return
    prevViewModeRef.current = viewMode
    prevIsoStyleRef.current = isoStyleId

    if (viewMode === 'isometric') {
      const bounds = getIsoBounds()
      if (bounds) fitToRect(bounds)
    } else if (viewMode === '2d' && viewModeChanged && !isFirstRun) {
      if (contentBounds) fitToRect(contentBounds)
      else resetTransform()
    }
  }, [viewMode, isoStyleId, getIsoBounds, contentBounds, fitToRect, resetTransform])

  const [ctxMenu, setCtxMenu] = useState<CtxMenuState | null>(null)
  const closeCtxMenu = useCallback(() => setCtxMenu(null), [])

  const openCtxMenu = useCallback((e: React.MouseEvent, target: CtxTarget) => {
    e.preventDefault()
    e.stopPropagation()
    if (target.kind === 'connector') actions.selectConnector(target.index)
    else if (target.kind === 'node') {
      if (!editor.selectedNodeIds.includes(target.id)) actions.selectNodes([target.id])
    } else if (target.kind === 'group') actions.selectGroup(target.id)
    else if (target.kind === 'image') actions.selectImage(target.id)
    setCtxMenu({ x: e.clientX, y: e.clientY, target })
  }, [actions, editor.selectedNodeIds])

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, nodeId: string) => {
      if (e.button !== 0) return
      if (editor.mode !== 'select' || isPanning) return
      if (!config.enableSelection && !config.enableDrag) return

      if (e.target instanceof Element) e.target.setPointerCapture?.(e.pointerId)
      const dragPoint = pointerToWorld(e.clientX, e.clientY)
      const isShiftHeld = e.shiftKey

      // Compute new selection based on shift state
      let newSelectedIds: string[]
      if (isShiftHeld) {
        // Toggle node in selection
        if (editor.selectedNodeIds.includes(nodeId)) {
          newSelectedIds = editor.selectedNodeIds.filter((id: string) => id !== nodeId)
        } else {
          newSelectedIds = [...editor.selectedNodeIds, nodeId]
        }
      } else {
        // If clicking on unselected node, select only it
        // If clicking on already-selected node, keep current selection (for multi-drag)
        newSelectedIds = editor.selectedNodeIds.includes(nodeId)
          ? editor.selectedNodeIds
          : [nodeId]
      }

      // Calculate offsets for all nodes that will be dragged
      const nodeOffsets: Record<string, { x: number; y: number }> = {}
      for (const id of newSelectedIds) {
        const node = diagram.nodes[id]
        if (node) {
          nodeOffsets[id] = {
            x: dragPoint.x - node.x,
            y: dragPoint.y - node.y,
          }
        }
      }

      const clickedNode = diagram.nodes[nodeId]

      // If drag is disabled, just update selection without starting drag
      if (!config.enableDrag) {
        actions.selectNodes(newSelectedIds)
        return
      }

      actions.startDrag(nodeId, {
        x: dragPoint.x - clickedNode.x,
        y: dragPoint.y - clickedNode.y,
      }, nodeOffsets, newSelectedIds)
    },
    [editor.mode, editor.selectedNodeIds, isPanning, diagram.nodes, actions, pointerToWorld, config.enableDrag, config.enableSelection]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!editor.isDragging || editor.selectedNodeIds.length === 0 || isPanning) return

      const dragPoint = pointerToWorld(e.clientX, e.clientY)

      // Move all selected nodes together - allow negative coords for infinite canvas
      const moves = editor.selectedNodeIds.map((nodeId: string) => {
        const offset = editor.dragNodeOffsets?.[nodeId] || editor.dragOffset

        // No bounds constraints - infinite canvas
        const x = Math.round(dragPoint.x - offset.x)
        const y = Math.round(dragPoint.y - offset.y)

        return { nodeId, x, y }
      })

      actions.moveNodes(moves)

      // Auto-expand canvas bounds if content moves near/past edges
      const padding = 200
      let maxWidth = diagram.layout.width
      let maxHeight = diagram.layout.height

      for (const move of moves) {
        const node = diagram.nodes[move.nodeId]
        const size = NODE_SIZES[node?.size as keyof typeof NODE_SIZES] || NODE_SIZES.m
        const nodeWidth = node?.width || size.width
        const nodeHeight = node?.height || size.height

        // Calculate required size
        const requiredWidth = move.x + nodeWidth + padding
        const requiredHeight = move.y + nodeHeight + padding

        if (requiredWidth > maxWidth) maxWidth = requiredWidth
        if (requiredHeight > maxHeight) maxHeight = requiredHeight
      }

      // Expand if needed (expandLayout only updates if larger)
      // Only in 2D mode - isometric uses different coordinate system
      if (viewMode === '2d' && (maxWidth > diagram.layout.width || maxHeight > diagram.layout.height)) {
        actions.expandLayout(maxWidth, maxHeight)
      }
    },
    [
      editor.isDragging,
      editor.selectedNodeIds,
      editor.dragOffset,
      editor.dragNodeOffsets,
      isPanning,
      diagram.nodes,
      diagram.layout,
      actions,
      pointerToWorld,
      viewMode,
    ]
  )

  const handlePointerUp = useCallback(() => {
    if (editor.isDragging) {
      actions.endDrag()
    }
  }, [editor.isDragging, actions])

  const handleNodeClick = useCallback(
    (nodeId: string, e?: React.MouseEvent) => {
      if (isPanning) return

      // Selection is handled in pointerDown for proper shift+click support
      if (editor.mode !== 'addConnector') return
      setHoveredNodeId(nodeId)
      if (viewMode !== 'isometric' || !e) return
      const node = diagram.nodes[nodeId]
      if (!node) return
      const canvas = screenToCanvas({ x: e.clientX, y: e.clientY })
      const face = nearestIsoAnchor(node, canvas.x, canvas.y, isoOrigin.x, isoOrigin.y)
      if (!editor.pendingConnector) {
        actions.setPendingConnector({ from: nodeId, fromAnchor: face })
      } else if (editor.pendingConnector.from !== nodeId) {
        actions.addConnector(
          editor.pendingConnector.from,
          nodeId,
          editor.pendingConnector.fromAnchor,
          face,
          'http'
        )
        setHoveredNodeId(null)
      }
    },
    [editor.mode, editor.pendingConnector, isPanning, viewMode, diagram.nodes, screenToCanvas, isoOrigin.x, isoOrigin.y, actions]
  )

  const handleAnchorClick = useCallback(
    (nodeId: string, position: string) => {
      if (editor.mode !== 'addConnector') return

      if (!editor.pendingConnector) {
        actions.setPendingConnector({ from: nodeId, fromAnchor: position })
      } else if (editor.pendingConnector.from !== nodeId) {
        actions.addConnector(
          editor.pendingConnector.from,
          nodeId,
          editor.pendingConnector.fromAnchor,
          position,
          'http'
        )
        setHoveredNodeId(null)
      } else {
        actions.setPendingConnector({ from: nodeId, fromAnchor: position })
      }
    },
    [editor.mode, editor.pendingConnector, actions]
  )

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      if (isPanning) return
      const target = e.target as HTMLElement
      if (!target.classList.contains('canvas-bg') && target !== canvasRef.current) return

      // Selection is handled by mousedown/mouseup for marquee selection
      if (editor.mode === 'addNode') {
        const world = pointerToWorld(e.clientX, e.clientY)
        if (viewMode === 'isometric') {
          const dims = isoNodeDims({ x: 0, y: 0, size: 'm' })
          actions.addNode({
            x: Math.round(world.x - dims.width / 2),
            y: Math.round(world.y - dims.depth / 2),
          })
        } else {
          const x = Math.round(world.x - NODE_SIZES.m.width / 2)
          const y = Math.round(world.y - NODE_SIZES.m.height / 2)
          actions.addNode({ x: Math.max(0, x), y: Math.max(0, y) })
        }
      } else if (editor.mode === 'addConnector') {
        actions.clearPendingConnector()
        setHoveredNodeId(null)
      }
    },
    [editor.mode, isPanning, actions, pointerToWorld, viewMode]
  )

  const handleConnectorClick = useCallback(
    (index: number) => {
      if (editor.mode === 'select' && !isPanning && !retarget) {
        actions.selectConnector(index)
      }
    },
    [editor.mode, isPanning, actions, retarget]
  )

  const handleEndpointDown = useCallback(
    (index: number, end: 'from' | 'to', e: React.PointerEvent) => {
      if (editor.mode !== 'select' || isPanning) return
      actions.selectConnector(index)
      setRetarget({ index, end })
      setRetargetPt(screenToCanvas({ x: e.clientX, y: e.clientY }))
    },
    [editor.mode, isPanning, actions, screenToCanvas]
  )

  useEffect(() => {
    if (!retarget) return
    const onMove = (e: PointerEvent) => {
      const canvas = screenToCanvas({ x: e.clientX, y: e.clientY })
      setRetargetPt(canvas)
      if (viewMode === 'isometric') {
        setHoveredNodeId(
          hitTestIsoNode(diagram.nodes, diagram.nodeData, canvas.x, canvas.y, isoOrigin.x, isoOrigin.y)
        )
      } else {
        setHoveredNodeId(hitTestNode(diagram.nodes, diagram.nodeData, canvas))
      }
    }
    const onUp = (e: PointerEvent) => {
      const canvas = screenToCanvas({ x: e.clientX, y: e.clientY })
      const c = diagram.connectors[retarget.index]
      if (c) {
        let nodeId: string | null = null
        let face: string | null = null
        if (viewMode === 'isometric') {
          nodeId = hitTestIsoNode(
            diagram.nodes,
            diagram.nodeData,
            canvas.x,
            canvas.y,
            isoOrigin.x,
            isoOrigin.y
          )
          if (nodeId) {
            face = nearestIsoAnchor(diagram.nodes[nodeId], canvas.x, canvas.y, isoOrigin.x, isoOrigin.y)
          }
        } else {
          nodeId = hitTestNode(diagram.nodes, diagram.nodeData, canvas)
          if (nodeId) face = nearestNodeAnchor(diagram.nodes, nodeId, canvas.x, canvas.y)
        }
        const other = retarget.end === 'from' ? c.to : c.from
        if (nodeId && face && nodeId !== other) {
          if (retarget.end === 'from') {
            actions.updateConnector(retarget.index, { from: nodeId, fromAnchor: face })
          } else {
            actions.updateConnector(retarget.index, { to: nodeId, toAnchor: face })
          }
        }
      }
      setRetarget(null)
      setRetargetPt(null)
      setHoveredNodeId(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [retarget, screenToCanvas, viewMode, diagram.nodes, diagram.nodeData, diagram.connectors, isoOrigin.x, isoOrigin.y, actions])

  const handleGroupClick = useCallback(
    (groupId: string) => {
      if (editor.mode === 'select' && !isPanning) {
        actions.selectGroup(groupId)
      }
    },
    [editor.mode, isPanning, actions]
  )

  const handleImageClick = useCallback(
    (imageId: string) => {
      if (editor.mode === 'select' && !isPanning) {
        actions.selectImage(imageId)
      }
    },
    [editor.mode, isPanning, actions]
  )

  // Handle image drop
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()

      const files = Array.from(e.dataTransfer.files)
      const imageFiles = files.filter(file =>
        file.type.startsWith('image/') || file.name.endsWith('.svg')
      )

      if (imageFiles.length === 0) return

      const canvasPoint = screenToCanvas({ x: e.clientX, y: e.clientY })

      imageFiles.forEach((file, index) => {
        const reader = new FileReader()
        reader.onload = (event) => {
          const src = event.target?.result as string

          // Create an image to get dimensions
          const img = new Image()
          img.onload = () => {
            // Scale down large images to fit reasonably
            let width = img.width
            let height = img.height
            const maxSize = 300

            if (width > maxSize || height > maxSize) {
              const ratio = Math.min(maxSize / width, maxSize / height)
              width = Math.round(width * ratio)
              height = Math.round(height * ratio)
            }

            actions.addImage({
              src,
              name: file.name,
              x: Math.round(canvasPoint.x + index * 20),
              y: Math.round(canvasPoint.y + index * 20),
              width,
              height,
              opacity: 1,
            })
          }
          img.src = src
        }
        reader.readAsDataURL(file)
      })
    },
    [screenToCanvas, actions]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  // Calculate viewport bounds for minimap
  const [containerSize, setContainerSize] = useState({ width: 800, height: 600 })

  // Update container size on resize
  const updateContainerSize = useCallback(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      setContainerSize({ width: rect.width, height: rect.height })
    }
  }, [containerRef])

  // Observe the element, not the window: the markup pane opening, closing or
  // being dragged changes the drawing area without a window resize, and a stale
  // size throws off the minimap viewport and every fit calculation.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    updateContainerSize()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateContainerSize)
      return () => window.removeEventListener('resize', updateContainerSize)
    }
    const observer = new ResizeObserver(updateContainerSize)
    observer.observe(el)
    return () => observer.disconnect()
  }, [updateContainerSize, containerRef])

  const viewportBounds = {
    x: -pan.x / zoom,
    y: -pan.y / zoom,
    width: containerSize.width / zoom,
    height: containerSize.height / zoom,
  }

  // Report viewport changes to parent
  useEffect(() => {
    onViewportChange?.(viewportBounds)
  }, [viewportBounds.x, viewportBounds.y, viewportBounds.width, viewportBounds.height, onViewportChange])

  // Auto-expand layout when viewport extends beyond current bounds
  // Only in 2D mode - isometric uses different coordinate system
  useEffect(() => {
    if (viewMode !== '2d') return

    const viewRight = viewportBounds.x + viewportBounds.width
    const viewBottom = viewportBounds.y + viewportBounds.height
    const padding = 100

    // Only expand if viewport goes significantly past current bounds
    if (viewRight > diagram.layout.width - padding || viewBottom > diagram.layout.height - padding) {
      const newWidth = Math.max(diagram.layout.width, viewRight + padding)
      const newHeight = Math.max(diagram.layout.height, viewBottom + padding)
      if (newWidth > diagram.layout.width || newHeight > diagram.layout.height) {
        actions.expandLayout(newWidth, newHeight)
      }
    }
  }, [viewMode, viewportBounds.x, viewportBounds.y, viewportBounds.width, viewportBounds.height, diagram.layout.width, diagram.layout.height, actions])

  const handleMiniMapViewportChange = useCallback(
    (newCenter: { x: number; y: number }) => {
      // Pan so that newCenter is at the center of the viewport
      const newPanX = -(newCenter.x * zoom) + containerSize.width / 2
      const newPanY = -(newCenter.y * zoom) + containerSize.height / 2
      setPan({ x: newPanX, y: newPanY })
    },
    [zoom, containerSize, setPan]
  )

  // Export zone editing
  const handleExportZoneUpdate = useCallback(
    (zone: { x: number; y: number; width: number; height: number }) => {
      actions.setExportZone(zone)
    },
    [actions]
  )

  // State for drawing groups
  const [drawingGroup, setDrawingGroup] = useState<{
    type: 'rect' | 'circle'
    startX: number
    startY: number
    currentX: number
    currentY: number
  } | null>(null)

  // State for marquee selection
  const [marqueeSelection, setMarqueeSelection] = useState<{
    startX: number
    startY: number
    currentX: number
    currentY: number
    additive: boolean
  } | null>(null)

  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0 || retarget) return
      const target = e.target as HTMLElement
      const isCanvasBg = target.classList.contains('canvas-bg') || target === canvasRef.current

      if (editor.mode === 'addRect' || editor.mode === 'addCircle') {
        const world = pointerToWorld(e.clientX, e.clientY)
        setDrawingGroup({
          type: editor.mode === 'addRect' ? 'rect' : 'circle',
          startX: world.x,
          startY: world.y,
          currentX: world.x,
          currentY: world.y,
        })
      } else if (editor.mode === 'select' && isCanvasBg && !isPanning) {
        // Start marquee selection on empty canvas
        const canvasPoint = screenToCanvas({ x: e.clientX, y: e.clientY })
        setMarqueeSelection({
          startX: canvasPoint.x,
          startY: canvasPoint.y,
          currentX: canvasPoint.x,
          currentY: canvasPoint.y,
          additive: e.shiftKey,
        })
      }
    },
    [editor.mode, screenToCanvas, pointerToWorld, isPanning, retarget]
  )

  const handleCanvasMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (drawingGroup) {
        const world = pointerToWorld(e.clientX, e.clientY)
        setDrawingGroup(prev => prev ? {
          ...prev,
          currentX: world.x,
          currentY: world.y,
        } : null)
      }
      if (marqueeSelection) {
        const canvasPoint = screenToCanvas({ x: e.clientX, y: e.clientY })
        setMarqueeSelection(prev => prev ? {
          ...prev,
          currentX: canvasPoint.x,
          currentY: canvasPoint.y,
        } : null)
      }
    },
    [drawingGroup, marqueeSelection, screenToCanvas, pointerToWorld]
  )

  const handleCanvasMouseUp = useCallback(() => {
    if (drawingGroup) {
      const x = Math.min(drawingGroup.startX, drawingGroup.currentX)
      const y = Math.min(drawingGroup.startY, drawingGroup.currentY)
      const width = Math.abs(drawingGroup.currentX - drawingGroup.startX)
      const height = Math.abs(drawingGroup.currentY - drawingGroup.startY)

      if (width > 20 && height > 20) {
        actions.addGroup({
          x: Math.round(x),
          y: Math.round(y),
          width: Math.round(width),
          height: Math.round(height),
          type: drawingGroup.type === 'circle' ? 'circle' : 'rect',
          color: 'zinc',
          label: '',
          dashed: true,
        })
      }
      setDrawingGroup(null)
      actions.setMode('select')
    }

    if (marqueeSelection) {
      const x = Math.min(marqueeSelection.startX, marqueeSelection.currentX)
      const y = Math.min(marqueeSelection.startY, marqueeSelection.currentY)
      const width = Math.abs(marqueeSelection.currentX - marqueeSelection.startX)
      const height = Math.abs(marqueeSelection.currentY - marqueeSelection.startY)

      // Only select if we actually dragged (not just clicked)
      if (width > 5 || height > 5) {
        const selectedIds: string[] = []
        for (const [nodeId, raw] of Object.entries(diagram.nodes)) {
          const nodeData = diagram.nodeData[nodeId]
          if (!nodeData) continue
          const node = raw as NodePosition
          let nodeX: number
          let nodeY: number
          let nodeWidth: number
          let nodeHeight: number
          if (viewMode === 'isometric') {
            const box = isoNodeScreenBounds(node, isoOrigin.x, isoOrigin.y)
            nodeX = box.minX
            nodeY = box.minY
            nodeWidth = box.width
            nodeHeight = box.height
          } else {
            const size = NODE_SIZES[node.size] || NODE_SIZES.m
            nodeWidth = size.width
            nodeHeight = size.height
            nodeX = node.x
            nodeY = node.y
          }

          if (
            nodeX < x + width &&
            nodeX + nodeWidth > x &&
            nodeY < y + height &&
            nodeY + nodeHeight > y
          ) {
            selectedIds.push(nodeId)
          }
        }
        if (selectedIds.length > 0) {
          const next = marqueeSelection.additive
            ? [...new Set([...editor.selectedNodeIds, ...selectedIds])]
            : selectedIds
          actions.selectNodes(next)
        } else if (!marqueeSelection.additive) {
          actions.clearSelection()
        }
      } else if (!marqueeSelection.additive) {
        actions.clearSelection()
      }
      setMarqueeSelection(null)
    }
  }, [drawingGroup, marqueeSelection, diagram.nodes, diagram.nodeData, actions, viewMode, isoOrigin.x, isoOrigin.y, editor.selectedNodeIds])

  const anchorNodeId =
    editor.mode === 'addConnector'
      ? hoveredNodeId || editor.pendingConnector?.from
      : retarget
        ? hoveredNodeId
        : null

  const retargetFixed = (() => {
    if (!retarget) return null
    const c = diagram.connectors[retarget.index]
    if (!c) return null
    const nodeId = retarget.end === 'from' ? c.to : c.from
    const face = retarget.end === 'from' ? c.toAnchor : c.fromAnchor
    const node = diagram.nodes[nodeId]
    if (!node) return null
    if (viewMode === 'isometric') return isoNodeAnchor(node, face, isoOrigin.x, isoOrigin.y)
    return anchor(diagram.nodes, nodeId, face)
  })()

  const getCursorClass = () => {
    if (isPanning) return 'cursor-grabbing'
    if (retarget) return 'cursor-grabbing'
    if (editor.mode === 'pan') return 'cursor-grab'
    if (editor.mode === 'addNode') return 'cursor-crosshair'
    if (editor.mode === 'addConnector') return 'cursor-pointer'
    if (editor.mode === 'addRect' || editor.mode === 'addCircle') return 'cursor-crosshair'
    return 'cursor-default'
  }

  const getModeLabel = () => {
    switch (editor.mode) {
      case 'addNode':
        return 'Click to place node'
      case 'addConnector':
        return viewMode === 'isometric' ? 'Click two boxes to connect' : 'Click nodes to connect'
      case 'pan':
        return 'Drag to pan canvas'
      case 'addRect':
        return 'Draw rectangle group'
      case 'addCircle':
        return 'Draw circle group'
      default:
        return null
    }
  }

  const modeLabel = getModeLabel()
  // Below this the minimap, the toolbar and the controls all want the same
  // edge. Measured rather than asked for with a CSS container query: making
  // this element a container root stops the browser invalidating paint inside
  // it when a chrome token changes, so the canvas kept the old skin until
  // something forced a repaint.
  const isNarrow = containerSize.width > 0 && containerSize.width < 680

  const isEmpty =
    Object.keys(diagram.nodes || {}).length === 0 &&
    (diagram.groups || []).length === 0 &&
    (diagram.images || []).length === 0

  return (
    <div className={`arc-canvas-frame relative w-full h-full${isNarrow ? ' is-narrow' : ''} ${themeColors?.background.container.startsWith('arc-inherit-') ? themeColors.background.container : ''}`}>
      {themeColors?.background.container.startsWith('arc-inherit-') && <style>{HOST_THEME_CSS}</style>}
      {/* Transform container - handles wheel/pan events */}
      <div
        ref={containerRef}
        className={`
          relative w-full h-full overflow-hidden
          ${surface === 'chrome' ? '' : themeColors ? '' : (themeOverride ? '' : template.canvas.background)}
          ${surface === 'chrome' ? '' : themeColors ? themeColors.background.container : (themeOverride ? getTheme(themeOverride as any)?.[isDark ? 'dark' : 'light']?.background?.container || '' : '')}
          ${getCursorClass()}
        `}
        style={{
          touchAction: 'none',
          // The workspace is chrome, not artifact: stay transparent so the
          // shell's drafting-table backdrop (grid + vignette) shows through.
          ...(surface === 'chrome' ? { background: 'transparent' } : {}),
        }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        {/* Paper fills the whole canvas for the technical isometric styles;
            its graph grid is pinned to the panned/zoomed drawing. */}
        {viewMode === 'isometric' && isoStyle.technical && (
          <TechnicalBackdrop style={isoStyle} pan={pan} zoom={zoom} />
        )}

        {/* Infinite grid - fills entire viewport */}
        {config.showGrid && !(viewMode === 'isometric' && isoStyle.technical) && (
          <InfiniteGrid
            grid={diagram.grid}
            viewportBounds={viewportBounds}
            zoom={zoom}
          />
        )}

        {/* Transformed canvas content */}
        <div style={transformStyle}>
          <div
            ref={canvasRef}
            className="relative canvas-bg"
            style={{
              width: diagram.layout.width,
              height: diagram.layout.height,
            }}
            onClick={handleCanvasClick}
            onContextMenu={(e) => {
              e.preventDefault()
              setCtxMenu(null)
            }}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          >

            {/* Groups - render behind everything else */}
            <GroupLayer
              layout={diagram.layout}
              groups={diagram.groups || []}
              selectedGroupId={editor.selectedGroupId}
              onGroupClick={handleGroupClick}
              onGroupContextMenu={(id, e) => openCtxMenu(e, { kind: 'group', id })}
              onGroupUpdate={actions.updateGroup}
              screenToCanvas={screenToCanvas}
              isoOrigin={viewMode === 'isometric' ? isoOrigin : null}
              isoStyle={viewMode === 'isometric' ? isoStyle : null}
            />

            {/* Images - render above groups but below nodes */}
            <ImageLayer
              layout={diagram.layout}
              images={diagram.images || []}
              selectedImageId={editor.selectedImageId}
              onImageClick={handleImageClick}
              onImageContextMenu={(id, e) => openCtxMenu(e, { kind: 'image', id })}
              onImageUpdate={actions.updateImage}
              screenToCanvas={screenToCanvas}
            />

            {/* Drawing preview for groups */}
            {drawingGroup && (
              <DrawingGroupPreview
                drawing={drawingGroup}
                layout={diagram.layout}
                isoOrigin={viewMode === 'isometric' ? isoOrigin : null}
              />
            )}

            {/* Marquee selection */}
            {marqueeSelection && (
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none"
                viewBox={`0 0 ${diagram.layout.width} ${diagram.layout.height}`}
              >
                <rect
                  x={Math.min(marqueeSelection.startX, marqueeSelection.currentX)}
                  y={Math.min(marqueeSelection.startY, marqueeSelection.currentY)}
                  width={Math.abs(marqueeSelection.currentX - marqueeSelection.startX)}
                  height={Math.abs(marqueeSelection.currentY - marqueeSelection.startY)}
                  fill="rgba(59, 130, 246, 0.1)"
                  stroke="rgba(59, 130, 246, 0.8)"
                  strokeWidth="1"
                  strokeDasharray="4 2"
                />
              </svg>
            )}

            {/* Render 2D or Isometric view based on viewMode */}
            {viewMode === '2d' ? (
              <>
                {/* 2D Connectors */}
                <ConnectorLayer
                  layout={diagram.layout}
                  nodes={diagram.nodes}
                  connectors={diagram.connectors}
                  connectorStyles={diagram.connectorStyles}
                  selectedConnectorIndex={editor.selectedConnectorIndex}
                  onConnectorClick={handleConnectorClick}
                  onConnectorContextMenu={(index, e) => openCtxMenu(e, { kind: 'connector', index })}
                  onEndpointDown={handleEndpointDown}
                  themeColors={themeColors}
                  brand={brand}
                />

                {/* Anchor points */}
                {anchorNodeId && (
                  <AnchorPoints
                    layout={diagram.layout}
                    nodes={diagram.nodes}
                    visibleNodeId={anchorNodeId}
                    onAnchorClick={handleAnchorClick}
                    pendingConnector={editor.pendingConnector}
                  />
                )}

                {/* 2D Nodes */}
                <div className="absolute inset-0 pointer-events-none">
                  {Object.entries(diagram.nodes).map(([nodeId, node]) => {
                    const data = diagram.nodeData[nodeId]
                    if (!data) return null
                    const typedNode = node as { x: number; y: number; size?: string; width?: number; height?: number }
                    return (
                      <EditableNode
                        key={nodeId}
                        nodeId={nodeId}
                        node={typedNode}
                        data={data}
                        layout={diagram.layout}
                        template={template}
                        isSelected={editor.selectedNodeIds.includes(nodeId)}
                        onPointerDown={handlePointerDown}
                        onClick={handleNodeClick}
                        onContextMenu={(id, e) => openCtxMenu(e, { kind: 'node', id })}
                        onMouseEnter={() => editor.mode === 'addConnector' && setHoveredNodeId(nodeId)}
                        onMouseLeave={() => editor.mode === 'addConnector' && setHoveredNodeId(null)}
                        themeColors={themeColors}
                        brand={brand}
                        colorMode={editor.colorMode === 'light' ? 'light' : 'dark'}
                      />
                    )
                  })}
                </div>
              </>
            ) : (
              <>
                {/* Drafting plate: frame, component index, title block */}
                {isoStyle.technical && (
                  <TechnicalPlate
                    style={isoStyle}
                    plate={isoPlateBounds(
                      diagram.nodes,
                      diagram.nodeData,
                      isoOrigin.x,
                      isoOrigin.y,
                      diagram.layout,
                      diagram.groups
                    )}
                    rows={Object.entries(buildNodeIndex(diagram.nodes, diagram.nodeData))
                      .sort(([, a], [, b]) => (a as number) - (b as number))
                      .map(([nodeId, n]) => ({
                        n: n as number,
                        name: diagram.nodeData[nodeId]?.name || nodeId,
                        subtitle: diagram.nodeData[nodeId]?.subtitle,
                        color: resolveNodeColor(diagram.nodeData[nodeId]),
                      }))}
                    title={(meta.diagramMeta as { title?: string })?.title || meta.filename || undefined}
                    tally={`${String(Object.keys(diagram.nodeData || {}).length).padStart(2, '0')} CMP / ${String(diagram.connectors.length).padStart(2, '0')} LNK`}
                  />
                )}

                {/* Isometric Connectors */}
                <IsometricConnectorLayer
                  nodes={diagram.nodes}
                  nodeData={diagram.nodeData}
                  connectors={diagram.connectors}
                  connectorStyles={diagram.connectorStyles}
                  selectedConnectorIndex={editor.selectedConnectorIndex}
                  onConnectorClick={handleConnectorClick}
                  onConnectorContextMenu={(index, e) => openCtxMenu(e, { kind: 'connector', index })}
                  onEndpointDown={handleEndpointDown}
                  originX={diagram.layout.width / 2}
                  originY={diagram.layout.height - 100}
                  isoStyle={isoStyle}
                />

                {/* Isometric Nodes */}
                <IsometricNodeLayer
                  nodes={diagram.nodes}
                  nodeData={diagram.nodeData}
                  selectedNodeIds={editor.selectedNodeIds}
                  onNodeClick={handleNodeClick}
                  onNodePointerDown={handlePointerDown}
                  onNodeContextMenu={(id, e) => openCtxMenu(e, { kind: 'node', id })}
                  onNodePointerEnter={(nodeId) => {
                    if (editor.mode === 'addConnector') setHoveredNodeId(nodeId)
                  }}
                  originX={diagram.layout.width / 2}
                  originY={diagram.layout.height - 100}
                  isoStyle={isoStyle}
                  brand={brand}
                />

                {anchorNodeId && diagram.nodes[anchorNodeId] && (
                  <IsoAnchorPoints
                    node={diagram.nodes[anchorNodeId]}
                    nodeId={anchorNodeId}
                    originX={isoOrigin.x}
                    originY={isoOrigin.y}
                    onAnchorClick={handleAnchorClick}
                    pendingConnector={editor.pendingConnector}
                  />
                )}

              </>
            )}

            {retarget && retargetFixed && retargetPt && (
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none"
                viewBox={viewMode === '2d' ? `0 0 ${diagram.layout.width} ${diagram.layout.height}` : undefined}
                style={{ overflow: 'visible' }}
              >
                <line
                  x1={retargetFixed.x}
                  y1={retargetFixed.y}
                  x2={retargetPt.x}
                  y2={retargetPt.y}
                  stroke="var(--arc-acc, #2b7fd4)"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  strokeLinecap="round"
                />
                <circle cx={retargetPt.x} cy={retargetPt.y} r={5} fill="var(--arc-acc, #2b7fd4)" />
              </svg>
            )}

            {/* Export zone overlay */}
            <ExportZoneLayer
              layout={diagram.layout}
              exportZone={diagram.exportZone}
              isEditing={editor.mode === 'select'}
              onZoneUpdate={handleExportZoneUpdate}
              screenToCanvas={screenToCanvas}
            />
          </div>
        </div>
      </div>

      {/* Empty canvas — File → New leaves nothing to look at and no hint that
          a node is one keystroke away. */}
      {isEmpty && (
        <div className="arc-canvas-empty">
          <p className="arc-canvas-empty-title">Empty canvas</p>
          <p className="arc-canvas-empty-hint">
            Press <kbd>N</kbd> and click to place a node — or open the markup pane
            and paste a diagram.
          </p>
          {config.enableSelection && (
            <button
              type="button"
              className="arc-editor-btn-primary arc-canvas-empty-action"
              onClick={() => actions.setMode('addNode')}
            >
              Add a node
            </button>
          )}
        </div>
      )}

      {/* Mode indicator */}
      {modeLabel && (
        <div className={`arc-editor-mode-badge${editor.mode === 'pan' ? ' is-pan' : ''}`}>
          {modeLabel}
        </div>
      )}

      {/* Pending connector indicator */}
      {editor.pendingConnector && (
        <div className="arc-editor-mode-badge is-pending">
          Select target anchor
        </div>
      )}

      {/* Canvas dock — the control clusters share one bottom-right stack, so
          neither has to guess how wide the other is at the current scale. */}
      {(config.showZoomControls || config.enableViewModeToggle) && (
      <div className="arc-canvas-dock">
      {/* View mode toggle */}
      {config.enableViewModeToggle && (
        <ViewModeToggle
          viewMode={viewMode as '2d' | 'isometric'}
          onViewModeChange={actions.setViewMode}
          isoStyle={isoStyle.id}
          onIsoStyleChange={actions.setIsoStyle}
        />
      )}

      {/* Zoom controls */}
      {config.showZoomControls && (
        <ZoomControls
          zoom={zoom}
          minZoom={minZoom}
          maxZoom={maxZoom}
          onZoomIn={() => zoomIn()}
          onZoomOut={() => zoomOut()}
          onZoomChange={(newZoom) => setZoom(newZoom)}
          onReset={resetTransform}
          onFitToView={() => {
            const bounds = viewMode === 'isometric' ? getIsoBounds() : contentBounds
            if (bounds) fitToRect(bounds)
            else fitToView(diagram.layout)
          }}
        />
      )}
      </div>
      )}

      {/* Mini map - hidden in isometric mode since coordinate systems don't align */}
      {config.showMiniMap && viewMode === '2d' && (
        <MiniMap
          diagram={diagram}
          viewportBounds={viewportBounds}
          onViewportChange={handleMiniMapViewportChange}
        />
      )}

      {viewMode === 'isometric'
        && editor.selectedNodeIds.length === 1
        && diagram.nodes[editor.selectedNodeIds[0]] && (
        <IsoOriginHud
          node={diagram.nodes[editor.selectedNodeIds[0]]}
          name={diagram.nodeData[editor.selectedNodeIds[0]]?.name}
          onChange={(updates) => actions.updateNodePosition(editor.selectedNodeIds[0], updates)}
        />
      )}

      <CanvasContextMenu menu={ctxMenu} onClose={closeCtxMenu} />
    </div>
  )
}
