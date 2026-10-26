import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { dispatchHudsonAgentAction } from 'hudsonkit/observability'
import type { ArchitectureReviewArtifact, LiveDiagramSnapshot } from '../../types/live'
import { isDiagramWorking, readLiveSnapshot } from './liveState'
import { advanceEditPresence, type EditPresence, type EditPresenceState } from './editPresence'
import { useTestBench } from './useTestBench'
import { mergeReviewRevisions, readReviewArtifact, reviewActivity, reviewArtifactUrl } from './savedReview'

export type LiveConnection = 'connecting' | 'connected' | 'reconnecting' | 'unavailable' | 'complete'

function useLiveSession(sessionId: string, stream: string | null) {
  const [snapshot, setSnapshot] = useState<LiveDiagramSnapshot | null>(null)
  const [connection, setConnection] = useState<LiveConnection>(stream ? 'connecting' : 'unavailable')
  const [error, setError] = useState<string | null>(null)
  const [revisions, setRevisions] = useState<LiveDiagramSnapshot[]>([])
  const [artifact, setArtifact] = useState<ArchitectureReviewArtifact | null>(null)
  const [artifactLoading, setArtifactLoading] = useState(!!stream)
  const [artifactError, setArtifactError] = useState<string | null>(null)
  const [editPresence, setEditPresence] = useState<EditPresence | null>(null)
  const [motion, setMotion] = useState(true)
  const [attempt, setAttempt] = useState(0)
  const latest = useRef<LiveDiagramSnapshot | null>(null)
  const editState = useRef<EditPresenceState>({ pending: null, completed: null })
  const activity = useMemo(() => reviewActivity(revisions), [revisions])
  const retry = useCallback(() => {
    setConnection(latest.current ? 'reconnecting' : 'connecting')
    setError(null)
    setAttempt(n => n + 1)
  }, [])

  useEffect(() => {
    if (!stream) return
    let disposed = false
    let artifactRequest: AbortController | null = null
    let artifactTimer: ReturnType<typeof setTimeout> | null = null
    const source = new EventSource(stream)
    if (latest.current && latest.current.sessionId !== sessionId) {
      latest.current = null
      editState.current = { pending: null, completed: null }
      setSnapshot(null)
      setEditPresence(null)
      setRevisions([])
      setArtifact(null)
      setArtifactError(null)
    }
    const loadArtifact = async () => {
      // Ordinary live diagrams deliberately have no persisted review endpoint.
      if (latest.current && !latest.current.review) {
        setArtifactLoading(false)
        setArtifactError(null)
        return
      }
      artifactRequest?.abort()
      const request = new AbortController()
      artifactRequest = request
      setArtifactLoading(true)
      try {
        const response = await fetch(reviewArtifactUrl(stream), { signal: request.signal, cache: 'no-store', referrerPolicy: 'no-referrer', redirect: 'error' })
        if (!response.ok) throw new Error(response.status === 401 || response.status === 403
          ? 'This link cannot open the saved review. Ask for a new session link.'
          : response.status === 404 ? 'No saved review was found on this server.' : 'Saved history could not be loaded. Try reconnecting.')
        const saved = readReviewArtifact(await response.json(), sessionId)
        if (disposed || request !== artifactRequest) return
        setArtifact(current => !current || saved.snapshot.revision >= current.snapshot.revision ? saved : current)
        setArtifactError(null)
        setRevisions(current => mergeReviewRevisions(current, saved.revisions))
        if (!latest.current || saved.snapshot.revision > latest.current.revision) {
          latest.current = saved.snapshot
          editState.current = { pending: null, completed: null }
          setEditPresence(null)
          setSnapshot(saved.snapshot)
          // Persisted data can restore the drawing, but only SSE confirms live work.
          setConnection(current => saved.snapshot.status === 'complete' ? 'complete' : current === 'connecting' ? 'connecting' : 'reconnecting')
        }
        if (latest.current.status === 'complete') {
          setConnection('complete')
          source.close()
        }
      } catch (cause) {
        if (disposed || request.signal.aborted || request !== artifactRequest) return
        setArtifactError(cause instanceof Error && !cause.message.includes('fetch') ? cause.message : 'Saved history could not be loaded. Try reconnecting.')
      } finally {
        if (!disposed && request === artifactRequest) setArtifactLoading(false)
      }
    }
    const queueArtifact = () => {
      if (disposed) return
      if (artifactTimer) clearTimeout(artifactTimer)
      artifactTimer = setTimeout(() => { artifactTimer = null; void loadArtifact() }, 120)
    }
    void loadArtifact()
    source.onopen = queueArtifact
    source.onerror = () => {
      if (disposed || latest.current?.status === 'complete') return
      setConnection(source.readyState === EventSource.CLOSED ? 'unavailable' : 'reconnecting')
    }
    const receive = (event: MessageEvent) => {
      if (disposed) return
      try {
        const next = readLiveSnapshot(JSON.parse(event.data), sessionId)
        if (latest.current && next.revision < latest.current.revision) return
        // The live stream already carries each edit. Refresh the full saved history
        // after a work result instead of downloading it on every in-progress move.
        if (next.review && next.work?.status !== 'working') queueArtifact()
        else if (!next.review) {
          artifactRequest?.abort()
          if (artifactTimer) { clearTimeout(artifactTimer); artifactTimer = null }
          setArtifactLoading(false)
          setArtifactError(null)
        }
        // A reopened transport is current only after its first valid snapshot.
        // The same revision restores connectivity without replaying activity.
        if (latest.current && next.revision === latest.current.revision) {
          setError(null)
          setConnection(latest.current.status === 'complete' ? 'complete' : 'connected')
          if (latest.current.status === 'complete') source.close()
          return
        }
        const previous = latest.current
        editState.current = advanceEditPresence(editState.current, previous, next)
        setEditPresence(editState.current.completed)
        latest.current = next
        setSnapshot(next)
        setError(null)
        setConnection(next.status === 'complete' ? 'complete' : 'connected')
        setRevisions(current => mergeReviewRevisions(current, [next]))
        dispatchHudsonAgentAction({
          source: 'arc-mcp', actor: next.actor.name,
          status: next.work?.status === 'interrupted' ? 'failed' : next.work?.status === 'working' ? 'started' : 'completed',
          toolset: 'arc', appId: 'arc-live', appName: 'Arc', chatId: sessionId,
          action: next.status === 'complete' ? 'end_live_diagram' : next.work?.id !== previous?.work?.id ? 'begin_live_diagram_work' : previous?.work?.status === 'working' && next.work?.status === 'complete' ? 'finish_live_diagram_work' : 'diagram_revision',
          traceId: `${sessionId}:${next.revision}`,
          metadata: { revision: next.revision, connectionId: next.actor.id },
        })
        if (next.status === 'complete') source.close()
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not read the diagram update.')
      }
    }
    source.addEventListener('snapshot', receive)
    return () => {
      disposed = true
      artifactRequest?.abort()
      if (artifactTimer) clearTimeout(artifactTimer)
      source.removeEventListener('snapshot', receive)
      source.close()
    }
  }, [sessionId, stream, attempt])

  useEffect(() => {
    if (!editPresence) return
    const timer = setTimeout(() => {
      editState.current = { ...editState.current, completed: null }
      setEditPresence(null)
    }, 4500)
    return () => clearTimeout(timer)
  }, [editPresence])

  const working = isDiagramWorking(connection, snapshot)
  return { sessionId, stream, snapshot, connection, error, activity, artifact, artifactLoading, artifactError, editPresence, motion, setMotion, working, retry }
}

type TestBenchControls = ReturnType<typeof useTestBench>['controls'] & { close: () => void }
type LiveDiagramState = ReturnType<typeof useLiveSession> & { testBench: TestBenchControls | null; openTestBench: () => void }
const LiveContext = createContext<LiveDiagramState | null>(null)

export function LiveDiagramProvider({ sessionId, stream, children }: { sessionId: string; stream: string | null; children: ReactNode }) {
  const live = useLiveSession(sessionId, stream)
  const [testing, setTesting] = useState(false)
  const demo = useTestBench(testing)
  const openTestBench = () => {
    demo.controls.dispatch({ type: 'restart' })
    setTesting(true)
  }
  const value: LiveDiagramState = testing
    ? { ...live, ...demo, artifact: null, artifactLoading: false, artifactError: null, testBench: { ...demo.controls, close: () => setTesting(false) }, openTestBench }
    : { ...live, testBench: null, openTestBench }
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>
}

export function useLiveDiagram() {
  const value = useContext(LiveContext)
  if (!value) throw new Error('Live diagram must be inside its Hudson app provider')
  return value
}
