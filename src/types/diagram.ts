// Arc Diagram Types
// Shared format for the Arc editor and diagram consumers

import type { NodeShape } from '../utils/nodeShape'

export type { NodeShape }

export type NodeSize = 'xs' | 's' | 'm' | 'l'

export type AnchorPosition =
  | 'left' | 'right' | 'top' | 'bottom'
  | 'bottomLeft' | 'bottomRight' | 'topLeft' | 'topRight'

export type DiagramColor =
  | 'violet' | 'emerald' | 'blue' | 'amber'
  | 'sky' | 'zinc' | 'rose' | 'orange'

/**
 * Semantic role for a node. When set, `icon` and `color` may be omitted —
 * NODE_KIND_DEFAULTS supplies them — and every renderer resolves the kind
 * through the theme palette the same way an authored `color` resolves.
 */
export type NodeKind =
  | 'frontend' | 'backend' | 'service'
  | 'database' | 'cache' | 'queue' | 'storage'
  | 'gateway' | 'security' | 'user'
  | 'external' | 'observability'

export interface NodePosition {
  x: number
  y: number
  size: NodeSize
  /** Custom rendered dimensions; when present they override the size preset. */
  width?: number
  height?: number
  /** Isometric elevation above the floor plane. */
  z?: number
  /** Isometric box height. */
  isoHeight?: number
  /** Isometric box depth (Y in iso space). */
  isoDepth?: number
  /** Painter's-algorithm bias when two iso boxes occupy the same volume. */
  isoOrder?: number
  /** Top-face label axis. Omit / `auto` = along the longer edge. */
  isoLabelDir?: 'auto' | 'x' | 'y'
  /** Rotate the printed iso label 180° on the face. */
  isoLabelFlip?: boolean
  /** Typeface for the printed iso label. Omit / `theme` follows the diagram brand. */
  isoLabelFont?: 'theme' | 'ui' | 'mono'
}

/**
 * A pointer into the codebase this node describes. Lets a diagram cite the
 * code it models, so docs and agents can jump — or check staleness — at the
 * recorded `commit`.
 */
export interface DiagramSource {
  /** Repo-relative path, e.g. `src/auth/session.ts`. */
  path: string
  /** 1-based first line. */
  line?: number
  /** 1-based last line when the reference spans a range. */
  endLine?: number
  /** Commit SHA the reference was written against. */
  commit?: string
}

export interface NodeData {
  /** Lucide icon name. Omit when `kind` supplies the default icon. */
  icon?: string
  name: string
  subtitle?: string
  description?: string
  /** Palette color. Omit when `kind` supplies the default color. */
  color?: DiagramColor
  /** Semantic role — supplies default `icon` and `color`; explicit fields still win. */
  kind?: NodeKind
  /** Per-node silhouette. Omit to follow the theme's own node shape. */
  shape?: NodeShape
  /** Code this node describes — see `sourceUrl`/`sourceLabel` in utils/sourceRef. */
  source?: DiagramSource
}

export type ConnectorCurve = 'natural' | 'down' | 'up' | 'step' | 'direct'

export type ArrowHead = 'none' | 'arrow' | 'open' | 'dot' | 'diamond' | 'bar' | 'dart'

export type ConnectorLineStyle = 'solid' | 'dashed' | 'dotted'

export interface Connector {
  /**
   * Stable identity for diffs, deep links, and diagnostics. Without it a
   * connector is only addressable by `from`/`to` pair or array index, which
   * breaks under reordering and parallel edges.
   */
  id?: string
  from: string
  to: string
  fromAnchor: AnchorPosition
  toAnchor: AnchorPosition
  style: string
  curve?: ConnectorCurve
  /** Bezier control-point scale for curved connectors (percent of distance). */
  curveDepth?: number
  /** Label drawn beside this connector; overrides the style's `label`. */
  label?: string
  /** Relationship kind ('custom' by default). Inspector metadata. */
  kind?: string
  /** Role annotation drawn near the `from` end, e.g. "owner 1". */
  fromRole?: string
  /** Role annotation drawn near the `to` end, e.g. "items 0..*". */
  toRole?: string
}

/**
 * Stable identity for a connector: its authored `id`, else the `from→to`
 * pair. Parallel edges between the same endpoints collide without `id`.
 */
export function connectorKey(connector: Pick<Connector, 'from' | 'to' | 'id'>): string {
  return connector.id ?? `${connector.from}->${connector.to}`
}

export type LabelAlign = 'left' | 'right' | 'center'

export interface ConnectorStyle {
  /** Omit for 'auto' — renderers fall back to the theme's neutral stroke. */
  color?: DiagramColor
  /** Omit for 'auto' — renderers use a 2px stroke. */
  strokeWidth?: number
  label?: string
  /** For vertical connectors, `right`/`left` places the label beside the line. */
  labelAlign?: LabelAlign
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
  /** When true, arrowhead size scales with `strokeWidth` ("sizes follow .width"). */
  arrowScale?: boolean
}

export interface DiagramLayout {
  width: number
  height: number
}

export interface GridConfig {
  enabled: boolean
  size: number
  color: string
  opacity: number
  type: 'dots' | 'lines'
}

export interface GroupShape {
  id: string
  x: number
  y: number
  width: number
  height: number
  type: 'rect' | 'circle'
  color: DiagramColor
  label?: string
  dashed?: boolean
}

export interface FocusConnectorRef {
  /** Pins a specific connector by `Connector.id` — survives reordering and parallel edges. */
  id?: string
  /** Endpoint-pair matching, used when `id` is absent. Ambiguous on parallel edges. */
  from?: string
  to?: string
}

/** Direction a flow leg traverses its connector. */
export type FlowDirection = 'forward' | 'reverse'

/** Per-interval animation easing for the moving marker. */
export type FlowEasing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'

/** Marker shape riding a flow route. `packet` and `arrow` orient to travel. */
export type FlowMarker = 'dot' | 'packet' | 'pulse' | 'arrow'

/** Motion trail treatment. `fade` shows trailing ghosts; `wake` also traces the route. */
export type FlowTrail = 'none' | 'fade' | 'wake'

/** One connector leg in a flow route. `id` pins a connector; `from`/`to` match
 *  an endpoint pair when no stable id exists. `direction` overrides the flow's
 *  own direction for this leg; `pause` is seconds spent under the destination
 *  node before continuing to the next leg. */
export interface DiagramFlowLeg extends FocusConnectorRef {
  direction?: FlowDirection
  pause?: number
}

/** A message or packet travelling an ordered connector route. Renderers draw
 *  the marker beneath nodes, so node-to-node handoffs read as a single trip. */
export interface DiagramFlow {
  /** Stable flow id for diagnostics and tooling. */
  id: string
  /** Optional caption shown near the route. */
  label?: string
  /** Ordered connector legs; each leg may travel a connector in reverse. */
  legs: DiagramFlowLeg[]
  /** Default leg direction (default: 'forward'). */
  direction?: FlowDirection
  /** Route pixels per second (default: 160). Ignored when `duration` is set. */
  speed?: number
  /** Total route seconds including inter-node pauses; overrides `speed`. */
  duration?: number
  /** Seconds before the first run (default: 0). */
  delay?: number
  /** Seconds hidden at the end of each run before repeating (default: 0). */
  hold?: number
  /** Repeat count, or 'indefinite' for a looping SVG/player (default). */
  repeat?: number | 'indefinite'
  /** Marker easing across each leg (default: 'linear'). */
  easing?: FlowEasing
  /** Marker treatment (default: 'dot'). */
  marker?: FlowMarker
  /** Palette color; defaults to the first connector's style color. */
  color?: DiagramColor
  /** Marker diameter in px (default: 10). */
  size?: number
  /** Motion trail treatment (default: 'none'). */
  trail?: FlowTrail
}

export interface FocusStep {
  icon: string
  label: string
}

/** A declarative highlight story activated by hovering or selecting a node. */
export interface FocusTarget {
  /** `append` includes direct neighbors; `replace` uses only the explicit story. */
  mode?: 'append' | 'replace'
  nodes?: string[]
  connectors?: FocusConnectorRef[]
  caption?: string
  steps?: FocusStep[]
}

/**
 * A named stop in a guided tour. `views[]` turns a diagram into a document:
 * an ordered set of camera/highlight states the reader can step through, and
 * each `id` is stable enough to deep-link (`/player/<session>?view=<id>`).
 */
export interface DiagramView {
  /** Stable slug — used by deep links and the views rail. */
  id: string
  /** Chapter title shown in the rail. */
  title: string
  /** Anchor node — behaves like selecting it, including its focusTarget story
   *  unless the view overrides the highlight set. */
  node?: string
  /** `append` adds direct neighbors of `node`; `replace` draws only the
   *  declared set. Views without `node` always behave as `replace`. */
  mode?: 'append' | 'replace'
  nodes?: string[]
  connectors?: FocusConnectorRef[]
  caption?: string
  steps?: FocusStep[]
}

export type LayoutAlignment = 'start' | 'center' | 'end'
export type GroupLayoutDirection = 'horizontal' | 'vertical'

/** Optional placement hints used by autoLayout when nodes belong to groups. */
export interface NodeLayoutHint {
  /** ID of the group frame that owns this node. */
  group?: string
  /** Explicit layer within the group. Connected nodes are layered automatically otherwise. */
  layer?: number
  /** Stable ordering within a layer. Lower values render first. */
  order?: number
}

/** Layout policy for the nodes inside one group frame. */
export interface GroupLayoutHint {
  /** `horizontal` lays layers left-to-right; `vertical` lays them top-to-bottom. */
  direction?: GroupLayoutDirection
  padding?: number
  layerGap?: number
  itemGap?: number
  align?: LayoutAlignment
  justify?: LayoutAlignment | 'space-between'
}

export interface LayoutHints {
  nodes?: Record<string, NodeLayoutHint>
  groups?: Record<string, GroupLayoutHint>
}

export interface DiagramImage {
  id: string
  src: string
  name: string
  x: number
  y: number
  width: number
  height: number
  opacity: number
}

export interface ExportZone {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Legend policy for the edge/group key. `auto` lists the connector styles
 * actually used plus labelled groups; `all` lists every connector style
 * (used or not); `hidden` never shows the key.
 */
export type LegendMode = 'auto' | 'all' | 'hidden'

/**
 * Viewer/editor display state saved alongside the diagram in a file (the
 * `_meta` key). Never affects geometry, structure validation, or diffs —
 * the editor strips it into `diagramMeta` at load and writes it back at save.
 */
export interface FileMeta {
  themeId?: string
  colorMode?: 'light' | 'dark'
  viewMode?: string
  isoStyle?: string
  viewport?: { width: number; height: number }
  sourceUrl?: string
  /** BCP-47 locale tag, e.g. `en`, `fr`, `ar` — viewer `lang`/`dir` + Intl formatting. */
  locale?: string
}

// Full diagram format (internal Arc state)
export interface ArcDiagram {
  layout: DiagramLayout
  grid: GridConfig
  /** Authored legend policy; a viewer prop can still override it. */
  legend?: LegendMode
  /** Viewer/editor display state saved with the file — see `FileMeta`. */
  _meta?: FileMeta
  layoutHints?: LayoutHints
  nodes: Record<string, NodePosition>
  nodeData: Record<string, NodeData>
  connectors: Connector[]
  connectorStyles: Record<string, ConnectorStyle>
  groups?: GroupShape[]
  focusTargets?: Record<string, FocusTarget>
  /** Ordered guided views — the chapter rail in the player. */
  views?: DiagramView[]
  /** Animated message/packet routes across connectors. */
  flows?: DiagramFlow[]
  images?: DiagramImage[]
  exportZone?: ExportZone | null
}

// Clean export format (for consumers)
export interface ArcDiagramData {
  id?: string
  layout: DiagramLayout
  /** Authored legend policy: 'auto' | 'all' | 'hidden'. */
  legend?: LegendMode
  /** Viewer/editor display state saved with the file — see `FileMeta`. */
  _meta?: FileMeta
  layoutHints?: LayoutHints
  nodes: Record<string, NodePosition>
  nodeData: Record<string, NodeData>
  connectors: Connector[]
  connectorStyles: Record<string, ConnectorStyle>
  focusTargets?: Record<string, FocusTarget>
  views?: DiagramView[]
  /** Animated message/packet routes across connectors. */
  flows?: DiagramFlow[]
  groups?: GroupShape[]
}

// Convert full diagram to clean export format
export function toExportFormat(diagram: ArcDiagram): ArcDiagramData {
  return {
    layout: diagram.layout,
    legend: diagram.legend,
    _meta: diagram._meta,
    layoutHints: diagram.layoutHints,
    nodes: diagram.nodes,
    nodeData: diagram.nodeData,
    connectors: diagram.connectors,
    connectorStyles: diagram.connectorStyles,
    focusTargets: diagram.focusTargets,
    views: diagram.views,
    flows: diagram.flows,
    groups: diagram.groups,
  }
}

// Generate TypeScript source file content
export function toTypeScriptSource(diagram: ArcDiagram, name: string = 'diagram'): string {
  const data = toExportFormat(diagram)
  const json = JSON.stringify(data, null, 2)
    .replace(/"([^"]+)":/g, '$1:') // Remove quotes from keys
    .replace(/"/g, "'") // Use single quotes

  return `import type { ArcDiagramData } from '@hudsonkit/arc'

const ${name}: ArcDiagramData = ${json}

export default ${name}
`
}
