// @hudsonkit/arc - Declarative architecture diagram renderer
export { ArcDiagram, default } from './ArcDiagram'
export type {
  ArcDiagramProps,
  ArcDiagramData,
  DiagramLayout,
  NodePosition,
  NodeData,
  NodeSize,
  Connector,
  ConnectorStyle,
  AnchorPosition,
  DiagramColor,
  DiagramMode,
  LabelAlign,
  HoverEffectsConfig,
} from './ArcDiagram'

export {
  getTheme,
  getThemeList,
  THEMES,
  DEFAULT_THEME,
} from './themes'
export type {
  ThemeId,
  Theme,
  ThemeBackground,
  ColorPalette,
} from './themes'

// Auto-layout
export { autoLayout, createAutoLayout } from './autoLayout'
export type { LayoutOptions, AutoDiagramInput } from './autoLayout'

// Mermaid architecture projection compatibility adapter
export { importMermaid } from './importMermaid'
export type { MermaidImportOptions, MermaidImportResult } from './importMermaid'

// Native Mermaid documents and family renderers
export * from './mermaid/index'
