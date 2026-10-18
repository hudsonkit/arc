import { createRoot } from 'react-dom/client'
import ArcDiagram from '../src/components/ArcDiagram'
import { ArcDiagram as Viewer } from '../packages/viewer/src/ArcDiagram'
import type { ArcDiagramData } from '../src/types/diagram'
import { generateSVG } from '../src/utils/exportUtils'
import '../src/index.css'
import './host-theme.css'

const diagram: ArcDiagramData = {
  layout: { width: 320, height: 220 },
  nodes: { app: { x: 15, y: 80, size: 's' }, api: { x: 195, y: 80, size: 's' } },
  nodeData: {
    app: { icon: 'Monitor', name: 'Client', subtitle: 'Host application', color: 'violet' },
    api: { icon: 'Server', name: 'API', subtitle: 'Shared service', color: 'emerald' },
  },
  connectors: [{ from: 'app', to: 'api', fromAnchor: 'right', toAnchor: 'left', style: 'request' }],
  connectorStyles: { request: { color: 'violet', strokeWidth: 2, label: 'Request' } },
}

createRoot(document.getElementById('root')!).render(
  <main id="host" data-mode="light">
    <header><div><h1>Inherit from host</h1><p>The page controls the colors. The diagrams keep their state.</p></div>
      <button onClick={() => {
        const host = document.getElementById('host')!
        host.dataset.mode = host.dataset.mode === 'light' ? 'dark' : 'light'
      }}>Toggle host appearance</button>
    </header>
    <section><h2>Arc renderer</h2><ArcDiagram interactive={false} defaultZoom="fit" data={diagram} theme="inherit" mode="light" showArcToggle={false} /></section>
    <section><h2>Lightweight viewer</h2><Viewer data={diagram} theme="inherit" mode="light" showArcToggle={false} /></section>
    <section><h2>Inline SVG export</h2><div id="svg-export" dangerouslySetInnerHTML={{ __html: generateSVG(diagram, { theme: 'inherit', mode: 'light' }) }} /></section>
    <section><h2>Existing warm preset</h2><ArcDiagram interactive={false} defaultZoom="fit" data={diagram} theme="warm" mode="light" showArcToggle={false} /></section>
  </main>,
)
