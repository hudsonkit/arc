/**
 * Arc Isometric - Embeddable isometric diagram renderer
 *
 * Usage:
 *   import { ArcDiagram } from '@hudsonkit/arc-iso'
 *
 *   <ArcDiagram config={diagramConfig} />
 */

// Core rendering
export { isoToScreen, isoBox, getColorShading } from '../utils/isometric'

// React component (for React users)
export { default as ArcDiagram } from './ArcDiagram'

// Vanilla JS renderer (for non-React users)
export { renderToElement, renderToString } from './vanilla'

// Config utilities
export { parseYamlConfig, configToYaml } from '../utils/yamlConfig'

// Types
export type { DiagramConfig, DiagramNode, TierConfig } from './types'
