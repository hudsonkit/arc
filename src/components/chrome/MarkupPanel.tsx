// The diagram's markup, as a pane beside the drawing.
//
// Opening it splits the surface — source on the left, rendering on the right —
// so an edit and its effect are visible at once. Editing runs the other way
// too: valid JSON is applied back to the diagram as you type.
//
// The editor is Hudson's CodeEditor from hudsonkit/controls (CodeMirror 6),
// which brings the syntax highlighting and gutter with it, so we only supply
// the language and the document. Its CodeMirror packages are optional peers of
// hudsonkit and are installed here.
//
// Two formats, deliberately different in kind:
//   .json  the document itself — editable, round-trips
//   .ts    a generated module for pasting into a repo — read-only, since
//          parsing arbitrary TypeScript back into a diagram is a different
//          problem to the one this pane solves

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Copy, X } from 'lucide-react'
import { CodeEditor } from 'hudsonkit/controls'
import { validateDiagram, type Diagnostic } from '../../utils/diagramDiagnostics'

export type MarkupFormat = 'ts' | 'json'

const WIDTH_KEY = 'arc-markup-width'
const DEFAULT_WIDTH = 460
const MIN_WIDTH = 280
/** Leave the drawing at least a third of the surface. */
const MAX_FRACTION = 0.68
/** Keyboard nudge for the resize handle. */
const RESIZE_STEP = 24

function maxWidth(): number {
  if (typeof window === 'undefined') return DEFAULT_WIDTH
  return Math.max(MIN_WIDTH, Math.round(window.innerWidth * MAX_FRACTION))
}

const clampWidth = (px: number) => Math.min(Math.max(px, MIN_WIDTH), maxWidth())

function loadWidth(): number {
  if (typeof window === 'undefined') return DEFAULT_WIDTH
  try {
    const stored = Number(window.localStorage.getItem(WIDTH_KEY))
    return Number.isFinite(stored) && stored >= MIN_WIDTH ? clampWidth(stored) : DEFAULT_WIDTH
  } catch {
    // Storage can throw outright in private mode — fall back to the default.
    return DEFAULT_WIDTH
  }
}

function storeWidth(px: number) {
  try { window.localStorage.setItem(WIDTH_KEY, String(px)) } catch { /* private mode */ }
}

/** TypeScript module — what you paste into a repo. */
export function toTsSource(data: unknown, name = 'diagram'): string {
  const json = JSON.stringify(data, null, 2)
    .replace(/"([^"]+)":/g, '$1:')
    .replace(/"/g, "'")
  return `import type { ArcDiagramData } from '@hudsonkit/arc'\n\nconst ${name}: ArcDiagramData = ${json}\n\nexport default ${name}\n`
}

type Status =
  | { kind: 'clean' }
  | { kind: 'applied' }
  | { kind: 'error'; message: string }

interface MarkupPanelProps {
  title: string
  /** Clean export payload — no editor-only fields. */
  data: unknown
  /** Supplied by surfaces that can take an edit back. Omit for read-only. */
  onApply?: (next: Record<string, unknown>) => void
  onClose: () => void
}

export default function MarkupPanel({ title, data, onApply, onClose }: MarkupPanelProps) {
  const [format, setFormat] = useState<MarkupFormat>('json')
  const [copied, setCopied] = useState(false)
  const [status, setStatus] = useState<Status>({ kind: 'clean' })
  // Text the user is editing; null means "follow the diagram".
  const [draft, setDraft] = useState<string | null>(null)
  // Diagnostics for the draft once it has parsed; null means "use the live ones".
  const [draftDiagnostics, setDraftDiagnostics] = useState<Diagnostic[] | null>(null)
  const applyTimer = useRef<number | null>(null)
  const copyTimer = useRef<number | null>(null)
  // The source our own apply is expected to produce. An edit echoing back must
  // not replace the text under the cursor; a change from the canvas must.
  const echo = useRef<string | null>(null)
  const [width, setWidth] = useState(loadWidth)
  const drag = useRef<{ startX: number; startWidth: number } | null>(null)

  const rendered = useMemo(
    () => (format === 'ts' ? toTsSource(data) : JSON.stringify(data, null, 2)),
    [format, data],
  )
  const editable = format === 'json' && !!onApply
  const source = draft ?? rendered

  const liveDiagnostics = useMemo(() => validateDiagram(data), [data])
  const diagnostics = draftDiagnostics ?? liveDiagnostics

  useEffect(() => {
    if (echo.current !== null && echo.current === rendered) {
      echo.current = null
      return
    }
    echo.current = null
    setDraft(null)
    setDraftDiagnostics(null)
    setStatus({ kind: 'clean' })
  }, [rendered])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Escape inside the code editor steps out of it; the pane closes on the
      // next press, once focus has left.
      const el = e.target as HTMLElement | null
      if (el?.closest?.('.cm-editor')) return
      onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => () => {
    if (applyTimer.current) window.clearTimeout(applyTimer.current)
    if (copyTimer.current) window.clearTimeout(copyTimer.current)
  }, [])

  // --- resize ---

  // A narrowed window must not leave the pane covering the drawing.
  useEffect(() => {
    const onResize = () => setWidth(w => (w > maxWidth() ? maxWidth() : w))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const onResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { startX: e.clientX, startWidth: width }
  }, [width])

  const onResizeMove = useCallback((e: React.PointerEvent) => {
    if (!drag.current) return
    setWidth(clampWidth(drag.current.startWidth + (e.clientX - drag.current.startX)))
  }, [])

  const onResizeEnd = useCallback((e: React.PointerEvent) => {
    if (!drag.current) return
    drag.current = null
    ;(e.target as HTMLElement).releasePointerCapture?.(e.pointerId)
    storeWidth(width)
  }, [width])

  // Double-click the handle to snap back to a readable default.
  const onResizeReset = useCallback(() => {
    setWidth(DEFAULT_WIDTH)
    storeWidth(DEFAULT_WIDTH)
  }, [])

  // The handle is focusable, so the split is reachable without a pointer.
  const onResizeKey = useCallback((e: React.KeyboardEvent) => {
    const delta = e.key === 'ArrowLeft' ? -RESIZE_STEP : e.key === 'ArrowRight' ? RESIZE_STEP : 0
    if (!delta) return
    e.preventDefault()
    setWidth(w => {
      const next = clampWidth(w + delta)
      storeWidth(next)
      return next
    })
  }, [])

  const handleChange = (next: string) => {
    // CodeMirror re-emits the document whenever `code` changes from outside —
    // a canvas edit, File → New. That is not the user typing, and treating it
    // as one applied the document back to itself: a history entry and a dirty
    // flag for every move of a node.
    if (next === rendered) {
      if (applyTimer.current) window.clearTimeout(applyTimer.current)
      setDraft(null)
      setDraftDiagnostics(null)
      return
    }
    setDraft(next)
    if (!editable) return
    if (applyTimer.current) window.clearTimeout(applyTimer.current)
    // Debounced: parsing on every keystroke would fight half-typed JSON.
    applyTimer.current = window.setTimeout(() => {
      let parsed: unknown
      try {
        parsed = JSON.parse(next)
      } catch (err) {
        setStatus({ kind: 'error', message: (err as Error).message.replace(/^JSON\.parse: /, '') })
        setDraftDiagnostics(null)
        return
      }
      const diags = validateDiagram(parsed)
      setDraftDiagnostics(diags)
      // Only shape failures block apply — the same bar validateDiagramShape set.
      const shapeError = diags.find(dd => dd.code.startsWith('shape/'))
      if (shapeError) {
        setStatus({ kind: 'error', message: shapeError.message })
        return
      }
      echo.current = JSON.stringify(parsed, null, 2)
      onApply?.(parsed as Record<string, unknown>)
      setStatus({ kind: 'applied' })
    }, 400)
  }

  const pickFormat = (next: MarkupFormat) => {
    if (next === format) return
    // Drop a pending apply — it belongs to text that is about to be replaced.
    if (applyTimer.current) window.clearTimeout(applyTimer.current)
    setDraft(null)
    setDraftDiagnostics(null)
    setStatus({ kind: 'clean' })
    setFormat(next)
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(source)
      setCopied(true)
      if (copyTimer.current) window.clearTimeout(copyTimer.current)
      copyTimer.current = window.setTimeout(() => setCopied(false), 1600)
    } catch {
      // Denied permission, or a page served over plain http.
      setStatus({ kind: 'error', message: 'Clipboard unavailable — select the text and copy' })
    }
  }

  const lines = source.split('\n').length
  const footer =
    status.kind === 'error'
      ? `⚠ ${status.message}`
      : status.kind === 'applied'
        ? `${lines} lines · applied to canvas`
        : `${lines} lines · ${format === 'ts' ? 'read-only export' : editable ? 'edit to update the diagram' : 'diagram JSON'}`

  const shownDiagnostics = diagnostics.slice(0, 3)
  const hiddenDiagnostics = diagnostics.length - shownDiagnostics.length
  const hasErrorDiagnostic = diagnostics.some(dd => dd.severity === 'error')

  return (
    <aside className="arc-markup-pane" style={{ width }} aria-label="Diagram markup">
      <div className="arc-markup-head">
        <span className="arc-markup-title" title={title}>{title}</span>
        <div className="arc-markup-formats" role="group" aria-label="Markup format">
          <button
            type="button"
            className={`arc-settings-segment${format === 'json' ? ' is-active' : ''}`}
            aria-pressed={format === 'json'}
            onClick={() => pickFormat('json')}
          >
            .json
          </button>
          <button
            type="button"
            className={`arc-settings-segment${format === 'ts' ? ' is-active' : ''}`}
            aria-pressed={format === 'ts'}
            onClick={() => pickFormat('ts')}
          >
            .ts
          </button>
        </div>
        <button
          type="button"
          className="arc-editor-btn"
          onClick={copy}
          title={copied ? 'Copied' : 'Copy markup'}
          aria-label="Copy markup"
        >
          {copied ? <Check /> : <Copy />}
        </button>
        <button type="button" className="arc-editor-btn" onClick={onClose} title="Close" aria-label="Close markup">
          <X />
        </button>
      </div>

      <div className="arc-markup-source">
        <CodeEditor
          key={format}
          code={source}
          language={format === 'ts' ? 'typescript' : 'json'}
          filename={format === 'ts' ? 'diagram.ts' : 'diagram.json'}
          readOnly={!editable}
          showLineNumbers
          onChange={handleChange}
        />
      </div>

      <div
        className={`arc-markup-foot${status.kind === 'error' || hasErrorDiagnostic ? ' is-error' : ''}`}
        role="status"
        aria-live="polite"
      >
        <div>{footer}</div>
        {diagnostics.length > 0 && (
          <div className="arc-markup-diagnostics">
            {diagnostics.length} {diagnostics.length === 1 ? 'diagnostic' : 'diagnostics'}
            {shownDiagnostics.map((dd, i) => (
              <div key={i} className="arc-markup-diagnostic">
                {dd.code} · {dd.message}
              </div>
            ))}
            {hiddenDiagnostics > 0 && <div>+{hiddenDiagnostics} more</div>}
          </div>
        )}
      </div>

      <div
        className="arc-markup-resizer"
        role="separator"
        tabIndex={0}
        aria-orientation="vertical"
        aria-label="Resize markup pane"
        aria-valuenow={width}
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={maxWidth()}
        onPointerDown={onResizeStart}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeEnd}
        onPointerCancel={onResizeEnd}
        onDoubleClick={onResizeReset}
        onKeyDown={onResizeKey}
      />
    </aside>
  )
}
