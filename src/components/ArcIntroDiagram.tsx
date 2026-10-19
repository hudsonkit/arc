import { ArcDiagram } from '@hudsonkit/arc'
import diagram from './diagrams/architecture-intro.diagram'

// Actual source that generates the diagram
const sourceCode = `const diagram: ArcDiagramData = {
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
    editor:    { icon: 'Monitor',  name: 'Arc Editor',    color: 'violet' },
    templates: { icon: 'Grid3X3',  name: 'Templates',     color: 'amber' },
    model:     { icon: 'Layers',   name: 'Diagram Model', color: 'blue' },
    exporters: { icon: 'Upload',   name: 'Exporters',     color: 'emerald' },
    docs:      { icon: 'FileCode', name: 'Docs + Apps',   color: 'zinc' },
  },
  connectors: [
    { from: 'editor',    to: 'model',     style: 'diagram' },
    { from: 'templates', to: 'model',     style: 'themes' },
    { from: 'model',     to: 'docs',      style: 'publish' },
    { from: 'model',     to: 'exporters', style: 'export' },
  ],
  connectorStyles: {
    diagram: { color: 'violet',  label: 'diagram' },
    themes:  { color: 'amber',   label: 'themes' },
    publish: { color: 'blue',    label: 'publish' },
    export:  { color: 'emerald', label: 'export' },
  },
}`

export default function ArcIntroDiagram() {
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
          <span className="arc-showcase-filename">architecture-intro.diagram.ts</span>
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
