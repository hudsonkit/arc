import { ArcDiagram } from '@hudsonkit/arc'
import type { ArcDiagramData } from '@hudsonkit/arc'

// Canonical Arc architecture diagram (ported from src/components/diagrams/architecture.diagram.ts)
const architecture: ArcDiagramData = {
  id: 'ARC.ARCH.001',
  layout: { width: 860, height: 400 },
  nodes: {
    editor:    { x: 50,  y: 50,  size: 'l' },
    templates: { x: 70,  y: 200, size: 'm' },
    model:     { x: 340, y: 150, size: 'm' },
    exporters: { x: 340, y: 280, size: 'm' },
    docs:      { x: 600, y: 150, size: 'm' },
  },
  nodeData: {
    editor:    { icon: 'Monitor',  name: 'Arc Editor',    subtitle: 'Canvas UI',      description: 'Drag, connect, style.',     color: 'violet' },
    templates: { icon: 'Grid3X3',  name: 'Templates',     subtitle: 'Themes',         description: 'Palettes, sizes, presets.', color: 'amber' },
    model:     { icon: 'Layers',   name: 'Diagram Model', subtitle: 'JSON / TS',      description: 'Typed, diffable state.',    color: 'blue' },
    exporters: { icon: 'Upload',   name: 'Exporters',     subtitle: 'SVG / PNG / TS', description: 'Outputs for docs & decks.', color: 'emerald' },
    docs:      { icon: 'FileCode', name: 'Docs + Apps',   subtitle: 'Consumers',      description: 'Embed anywhere.',           color: 'zinc' },
  },
  connectors: [
    { from: 'editor',    to: 'model',     fromAnchor: 'right',  toAnchor: 'left', style: 'diagram' },
    { from: 'templates', to: 'model',     fromAnchor: 'right',  toAnchor: 'left', style: 'themes' },
    { from: 'model',     to: 'docs',      fromAnchor: 'right',  toAnchor: 'left', style: 'publish' },
    { from: 'model',     to: 'exporters', fromAnchor: 'bottom', toAnchor: 'top',  style: 'export' },
  ],
  connectorStyles: {
    diagram: { color: 'violet',  strokeWidth: 2, label: 'diagram' },
    themes:  { color: 'amber',   strokeWidth: 2, label: 'themes' },
    publish: { color: 'blue',    strokeWidth: 2, label: 'publish' },
    export:  { color: 'emerald', strokeWidth: 2, label: 'export' },
  },
}

function Frame({ children }: { children: React.ReactNode }) {
  return <div style={{ width: 760, height: 360 }}>{children}</div>
}

/** Default dark theme — the canonical Arc architecture diagram. */
export function Default() {
  return <Frame><ArcDiagram data={architecture} mode="dark" theme="default" interactive={false} defaultZoom="fit" /></Frame>
}

/** Light mode, default palette. */
export function Light() {
  return <Frame><ArcDiagram data={architecture} mode="light" theme="default" interactive={false} defaultZoom="fit" /></Frame>
}

/** Cool theme — remaps logical colors to a blue/teal palette. */
export function Cool() {
  return <Frame><ArcDiagram data={architecture} mode="dark" theme="cool" interactive={false} defaultZoom="fit" /></Frame>
}

/** Warm theme — amber/rose palette. */
export function Warm() {
  return <Frame><ArcDiagram data={architecture} mode="dark" theme="warm" interactive={false} defaultZoom="fit" /></Frame>
}

/** Engineering — systematic enterprise blue (#0f62fe) on structured gray, shown light. */
export function Engineering() {
  return <Frame><ArcDiagram data={architecture} mode="light" theme="engineering" interactive={false} defaultZoom="fit" /></Frame>
}

/** Workbench — dark slate with signature intent colors. */
export function Workbench() {
  return <Frame><ArcDiagram data={architecture} mode="dark" theme="workbench" interactive={false} defaultZoom="fit" /></Frame>
}

/** Tactical — tactical near-black with signature amber. */
export function Tactical() {
  return <Frame><ArcDiagram data={architecture} mode="dark" theme="tactical" interactive={false} defaultZoom="fit" /></Frame>
}
