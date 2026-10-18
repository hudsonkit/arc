import { lazy, Suspense, useEffect, useState } from 'react'
import { Braces, Eye } from 'lucide-react'
import { Link } from 'react-router-dom'
import ErrorBoundary from '../../components/ErrorBoundary'
import SettingsRail from '../../components/chrome/SettingsRail'

import DiagramCanvas from '../../components/editor/DiagramCanvas'
import FloatingToolbar from '../../components/editor/FloatingToolbar'
import { useDiagram, useEditor, useEditorState, useThemeId } from '../../components/editor/EditorProvider'
import { useArcEditor, useArcEditorViewport } from './ArcEditorContext'

// CodeMirror is only worth downloading once the markup pane is opened.
const MarkupPanel = lazy(() => import('../../components/chrome/MarkupPanel'))

export default function ArcEditorContent() {
  const editor = useEditorState()
  const themeId = useThemeId()
  const diagram = useDiagram()
  const { actions } = useEditor()
  const { sessionId } = useArcEditor()
  const { setViewportBounds } = useArcEditorViewport()
  // Remembered, so a split-view habit survives a reload.
  const [showMarkup, setShowMarkup] = useState(() => {
    // Reading storage can throw outright, not just return null (private mode).
    try { return window.localStorage.getItem('arc-editor-markup') === '1' } catch { return false }
  })

  useEffect(() => {
    try { window.localStorage.setItem('arc-editor-markup', showMarkup ? '1' : '0') } catch { /* private mode */ }
  }, [showMarkup])
  const isDark = editor.colorMode === 'dark'

  // Clean export payload — the same shape the player and a saved file carry.
  // Editor state is loosely typed here, so read the optional keys off a record.
  const d = diagram as Record<string, unknown>
  const markup = {
    ...(d.id ? { id: d.id } : {}),
    layout: d.layout,
    nodes: d.nodes,
    nodeData: d.nodeData,
    connectors: d.connectors,
    connectorStyles: d.connectorStyles,
    ...(Array.isArray(d.groups) && d.groups.length ? { groups: d.groups } : {}),
    ...(d.focusTargets ? { focusTargets: d.focusTargets } : {}),
  }

  return (
    <div className="arc-shell-row">
      <SettingsRail editorTo={sessionId ? `/editor/${sessionId}` : undefined}>
        <button
          type="button"
          className={`arc-rail-btn${showMarkup ? ' is-active' : ''}`}
          title="Diagram markup"
          aria-label="Diagram markup"
          onClick={() => setShowMarkup(v => !v)}
        >
          <Braces strokeWidth={1.75} />
        </button>
        {sessionId && (
          <Link
            to={`/player/${sessionId}`}
            className="arc-rail-btn"
            title="Open the read-only viewer"
            aria-label="Viewer"
          >
            <Eye strokeWidth={1.75} />
          </Link>
        )}
      </SettingsRail>

      {showMarkup && (
        <Suspense fallback={null}>
          <MarkupPanel
            title={(d.id as string) || 'Untitled diagram'}
            data={markup}
            onApply={next => actions.replaceDiagram(next)}
            onClose={() => setShowMarkup(false)}
          />
        </Suspense>
      )}
      <div className="arc-editor-canvas arc-shell-main">
      {/* An edit that fixes a broken diagram should bring the canvas back. */}
      <ErrorBoundary resetKey={diagram}>
        <DiagramCanvas
          onViewportChange={setViewportBounds}
          embedConfig={{ enableViewModeToggle: true }}
          zoomConfig={{ defaultZoom: 'fit', maxFitZoom: 1.1 }}
          surface="chrome"
          themeOverride={themeId || undefined}
          isDark={isDark}
        />
      </ErrorBoundary>
      <FloatingToolbar />
      </div>
    </div>
  )
}