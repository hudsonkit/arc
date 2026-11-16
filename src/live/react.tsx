import { useEffect, useRef, useState, type ComponentProps } from 'react'
import ArcDiagram from '../components/ArcDiagram'
import { diffDiagram } from '../utils/diffDiagram'
import { applyOps, createArcLiveState, type ArcLiveSource, type ArcApplyResult, type ArcEnvelope } from './protocol'

export function useArcLive(stream: string, source: ArcLiveSource, onResult?: (result: ArcApplyResult) => void) {
  const [state, setState] = useState(() => createArcLiveState(stream))
  const [delta, setDelta] = useState<ReturnType<typeof diffDiagram>>()
  const callback = useRef(onResult)
  callback.current = onResult
  useEffect(() => {
    let current = createArcLiveState(stream)
    setState(current); setDelta(undefined)
    const queue: ArcEnvelope[] = []
    let frame = 0
    let stopped = false
    const step = () => {
      frame = 0
      if (stopped) return
      const envelope = queue.shift()
      if (envelope) {
        const result = applyOps(current, envelope)
        if (result.state !== current) {
          setDelta(diffDiagram(current.diagram, result.state.diagram))
          current = result.state
          setState(current)
        }
        if (result.resync) source.requestResync?.()
        callback.current?.(result)
      }
      if (queue.length) frame = requestAnimationFrame(step)
    }
    const unsubscribe = source.subscribe(envelope => {
      queue.push(envelope)
      if (!frame) frame = requestAnimationFrame(step)
    })
    return () => { stopped = true; unsubscribe(); cancelAnimationFrame(frame) }

  }, [stream, source])
  return { ...state, delta }
}
export type ArcLiveDiagramProps = Omit<ComponentProps<typeof ArcDiagram>, 'data' | 'delta'> & {
  stream: string; source: ArcLiveSource; onResult?: (result: ArcApplyResult) => void
}
export function ArcLiveDiagram({ stream, source, onResult, ...props }: ArcLiveDiagramProps) {
  const live = useArcLive(stream, source, onResult)
  const focusView = live.focus ? { id: '__arc_live_focus', title: 'Live focus', ...live.focus } : undefined
  const data = focusView ? { ...live.diagram, views: [...(live.diagram.views ?? []), focusView] } : live.diagram
  return <div data-arc-live-stream={stream}>
    <ArcDiagram {...props} data={data} view={focusView?.id ?? props.view} delta={live.delta} animateUpdates />
    {live.focus && <div role="status" aria-live="polite" data-arc-live-focus>{live.focus.caption ?? live.focus.nodes?.join(', ')}</div>}
  </div>
}
