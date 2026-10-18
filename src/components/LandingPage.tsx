import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Moon, Sun } from 'lucide-react'
import { ArcDiagram, type ArcDiagramData } from '@arach/arc'
import { siteVersion as version } from '../utils/siteVersion'
import { useMeta } from '../hooks/useMeta'
import ArcMark from './ArcMark'
import { examples } from '../content/examples'
import '../landing-technical.css'

// Below-the-fold showcases load on demand — the mermaid engine and the second
// ArcDiagram mount aren't worth blocking first paint on.
const IsoPlateShowcase = lazy(() => import('./IsoPlateShowcase'))
const SequenceEngineShowcase = lazy(() => import('./SequenceEngineShowcase'))

// The hero plate — a real request path, rendered live by ArcDiagram, with two
// declarative flow routes riding the connectors.
const heroDiagram: ArcDiagramData = {
  id: 'arc.hero.001',
  layout: { width: 736, height: 336 },
  nodes: {
    client:   { x: 16,  y: 142, size: 'm' },
    gateway:  { x: 206, y: 142, size: 'm' },
    orders:   { x: 396, y: 48,  size: 'm' },
    search:   { x: 396, y: 236, size: 'm' },
    postgres: { x: 584, y: 48,  size: 'm' },
    cache:    { x: 584, y: 236, size: 'm' },
  },
  nodeData: {
    client:   { icon: 'Monitor',  name: 'Web client',  subtitle: 'React',      color: 'blue' },
    gateway:  { icon: 'Shield',   name: 'API gateway', subtitle: 'Auth · rate', color: 'violet' },
    orders:   { icon: 'Server',   name: 'Orders',      subtitle: 'Service',    color: 'emerald' },
    search:   { icon: 'Search',   name: 'Search',      subtitle: 'Service',    color: 'sky' },
    postgres: { icon: 'Database', name: 'Postgres',    subtitle: 'Primary',    color: 'amber' },
    cache:    { icon: 'Zap',      name: 'Redis',       subtitle: 'Cache',      color: 'rose' },
  },
  connectors: [
    { from: 'client',  to: 'gateway',  fromAnchor: 'right', toAnchor: 'left', style: 'https' },
    { from: 'gateway', to: 'orders',   fromAnchor: 'right', toAnchor: 'left', style: 'rpc' },
    { from: 'gateway', to: 'search',   fromAnchor: 'right', toAnchor: 'left', style: 'rpc' },
    { from: 'orders',  to: 'postgres', fromAnchor: 'right', toAnchor: 'left', style: 'sql' },
    { from: 'search',  to: 'cache',    fromAnchor: 'right', toAnchor: 'left', style: 'kv' },
  ],
  connectorStyles: {
    https: { color: 'blue',    strokeWidth: 1.5, label: 'HTTPS' },
    rpc:   { color: 'violet',  strokeWidth: 1.5, label: 'gRPC' },
    sql:   { color: 'amber',   strokeWidth: 1.5, label: 'SQL' },
    kv:    { color: 'rose',    strokeWidth: 1.5, label: 'GET', dashed: true },
  },
  flows: [
    {
      id: 'checkout',
      legs: [{ from: 'client', to: 'gateway' }, { from: 'gateway', to: 'orders' }, { from: 'orders', to: 'postgres' }],
      marker: 'packet', trail: 'wake', color: 'amber', speed: 170, hold: 0.6,
    },
    {
      id: 'lookup',
      legs: [{ from: 'client', to: 'gateway' }, { from: 'gateway', to: 'search' }, { from: 'search', to: 'cache' }],
      marker: 'dot', trail: 'fade', color: 'sky', speed: 150, delay: 1.4, hold: 0.6,
    },
  ],
}

// The pipeline diagram rendered in section 02 — the real ArcDiagram component.
const archDiagram: ArcDiagramData = {
  id: 'arc.arch.001',
  layout: { width: 760, height: 372 },
  nodes: {
    editor:    { x: 18,  y: 36,  size: 'm' },
    templates: { x: 18,  y: 210, size: 'm' },
    model:     { x: 300, y: 128, size: 'l' },
    exporters: { x: 300, y: 262, size: 'm' },
    docs:      { x: 556, y: 128, size: 'm' },
  },
  nodeData: {
    editor:    { icon: 'Monitor',  name: 'Editor',        subtitle: 'Canvas UI',  description: 'Drag, connect, style.',      color: 'blue' },
    templates: { icon: 'Grid3X3',  name: 'Templates',     subtitle: 'Themes',     description: 'Palettes, sizes, presets.',  color: 'amber' },
    model:     { icon: 'Layers',   name: 'Diagram Model', subtitle: 'JSON / TS',  description: 'Typed, diffable state.',     color: 'violet' },
    exporters: { icon: 'Upload',   name: 'Exporters',     subtitle: 'Images / Motion',  description: 'Outputs for docs & decks.',  color: 'emerald' },
    docs:      { icon: 'FileCode', name: 'Docs',          subtitle: 'Apps',       description: 'Embed anywhere.',            color: 'sky' },
  },
  connectors: [
    { from: 'editor',    to: 'model',     fromAnchor: 'right',  toAnchor: 'left', style: 'diagram' },
    { from: 'templates', to: 'model',     fromAnchor: 'right',  toAnchor: 'left', style: 'themes' },
    { from: 'model',     to: 'docs',      fromAnchor: 'right',  toAnchor: 'left', style: 'publish' },
    { from: 'model',     to: 'exporters', fromAnchor: 'bottom', toAnchor: 'top',  style: 'export' },
  ],
  connectorStyles: {
    diagram: { color: 'blue',    strokeWidth: 1.25, label: 'diagram' },
    themes:  { color: 'amber',   strokeWidth: 1.25, label: 'themes' },
    publish: { color: 'sky',     strokeWidth: 1.25, label: 'publish' },
    export:  { color: 'emerald', strokeWidth: 1.25, label: 'export' },
  },
  // Packet flows keep the plate in motion — the same `flows` feature used by
  // animated exports, looping indefinitely on the landing.
  flows: [
    { id: 'author',  legs: [{ from: 'editor',    to: 'model' }],     marker: 'packet', color: 'blue',    duration: 3.2, repeat: 'indefinite' },
    { id: 'style',   legs: [{ from: 'templates', to: 'model' }],     marker: 'packet', color: 'amber',   duration: 3.2, delay: 1.1, repeat: 'indefinite' },
    { id: 'publish', legs: [{ from: 'model',     to: 'docs' }],      marker: 'packet', color: 'sky',     duration: 3.2, delay: 2.0, repeat: 'indefinite' },
    { id: 'export',  legs: [{ from: 'model',     to: 'exporters' }], marker: 'packet', color: 'emerald', duration: 3.2, delay: 2.7, repeat: 'indefinite' },
  ],
  // Guided views turn the plate into a three-chapter walkthrough — the same
  // `views` feature the docs describe, dogfooded on the landing itself.
  views: [
    {
      id: 'overview',
      title: 'Overview',
      nodes: ['editor', 'templates', 'model', 'exporters', 'docs'],
      caption: 'The whole pipeline on one plate.',
    },
    {
      id: 'authoring',
      title: 'Authoring',
      nodes: ['editor', 'templates', 'model'],
      connectors: [
        { from: 'editor', to: 'model' },
        { from: 'templates', to: 'model' },
      ],
      caption: 'The canvas and its themes feed one typed model.',
    },
    {
      id: 'publishing',
      title: 'Publishing',
      nodes: ['model', 'docs', 'exporters'],
      connectors: [
        { from: 'model', to: 'docs' },
        { from: 'model', to: 'exporters' },
      ],
      caption: 'The same model publishes to docs and static exports.',
    },
  ],
}

const NODE_BOX = { s: [110, 48], m: [160, 75], l: [220, 90] } as const

// Three entries from the examples gallery, each in a different theme. They are
// the gallery's own documents, not drawings made for this page, and each tile
// opens its entry — source, download, "open in editor" — so a reader can check.
// (Engineering and spacex draw a fixed-size title block that covers a
// thumbnail-sized fit.) They follow the page's mode: one dark tile among light
// ones read as a fault, and a dark row on a light page clashed.
const themeSamples = ([
  { theme: 'workbench', name: 'Workbench', example: 'event-fanout' },
  { theme: 'tactical',  name: 'Tactical',  example: 'webhook-ingress' },
  { theme: 'claude',    name: 'Claude',    example: 'retrieval-pipeline' },
] as const).map((s) => {
  const entry = examples.find((e) => e.id === s.example)
  if (!entry?.diagram) throw new Error(`Missing example: ${s.example}`)
  return { ...s, title: entry.title, diagram: cropToContent(entry.diagram as ArcDiagramData, 44) }
})

/** The gallery documents carry a 900×510 canvas with the drawing in the middle
 *  of it, and fit always keeps the whole canvas in view. A thumbnail wants the
 *  drawing, so shift the nodes to the corner and shrink the canvas around them. */
function cropToContent(d: ArcDiagramData, pad: number): ArcDiagramData {
  const boxes = Object.values(d.nodes).map((n) => {
    const [w, h] = NODE_BOX[(n.size as keyof typeof NODE_BOX) ?? 'm'] ?? NODE_BOX.m
    return { x: n.x, y: n.y, w, h }
  })
  const minX = Math.min(...boxes.map((b) => b.x))
  const minY = Math.min(...boxes.map((b) => b.y))
  const maxX = Math.max(...boxes.map((b) => b.x + b.w))
  const maxY = Math.max(...boxes.map((b) => b.y + b.h))
  const nodes = Object.fromEntries(Object.entries(d.nodes).map(([id, n]) => [id, { ...n, x: n.x - minX + pad, y: n.y - minY + pad }]))
  return { ...d, nodes, layout: { width: maxX - minX + pad * 2, height: maxY - minY + pad * 2 } }
}

/** A link that opens a document in the editor. The editor reads the hash with
 *  a bare `atob`, so non-ASCII is escaped inside the JSON first — `btoa` throws
 *  on anything past Latin-1, and Latin-1 itself would come back as mojibake. */
function editorHref(d: ArcDiagramData, display: Record<string, string> = {}): string {
  const json = JSON.stringify({ ...d, ...display }).replace(/[\u007f-\uffff]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))
  return `/editor#data=${btoa(json)}`
}

const features = [
  { n: '01', h: 'Lives in the repo', p: 'A diagram is a JSON or TypeScript file next to the code it describes.' },
  { n: '02', h: 'Changes show in the diff', p: 'Move a service and the review shows the edge that moved, line by line.' },
  { n: '03', h: 'Checked like code', p: 'arc check validates a diagram in CI, so a broken reference fails the build.' },
  { n: '04', h: 'Kept current by agents', p: 'The MCP server lets the agent that changes the system update its picture.' },
]

const docs = [
  { n: 'DOC.01', h: 'Introduction to Arc', p: 'What it is and the problem it solves.', to: '/docs/overview' },
  { n: 'DOC.02', h: 'Get up and running', p: 'Install, import, render your first diagram.', to: '/docs/quickstart' },
  { n: 'DOC.03', h: 'Data structure reference', p: 'Nodes, connectors, layout, and theming.', to: '/docs/diagram-format' },
  { n: 'DOC.04', h: 'Themes', p: 'Eleven themes, from drafting plates to branded skins, light & dark.', to: '/docs/themes' },
  { n: 'GUIDE.01', h: 'Guided views', p: 'Ordered chapters and deep-linked walkthroughs.', to: '/docs/views' },
  { n: 'GUIDE.02', h: 'Diagram diffs', p: 'Added, removed, moved, changed — rendered.', to: '/docs/diff' },
  { n: 'EXP.01', h: 'Connection pool explainer', p: 'A live model of borrow, wait, reuse.', to: '/examples/connection-pool' },
  { n: 'EXP.02', h: 'Player showcase', p: 'Every renderer option, live on the canvas.', to: '/showcase' },
  { n: 'GUIDE.03', h: 'Field guide', p: 'How the architecture-diagram tools compare.', to: '/architecture-diagram-software' },
  { n: 'AGENT.01', h: 'MCP server', p: 'Give agents tools to validate, lay out, and render.', to: '/mcp' },
  { n: 'AGENT.02', h: 'Agent skills', p: 'Reusable diagram authoring and repair playbooks.', to: '/skills' },
]

const loopBeats = [
  { n: 'NUDGE', h: 'Updated in the loop', p: 'A changed file claims a diagram — the agent touches the *.arc.json in the same commit it edits the code.' },
  { n: 'CHECK', h: 'Verified mechanically', p: 'arc check returns coded diagnostics with supportedFixes — an instruction list to converge on, not output to parse.' },
  { n: 'DIFF', h: 'Reviewed as a delta', p: 'arc diff renders added, removed, moved, changed next to the code diff — drift becomes a review artifact.' },
]

/** SMIL flow markers keep moving under `prefers-reduced-motion`, so the page
 *  turns the animation layer off itself. */
function useReducedMotion(): boolean {
  const query = '(prefers-reduced-motion: reduce)'
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' && !!window.matchMedia?.(query).matches,
  )
  useEffect(() => {
    const mq = window.matchMedia?.(query)
    if (!mq) return
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

/** The one label pattern on the page: `01 — FORMATS`. The index matches the
 *  nav; unnumbered sections keep the rule so the column still lines up. */
function Tag({ n, children, invert }: { n?: string; children: string; invert?: boolean }) {
  return (
    <div className={`tl-tag${invert ? ' tl-tag-invert' : ''}`}>
      <span className="tl-tag-n">{n ?? '··'}</span>
      <span className="tl-tag-rule" aria-hidden="true" />
      {children}
    </div>
  )
}

type HeroView = 'render' | 'source'

function HeroPlate({ animate, mode }: { animate: boolean; mode: 'light' | 'dark' }) {
  const [view, setView] = useState<HeroView>('render')
  const source = useMemo(() => {
    const { id: _id, ...rest } = heroDiagram
    return JSON.stringify(rest, null, 2)
  }, [])

  return (
    <figure className="tl-plate">
      <div className="tl-plate-bar">
        <span className="tl-plate-id">PLATE 00 · arc.hero.001</span>
        <div className="tl-plate-tabs" role="tablist" aria-label="Hero diagram view">
          {(['render', 'source'] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              id={`tl-plate-tab-${v}`}
              aria-selected={view === v}
              aria-controls="tl-plate-panel"
              className={view === v ? 'is-active' : ''}
              onClick={() => setView(v)}
            >
              {v === 'render' ? 'Render' : 'Source'}
            </button>
          ))}
        </div>
      </div>
      <div className="tl-plate-stage" id="tl-plate-panel" role="tabpanel" aria-labelledby={`tl-plate-tab-${view}`}>
        <span className="tl-reg tl-reg-tl" aria-hidden="true" />
        <span className="tl-reg tl-reg-tr" aria-hidden="true" />
        <span className="tl-reg tl-reg-bl" aria-hidden="true" />
        <span className="tl-reg tl-reg-br" aria-hidden="true" />
        {view === 'render' ? (
          <div className="tl-plate-mount">
            <ArcDiagram
              data={heroDiagram}
              mode={mode}
              theme="inherit"
              defaultZoom="fit"
              fitPadding={10}
              maxFitZoom={1.25}
              interactive={false}
              hoverEffects={{ dim: false, lift: false, glow: false }}
              showArcToggle={false}
              animateFlows={animate}
              flowTime={animate ? undefined : 2.2}
              label=""
            />
          </div>
        ) : (
          <pre className="tl-plate-source" tabIndex={0} aria-label="Hero diagram source (Arc JSON)">
            <code>{source}</code>
          </pre>
        )}
      </div>
      <figcaption className="tl-plate-foot">
        <span>A request path with two flow routes. Hover a node.</span>
        <Link className="tl-plate-open" to={editorHref(heroDiagram, { _mode: mode })}>Open in editor ↗</Link>
      </figcaption>
    </figure>
  )
}

type LandingPageProps = { onLaunchEditor: () => void }

export default function LandingPage({ onLaunchEditor }: LandingPageProps) {
  useMeta({
    title: 'Arc | Diagrams as code',
    description: 'Build interactive diagrams from Arc data or supported Mermaid source. Export PNG, SVG, GIF, and MP4, or embed the explanation in your app.',
    image: '/og-landing.png',
    url: '/',
  })
  const reducedMotion = useReducedMotion()
  const [mode, setMode] = useState<'light' | 'dark'>(() => {
    try {
      const stored = localStorage.getItem('arc-landing-mode')
      if (stored === 'dark' || stored === 'light') return stored
    } catch { /* Storage can be unavailable. */ }
    return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })
  // Only a reader's explicit choice is remembered, so the system setting keeps
  // working for everyone who never touches the toggle.
  const toggleMode = () => setMode(current => {
    const next = current === 'light' ? 'dark' : 'light'
    try { localStorage.setItem('arc-landing-mode', next) } catch { /* Storage can be unavailable. */ }
    return next
  })

  return (
    <div className="tl-root" data-mode={mode}>
      <a className="tl-skip" href="#formats">Skip to content</a>

      {/* HERO — a dark cyanotype sheet with the live plate */}
      <div className="tl-hero-band">
        <div className="tl-shell">
          <header className="tl-header">
            <div className="tl-brand-cluster">
              <Link className="tl-brand" to="/" aria-label="Arc home">
                <ArcMark className="tl-brand-mark" />
                <span className="tl-brand-lockup">
                  <span className="tl-brand-name">Arc</span>
                  <span className="tl-brand-descriptor">diagrams as code</span>
                </span>
              </Link>
              <span className="tl-brand-ver">v{version}</span>
            </div>
            <nav className="tl-nav" aria-label="Primary">
              <a href="#formats"><span className="tl-nav-n">01</span>FORMATS</a>
              <a href="#pipeline"><span className="tl-nav-n">02</span>ARCHITECTURE</a>
              <a href="#isometric"><span className="tl-nav-n">03</span>ISOMETRIC</a>
              <a href="#sequence"><span className="tl-nav-n">04</span>SEQUENCE</a>
              <a href="#agentic"><span className="tl-nav-n">05</span>AGENTS</a>
              <Link to="/examples">EXAMPLES</Link>
              <Link to="/docs">DOCS</Link>
              <a className="tl-nav-accent" href="https://github.com/hudsonkit/arc" target="_blank" rel="noopener noreferrer">GITHUB ↗</a>
            </nav>
            <Link className="tl-nav-mobile" to="/examples">Examples →</Link>
            <button
              type="button"
              className="tl-mode-toggle"
              aria-label={`Switch the hero sheet to ${mode === 'light' ? 'cyanotype' : 'paper'}`}
              onClick={toggleMode}
            >
              {mode === 'light' ? <Moon size={16} aria-hidden="true" /> : <Sun size={16} aria-hidden="true" />}
              {mode === 'light' ? 'Cyanotype' : 'Paper'}
            </button>
          </header>

          <section className="tl-hero" aria-labelledby="tl-hero-title">
            <div className="tl-hero-copy">
              <h1 id="tl-hero-title" className="tl-h1">
                Diagrams that <em>live</em> where your system does.
              </h1>
              <p className="tl-lead">
                Build interactive explanations from Arc data or supported Mermaid source.
                Share a PNG or SVG, put flow routes in motion as GIF or MP4, or embed
                the explanation in your app.
              </p>
              <div className="tl-actions">
                <button type="button" className="tl-btn tl-btn-signal" onClick={onLaunchEditor}>Launch the editor →</button>
                <Link className="tl-btn tl-btn-line" to="/examples">Examples</Link>
                <Link className="tl-btn tl-btn-quiet" to="/docs">Docs</Link>
              </div>
              <dl className="tl-specbar">
                <div><dt>IN</dt><dd>Arc + Mermaid source</dd></div>
                <div><dt>OUT</dt><dd>PNG · SVG · GIF · MP4</dd></div>
                <div><dt>EMBED</dt><dd>React</dd></div>
              </dl>
            </div>
            <HeroPlate animate={!reducedMotion} mode={mode} />
          </section>
        </div>
      </div>

      <div className="tl-shell">
        {/* SOURCE → OUTPUT */}
        <section id="formats" className="tl-section tl-formats" aria-labelledby="formats-heading">
          <div className="tl-head">
            <div>
              <Tag n="01">FORMATS</Tag>
              <h2 id="formats-heading" className="tl-h2">Bring your source. Choose your output.</h2>
            </div>
          </div>
          <div className="tl-format-columns">
            <div className="tl-format-panel">
              <h3 className="tl-format-title"><span className="tl-format-k">IN</span>Start with Arc or Mermaid</h3>
              <dl className="tl-format-list">
                <div><dt>Arc JSON / TypeScript</dt><dd>Architecture, guided views, flow routes, and isometric scenes.</dd></div>
                <div><dt>Mermaid</dt><dd>Import flowcharts and state diagrams, or play sequences one message at a time.</dd></div>
                <div>
                  <dt><a href="https://pele.run/">Pele</a> + <a href="https://github.com/lukilabs/beautiful-mermaid">Beautiful Mermaid</a></dt>
                  <dd>Reuse their Mermaid source through Arc’s supported flowchart, state, and sequence APIs.</dd>
                </div>
              </dl>
              <p className="tl-format-note">Arc applies its own layout and themes. Compatibility covers supported Mermaid syntax; renderer-specific styling and other diagram families are not imported.</p>
              <Link className="tl-format-link" to="/docs/mermaid-import">See Mermaid compatibility →</Link>
            </div>
            <div className="tl-format-panel">
              <h3 className="tl-format-title"><span className="tl-format-k">OUT</span>Publish in the format you need</h3>
              <dl className="tl-format-list tl-output-list">
                <div><dt>PNG</dt><dd>Still images for documents, chat, and social posts.</dd></div>
                <div><dt>SVG</dt><dd>Scalable vector drawings with optional flow animation.</dd></div>
                <div><dt>GIF</dt><dd>Looping flow animations for READMEs and demos.</dd></div>
                <div><dt>MP4</dt><dd>Flow videos for presentations and announcements.</dd></div>
              </dl>
              <p className="tl-format-note">Also: React components, HTML, ASCII / Unicode, and editable JSON / TypeScript. File exports use Arc architecture data. GIF and MP4 use the CLI or MCP with Chrome and ffmpeg.</p>
              <Link className="tl-format-link" to="/docs/exports">Choose an export →</Link>
            </div>
          </div>
        </section>

        {/* WHY */}
        <section id="why" className="tl-why" aria-labelledby="why-heading">
          <div className="tl-why-copy">
            <Tag>WHY ARC</Tag>
            <h2 id="why-heading" className="tl-h2">Diagrams drawn in Figma drift.</h2>
            <p className="tl-section-p">
              The system changes and the picture falls behind. Arc diagrams are code: they sit in the repo
              next to what they describe, show up in the same diff, and get reviewed and updated alongside
              the system.
            </p>
          </div>
          <ol className="tl-feature-grid">
            {features.map((f) => (
              <li className="tl-feature" key={f.n}>
                <div className="tl-feature-n">{f.n}</div>
                <div className="tl-feature-h">{f.h}</div>
                <div className="tl-feature-p">{f.p}</div>
              </li>
            ))}
          </ol>
        </section>

        {/* PIPELINE / DIAGRAM */}
        <section id="pipeline" className="tl-section" aria-labelledby="pipeline-heading">
          <div className="tl-head">
            <div>
              <Tag n="02">ARCHITECTURE</Tag>
              <h2 id="pipeline-heading" className="tl-h2">From editor to everywhere.</h2>
            </div>
            <div className="tl-pipeline-id">ARC.ARCH.001<br />editor → model → exporters</div>
          </div>
          <div className="tl-diagram-card">
            <div className="tl-diagram-mount">
              <ArcDiagram
                data={archDiagram}
                mode="light"
                theme="cool"
                defaultZoom="fit"
                maxFitZoom={0.95}
                interactive={false}
                hoverEffects={false}
                showViews
                label="arc.arch.001"
              />
            </div>
          </div>
          <div className="tl-sequence-links">
            <Link to={editorHref(archDiagram, { _theme: 'cool', _mode: 'light' })}>Open this diagram in the editor ↗</Link>
            <Link to="/docs/views">How the chapter rail works →</Link>
          </div>
          <div className="tl-embed">
            <p className="tl-section-p">
              The same component renders in your app, your docs, or your README —
              one typed config, zero runtime deps.
            </p>
            <pre className="tl-embed-code" aria-label="Embedding Arc in a React app"><code>{`npm i @arach/arc

import { ArcDiagram } from '@arach/arc'

<ArcDiagram data={diagram} theme="cool" />`}</code></pre>
          </div>
        </section>

        {/* ISOMETRIC PLATES */}
        <section id="isometric" className="tl-section" aria-labelledby="isometric-heading">
          <div className="tl-head">
            <div>
              <Tag n="03">ISOMETRIC</Tag>
              <h2 id="isometric-heading" className="tl-h2">The same model, on the drafting table.</h2>
              <p className="tl-section-p">
                One typed config in isometric view — toggle the ink between sepia
                blueprint and cyanotype.
              </p>
            </div>
            <div className="tl-pipeline-id">ARC.ARCH.001<br />viewMode: isometric</div>
          </div>
          <Suspense fallback={<div style={{ minHeight: 320 }} />}>
            <IsoPlateShowcase data={archDiagram} />
          </Suspense>
          <div className="tl-sequence-links">
            <Link to={editorHref(archDiagram, { _viewMode: 'isometric', _isoStyle: 'blueprint' })}>Open the plate in the editor ↗</Link>
          </div>
        </section>

        {/* NATIVE MERMAID SEQUENCE */}
        <section id="sequence" className="tl-section tl-sequence-section" aria-labelledby="sequence-heading">
          <div className="tl-head">
            <div>
              <Tag n="04">SEQUENCE</Tag>
              <h2 id="sequence-heading" className="tl-h2">Interaction, rendered in sequence.</h2>
              <p className="tl-section-p">
                Keep Mermaid as the reviewable source while Arc owns the typed interaction model,
                theme, renderer, and playback controls.
              </p>
            </div>
            <div className="tl-pipeline-id">MERMAID.SEQUENCE.001<br />source → model → player</div>
          </div>
          <Suspense fallback={<div style={{ minHeight: 320 }} />}>
            <SequenceEngineShowcase showSource showIntro={false} />
          </Suspense>
          <div className="tl-sequence-links">
            <Link to="/blog/native-mermaid-sequences">Read the build note →</Link>
            <Link to="/docs/mermaid-sequences">Open the implementation guide →</Link>
          </div>
        </section>

        {/* AGENTIC LOOP */}
        <section id="agentic" className="tl-section" aria-labelledby="agentic-heading">
          <div className="tl-head">
            <div>
              <Tag n="05">AGENTIC LOOP</Tag>
              <h2 id="agentic-heading" className="tl-h2">Diagrams maintained by the agents that change the code.</h2>
              <p className="tl-section-p">
                The author is a model now. Typed JSON, coded diagnostics, and structural
                diffs mean the agent that edits the system updates the picture in the
                same commit — and review can check that it did.
              </p>
            </div>
            <div className="tl-pipeline-id">AGENT.LOOP.001<br />edit → check → diff → review</div>
          </div>
          <ol className="tl-feature-grid tl-loop-grid">
            {loopBeats.map((f) => (
              <li className="tl-feature" key={f.n}>
                <div className="tl-feature-n">{f.n}</div>
                <div className="tl-feature-h">{f.h}</div>
                <div className="tl-feature-p">{f.p}</div>
              </li>
            ))}
          </ol>
          <div className="tl-sequence-links">
            <Link to="/docs/agentic-loop">Read the agentic loop →</Link>
            <Link to="/mcp">MCP tools for agents →</Link>
          </div>
        </section>
      </div>

      {/* EXAMPLES TEASER — three gallery entries, three themes, rendered live */}
      <section className="tl-examples-band" aria-labelledby="examples-heading">
        <div className="tl-shell">
          <div className="tl-examples-head">
            <div>
              <Tag n="06" invert>EXAMPLES</Tag>
              <h2 id="examples-heading" className="tl-h2">Real diagrams. Any theme.</h2>
              <p className="tl-section-p">
                Three entries from the examples gallery, each in a different theme. Open one
                for its source, or take it into the editor.
              </p>
            </div>
            <Link className="tl-btn tl-btn-line" to="/examples">Open the examples gallery →</Link>
          </div>
        </div>
        {/* Wider than the shell: the samples are the point of the band. */}
        <ul className="tl-sample-grid">
          {themeSamples.map((s) => (
            <li key={s.theme}>
              <Link className="tl-sample" to={`/examples/${s.example}`} aria-label={`${s.title}, in the ${s.name} theme — open the example and its source`}>
                <div className="tl-sample-mount" aria-hidden="true">
                  <ArcDiagram
                    data={s.diagram}
                    mode={mode}
                    theme={s.theme}
                    defaultZoom="fit"
                    fitPadding={0}
                    maxFitZoom={1}
                    interactive={false}
                    hoverEffects={false}
                    showArcToggle={false}
                    animateFlows={false}
                    label=""
                  />
                </div>
                <div className="tl-sample-meta">
                  <span className="tl-sample-name">{s.title}</span>
                  <span className="tl-sample-note">theme=&quot;{s.theme}&quot; · open ↗</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="tl-shell">
        {/* DOCS */}
        <section id="docs" className="tl-section" aria-labelledby="docs-heading">
          <div className="tl-head">
            <div>
              <Tag n="07">DOCS</Tag>
              <h2 id="docs-heading" className="tl-h2">Start reading.</h2>
            </div>
          </div>
          <ul className="tl-doc-list">
            {docs.map((d) => (
              <li key={d.n}>
                <Link className="tl-doc" to={d.to}>
                  <span className="tl-doc-n">{d.n}</span>
                  <span className="tl-doc-h">{d.h}</span>
                  <span className="tl-doc-p">{d.p}</span>
                  <span className="tl-doc-go" aria-hidden="true">→</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* CTA */}
        <section className="tl-cta" aria-labelledby="cta-heading">
          <div className="tl-cta-card">
            <div>
              <Tag>GET STARTED</Tag>
              <h2 id="cta-heading" className="tl-h2">Ready to share the system story?</h2>
              <p className="tl-section-p">
                Open the editor, design a diagram, and export it to the docs. Arc keeps diagrams living
                alongside your codebase.
              </p>
              <div className="tl-actions">
                <button type="button" className="tl-btn tl-btn-signal" onClick={onLaunchEditor}>Launch the editor →</button>
                <Link className="tl-btn tl-btn-ghost" to="/examples">See examples</Link>
              </div>
            </div>
            <dl className="tl-specs">
              <div className="tl-specs-h">SPECS</div>
              <div><dt>version</dt><dd>v{version}</dd></div>
              <div><dt>install</dt><dd>npm i @arach/arc</dd></div>
              <div><dt>source</dt><dd>TypeScript / JSON</dd></div>
              <div><dt>render</dt><dd>SSR · client</dd></div>
              <div><dt>agents</dt><dd>MCP server · skills</dd></div>
            </dl>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="tl-footer">
          <span className="tl-footer-brand"><ArcMark />Arc — diagrams that live where your system does.</span>
          <span>MIT · <a href="https://github.com/hudsonkit/arc" target="_blank" rel="noopener noreferrer">GitHub ↗</a></span>
        </footer>
      </div>
    </div>
  )
}
