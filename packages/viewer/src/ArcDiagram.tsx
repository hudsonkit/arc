"use client"
import { HOST_THEME_CSS, colorAlpha } from './theme/host'
import React, { useState, useCallback, useMemo } from 'react'
import * as LucideIcons from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { getTheme, type ThemeId, type Theme } from './themes'
import { autoLayout } from './autoLayout'

// ============================================
// Types
// ============================================

export type NodeSize = 'xs' | 's' | 'm' | 'l'
export type AnchorPosition = 'left' | 'right' | 'top' | 'bottom' | 'bottomLeft' | 'bottomRight' | 'topLeft' | 'topRight'
export type DiagramColor = 'violet' | 'emerald' | 'blue' | 'amber' | 'sky' | 'zinc' | 'rose' | 'orange'

export interface NodePosition {
  x: number
  y: number
  size: NodeSize
}

export interface NodeData {
  icon: string
  name: string
  subtitle?: string
  description?: string
  color: DiagramColor
}

export type ArrowHead = 'none' | 'arrow' | 'open' | 'dot' | 'diamond' | 'bar' | 'dart'

export type ConnectorLineStyle = 'solid' | 'dashed' | 'dotted'

export interface Connector {
  from: string
  to: string
  fromAnchor: AnchorPosition
  toAnchor: AnchorPosition
  style: string
  curve?: 'natural' | 'step' | 'direct' | 'down' | 'up'
  /** Label drawn beside this connector; overrides the style's `label`. */
  label?: string
  /** Relationship kind ('custom' by default). Inspector metadata. */
  kind?: string
  /** Role annotation drawn near the `from` end. */
  fromRole?: string
  /** Role annotation drawn near the `to` end. */
  toRole?: string
}

export type LabelAlign = 'left' | 'right' | 'center'

export interface ConnectorStyle {
  /** Omit for 'auto' — falls back to the theme's neutral stroke. */
  color?: DiagramColor
  /** Omit for 'auto' — renderers use a 2px stroke. */
  strokeWidth?: number
  label?: string
  labelAlign?: LabelAlign  // For vertical: 'right' = right of line, 'left' = left of line. Default: 'right'
  dashed?: boolean
  /** Stroke pattern; when set it takes precedence over `dashed`. */
  lineStyle?: ConnectorLineStyle
  /** Stroke opacity 0–1. */
  opacity?: number
  bidirectional?: boolean
  animated?: boolean
  showArrow?: boolean
  showEndpoints?: boolean
  /** Arrowhead at the `from` end. Omit = `bidirectional ? 'arrow' : 'none'`. */
  fromArrow?: ArrowHead
  /** Arrowhead at the `to` end. Omit = `showArrow === false ? 'none' : 'arrow'`. */
  toArrow?: ArrowHead
  /** Arrowhead length in px. Omit = auto. */
  arrowSize?: number
  /** Per-end size overrides; omit = `arrowSize` then auto. */
  fromArrowSize?: number
  toArrowSize?: number
  /** When true, arrowhead size scales with `strokeWidth`. */
  arrowScale?: boolean
}

export interface DiagramLayout {
  width: number
  height: number
}

export interface ArcDiagramData {
  id?: string
  layout: DiagramLayout
  nodes: Record<string, NodePosition>
  nodeData: Record<string, NodeData>
  connectors: Connector[]
  connectorStyles: Record<string, ConnectorStyle>
}

// ============================================
// Hover Effects
// ============================================

export interface HoverEffectsConfig {
  /** Dim unrelated nodes/connectors. Default: true */
  dim?: boolean
  /** 0–1 opacity for dimmed nodes. Connectors dim to ~56% of this. Default: 0.45 */
  dimOpacity?: number
  /** Lift hovered node up 2px. Default: true */
  lift?: boolean
  /** Colored glow shadow on hover. Default: true */
  glow?: boolean
  /** Thicken connected edges. Default: true */
  highlightEdges?: boolean
}

interface ResolvedHoverEffects {
  enabled: boolean
  dim: boolean
  dimOpacity: number
  connectorDimOpacity: number
  lift: boolean
  glow: boolean
  highlightEdges: boolean
}

function resolveHoverEffects(input?: boolean | HoverEffectsConfig): ResolvedHoverEffects {
  if (input === false) return { enabled: false, dim: false, dimOpacity: 1, connectorDimOpacity: 1, lift: false, glow: false, highlightEdges: false }
  const cfg = typeof input === 'object' ? input : {}
  const dimOpacity = cfg.dimOpacity ?? 0.45
  return {
    enabled: true,
    dim: cfg.dim ?? true,
    dimOpacity,
    connectorDimOpacity: dimOpacity * 0.56,
    lift: cfg.lift ?? true,
    glow: cfg.glow ?? true,
    highlightEdges: cfg.highlightEdges ?? true,
  }
}

// ============================================
// Constants
// ============================================

const NODE_SIZES: Record<NodeSize, { width: number; height: number }> = {
  l: { width: 200, height: 68 },
  m: { width: 140, height: 52 },
  s: { width: 100, height: 40 },
  xs: { width: 36, height: 52 },
}

// Mode = light/dark appearance, Theme = color palette
export type DiagramMode = 'dark' | 'light'
export { type ThemeId } from './themes'

// ============================================
// Components
// ============================================

interface NodeProps {
  node: NodePosition
  data: NodeData
  mode: DiagramMode
  themeColors: Theme['light'] | Theme['dark']
  editable?: boolean
  onDragStart?: (e: React.MouseEvent) => void
  hovered?: boolean
  dimmed?: boolean
  lift?: boolean
  glow?: boolean
  dimOpacity?: number
  onMouseEnter?: () => void
  onMouseLeave?: () => void
  onClick?: () => void
}

function Node({ node, data, mode, themeColors, editable, onDragStart, hovered, dimmed, lift = true, glow = true, dimOpacity = 0.45, onMouseEnter, onMouseLeave, onClick }: NodeProps) {
  const size = NODE_SIZES[node.size]
  const color = themeColors.palette[data.color] || themeColors.palette.zinc
  const Icon = (LucideIcons as unknown as Record<string, LucideIcon>)[data.icon] || LucideIcons.Box

  const isLarge = node.size === 'l'
  const isSmall = node.size === 's'
  const isXs = node.size === 'xs'
  const isLight = mode === 'light'

  const dragProps = editable ? {
    onMouseDown: (e: React.MouseEvent) => { e.stopPropagation(); onDragStart?.(e) },
  } : {}

  const editClass = editable ? 'cursor-move hover:brightness-110' : ''

  // XS: icon-only circle with label underneath
  if (isXs) {
    return (
      <div
        className={`absolute flex flex-col items-center transition-all duration-200 ease-out ${editClass}`}
        style={{
          left: node.x,
          top: node.y,
          width: size.width,
          zIndex: hovered ? 10 : editable ? 1 : undefined,
          transform: hovered && lift ? 'translateY(-2px)' : 'none',
          opacity: dimmed ? dimOpacity : 1,
          cursor: onClick ? 'pointer' : undefined,
        }}
        data-arc-node
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onClick={onClick}
        {...dragProps}
      >
        <div className={`
          rounded-full w-9 h-9 flex items-center justify-center
          ${isLight ? 'bg-white border border-zinc-200/80 shadow-sm' : 'bg-zinc-800/90 border border-zinc-700/60'}
        `}>
          <Icon className={`w-4 h-4 ${color.icon}`} strokeWidth={1.5} />
        </div>
        {data.name && (
          <div className={`mt-1.5 text-center ${themeColors.text.muted} text-[8px] tracking-wide uppercase`}
            style={{ fontFamily: themeColors.text.primary === 'arc-host-foreground' ? 'var(--arc-diagram-font, inherit)' : 'ui-sans-serif, system-ui, sans-serif' }}
          >
            {data.name}
          </div>
        )}
      </div>
    )
  }

  // S/M/L: clean card — icon is inline color dot, not a boxed element
  return (
    <div
      className={`
        absolute rounded-lg border transition-all duration-200 ease-out
        ${isLight
          ? 'bg-white/90 border-zinc-200/70 shadow-sm'
          : 'bg-zinc-900/80 border-zinc-700/50'
        }
        ${editClass}
      `}
      style={{
        left: node.x,
        top: node.y,
        width: size.width,
        zIndex: hovered ? 10 : editable ? 1 : undefined,
        backdropFilter: 'blur(8px)',
        transform: hovered && lift ? 'translateY(-2px)' : 'none',
        boxShadow: hovered && glow
          ? `0 8px 24px -4px ${colorAlpha(color.stroke, '33')}, 0 0 0 1px ${colorAlpha(color.stroke, '22')}`
          : 'none',
        opacity: dimmed ? dimOpacity : 1,
        cursor: onClick ? 'pointer' : undefined,
      }}
      data-arc-node
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
      {...dragProps}
    >
      {/* Accent top edge */}
      <div
        className="absolute top-0 left-3 right-3 h-[2px] rounded-full"
        style={{ backgroundColor: color.stroke, opacity: 0.6 }}
      />

      <div className={`${isLarge ? 'px-4 py-3' : isSmall ? 'px-2.5 py-1.5' : 'px-3 py-2'}`}>
        <div className="flex items-center gap-2">
          <Icon
            className={`flex-shrink-0 ${isLarge ? 'w-4 h-4' : isSmall ? 'w-3 h-3' : 'w-3.5 h-3.5'}`}
            style={{ color: color.stroke }}
            strokeWidth={1.5}
          />
          <span className={`font-medium ${themeColors.text.primary} ${isLarge ? 'text-[13px]' : isSmall ? 'text-[10px]' : 'text-[11px]'} leading-tight`}>
            {data.name}
          </span>
        </div>
        {data.subtitle && (
          <div className={`${themeColors.text.muted} ${isSmall ? 'text-[8px] mt-0.5' : 'text-[9px] mt-1'} leading-tight`}
            style={{ fontFamily: themeColors.text.primary === 'arc-host-foreground' ? 'var(--arc-diagram-font-mono, ui-monospace, monospace)' : 'ui-monospace, monospace' }}
          >
            {data.subtitle}
          </div>
        )}
        {data.description && !isSmall && (
          <div className={`mt-1 ${themeColors.text.secondary} text-[9px] leading-relaxed`}>
            {data.description}
          </div>
        )}
      </div>
    </div>
  )
}

function getAnchorPoint(node: NodePosition, anchor: AnchorPosition): { x: number; y: number } {
  const size = NODE_SIZES[node.size]
  const gap = 6

  const anchors: Record<AnchorPosition, { x: number; y: number }> = {
    left:        { x: node.x - gap,              y: node.y + size.height / 2 },
    right:       { x: node.x + size.width + gap, y: node.y + size.height / 2 },
    top:         { x: node.x + size.width / 2,   y: node.y - gap },
    bottom:      { x: node.x + size.width / 2,   y: node.y + size.height + gap },
    bottomRight: { x: node.x + size.width + gap, y: node.y + size.height - 12 },
    bottomLeft:  { x: node.x - gap,              y: node.y + size.height - 12 },
    topRight:    { x: node.x + size.width + gap, y: node.y + 12 },
    topLeft:     { x: node.x - gap,              y: node.y + 12 },
  }

  return anchors[anchor]
}

// Calculate angle between two points for arrow rotation
function getAngle(from: { x: number; y: number }, to: { x: number; y: number }): number {
  return Math.atan2(to.y - from.y, to.x - from.x) * (180 / Math.PI)
}

// Arrowhead geometry in local coords: +x is travel direction, origin at tip.
function arrowShapeFor(kind: ArrowHead, size: number): { d?: string; circle?: { cx: number; r: number }; filled: boolean } | null {
  const s = size
  switch (kind) {
    case 'arrow':   return { d: `M 0 0 L ${-s} ${-s / 2.6} L ${-s} ${s / 2.6} Z`, filled: true }
    case 'open':    return { d: `M ${-s} ${-s / 2.4} L 0 0 L ${-s} ${s / 2.4}`, filled: false }
    case 'dart':    return { d: `M 0 0 L ${-s * 1.15} ${-s * 0.55} L ${-s * 0.7} 0 L ${-s * 1.15} ${s * 0.55} Z`, filled: true }
    case 'dot':     return { circle: { cx: -s / 2, r: s / 2.8 }, filled: true }
    case 'diamond': return { d: `M 0 0 L ${-s * 0.5} ${-s * 0.3} L ${-s} 0 L ${-s * 0.5} ${s * 0.3} Z`, filled: true }
    case 'bar':     return { d: `M ${-s * 0.15} ${-s * 0.5} L ${-s * 0.15} ${s * 0.5}`, filled: false }
    default:        return null
  }
}

function arrowAtEnd(style: ConnectorStyle, end: 'from' | 'to'): ArrowHead {
  const explicit = end === 'from' ? style.fromArrow : style.toArrow
  if (explicit) return explicit
  if (end === 'to') return style.showArrow === false ? 'none' : 'arrow'
  return style.bidirectional ? 'arrow' : 'none'
}

function arrowSizeFor(style: ConnectorStyle, end: 'from' | 'to'): number {
  const size = (end === 'from' ? style.fromArrowSize : style.toArrowSize) ?? style.arrowSize
  if (size != null) return size
  if (style.arrowScale) return Math.max(4, (style.strokeWidth ?? 2) * 4)
  return 6
}

interface ConnectorProps {
  connector: Connector
  connectorIndex: number
  nodes: Record<string, NodePosition>
  styles: Record<string, ConnectorStyle>
  themeColors: Theme['light'] | Theme['dark']
  highlighted?: boolean
  dimmed?: boolean
  dimOpacity?: number
}

function ConnectorPath({ connector, connectorIndex, nodes, styles, themeColors, highlighted, dimmed, dimOpacity = 0.25 }: ConnectorProps) {
  const fromNode = nodes[connector.from]
  const toNode = nodes[connector.to]
  if (!fromNode || !toNode) return null

  const style = styles[connector.style] || { color: 'zinc' as const }
  const from = getAnchorPoint(fromNode, connector.fromAnchor)
  const to = getAnchorPoint(toNode, connector.toAnchor)
  const color = themeColors.palette[style.color ?? 'zinc']?.stroke || themeColors.palette.zinc.stroke
  const strokeWidth = style.strokeWidth ?? 2
  const styleOpacity = style.opacity ?? 1
  const lineStyle = style.lineStyle ?? (style.dashed ? 'dashed' : 'solid')
  const labelText = connector.label ?? style.label
  const gradientId = `connector-gradient-${connectorIndex}`

  // Calculate path
  let path: string
  const isVertical = Math.abs(to.y - from.y) > Math.abs(to.x - from.x)
  const labelAlign = style.labelAlign || (isVertical ? 'right' : 'center')

  // Label positioning
  let labelPos: { x: number; y: number }
  let labelOffset = { x: 0, y: 0 }
  let textAnchor: 'start' | 'middle' | 'end' = 'middle'

  // Always use smooth bezier curves unless explicitly step
  const dx = to.x - from.x
  const dy = to.y - from.y

  if (connector.curve === 'step') {
    // Orthogonal step path
    const midX = from.x + dx / 2
    path = `M ${from.x} ${from.y} L ${midX} ${from.y} L ${midX} ${to.y} L ${to.x} ${to.y}`
  } else if (connector.curve === 'direct') {
    path = `M ${from.x} ${from.y} L ${to.x} ${to.y}`
  } else {
    // Smooth bezier — control points follow the dominant axis
    const tension = 0.5
    if (isVertical) {
      const cpy = dy * tension
      path = `M ${from.x} ${from.y} C ${from.x} ${from.y + cpy}, ${to.x} ${to.y - cpy}, ${to.x} ${to.y}`
    } else {
      const cpx = dx * tension
      path = `M ${from.x} ${from.y} C ${from.x + cpx} ${from.y}, ${to.x - cpx} ${to.y}, ${to.x} ${to.y}`
    }
  }

  labelPos = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }

  if (isVertical) {
    if (labelAlign === 'right') {
      labelOffset = { x: 8, y: 4 }
      textAnchor = 'start'
    } else if (labelAlign === 'left') {
      labelOffset = { x: -8, y: 4 }
      textAnchor = 'end'
    } else {
      labelOffset = { x: 0, y: -8 }
      textAnchor = 'middle'
    }
  } else {
    labelOffset = { x: 0, y: -8 }
    textAnchor = 'middle'
  }

  // Arrow angle at each endpoint
  const angle = getAngle(from, to)
  const fromArrow = arrowAtEnd(style, 'from')
  const toArrow = arrowAtEnd(style, 'to')

  const renderEnd = (kind: ArrowHead, x: number, y: number, deg: number, end: 'from' | 'to') => {
    const shape = arrowShapeFor(kind, arrowSizeFor(style, end))
    if (!shape) return null
    return (
      <g transform={`translate(${x}, ${y}) rotate(${deg})`}>
        {shape.circle ? (
          <circle cx={shape.circle.cx} cy={0} r={shape.circle.r} fill={color} />
        ) : (
          <path
            d={shape.d!}
            fill={shape.filled ? color : 'none'}
            stroke={shape.filled ? undefined : color}
            strokeWidth={Math.max(1, strokeWidth * 0.85)}
            strokeOpacity={0.9}
            strokeLinecap="square"
            strokeLinejoin="miter"
          />
        )}
      </g>
    )
  }

  return (
    <g style={{
      opacity: (dimmed ? dimOpacity : 1) * styleOpacity,
      transition: 'opacity 200ms ease-out',
    }}>
      {/* Gradient definition - fades at both ends */}
      <defs>
        <linearGradient
          id={gradientId}
          x1={from.x}
          y1={from.y}
          x2={to.x}
          y2={to.y}
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor={color} stopOpacity={highlighted ? 0.6 : 0.4} />
          <stop offset="10%" stopColor={color} stopOpacity={highlighted ? 0.9 : 0.7} />
          <stop offset="90%" stopColor={color} stopOpacity={highlighted ? 0.9 : 0.7} />
          <stop offset="100%" stopColor={color} stopOpacity={highlighted ? 0.6 : 0.4} />
        </linearGradient>
      </defs>

      {/* Main path with gradient */}
      <path
        d={path}
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth={highlighted ? strokeWidth + 1 : strokeWidth}
        strokeDasharray={lineStyle === 'dashed' ? '6 3' : lineStyle === 'dotted' ? '0.1 6' : undefined}
        strokeLinecap="round"
        style={{ transition: 'stroke-width 200ms ease-out' }}
      />

      {/* End glyphs — arrow/open/dot/diamond/bar at each end */}
      {renderEnd(fromArrow, from.x, from.y, angle + 180, 'from')}
      {renderEnd(toArrow, to.x, to.y, angle, 'to')}

      {/* Label with background pill */}
      {labelText && (
        <g style={{ transition: 'opacity 200ms ease-out' }}>
          <rect
            x={labelPos.x + labelOffset.x - (textAnchor === 'middle' ? labelText.length * 3.2 : textAnchor === 'end' ? labelText.length * 6.4 : 0) - 4}
            y={labelPos.y + labelOffset.y - 10}
            width={labelText.length * 6.4 + 8}
            height={14}
            rx={4}
            fill={color}
            opacity={highlighted ? 0.3 : 0.15}
          />
          <text
            x={labelPos.x + labelOffset.x}
            y={labelPos.y + labelOffset.y}
            textAnchor={textAnchor}
            fill={color}
            className="text-[9px] font-mono"
            style={{ fontFamily: themeColors.text.primary === 'arc-host-foreground' ? 'var(--arc-diagram-font-mono, ui-monospace, monospace)' : 'ui-monospace, monospace', fontWeight: highlighted ? 700 : 500 }}
          >
            {labelText}
          </text>
        </g>
      )}

      {/* Relationship role annotations near each end */}
      {connector.fromRole && (
        <text x={from.x + Math.cos(((angle + 0) * Math.PI) / 180) * 20} y={from.y + Math.sin((angle * Math.PI) / 180) * 20 + 10} textAnchor="middle" fill={color} fontSize="7.5" fontFamily={themeColors.text.primary === 'arc-host-foreground' ? 'var(--arc-diagram-font-mono, ui-monospace, monospace)' : 'ui-monospace, monospace'} opacity={0.6}>
          {connector.fromRole}
        </text>
      )}
      {connector.toRole && (
        <text x={to.x - Math.cos((angle * Math.PI) / 180) * 20} y={to.y - Math.sin((angle * Math.PI) / 180) * 20 + 10} textAnchor="middle" fill={color} fontSize="7.5" fontFamily={themeColors.text.primary === 'arc-host-foreground' ? 'var(--arc-diagram-font-mono, ui-monospace, monospace)' : 'ui-monospace, monospace'} opacity={0.6}>
          {connector.toRole}
        </text>
      )}
    </g>
  )
}

// ============================================
// Zoom Controls
// ============================================

const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2]

interface ZoomControlsProps {
  zoom: number
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
  mode: DiagramMode
}

function ZoomControls({ zoom, onZoomIn, onZoomOut, onReset, mode }: ZoomControlsProps) {
  const { ZoomIn, ZoomOut } = LucideIcons
  const isLight = mode === 'light'

  return (
    <div className={`absolute bottom-3 right-3 flex items-center backdrop-blur-sm rounded-md z-10 ${
      isLight
        ? 'bg-white/90 border border-zinc-200 shadow-sm'
        : 'bg-zinc-900/90 border border-zinc-700'
    }`}>
      <button
        onClick={onZoomOut}
        disabled={zoom <= ZOOM_LEVELS[0]}
        className={`p-1 disabled:opacity-30 disabled:cursor-not-allowed transition-colors rounded-l-md ${
          isLight ? 'hover:bg-zinc-100' : 'hover:bg-zinc-700'
        }`}
        title="Zoom out"
      >
        <ZoomOut className={`w-3 h-3 ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`} />
      </button>
      <button
        onClick={onReset}
        className={`px-1.5 py-1 text-[9px] font-mono transition-colors min-w-[36px] ${
          isLight
            ? 'text-zinc-500 hover:bg-zinc-100 border-x border-zinc-200'
            : 'text-zinc-400 hover:bg-zinc-700 border-x border-zinc-700'
        }`}
        title="Reset zoom"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        onClick={onZoomIn}
        disabled={zoom >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
        className={`p-1 disabled:opacity-30 disabled:cursor-not-allowed transition-colors rounded-r-md ${
          isLight ? 'hover:bg-zinc-100' : 'hover:bg-zinc-700'
        }`}
        title="Zoom in"
      >
        <ZoomIn className={`w-3 h-3 ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`} />
      </button>
    </div>
  )
}

// ============================================
// .arc View & Controls
// ============================================

function generateSource(data: ArcDiagramData): string {
  const clean = {
    id: data.id,
    layout: data.layout,
    nodes: data.nodes,
    nodeData: data.nodeData,
    connectors: data.connectors,
    connectorStyles: data.connectorStyles,
  }
  const json = JSON.stringify(clean, null, 2)
    .replace(/"([^"]+)":/g, '$1:')
    .replace(/"/g, "'")

  return `import type { ArcDiagramData } from '@hudsonkit/arc'\n\nconst diagram: ArcDiagramData = ${json}\n\nexport default diagram\n`
}

function ArcSourceView({ source, mode }: {
  source: string
  mode: DiagramMode
}) {
  const isLight = mode === 'light'
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(source).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [source])

  const { Copy, Check } = LucideIcons

  return (
    <div className="absolute inset-0 overflow-auto z-[5]" style={{
      backgroundColor: isLight ? 'rgba(250,250,250,0.97)' : 'rgba(9,9,11,0.97)',
    }}>
      <div className="flex items-center justify-end gap-1 px-4 pt-3">
        <button
          onClick={handleCopy}
          className={`p-1 rounded transition-colors ${
            isLight
              ? 'hover:bg-zinc-200/60 text-zinc-400'
              : 'hover:bg-zinc-700/60 text-zinc-500'
          }`}
          title={copied ? 'Copied!' : 'Copy'}
        >
          {copied
            ? <Check className="w-3 h-3 text-emerald-500" />
            : <Copy className="w-3 h-3" />
          }
        </button>
      </div>
      <pre
        className={`px-5 pb-5 pt-2 text-[11px] leading-relaxed font-mono whitespace-pre ${
          isLight ? 'text-zinc-600' : 'text-zinc-400'
        }`}
        style={{ fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", Consolas, monospace', tabSize: 2 }}
      >
        {source}
      </pre>
    </div>
  )
}

function ViewToggle({ showArc, onToggle, mode }: {
  showArc: boolean
  onToggle: () => void
  mode: DiagramMode
}) {
  const isLight = mode === 'light'
  const { Braces, Layers } = LucideIcons

  return (
    <button
      onClick={onToggle}
      className={`absolute top-3 right-3 flex items-center gap-1.5 px-2 py-1 rounded-md backdrop-blur-sm z-10 text-[10px] font-mono transition-colors ${
        isLight
          ? 'bg-white/90 border border-zinc-200 shadow-sm text-zinc-500 hover:text-zinc-700 hover:bg-zinc-50'
          : 'bg-zinc-900/90 border border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
      }`}
      title={showArc ? 'Back to diagram' : 'View source'}
    >
      {showArc
        ? <><Layers className="w-3 h-3" /> Diagram</>
        : <><Braces className="w-3 h-3" /> Source</>
      }
    </button>
  )
}

function AutoLayoutButton({ active, onToggle, mode }: {
  active: boolean
  onToggle: () => void
  mode: DiagramMode
}) {
  const isLight = mode === 'light'
  const { Wand2 } = LucideIcons

  return (
    <button
      onClick={onToggle}
      className={`flex items-center gap-1.5 px-2 py-1 rounded-md backdrop-blur-sm text-[10px] font-mono transition-colors ${
        active
          ? isLight
            ? 'bg-violet-50 border border-violet-200 text-violet-600 shadow-sm'
            : 'bg-violet-950/80 border border-violet-700 text-violet-400'
          : isLight
            ? 'bg-white/90 border border-zinc-200 shadow-sm text-zinc-500 hover:text-zinc-700 hover:bg-zinc-50'
            : 'bg-zinc-900/90 border border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
      }`}
      title={active ? 'Reset to original layout' : 'Auto-layout nodes'}
    >
      <Wand2 className="w-3 h-3" /> Auto
    </button>
  )
}

function EditButton({ url, mode }: { url: string; mode: DiagramMode }) {
  const isLight = mode === 'light'
  const { Pencil } = LucideIcons

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex items-center gap-1.5 px-2 py-1 rounded-md backdrop-blur-sm text-[10px] font-mono transition-colors no-underline ${
        isLight
          ? 'bg-white/90 border border-zinc-200 shadow-sm text-zinc-500 hover:text-zinc-700 hover:bg-zinc-50'
          : 'bg-zinc-900/90 border border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
      }`}
      title="Open in Arc editor"
    >
      <Pencil className="w-3 h-3" /> Edit
    </a>
  )
}

// ============================================
// Main Component
// ============================================

export interface ArcDiagramProps {
  data: ArcDiagramData
  className?: string
  interactive?: boolean  // Enable zoom/pan controls
  mode?: DiagramMode     // Light/dark appearance
  theme?: ThemeId        // Color palette theme
  /** Show the source toggle button. Default: true */
  showArcToggle?: boolean
  /** Show the auto-layout button. Default: false */
  showAutoLayout?: boolean
  /** Enable drag-to-reposition nodes. Default: false */
  editable?: boolean
  /** URL of the Arc editor. When set with editable, shows an "Edit" button. */
  editorUrl?: string
  /** Metadata to pass to the editor (viewport size, theme, mode). */
  editorMeta?: { viewport?: { width: number; height: number }; theme?: string; mode?: string }
  /** Control hover behavior. true = all effects (default), false = none, object = granular control */
  hoverEffects?: boolean | HoverEffectsConfig
  /** Called when a node is hovered/clicked (nodeId) or released (null) */
  onNodeHover?: (nodeId: string | null) => void
}

export function ArcDiagram({ data, className = '', interactive = true, mode = 'dark', theme = 'default', showArcToggle = true, showAutoLayout = false, editable = false, editorUrl, editorMeta, hoverEffects, onNodeHover }: ArcDiagramProps) {
  const isLight = mode === 'light'
  const [showArc, setShowArc] = useState(false)
  const [useAutoLayout, setUseAutoLayout] = useState(false)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [lockedNodeId, setLockedNodeId] = useState<string | null>(null)
  const fx = useMemo(() => resolveHoverEffects(hoverEffects), [hoverEffects])

  // Active node = locked takes priority over hovered
  const activeNodeId = fx.enabled ? (lockedNodeId ?? hoveredNodeId) : null

  // Click-to-lock: clicking a node locks the highlight, clicking background or same node unlocks
  const handleNodeClick = useCallback((nodeId: string) => {
    setLockedNodeId(prev => {
      const next = prev === nodeId ? null : nodeId
      onNodeHover?.(next)
      return next
    })
  }, [onNodeHover])

  // Apply auto-layout if toggled
  const baseData = useMemo(
    () => useAutoLayout ? autoLayout(data) : data,
    [data, useAutoLayout],
  )

  // Persistence key for localStorage
  const storageKey = editable && data.id ? `arc-drag-${data.id}` : null

  // Editable node positions — override base positions when dragged
  const [draggedPositions, setDraggedPositions] = useState<Record<string, { x: number; y: number }>>(() => {
    if (!storageKey) return {}
    try {
      const saved = localStorage.getItem(storageKey)
      return saved ? JSON.parse(saved) : {}
    } catch { return {} }
  })
  const [draggingNode, setDraggingNode] = useState<{ id: string; startX: number; startY: number; nodeX: number; nodeY: number } | null>(null)

  // Persist dragged positions to localStorage
  React.useEffect(() => {
    if (!storageKey) return
    if (Object.keys(draggedPositions).length === 0) {
      localStorage.removeItem(storageKey)
    } else {
      localStorage.setItem(storageKey, JSON.stringify(draggedPositions))
    }
  }, [draggedPositions, storageKey])

  // Reset dragged positions when auto-layout toggled
  React.useEffect(() => {
    setDraggedPositions({})
  }, [useAutoLayout])

  // Merge dragged positions into active data
  const activeData = useMemo(() => {
    if (Object.keys(draggedPositions).length === 0) return baseData
    const mergedNodes = { ...baseData.nodes }
    for (const [id, pos] of Object.entries(draggedPositions)) {
      if (mergedNodes[id]) {
        mergedNodes[id] = { ...mergedNodes[id], x: pos.x, y: pos.y }
      }
    }
    return { ...baseData, nodes: mergedNodes }
  }, [baseData, draggedPositions])

  const { id, layout, nodes, nodeData, connectors, connectorStyles } = activeData

  // Resolve theme colors based on mode
  const themeData = getTheme(theme)
  const themeColors = isLight ? themeData.light : themeData.dark

  // Generate source from the active data (reflects dragged positions)
  const sourceCode = useMemo(() => generateSource(activeData), [activeData])

  // Zoom & pan state
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, y: 0 })

  const handleZoomIn = useCallback(() => {
    setZoom(z => {
      const idx = ZOOM_LEVELS.findIndex(l => l >= z)
      return ZOOM_LEVELS[Math.min(idx + 1, ZOOM_LEVELS.length - 1)]
    })
  }, [])

  const handleZoomOut = useCallback(() => {
    setZoom(z => {
      const idx = ZOOM_LEVELS.findIndex(l => l >= z)
      return ZOOM_LEVELS[Math.max(idx - 1, 0)]
    })
  }, [])

  const handleReset = useCallback(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!interactive) return
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      if (e.deltaY < 0) handleZoomIn()
      else handleZoomOut()
    }
  }, [interactive, handleZoomIn, handleZoomOut])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!interactive || draggingNode) return
    // Clicking background clears locked node
    if (lockedNodeId && (e.target as HTMLElement).closest('[data-arc-node]') === null) {
      setLockedNodeId(null)
      onNodeHover?.(null)
    }
    setIsPanning(true)
    setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
  }, [interactive, pan, draggingNode, lockedNodeId, onNodeHover])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (draggingNode) {
      const dx = (e.clientX - draggingNode.startX) / zoom
      const dy = (e.clientY - draggingNode.startY) / zoom
      setDraggedPositions(prev => ({
        ...prev,
        [draggingNode.id]: {
          x: Math.round(draggingNode.nodeX + dx),
          y: Math.round(draggingNode.nodeY + dy),
        },
      }))
      return
    }
    if (!isPanning) return
    setPan({
      x: e.clientX - panStart.x,
      y: e.clientY - panStart.y,
    })
  }, [isPanning, panStart, draggingNode, zoom])

  const handleMouseUp = useCallback(() => {
    setIsPanning(false)
    setDraggingNode(null)
  }, [])

  return (
    <div
      data-arc-theme={theme}
      className={`rounded-2xl overflow-hidden relative ${themeColors.background.container} ${className}`}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{ cursor: draggingNode ? 'grabbing' : interactive ? (isPanning ? 'grabbing' : 'grab') : 'default' }}
    >
      {theme === 'inherit' && <style>{HOST_THEME_CSS}</style>}
      <div
        className="relative transition-transform duration-150 ease-out"
        style={{
          width: layout.width,
          height: layout.height,
          minWidth: layout.width,
          transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
          transformOrigin: 'top left',
        }}
      >
        {/* Grid background - extends beyond content for pan */}
        <div
          className="absolute"
          style={{
            top: -2000,
            left: -2000,
            width: layout.width + 4000,
            height: layout.height + 4000,
            backgroundImage: `radial-gradient(circle, ${themeColors.background.grid.color} 1px, transparent 1px)`,
            backgroundSize: `${themeColors.background.grid.size}px ${themeColors.background.grid.size}px`,
            opacity: themeColors.background.grid.opacity,
          }}
        />

        {/* Connectors */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox={`0 0 ${layout.width} ${layout.height}`}
        >
          {connectors.map((conn, i) => {
            const isConnected = activeNodeId != null && (conn.from === activeNodeId || conn.to === activeNodeId)
            return (
              <ConnectorPath
                key={i}
                connector={conn}
                connectorIndex={i}
                nodes={nodes}
                styles={connectorStyles}
                themeColors={themeColors}
                highlighted={fx.highlightEdges && isConnected}
                dimmed={fx.dim && activeNodeId != null && !isConnected}
                dimOpacity={fx.connectorDimOpacity}
              />
            )
          })}
        </svg>

        {/* Nodes */}
        {Object.entries(nodes).map(([nodeId, node]) => {
          const isActive = activeNodeId === nodeId
          return (
            <Node
              key={nodeId}
              node={node}
              data={nodeData[nodeId]}
              mode={mode}
              themeColors={themeColors}
              editable={editable}
              onDragStart={editable ? (e: React.MouseEvent) => {
                setDraggingNode({ id: nodeId, startX: e.clientX, startY: e.clientY, nodeX: node.x, nodeY: node.y })
              } : undefined}
              hovered={isActive}
              dimmed={fx.dim && activeNodeId != null && !isActive}
              lift={fx.lift}
              glow={fx.glow}
              dimOpacity={fx.dimOpacity}
              onMouseEnter={() => { if (!lockedNodeId) { setHoveredNodeId(nodeId); onNodeHover?.(nodeId) } }}
              onMouseLeave={() => { if (!lockedNodeId) { setHoveredNodeId(null); onNodeHover?.(null) } }}
              onClick={() => handleNodeClick(nodeId)}
            />
          )
        })}
      </div>

      {/* Viewer chrome - fixed position regardless of zoom/pan */}

      {/* .arc source overlay */}
      {showArc && (
        <ArcSourceView source={sourceCode} mode={mode} />
      )}

      {/* .arc toggle - top right */}
      {showArcToggle && (
        <ViewToggle
          showArc={showArc}
          onToggle={() => setShowArc(s => !s)}
          mode={mode}
        />
      )}

      {/* Top-left controls */}
      {!showArc && (
        <div className="absolute top-3 left-3 flex items-center gap-1.5 z-10">
          {showAutoLayout && (
            <AutoLayoutButton
              active={useAutoLayout}
              onToggle={() => setUseAutoLayout(v => !v)}
              mode={mode}
            />
          )}
          {editable && editorUrl && (
            <EditButton url={`${editorUrl}#data=${btoa(JSON.stringify({ ...activeData, _viewport: editorMeta?.viewport, _theme: editorMeta?.theme, _mode: editorMeta?.mode }))}`} mode={mode} />
          )}
        </div>
      )}

      {/* Diagram ID - bottom left */}
      {id && (
        <div className={`absolute bottom-3 left-3 font-mono text-[9px] tracking-wider z-10 ${themeColors.text.muted}`}>
          {id}
        </div>
      )}

      {/* Zoom controls - bottom right */}
      {interactive && !showArc && (
        <ZoomControls
          zoom={zoom}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onReset={handleReset}
          mode={mode}
        />
      )}
    </div>
  )
}

export default ArcDiagram
