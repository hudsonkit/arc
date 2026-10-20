import { useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArcDiagram } from '@hudsonkit/arc'
import { ArcMermaidPlayer } from '../../packages/viewer/src/mermaid'
import { importMermaid } from '../../packages/viewer/src/importMermaid'
import { examples, exampleSource, type ExampleCategory } from '../content/examples'
import { siteVersion } from '../utils/siteVersion'
import { useMeta } from '../hooks/useMeta'
import ArcMark from './ArcMark'
import '../examples.css'

const categories: Array<'All' | ExampleCategory> = ['All', 'Architecture', 'Sequence', 'Flowchart', 'State']

export default function ExamplesPage() {
  const { exampleId } = useParams()
  const [category, setCategory] = useState<(typeof categories)[number]>('All')
  const [query, setQuery] = useState('')
  const [view, setView] = useState<'preview' | 'source'>('preview')
  const [mode, setMode] = useState<'light' | 'dark'>('light')
  const detailRef = useRef<HTMLElement>(null)
  const selectExample = () => {
    setView('preview')
    if (window.matchMedia('(max-width: 720px)').matches) detailRef.current?.scrollIntoView({ block: 'start' })
  }
  const example = examples.find(item => item.id === exampleId) ?? examples[0]
  const visible = examples.filter(item => (category === 'All' || item.category === category) && `${item.title} ${item.description}`.toLowerCase().includes(query.toLowerCase()))
  const diagram = useMemo(() => example.diagram ?? (example.category !== 'Sequence' ? importMermaid(example.source!).diagram : null), [example])
  const source = exampleSource(example)
  const extension = example.source ? 'mmd' : 'json'
  const sourceHref = `data:${example.source ? 'text/plain' : 'application/json'};charset=utf-8,${encodeURIComponent(source)}`
  useMeta({ title: `${exampleId ? example.title : 'Diagram examples'} | Arc`, description: exampleId ? example.description : 'Explore 16 architecture, sequence, flowchart, and state examples. Preview the diagram and download its source.', url: `/examples${exampleId ? `/${example.id}` : ''}` })

  if (exampleId && !examples.some(item => item.id === exampleId)) {
    return <main className="eg-root"><div className="eg-shell"><h1>Example not found</h1><Link to="/examples">Browse all examples</Link></div></main>
  }

  return (
    <div className="eg-root">
      <div className="eg-shell">
        <header className="eg-header">
          <Link to="/" className="eg-brand" aria-label="Arc home"><ArcMark width={32} height={32} /><strong>Arc</strong><span>v{siteVersion}</span></Link>
          <nav aria-label="Main navigation"><Link to="/">Overview</Link><Link to="/exploded">Exploded views</Link><Link to="/panel-cube">Panel cube</Link><Link to="/docs/examples">Docs</Link><Link to="/editor">Open editor ↗</Link></nav>
        </header>
        <main>
          <div className="eg-intro"><p className="eg-eyebrow">THE EXAMPLE LIBRARY · {examples.length} WORKING DIAGRAMS</p><h1>Start with a system<br />you know.</h1><p>A cache miss. A payment retry. A release going live. Explore the diagram, read its source, and make it your own.</p></div>
          <div className="eg-filter-bar">
            <div className="eg-filters" aria-label="Filter examples">{categories.map(item => <button key={item} onClick={() => setCategory(item)} aria-pressed={category === item}>{item}<span>{item === 'All' ? examples.length : examples.filter(e => e.category === item).length}</span></button>)}</div>
            <label className="eg-search"><span className="eg-sr-only">Search examples</span><input type="search" placeholder="Find a system…" value={query} onChange={event => setQuery(event.target.value)} /></label>
          </div>
          <div className="eg-workbench">
            <aside className="eg-catalog" aria-label="Example library">
              <p className="eg-result-count" aria-live="polite">{visible.length} examples</p>
              {visible.map(item => <Link key={item.id} to={`/examples/${item.id}`} className={`eg-example ${item.id === example.id ? 'is-selected' : ''}`} aria-current={item.id === example.id ? 'page' : undefined} onClick={selectExample}><span className="eg-example-category">{item.category}</span><strong>{item.title}</strong><span>{item.description}</span><span className="eg-example-arrow" aria-hidden="true">↗</span></Link>)}
              {!visible.length && <p className="eg-empty">No matches. Try another search or category.</p>}
            </aside>
            <section ref={detailRef} className="eg-detail" aria-label="Selected example">
              <header className="eg-detail-header"><span className="eg-eyebrow">{example.category} / {example.source ? 'MERMAID SOURCE' : 'ARC JSON'}</span><h2>{example.title}</h2><p>{example.description}</p></header>
              <div className="eg-toolbar"><div role="group" aria-label="Example view"><button aria-pressed={view === 'preview'} onClick={() => setView('preview')}>Preview</button><button aria-pressed={view === 'source'} onClick={() => setView('source')}>Source</button></div><button onClick={() => setMode(mode === 'light' ? 'dark' : 'light')} aria-pressed={mode === 'dark'}>Dark mode</button></div>
              <div className="eg-stage" data-mode={mode}>
                {view === 'source' ? <pre tabIndex={0} aria-label={`${example.title} source`}><code>{source}</code></pre> : example.category === 'Sequence' ? <ArcMermaidPlayer key={`${example.id}-${mode}`} source={example.source} mode={mode} title={example.title} defaultZoom="fit" minZoom={0.2} sequence={{ width: 900 }} /> : <ArcDiagram key={`${example.id}-${mode}`} data={diagram!} mode={mode} defaultZoom="fit" fitPadding={32} showArcToggle={false} showControls interactive={false} />}
              </div>
              <footer className="eg-detail-footer"><a href={sourceHref} download={`${example.id}.${extension}`}>Download .{extension} ↓</a>{diagram && <Link to={`/editor#data=${btoa(JSON.stringify(diagram))}`}>Open in editor ↗</Link>}<Link to="/docs/exports">Export PNG · SVG · GIF · MP4 ↗</Link></footer>
              <p className="eg-caption">{example.category === 'Sequence' ? 'Native sequence playback: step through messages or press play. GIF and MP4 exports use Arc flow animation; they do not capture this timeline.' : example.source ? 'Mermaid source imported into Arc nodes and connectors. Arc applies its own layout. Supported source used with Pele or Beautiful Mermaid follows this same import path.' : 'Live Arc rendering with an animated packet route. The downloaded JSON includes nodes, connectors, and flow timing.'}</p>
            </section>
          </div>
          <Link className="eg-explainer" to="/examples/connection-pool"><span className="eg-eyebrow">GO DEEPER / INTERACTIVE EXPLAINER</span><h2>What happens when the connection pool fills up? <span>↗</span></h2><p>Adjust demand and follow connections through borrowing, waiting, and reuse.</p></Link>
        </main>
        <footer className="eg-footer"><Link to="/">Arc · diagrams as code</Link><span>Keep the diagram with the system it describes.</span></footer>
      </div>
    </div>
  )
}
