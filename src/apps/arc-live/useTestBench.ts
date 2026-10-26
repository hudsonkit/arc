import { useCallback, useEffect, useReducer } from 'react'
import type { LiveDiagramSnapshot } from '../../types/live'
import { deriveEditPresence } from './editPresence'
import { testBenchSteps } from './testBenchSequence'
import { initialPlayback, playbackRemainingMs, reducePlayback, type PlaybackAction, type PlaybackState } from './testBenchPlayback'

const actor = { id: 'local-motion-test-bench', name: 'Demo agent' }
const sessionId = 'motion-test-bench'
const reducer = (state: PlaybackState, action: PlaybackAction) => reducePlayback(state, action, testBenchSteps.length)
const isoTime = (time: number) => new Date(time).toISOString()

/** Announcing work leaves the last committed drawing untouched. */
export function buildTestBenchSnapshot(playback: PlaybackState): LiveDiagramSnapshot {
  const { index, previousIndex, revision, phase, workStartedAt, workFinishedAt } = playback
  const step = testBenchSteps[index]
  const displayIndex = phase === 'working' ? previousIndex ?? 0 : index
  return {
    sessionId, revision, title: 'Motion test bench', actor,
    diagram: testBenchSteps[displayIndex].diagram, message: step.label,
    status: phase === 'working' ? 'working' : 'idle', updatedAt: isoTime(playback.updatedAt),
    ...(workStartedAt === null ? {} : {
      work: {
        id: `${sessionId}:${phase === 'complete' ? revision - 1 : revision}`,
        summary: step.label, scope: step.scope,
        status: phase === 'complete' ? 'complete' as const : 'working' as const,
        startedAt: isoTime(workStartedAt),
        ...(workFinishedAt === null ? {} : { finishedAt: isoTime(workFinishedAt) }),
      },
    }),
  }
}

export function testBenchEditPresence(playback: PlaybackState, snapshot = buildTestBenchSnapshot(playback)) {
  if (playback.phase !== 'complete' || playback.previousIndex === null) return null
  return deriveEditPresence({
    ...snapshot, revision: snapshot.revision - 1,
    diagram: testBenchSteps[playback.previousIndex].diagram,
  }, snapshot)
}

export function useTestBench(enabled: boolean) {
  const [playback, send] = useReducer(reducer, initialPlayback, state => {
    const now = Date.now()
    return { ...state, updatedAt: now, commits: [{ index: 0, revision: state.revision, updatedAt: now }] }
  })
  const dispatch = useCallback((action: PlaybackAction) => send({ ...action, now: Date.now() }), [])
  useEffect(() => {
    if (!enabled || !playback.playing) return
    const timer = window.setTimeout(() => dispatch({ type: 'tick', revision: playback.revision, phase: playback.phase }), playbackRemainingMs(playback, Date.now()))
    return () => window.clearTimeout(timer)
  }, [enabled, dispatch, playback])
  useEffect(() => {
    if (!enabled) dispatch({ type: 'pause' })
  }, [enabled, dispatch])
  useEffect(() => {
    const pauseWhenHidden = () => {
      if (document.hidden) dispatch({ type: 'pause' })
    }
    document.addEventListener('visibilitychange', pauseWhenHidden)
    return () => document.removeEventListener('visibilitychange', pauseWhenHidden)
  }, [dispatch])
  const snapshot = buildTestBenchSnapshot(playback)
  return {
    snapshot, sessionId, stream: null, connection: 'connected' as const, error: null,
    working: enabled && playback.playing && playback.phase === 'working',
    editPresence: testBenchEditPresence(playback, snapshot),
    activity: playback.commits.map(commit => ({
      revision: commit.revision, message: testBenchSteps[commit.index].label, actor: actor.name, updatedAt: isoTime(commit.updatedAt),
    })).reverse(),
    retry: () => {},
    controls: { ...playback, count: testBenchSteps.length, label: testBenchSteps[playback.index].label, dispatch },
  }
}
