import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useTheme } from 'hudsonkit/theme'
import {
  EditorProvider,
  useEditor,
  useDiagram,
  useEditorState,
  useMeta,
} from '../../components/editor/EditorProvider'
import ShareSheet from '../../components/dialogs/ShareSheet'
import useKeyboardShortcuts from '../../hooks/useKeyboardShortcuts'
import { useMeta as usePageMeta } from '../../hooks/useMeta'
import { saveDiagramSession, publishDiagramSession, loadDiagramSession, rememberLastSession } from '../../utils/sessionStorage'
import { saveDiagram, loadDiagram } from '../../utils/fileOperations'

export interface ArcEditorInit {
  initialData?: any
  themeId?: string | null
  colorMode?: 'light' | 'dark'
  sessionId?: string | null
  initialDiagramMeta?: Record<string, any>
}

export type NoticeTone = 'emerald' | 'amber' | 'red'

export interface EditorNotice {
  message: string
  tone: NoticeTone
}

interface ArcEditorContextValue {
  sessionId: string | null
  openShare: () => void
  handleNew: () => void
  handleOpen: () => Promise<void>
  handleSave: () => Promise<void>
  /** Transient line in the status bar — what just happened, or why it didn't. */
  notice: EditorNotice | null
}

const ArcEditorContext = createContext<ArcEditorContextValue | null>(null)

export function useArcEditor() {
  const ctx = useContext(ArcEditorContext)
  if (!ctx) {
    throw new Error('useArcEditor must be used inside ArcEditorProvider')
  }
  return ctx
}

function ArcEditorThemeSync() {
  const { resolvedTheme } = useTheme()
  const { actions } = useEditor()
  const editor = useEditorState()

  useEffect(() => {
    if (!resolvedTheme) return
    const mode = resolvedTheme === 'dark' ? 'dark' : 'light'
    if (editor.colorMode !== mode) {
      actions.setColorMode(mode)
    }
    if (mode === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [resolvedTheme, editor.colorMode, actions])

  useEffect(() => {
    return () => {
      document.documentElement.classList.remove('dark')
    }
  }, [])

  return null
}

function ArcEditorSession({
  sessionId,
  children,
}: {
  sessionId: string | null
  children: ReactNode
}) {
  const { actions, state } = useEditor()
  const diagram = useDiagram()
  const editor = useEditorState()
  const meta = useMeta()
  const [showShare, setShowShare] = useState(false)
  const [viewportBounds, setViewportBounds] = useState(null)
  const [notice, setNotice] = useState<EditorNotice | null>(null)
  const noticeTimer = useRef<number | null>(null)

  // File operations used to fail silently — a bad file left the editor looking
  // as if nothing had been clicked. Say so, briefly, in the status bar.
  const say = useCallback((message: string, tone: NoticeTone) => {
    setNotice({ message, tone })
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(
      () => setNotice(null),
      tone === 'red' ? 8000 : 3000,
    )
  }, [])

  useEffect(() => () => { if (noticeTimer.current) window.clearTimeout(noticeTimer.current) }, [])

  const [originalDiagram] = useState(() => {
    if (!sessionId) return null
    const existing = loadDiagramSession(sessionId)
    return existing?.originalDiagram || null
  })

  // Autosave. Debounced so a drag doesn't write on every frame, but the
  // pending write has to survive whatever ends the session — a route change to
  // the player, a closed tab, a reload. Hence the flush, which the unmount
  // cleanup and pagehide both call.
  const writeSession = useRef<() => void>(() => {})
  const saveTimer = useRef<number | null>(null)
  const unsaved = useRef(false)

  useEffect(() => {
    writeSession.current = () => {
      if (!sessionId) return
      saveDiagramSession(sessionId, {
        diagram: state.diagram,
        originalDiagram,
        themeId: state.editor.themeId,
        colorMode: state.editor.colorMode as 'light' | 'dark',
        diagramMeta: state.meta.diagramMeta || {},
      })
      rememberLastSession(sessionId)
    }
  })

  useEffect(() => {
    if (!sessionId) return
    publishDiagramSession(sessionId, {
      diagram: state.diagram, originalDiagram,
      themeId: state.editor.themeId,
      colorMode: state.editor.colorMode as 'light' | 'dark',
      diagramMeta: state.meta.diagramMeta || {},
    })
    unsaved.current = true
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      unsaved.current = false
      writeSession.current()
    }, 1000)
  }, [
    sessionId,
    state.diagram,
    state.editor.themeId,
    state.editor.colorMode,
    state.meta.diagramMeta,
    originalDiagram,
  ])

  useEffect(() => {
    const flush = () => {
      if (!unsaved.current) return
      unsaved.current = false
      if (saveTimer.current) clearTimeout(saveTimer.current)
      writeSession.current()
    }
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [])

  usePageMeta({
    title: 'Arc Editor | Visual Diagram Builder',
    description: 'Drag-and-drop diagram builder with real-time preview and JSON export.',
    image: '/og-editor.png',
    url: '/editor',
  })

  const handleNew = useCallback(() => {
    if (meta.isDirty && !window.confirm('Discard unsaved changes?')) return
    actions.newDiagram()
  }, [meta.isDirty, actions])

  const handleOpen = useCallback(async () => {
    if (meta.isDirty && !window.confirm('Discard unsaved changes?')) return
    const result = await loadDiagram()
    if (!result) return // cancelled
    if (result.error) {
      say(result.error, 'red')
      return
    }
    const { _meta, ...diagramData } = result.diagram
    const diagramMeta = _meta || {}
    actions.loadDiagram(diagramData, result.filename)
    if (diagramMeta.themeId) actions.setTheme(diagramMeta.themeId)
    if (diagramMeta.colorMode) actions.setColorMode(diagramMeta.colorMode)
    if (diagramMeta.isoStyle) actions.setIsoStyle(diagramMeta.isoStyle)
    if (diagramMeta.viewMode) actions.setViewMode(diagramMeta.viewMode)
    if (Object.keys(diagramMeta).length > 0) actions.setDiagramMeta(diagramMeta)
    say(`Opened ${result.filename}`, 'emerald')
  }, [meta.isDirty, actions, say])

  const handleSave = useCallback(async () => {
    const diagramWithMeta = {
      ...diagram,
      _meta: meta.diagramMeta || {},
    }
    try {
      const filename = await saveDiagram(diagramWithMeta, meta.filename || 'diagram.json')
      if (filename) {
        actions.markSaved(filename)
        say(`Saved ${filename}`, 'emerald')
      }
    } catch (err) {
      say((err as Error).message || 'Could not save the diagram.', 'red')
    }
  }, [diagram, meta.filename, meta.diagramMeta, actions, say])

  const handleDelete = useCallback(() => {
    if (editor.selectedNodeIds?.length > 0) {
      for (const nodeId of editor.selectedNodeIds) {
        actions.removeNode(nodeId)
      }
    } else if (editor.selectedConnectorIndex !== null) {
      actions.removeConnector(editor.selectedConnectorIndex)
    } else if (editor.selectedGroupId !== null) {
      actions.removeGroup(editor.selectedGroupId)
    } else if (editor.selectedImageId !== null) {
      actions.removeImage(editor.selectedImageId)
    }
  }, [
    editor.selectedNodeIds,
    editor.selectedConnectorIndex,
    editor.selectedGroupId,
    editor.selectedImageId,
    actions,
  ])

  const handleEscape = useCallback(() => {
    if (editor.pendingConnector) {
      actions.clearPendingConnector()
    } else if (editor.mode !== 'select') {
      actions.setMode('select')
    } else {
      actions.clearSelection()
    }
  }, [editor.mode, editor.pendingConnector, actions])

  useKeyboardShortcuts({
    onDelete: handleDelete,
    onUndo: actions.undo,
    onRedo: actions.redo,
    onSave: handleSave,
    onNew: handleNew,
    onEscape: handleEscape,
    onSetMode: actions.setMode,
  })

  const value = useMemo<ArcEditorContextValue>(() => ({
    sessionId,
    openShare: () => setShowShare(true),
    handleNew,
    handleOpen,
    handleSave,
    notice,
  }), [sessionId, handleNew, handleOpen, handleSave, notice])

  return (
    <ArcEditorContext.Provider value={value}>
      <ArcEditorViewportContext.Provider value={{ viewportBounds, setViewportBounds }}>
        {children}
        {showShare && (
          <ShareSheet
            diagram={diagram}
            viewportBounds={viewportBounds}
            onClose={() => setShowShare(false)}
          />
        )}
      </ArcEditorViewportContext.Provider>
    </ArcEditorContext.Provider>
  )
}

interface ArcEditorViewportContextValue {
  viewportBounds: any
  setViewportBounds: (bounds: any) => void
}

const ArcEditorViewportContext = createContext<ArcEditorViewportContextValue>({
  viewportBounds: null,
  setViewportBounds: () => {},
})

export function useArcEditorViewport() {
  return useContext(ArcEditorViewportContext)
}

export function ArcEditorProvider({
  children,
  init,
  initialDiagram,
}: {
  children: ReactNode
  init: ArcEditorInit
  initialDiagram: any
}) {
  return (
    <EditorProvider
      initialDiagram={initialDiagram}
      initialDiagramMeta={init.initialDiagramMeta}
      initialThemeId={init.themeId}
      initialColorMode={init.colorMode || 'dark'}
    >
      <ArcEditorThemeSync />
      <ArcEditorSession sessionId={init.sessionId ?? null}>
        {children}
      </ArcEditorSession>
    </EditorProvider>
  )
}