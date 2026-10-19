import { ArcDiagram } from '@hudsonkit/arc'
import diagram from './diagrams/architecture-next.diagram'

// Actual source that generates the diagram
const sourceCode = `const diagram: ArcDiagramData = {
  id: 'ARC.ARCH.002',
  layout: { width: 920, height: 440 },
  nodes: {
    core:       { x: 360, y: 170, size: 'l' },
    editor:     { x: 60,  y: 100, size: 'm' },
    templates:  { x: 70,  y: 280, size: 's' },
    automation: { x: 415, y: 50,  size: 's' },
    exports:    { x: 660, y: 100, size: 'm' },
    consumers:  { x: 660, y: 280, size: 'm' },
  },
  nodeData: {
    core:       { icon: 'Layers',   name: 'Arc Core',    color: 'emerald' },
    editor:     { icon: 'Monitor',  name: 'Editor UI',   color: 'orange' },
    templates:  { icon: 'Grid3X3',  name: 'Templates',   color: 'amber' },
    automation: { icon: 'Wand2',    name: 'Automation',  color: 'emerald' },
    exports:    { icon: 'Upload',   name: 'Exporters',   color: 'blue' },
    consumers:  { icon: 'FileCode', name: 'Docs + Apps', color: 'zinc' },
  },
  connectors: [
    { from: 'editor',     to: 'core',      style: 'solid' },
    { from: 'templates',  to: 'core',      style: 'dashed' },
    { from: 'automation', to: 'core',      style: 'dashed' },
    { from: 'core',       to: 'exports',   style: 'solid' },
    { from: 'core',       to: 'consumers', style: 'solid' },
  ],
  connectorStyles: {
    solid:  { color: 'zinc', strokeWidth: 2 },
    dashed: { color: 'zinc', strokeWidth: 2, dashed: true },
  },
}`

export default function ArcArchitectureNext() {
  return (
    <div className="arc-showcase">
      <div className="arc-showcase-diagram">
        <ArcDiagram data={diagram} mode="light" />
      </div>
      <div className="arc-showcase-code">
        <div className="arc-showcase-code-header">
          <span className="arc-showcase-dot arc-showcase-dot-red" />
          <span className="arc-showcase-dot arc-showcase-dot-yellow" />
          <span className="arc-showcase-dot arc-showcase-dot-green" />
          <span className="arc-showcase-filename">architecture-next.diagram.ts</span>
        </div>
        <pre className="arc-showcase-pre">
          <code dangerouslySetInnerHTML={{ __html: highlightCode(sourceCode) }} />
        </pre>
      </div>
    </div>
  )
}

function highlightCode(code: string): string {
  return code
    .replace(/(\w+)(\s*:)/g, '<span class="hl-property">$1</span>$2')
    .replace(/^(\s*)(const|let|var|type)\b/gm, '$1<span class="hl-keyword">$2</span>')
    .replace(/'([^']*)'/g, '<span class="hl-string">\'$1\'</span>')
    .replace(/\b(\d+)\b/g, '<span class="hl-number">$1</span>')
    .replace(/(\/\/.*)/g, '<span class="hl-comment">$1</span>')
    .replace(/: <span class="hl-property">ArcDiagramData<\/span>/g, ': <span class="hl-type">ArcDiagramData</span>')
}
