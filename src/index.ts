/**
 * Arc - Visual diagram editor for creating architecture diagrams
 *
 * @package @hudsonkit/arc
 */

// =============================================================================
// Editor Components
// =============================================================================
export { default as DiagramEditor } from './components/editor/DiagramEditor'
export { default as DiagramCanvas } from './components/editor/DiagramCanvas'
export { EditorProvider, useEditor, useDiagram, useEditorState, useViewMode, useThemeId, useColorMode, useResolvedTheme, useResolvedBrand, useDiagramMeta } from './components/editor/EditorProvider'

// =============================================================================
// Player / Viewer Components
// =============================================================================

// 2D Flow Diagram Player (layout, nodes, nodeData, connectors format)
export {
  default as ArcDiagram,
  type ArcDiagramData,
  type NodeSize,
  type NodePosition as ArcNodePosition,
  type NodeData as ArcNodeData,
  type Connector as ArcConnector,
  type ConnectorStyle as ArcConnectorStyle,
  type DiagramColor,
  type DiagramMode,
  type DiagramLayout,
  type FocusConnectorRef,
  type FocusStep,
  type FocusTarget,
  type DiagramView,
  type GroupShape,
  type LayoutAlignment,
  type GroupLayoutDirection,
  type NodeLayoutHint,
  type GroupLayoutHint,
  type LayoutHints,
  type ThemeId,
  resolveFocusState,
  resolveViewFocus,
} from './components/ArcDiagram'

// Theme utilities
export { THEMES, getTheme, getThemeList, type Theme, type ColorPalette } from './utils/themes'

// 3D Isometric Diagram Player (tiers, floorSize, nodes format)
export { default as ArcDiagramIsometric } from './iso/ArcDiagram'
export { renderToElement, renderToString } from './iso/vanilla'

// =============================================================================
// Isometric Utilities
// =============================================================================
export {
  isoToScreen,
  screenToIsoFloor,
  isoBox,
  isoShading,
  getColorShading,
  isoBoundingBox,
  ISO_COLORS,
} from './utils/isometric'

// =============================================================================
// Config Utilities
// =============================================================================
export { parseYamlConfig, configToYaml } from './utils/yamlConfig'

// =============================================================================
// Auto-Layout
// =============================================================================
export { autoLayout, createAutoLayout, type AutoDiagramInput } from './utils/autoLayout'

// =============================================================================
// ASCII Renderer
// =============================================================================
export { renderAscii, type AsciiOptions } from './utils/asciiRenderer'

// =============================================================================
// Types
// =============================================================================
export type { ViewMode, EmbedConfig, NodePosition, ConnectorStyle, DiagramMeta } from './types/editor'

// =============================================================================
// Diagram Validation, Diff & Export
// =============================================================================
export { validateDiagramShape, isDiagramShape } from './utils/diagramValidation'
export { validateDiagram, type Diagnostic, type DiagnosticSeverity, type DiagnosticSubject, type Fix } from './utils/diagramDiagnostics'
export { NODE_KINDS, NODE_KIND_DEFAULTS, isNodeKind, resolveNodeColor, resolveNodeIcon, suggestKind } from './utils/nodeKinds'
export { toTypeScriptSource, toExportFormat, connectorKey } from './types/diagram'
export type { NodeKind, DiagramSource, LegendMode, FileMeta, DiagramFlow, DiagramFlowLeg, FlowDirection, FlowEasing, FlowMarker, FlowTrail } from './types/diagram'
export { flowAnimationEnd, flowDistanceAt, flowPointAtDistance, flowPositionAt, flowTrailPositionsAt, resolveDiagramFlow, resolveDiagramFlows } from './utils/flowAnimation'
export type { FlowPosition, ResolvedFlow, ResolvedFlowLeg } from './utils/flowAnimation'
export { sourceUrl, sourceLabel } from './utils/sourceRef'
export { isValidLocale, isRtlLocale } from './utils/locale'
export { diffDiagram } from './utils/diffDiagram'
export type { DiagramDelta, RemovedNode, MovedNode, ChangedNode, ConnectorDelta, ChangedConnector, ChangedKeys, ChangedIds } from './utils/diffDiagram'

// =============================================================================
// Session Persistence
// =============================================================================
export { generateSessionId, deriveSessionId, saveDiagramSession, loadDiagramSession, listDiagramSessions, deleteDiagramSession } from './utils/sessionStorage'
export type { DiagramSession } from './utils/sessionStorage'
export type { DiagramConfig, DiagramNode, TierConfig } from './iso/types'
