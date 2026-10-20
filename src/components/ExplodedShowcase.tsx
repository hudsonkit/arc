import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Download, Moon, Sun } from 'lucide-react'
import { ArcExploded, aiStackExploded, explodedColor, explodedReadingOrder, keyboardExploded, renderExplodedSvg } from '@hudsonkit/arc'
import { useMeta } from '../hooks/useMeta'
import ArcMark from './ArcMark'
import '../exploded.css'

type Example = 'keyboard' | 'ai'
const examples = { keyboard: keyboardExploded, ai: aiStackExploded }

export default function ExplodedShowcase() {
  const [example, setExample] = useState<Example>('keyboard')
  const [progress, setProgress] = useState(1)
  const [target, setTarget] = useState(1)
  const [mode, setMode] = useState<'light' | 'dark'>('light')
  const [source, setSource] = useState(false)
  const [compact, setCompact] = useState(false)
  const animation = useRef(0)
  const doc = examples[example]
  useMeta({ title: 'Exploded views | Arc', description: 'Take apart a mini mechanical keyboard and an AI stack as native Arc diagrams.', url: '/exploded' })
  useEffect(() => {
    const media = window.matchMedia('(max-width: 640px)')
    const update = () => setCompact(media.matches)
    update(); media.addEventListener('change', update)
    return () => { media.removeEventListener('change', update); cancelAnimationFrame(animation.current) }
  }, [])
  function move(next: number, animate = true) {
    cancelAnimationFrame(animation.current)
    setTarget(next)
    if (!animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setProgress(next); return }
    const from = progress, start = performance.now()
    const tick = (time: number) => {
      const elapsed = Math.max(0, Math.min(1, (time - start) / 650))
      setProgress(elapsed === 1 ? next : from + (next - from) * (1 - Math.pow(1 - elapsed, 4)))
      if (elapsed < 1) animation.current = requestAnimationFrame(tick)
    }
    animation.current = requestAnimationFrame(tick)
  }
  function select(next: Example) { move(1, false); setExample(next) }
  function download(format: 'svg' | 'json') {
    const value = format === 'svg' ? renderExplodedSvg(doc, { mode }) : JSON.stringify(doc, null, 2)
    const url = URL.createObjectURL(new Blob([value], { type: format === 'svg' ? 'image/svg+xml' : 'application/json' }))
    const link = document.createElement('a')
    link.href = url; link.download = `${doc.id}.${format}`; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const controls = (id: string) => (<fieldset disabled={source}><legend>Assembly</legend><div className="ex-segment"><button aria-pressed={target === 0} onClick={() => move(0)}>Assembled</button><button aria-pressed={target === 1} onClick={() => move(1)}>Exploded</button></div>
              <label className="ex-range-label" htmlFor={id}>Separation <output htmlFor={id}>{Math.round(progress * 100)}%</output></label><input id={id} type="range" min="0" max="100" value={Math.round(progress * 100)} onChange={e => move(Number(e.target.value) / 100, false)} />
            </fieldset>)
  return <div className="ex-page" data-mode={mode}>
    <header className="ex-header">
      <Link to="/" className="ex-brand" aria-label="Arc home"><ArcMark width={28} height={28} /><strong>Arc</strong></Link>
      <Link to="/examples"><ArrowLeft size={14} /> All examples</Link>
    </header>
    <main className="ex-main">
      <div className="ex-heading"><div><h1>See how it fits together.</h1><p>Separate the layers. Follow each part back into place.</p></div><button className="ex-theme" onClick={() => setMode(mode === 'light' ? 'dark' : 'light')} aria-label={mode === 'light' ? 'Use dark appearance' : 'Use light appearance'}>{mode === 'light' ? <Moon size={18} /> : <Sun size={18} />}</button></div>
      <div className="ex-workbench">
        <div className="ex-toolbar">
          <div className="ex-segment" role="group" aria-label="Choose assembly"><button aria-pressed={example === 'keyboard'} onClick={() => select('keyboard')}>Mini keyboard</button><button aria-pressed={example === 'ai'} onClick={() => select('ai')}>AI stack</button></div>
          <div className="ex-segment" role="group" aria-label="Example view"><button aria-pressed={!source} onClick={() => setSource(false)}>Preview</button><button aria-pressed={source} onClick={() => setSource(true)}>Source</button></div>
        </div>
        <div className="ex-mobile-controls">{controls("separation-mobile")}</div>
        <div className="ex-content">
          <section className="ex-stage" aria-label={doc.title}>
            {source ? <pre tabIndex={0} aria-label="Exploded document source"><code>{JSON.stringify(doc, null, 2)}</code></pre> : <ArcExploded document={doc} progress={progress} mode={mode} labels={!compact} className="ex-diagram" />}
          </section>
          <aside className="ex-inspector">
            <h2>{doc.title}</h2><p>{doc.description}</p>
            <div className="ex-desktop-controls">{controls("separation")}</div>
            <ol className="ex-parts" aria-label="Assembly parts">{explodedReadingOrder(doc).map((part, i) => <li key={part.id}><span className="ex-index" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span><span className="ex-swatch" style={{ background: explodedColor(doc, part, mode) }} aria-hidden="true" /><div><strong>{part.label}</strong><span>{part.description}</span></div></li>)}</ol>
            <div className="ex-downloads"><button onClick={() => download('svg')}><Download size={14} /> Download SVG</button><button onClick={() => download('json')}>Download JSON</button></div><p className="ex-note">SVG exports show the fully exploded view. These examples are simplified illustrations.</p>
          </aside>
        </div>
      </div>
      <p className="ex-caption">Native Arc geometry, from a typed assembly document. Inspired by <a href="https://cathrynlavery.github.io/diagram-design/">Cathryn Lavery’s Diagram Design</a>.</p>
      <div className="ex-print"><ArcExploded document={doc} /></div>
    </main>
  </div>
}
