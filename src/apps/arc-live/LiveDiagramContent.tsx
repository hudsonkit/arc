import { useEffect, useRef, useState } from 'react'
import { Download, FileText, History, Radio, Sparkles } from 'lucide-react'
import { useTheme } from 'hudsonkit/theme'
import ArcDiagram from '../../components/ArcDiagram'
import { useLiveDiagram } from './LiveDiagramContext'
import { connectionLabel } from './liveState'
import { ActivityMatrix, AgentCoin, AgentIdentity, CanvasEditPresence, CanvasWorkPresence } from './LivePresence'
import { actorLabel, presenceState } from './presence'
import { TestBenchControls } from './TestBenchControls'
import { liveDiagramBounds } from '../../utils/liveMotion'
import { LiveReviewPanel, type ReviewPanelMode } from './LiveReviewPanel'

export function LiveDiagramContent() {
  const s = useLiveDiagram()
  const { resolvedTheme } = useTheme()
  const [panelChoice, setPanel] = useState<ReviewPanelMode | 'auto' | null>('auto')
  const [downloadError, setDownloadError] = useState(false)
  const activityToggle = useRef<HTMLButtonElement>(null)
  const reviewToggle = useRef<HTMLButtonElement>(null)
  const activityClose = useRef<HTMLButtonElement>(null)
  const panelTrigger = useRef<HTMLButtonElement | null>(null)
  const focusPanelOnOpen = useRef(false)
  const reviewAvailable = !!s.snapshot?.review && !s.testBench
  const panel = panelChoice === 'auto' ? reviewAvailable ? 'review' : null : panelChoice
  useEffect(() => {
    if (panel && focusPanelOnOpen.current) activityClose.current?.focus({ preventScroll: true })
    focusPanelOnOpen.current = false
  }, [panel])
  const togglePanel = (mode: ReviewPanelMode, trigger: HTMLButtonElement | null) => {
    panelTrigger.current = trigger
    focusPanelOnOpen.current = panel !== mode
    setPanel(panel === mode ? null : mode)
  }
  const closeActivity = () => {
    setPanel(null)
    const trigger = panelTrigger.current ?? reviewToggle.current ?? activityToggle.current
    trigger?.focus({ preventScroll: true })
  }
  const snapshot = s.snapshot
  const presence = presenceState(s.connection, s.working)
  const status = presence === 'working' ? 'Working' : presence === 'listening' ? '' : connectionLabel(s.connection, s.working)
  const download = () => {
    if (!snapshot) return
    try {
      const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot.diagram, null, 2)], { type: 'application/json' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `${snapshot.title.replace(/[^a-z0-9_-]+/gi, '-').slice(0, 80) || 'diagram'}.arc.json`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setDownloadError(false)
    } catch { setDownloadError(true) }
  }

  return (
    <div className="arc-live-content" data-arc-live-connection={s.connection} data-arc-live-motion={s.motion ? 'on' : 'off'}>
      {(s.error || downloadError || s.connection === 'reconnecting' || (snapshot && s.connection === 'unavailable')) && (
        <div className="arc-live-notice" role="status">
          <span>{s.error || (downloadError ? 'The download could not start. Try again.' : 'Connection interrupted. The last received drawing is still here.')}</span>
          {s.stream && <button type="button" onClick={s.retry}>Reconnect</button>}
        </div>
      )}

      <div className="arc-live-workspace">
        <div className="arc-live-stage" data-arc-live-stage data-revision={snapshot?.revision}>
          <div className="arc-live-toolbar">
            <div className="arc-live-presence" aria-live="polite" aria-atomic="true">
              {snapshot ? (
                <>
                  <span className="arc-live-coins" role="list" aria-label={s.testBench ? 'Sample agent' : 'Agents in this session'}>
                    <span role="listitem" aria-label={`${actorLabel(snapshot.actor)}${snapshot.actor.displayName ? ` · ${snapshot.actor.displayName}` : ''}`}><AgentCoin actor={snapshot.actor} state={presence} simulated={!!s.testBench} /></span>
                  </span>
                  <AgentIdentity actor={snapshot.actor} state={presence} status={status} simulated={!!s.testBench} />
                  <ActivityMatrix state={presence} animate={s.motion} />
                </>
              ) : (
                <span className="arc-live-identity">
                  <strong>Agent connection</strong>
                  <span data-state={presence}>{status}</span>
                </span>
              )}
            </div>
            <div className="arc-live-tools">
              <button type="button" className="arc-live-control arc-live-icon-control" aria-label="Animate changes" aria-pressed={s.motion} onClick={() => s.setMotion(!s.motion)} title={s.motion ? 'Turn off animated changes' : 'Animate diagram changes'}><Sparkles size={15} /></button>
              {reviewAvailable && <button ref={reviewToggle} type="button" className="arc-live-control arc-live-icon-control" aria-label="Architecture review" aria-expanded={panel === 'review'} aria-controls="arc-live-activity" onClick={() => togglePanel('review', reviewToggle.current)} title="Architecture review"><FileText size={15} /></button>}
              <button ref={activityToggle} type="button" className="arc-live-control arc-live-icon-control" aria-label="Recent changes" aria-expanded={panel === 'changes'} aria-controls="arc-live-activity" onClick={() => togglePanel('changes', activityToggle.current)} title="Recent changes"><History size={15} /></button>
              <button type="button" className="arc-live-control arc-live-icon-control" aria-label="Download diagram" onClick={download} disabled={!snapshot} title="Download this revision"><Download size={15} /></button>
            </div>
          </div>
          {snapshot ? (
            <ArcDiagram
              data={snapshot.diagram}
              className="w-full h-full"
              mode={resolvedTheme === 'light' ? 'light' : 'dark'}
              theme="engineering"
              frame="none"
              label=""
              defaultZoom="fit"
              fitPadding={80}
              animateUpdates={s.motion}
              autoFrameUpdates
              framingBounds={snapshot.work?.scope.type === 'region' ? {
                minX: snapshot.work.scope.x, minY: snapshot.work.scope.y,
                maxX: snapshot.work.scope.x + snapshot.work.scope.width,
                maxY: snapshot.work.scope.y + snapshot.work.scope.height,
              } : undefined}
              renderCanvasOverlay={({ nodes, zoom, camera, viewport, motion }) => {
                if (s.working && snapshot.work?.status === 'working') return <CanvasWorkPresence nodes={nodes} bounds={liveDiagramBounds(snapshot.diagram, false)} zoom={zoom} camera={camera} viewport={viewport} motion={motion} actor={snapshot.actor} work={snapshot.work} animate={s.motion} />
                const edit = s.editPresence
                const node = edit && nodes.find(node => node.id === edit.nodeId)
                return node && edit ? <CanvasEditPresence key={`${edit.updatedAt ?? snapshot.work?.finishedAt ?? snapshot.revision}:${edit.nodeId}`} node={node} zoom={zoom} motion={motion} actor={snapshot.actor} action={edit.action} /> : null
              }}
              showArcToggle={false}
              hoverEffects={{ lift: false, glow: false, dim: false, highlightEdges: true }}
            />
          ) : (
            <div className="arc-live-empty">
              <Radio size={28} strokeWidth={1.5} aria-hidden="true" />
              <h1>{s.stream ? 'Waiting for your diagram' : 'Watch your architecture take shape'}</h1>
              <p>{s.stream ? 'Keep the Arc MCP server running. Your drawing will appear as soon as the connection is ready.' : 'Ask your agent to open a live Arc diagram. Its session link connects this canvas to each new revision.'}</p>
              {!s.stream && <code>open_live_diagram</code>}
              {s.stream && <button type="button" className="arc-live-control" onClick={s.retry}>Reconnect</button>}
            </div>
          )}
        </div>
        {panel && <LiveReviewPanel mode={reviewAvailable ? panel : 'changes'} onModeChange={setPanel} onClose={closeActivity} closeRef={activityClose} />}
      </div>
      {s.testBench ? <TestBenchControls /> : snapshot && <div className="arc-live-caption" role="status"><span>{s.working ? snapshot.work?.summary : s.activity[0]?.message}</span><code>r{snapshot.revision}</code></div>}
    </div>
  )
}
