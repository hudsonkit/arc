import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import LandingPage from './components/LandingPage'
import ArcDiagram from './components/ArcDiagram'
import architectureDiagram from './components/diagrams/architecture.diagram'
import { getTheme, THEMES, type ThemeId } from './utils/themes'
import { GoogleAnalytics } from './components/GoogleAnalytics'
import { useMeta } from './hooks/useMeta'
import { generateSessionId, deriveSessionId, saveDiagramSession, loadDiagramSession } from './utils/sessionStorage'
import './landing.css'

// Heavy surfaces load on demand — the landing shouldn't ship the editor,
// CodeMirror, Dewey, or three.js to someone who never leaves the front page.
const DiagramEditor = lazy(() => import('./components/editor/DiagramEditor'))
const ArcDocs = lazy(() => import('./components/docs/ArcDocs'))
const AgentSharePage = lazy(() => import('./components/AgentSharePage'))
const SoftwareListPage = lazy(() => import('./components/SoftwareListPage'))
const IsometricDemo = lazy(() => import('./components/IsometricDemo'))
const IsometricExamples = lazy(() => import('./components/IsometricExamples'))
const PlayerShowcase = lazy(() => import('./components/PlayerShowcase'))
const NativeMermaidSequencesPost = lazy(() => import('./components/blog/NativeMermaidSequencesPost'))
const ConnectionPoolExplainer = lazy(() => import('./components/explainers/ConnectionPoolExplainer'))
const ExamplesPage = lazy(() => import('./components/ExamplesPage'))

interface HashPayload {
  diagram: any
  originalDiagram?: any  // Clean diagram data (no editor offsets) for player
  viewport?: { width: number; height: number }
  theme?: string
  mode?: 'light' | 'dark'
  sourceId?: string // diagram ID from source (e.g. "OPERATE.CONTROL.001")
  isoStyle?: string // 'solid' | 'blueprint' | 'cyanotype'
  viewMode?: string // '2d' | 'isometric'
}

function parseHashData(): HashPayload | null {
  const hash = window.location.hash
  if (!hash.startsWith('#data=')) return null
  try {
    const encoded = hash.slice(6)
    const json = atob(encoded)
    const d = JSON.parse(json)

    // Diagram files carry display choices under _meta; the embed handoff sends
    // them as underscore keys. Accept either, with the explicit key winning.
    const fileMeta = d._meta || {}
    const viewport = d._viewport ?? fileMeta.viewport
    const theme = d._theme ?? fileMeta.themeId
    const mode = d._mode ?? fileMeta.colorMode
    const isoStyle = d._isoStyle ?? fileMeta.isoStyle
    const viewMode = d._viewMode ?? fileMeta.viewMode
    const sourceId = d.id // diagram ID from the source site

    // Canvas is slightly larger than content to give room for the viewport frame
    const diagramLayout = d.layout || { width: 800, height: 400 }
    const padding = viewport ? 80 : 100  // Just enough for the frame + breathing room
    const layout = {
      width: Math.max(diagramLayout.width, viewport?.width || 0) + padding,
      height: Math.max(diagramLayout.height, viewport?.height || 0) + padding,
    }

    // Offset to place nodes inside a viewport frame
    const offset = viewport ? 40 : 0
    const nodes = d.nodes || {}
    const offsetNodes: Record<string, any> = {}
    for (const [id, node] of Object.entries(nodes)) {
      const n = node as any
      offsetNodes[id] = { ...n, x: n.x + offset, y: n.y + offset }
    }

    // Add a viewport frame as a dashed group rectangle
    const groups = viewport ? [{
      id: '_viewport',
      x: offset,
      y: offset,
      width: viewport.width,
      height: viewport.height,
      type: 'rect' as const,
      color: 'blue' as const,
      label: `Viewport ${viewport.width}×${viewport.height}`,
      dashed: true,
    }] : []

    // Original diagram (clean, no offsets) — for player rendering
    // Add padding to layout so edge nodes (especially xs with text labels) aren't clipped
    const pad = 40
    const paddedNodes: Record<string, any> = {}
    for (const [id, node] of Object.entries(d.nodes || {})) {
      const n = node as any
      paddedNodes[id] = { ...n, x: n.x + pad, y: n.y + pad }
    }
    const originalDiagram = {
      layout: { width: diagramLayout.width + pad * 2, height: diagramLayout.height + pad * 2 },
      nodes: paddedNodes,
      nodeData: d.nodeData || {},
      connectors: d.connectors || [],
      connectorStyles: d.connectorStyles || {},
      flows: d.flows,
      focusTargets: d.focusTargets,
      views: d.views,
      groups: d.groups || [],
    }

    return {
      diagram: {
        layout,
        grid: { enabled: true, size: 24, color: '#71717a', opacity: 0.1, type: 'dots' },
        nodes: offsetNodes,
        nodeData: d.nodeData || {},
        connectors: d.connectors || [],
        connectorStyles: d.connectorStyles || {},
        flows: d.flows,
        focusTargets: d.focusTargets,
        views: d.views,
        groups,
      },
      originalDiagram,
      viewport,
      theme,
      mode,
      sourceId,
      isoStyle,
      viewMode,
    }
  } catch (e) {
    console.warn('Failed to load diagram from URL hash:', e)
    return null
  }
}

/** Resolve initial editor state synchronously from hash or localStorage */
function resolveEditorSession(urlSessionId?: string) {
  // Priority 1: Hash data (incoming from edit button)
  const hashPayload = parseHashData()
  if (hashPayload) {
    const id = hashPayload.sourceId
      ? deriveSessionId(hashPayload.sourceId)
      : generateSessionId()
    const mode = hashPayload.mode || 'light'
    const diagramMeta = {
      themeId: hashPayload.theme,
      colorMode: mode,
      viewport: hashPayload.viewport,
      sourceId: hashPayload.sourceId,
      isoStyle: hashPayload.isoStyle,
      viewMode: hashPayload.viewMode,
    }

    // Persist immediately so refresh works
    saveDiagramSession(id, {
      diagram: hashPayload.diagram,
      originalDiagram: hashPayload.originalDiagram,
      themeId: hashPayload.theme || null,
      colorMode: mode,
      diagramMeta,
    })

    return { sessionId: id, initialData: hashPayload.diagram, originalDiagram: hashPayload.originalDiagram, themeId: hashPayload.theme || null, colorMode: mode, diagramMeta, needsRedirect: true }
  }

  // Priority 2: URL session ID — restore from localStorage
  if (urlSessionId) {
    const session = loadDiagramSession(urlSessionId)
    if (session) {
      return { sessionId: urlSessionId, initialData: session.diagram, originalDiagram: session.originalDiagram, themeId: session.themeId, colorMode: session.colorMode, diagramMeta: session.diagramMeta, needsRedirect: false }
    }
  }

  // Priority 3: Fresh editor
  const newId = generateSessionId()
  return { sessionId: newId, initialData: null, originalDiagram: null, themeId: 'command', colorMode: 'dark' as const, diagramMeta: { themeId: 'command', colorMode: 'dark' }, needsRedirect: !urlSessionId }
}

function EditorPage() {
  const { sessionId: urlSessionId } = useParams<{ sessionId?: string }>()

  // Resolve session synchronously on first render
  const [resolved] = useState(() => resolveEditorSession(urlSessionId))

  // Redirect to clean session URL if needed (hash import or fresh editor)
  useEffect(() => {
    if (resolved.needsRedirect) {
      // Use window.history directly to avoid React Router unmount/remount.
      // BASE_URL keeps the mount path when the app is served under a base (e.g. /arc/).
      window.history.replaceState(null, '', `${import.meta.env.BASE_URL}editor/${resolved.sessionId}`)
    }
  }, [resolved.needsRedirect, resolved.sessionId])

  return (
    <DiagramEditor
      initialData={resolved.initialData}
      themeId={resolved.themeId}
      colorMode={resolved.colorMode}
      sessionId={resolved.sessionId}
      initialDiagramMeta={resolved.diagramMeta}
    />
  )
}

/**
 * Shared dead-end screen: a wrong URL, or a player asked for a diagram this
 * browser has never seen. Both need somewhere to go next, not just a message.
 */
function Dead({ title, detail, actions }: { title: string; detail: string; actions: { to: string; label: string }[] }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 px-6 text-center">
      <div className="max-w-md">
        <div className="mx-auto mb-5 h-2 w-2 rounded-sm bg-sky-500 shadow-[0_0_14px_2px_rgba(56,189,248,0.45)]" />
        <h1 className="mb-2 text-base font-semibold text-zinc-100">{title}</h1>
        <p className="mb-6 text-sm leading-relaxed text-zinc-400">{detail}</p>
        <div className="flex items-center justify-center gap-2">
          {actions.map(a => (
            <Link
              key={a.to}
              to={a.to}
              className="rounded border border-zinc-700 px-3 py-1.5 text-xs uppercase tracking-wider text-zinc-300 transition-colors hover:border-sky-600 hover:text-sky-400"
            >
              {a.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Static pages render light-only — strip the editor's persisted dark mode. */
function useLightMode() {
  useEffect(() => { document.documentElement.classList.remove('dark') }, [])
}

function NotFoundPage() {
  useLightMode()
  useMeta({ title: 'Arc | Page not found', description: 'That URL is not routed.' })
  return (
    <Dead
      title="No such page"
      detail={`Nothing is routed at ${window.location.pathname}. It may have moved, or the link may be stale.`}
      actions={[
        { to: '/', label: 'Home' },
        { to: '/editor', label: 'Editor' },
        { to: '/docs', label: 'Docs' },
      ]}
    />
  )
}

/** Parse URL query params for theme/mode/viewport overrides */
function useUrlOverrides() {
  const [searchParams, setSearchParams] = useSearchParams()
  return {
    theme: searchParams.get('theme'),
    mode: searchParams.get('mode') as 'light' | 'dark' | null,
    viewport: searchParams.get('viewport') ? (() => {
      const [w, h] = searchParams.get('viewport')!.split('x').map(Number)
      return w && h ? { width: w, height: h } : null
    })() : null,
    // ?chrome=false strips the Source toggle + zoom controls for clean captures
    chrome: searchParams.get('chrome') !== 'false',
    // ?view=<id> deep-links one of data.views in the player's chapter rail
    view: searchParams.get('view'),
    setView: (view: string | null) => {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev)
        if (view == null) next.delete('view')
        else next.set('view', view)
        return next
      }, { replace: true })
    },
    locale: searchParams.get('locale'),
  }
}

/** Standalone player route: renders a diagram read-only with full theme fidelity */
function PlayerPage() {
  const { '*': diagramPath } = useParams()
  const urlOverrides = useUrlOverrides()
  const [session, setSession] = useState<ReturnType<typeof loadDiagramSession>>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!diagramPath) {
      setError('No diagram path specified')
      return
    }

    const sessionId = deriveSessionId(diagramPath)
    const loaded = loadDiagramSession(sessionId)
    if (loaded) {
      setSession(loaded)
    } else {
      setError(`No session named "${diagramPath}" in this browser. Sessions are stored locally, so a diagram has to be opened in the editor here before the player can render it.`)
    }
  }, [diagramPath])

  // Poll localStorage for changes (enables agent iteration: write → auto-refresh)
  useEffect(() => {
    if (!diagramPath) return
    const sessionId = deriveSessionId(diagramPath)
    const interval = setInterval(() => {
      if (document.hidden) return
      const current = loadDiagramSession(sessionId)
      if (current) {
        setSession(prev => {
          if (prev && current.updatedAt !== prev.updatedAt) return current
          if (!prev) return current
          return prev
        })
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [diagramPath])

  // URL params override session values
  const colorMode = urlOverrides.mode || session?.colorMode || 'dark'
  const rawThemeId = urlOverrides.theme || session?.themeId
  const themeId = rawThemeId && rawThemeId in THEMES ? (rawThemeId as ThemeId) : undefined
  const viewport = urlOverrides.viewport || session?.diagramMeta?.viewport
  const locale = urlOverrides.locale || session?.diagramMeta?.locale

  useEffect(() => {
    if (colorMode === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    return () => document.documentElement.classList.remove('dark')
  }, [colorMode])

  if (error) {
    return (
      <Dead
        title="Diagram not found"
        detail={error}
        actions={[
          { to: '/editor', label: 'New diagram' },
          { to: '/showcase', label: 'Showcase' },
        ]}
      />
    )
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <div className="text-sm text-zinc-500">Loading…</div>
      </div>
    )
  }

  // Use original diagram (clean, no editor offsets) for player rendering
  const playerData = session.originalDiagram || session.diagram

  return (
    <div className="min-h-screen flex items-center justify-center p-12">
      <div style={viewport ? { width: viewport.width, height: viewport.height } : undefined} className={viewport ? '' : 'w-full max-w-4xl'}>
        <ArcDiagram
          data={playerData}
          mode={colorMode}
          theme={themeId}
          interactive={urlOverrides.chrome}
          defaultZoom="fit"
          showArcToggle={urlOverrides.chrome}
          showControls={urlOverrides.chrome}
          showViews={urlOverrides.chrome && !!playerData.views?.length}
          showFocusStory={urlOverrides.chrome && !!playerData.focusTargets}
          view={urlOverrides.view}
          onViewChange={urlOverrides.setView}
          locale={locale}
        />
      </div>
    </div>
  )
}

function LandingPageWrapper() {
  const navigate = useNavigate()

  // Ensure dark mode is removed on landing page
  useLightMode()

  return <LandingPage onLaunchEditor={() => navigate('/editor')} />
}

function DocsWrapper() {
  const { page } = useParams<{ page?: string }>()

  // Ensure dark mode is removed on docs
  useLightMode()

  return <ArcDocs pageId={page || 'index'} />
}

const EXPLORATIONS: { id: ThemeId; label: string; sub: string }[] = [
  { id: 'spacex', label: 'xAI / SpaceX', sub: 'crosshair grid · chamfer plates · telemetry cyan · reticle frame' },
  { id: 'claude', label: 'Claude', sub: 'parchment paper · warm clay accents · serif type · soft rule' },
  { id: 'codex', label: 'OpenAI / Codex', sub: 'graphite console · mint signal · glass cards · mono labels' },
  { id: 'command', label: 'Command', sub: 'crosshair grid · chamfer glass · cyan accent bar · connector glow' },
  { id: 'engineering', label: 'Engineering', sub: 'graph grid · framed corners · square tiles · uppercase mono' },
  { id: 'workbench', label: 'Workbench', sub: 'dot grid · hairline edge · soft corners · sentence case' },
  { id: 'tactical', label: 'Tactical', sub: 'crosshair grid · corner brackets · hard edges · uppercase' },
]

const FRAMES: { id: 'hairline' | 'inset' | 'brackets' | 'ticks' | 'cropmarks'; label: string }[] = [
  { id: 'hairline', label: 'Hairline' },
  { id: 'inset', label: 'Inset frame' },
  { id: 'brackets', label: 'Corner brackets' },
  { id: 'ticks', label: 'Ruler ticks' },
  { id: 'cropmarks', label: 'Crop marks' },
]

function InspirationPage() {
  useLightMode()
  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0c', padding: '40px 24px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <h1 style={{ color: '#fff', fontSize: 24, fontWeight: 700, margin: '0 0 6px' }}>Diagram style explorations</h1>
        <p style={{ color: '#9aa0a6', fontSize: 14, margin: '0 0 36px' }}>
          One diagram, seven drafting grammars. The nodes and palette stay the same — what changes is the grid system, the edge treatment, the type, and the geometry. Pan/zoom is live.
        </p>
        {EXPLORATIONS.map((b) => (
          <section key={b.id} style={{ marginBottom: 44 }}>
            <div style={{ marginBottom: 12 }}>
              <h2 style={{ color: '#e6e6e6', fontSize: 13, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', margin: 0 }}>{b.label}</h2>
              <div style={{ color: '#6b7178', fontSize: 12, marginTop: 2 }}>{b.sub} · <code style={{ color: '#9aa0a6' }}>theme="{b.id}"</code></div>
            </div>
            <div style={{ height: 460 }}>
              <ArcDiagram data={architectureDiagram} mode={getTheme(b.id).defaultMode || 'dark'} theme={b.id} interactive defaultZoom="fit" showControls showMinimap />
            </div>
          </section>
        ))}

        <h2 style={{ color: '#fff', fontSize: 18, fontWeight: 700, margin: '24px 0 6px' }}>Edge treatments</h2>
        <p style={{ color: '#9aa0a6', fontSize: 13, margin: '0 0 20px' }}>
          Same diagram, exploring the frame at the boundary. Each is inset with a consistent margin (no competing container border) — corners are just one option.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20, marginBottom: 44 }}>
          {FRAMES.map((f) => (
            <div key={f.id}>
              <div style={{ color: '#6b7178', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px' }}>
                {f.label} · <code style={{ color: '#9aa0a6' }}>frame="{f.id}"</code>
              </div>
              <div style={{ height: 280 }}>
                <ArcDiagram data={architectureDiagram} mode="dark" theme="workbench" frame={f.id} interactive={false} defaultZoom="fit" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <GoogleAnalytics />
      <Suspense fallback={<div className="min-h-screen" />}>
      <Routes>
        <Route path="/" element={<LandingPageWrapper />} />
        <Route path="/editor" element={<EditorPage />} />
        <Route path="/editor/:sessionId" element={<EditorPage />} />
        <Route path="/player/*" element={<PlayerPage />} />
        <Route path="/docs" element={<DocsWrapper />} />
        <Route path="/docs/:page" element={<DocsWrapper />} />
        <Route path="/mcp" element={<AgentSharePage kind="mcp" />} />
        <Route path="/skills" element={<AgentSharePage kind="skills" />} />
        <Route path="/architecture-diagram-software" element={<SoftwareListPage />} />
        <Route path="/blog/native-mermaid-sequences" element={<NativeMermaidSequencesPost />} />
        <Route path="/iso-demo" element={<IsometricDemo />} />
        <Route path="/iso-examples" element={<IsometricExamples />} />
        <Route path="/showcase" element={<PlayerShowcase />} />
        <Route path="/examples" element={<ExamplesPage />} />
        <Route path="/examples/:exampleId" element={<ExamplesPage />} />
        <Route path="/examples/connection-pool" element={<ConnectionPoolExplainer />} />
        <Route path="/inspiration" element={<InspirationPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

export default App
