import { useMemo } from 'react'
import { AppShell } from 'hudsonkit/app-shell'
import { createArcEditorApp } from '../../apps/arc-editor/createArcApp'
import type { ArcEditorInit } from '../../apps/arc-editor/ArcEditorContext'
import { ARC_ROOT_CLASS } from '../../utils/cssScope'
import '../../editor-shell.css'

// Sample diagram to start with - Arc's own architecture (mirrors src/components/diagrams/architecture.diagram.ts)
const sampleDiagram = {
  layout: { width: 860, height: 400 },
  grid: { enabled: true, size: 24, color: '#71717a', opacity: 0.1, type: 'dots' },
  nodes: {
    editor:    { x: 50,  y: 50,  size: 'l' },
    templates: { x: 70,  y: 200, size: 'm' },
    model:     { x: 340, y: 150, size: 'm' },
    exporters: { x: 340, y: 280, size: 'm' },
    docs:      { x: 600, y: 150, size: 'm' },
  },
  nodeData: {
    editor:    { icon: 'Monitor',  name: 'Arc Editor',    subtitle: 'Canvas UI',     description: 'Drag, connect, style.',     color: 'violet' },
    templates: { icon: 'Grid',     name: 'Templates',     subtitle: 'Themes',        description: 'Palettes, sizes, presets.', color: 'amber' },
    model:     { icon: 'Layers',   name: 'Diagram Model', subtitle: 'JSON / TS',     description: 'Typed, diffable state.',    color: 'blue' },
    exporters: { icon: 'Upload',   name: 'Exporters',     subtitle: 'SVG / PNG / TS', description: 'Outputs for docs & decks.', color: 'emerald' },
    docs:      { icon: 'FileCode', name: 'Docs + Apps',   subtitle: 'Consumers',     description: 'Embed anywhere.',           color: 'zinc' },
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

export default function DiagramEditor({
  initialData = null,
  themeId = null,
  colorMode,
  sessionId = null,
  initialDiagramMeta,
}: {
  initialData?: any
  themeId?: string | null
  colorMode?: 'light' | 'dark'
  sessionId?: string | null
  initialDiagramMeta?: Record<string, any>
}) {
  const init = useMemo<ArcEditorInit>(() => ({
    initialData,
    themeId,
    colorMode,
    sessionId,
    initialDiagramMeta,
  }), [initialData, themeId, colorMode, sessionId, initialDiagramMeta])

  const app = useMemo(
    () => createArcEditorApp(init, initialData || sampleDiagram),
    [init, initialData],
  )

  return (
    <div className={`arc-editor-root ${ARC_ROOT_CLASS}`}>
      <AppShell
        app={app}
        assistant={false}
        defaultTheme={colorMode === 'dark' ? 'dark' : 'light'}
        defaultTemplate="hudson"
        chrome={{
          palette: false,
          terminal: false,
          leftPanel: false,
        }}
      />
    </div>
  )
}