import { describe, expect, test } from 'bun:test'
import { initialPlayback, playbackDelays, playbackPhaseDuration, playbackRemainingMs, reducePlayback, type PlaybackState } from '../src/apps/arc-live/testBenchPlayback'
import { testBenchSteps } from '../src/apps/arc-live/testBenchSequence'
import { buildTestBenchSnapshot, testBenchEditPresence } from '../src/apps/arc-live/useTestBench'
import { readLiveSnapshot } from '../src/apps/arc-live/liveState'

const count = testBenchSteps.length
const epoch = Date.parse('2026-10-24T23:00:00.000Z')
const start = (): PlaybackState => ({ ...initialPlayback, updatedAt: epoch, commits: [{ index: 0, revision: 1, updatedAt: epoch }] })
const play = (state = start(), now = epoch) => reducePlayback(state, { type: 'play', now }, count)
const tick = (state: PlaybackState) => reducePlayback(state, {
  type: 'tick', revision: state.revision, phase: state.phase,
  now: (state.runningSince ?? state.updatedAt) + playbackRemainingMs(state, state.runningSince ?? state.updatedAt),
}, count)
const finish = () => {
  let state = play()
  while (!state.completed) state = tick(state)
  return state
}

describe('local motion test bench work lifecycle', () => {
  test('announces work on the unchanged drawing before committing its result', () => {
    const ready = start()
    expect(ready).toMatchObject({ phase: 'ready', playing: false, completed: false, index: 0 })
    expect(buildTestBenchSnapshot(ready).work).toBeUndefined()
    expect(testBenchEditPresence(ready)).toBeNull()

    const working = play(ready)
    const announcement = buildTestBenchSnapshot(working)
    expect(working).toMatchObject({ index: 1, previousIndex: 0, revision: 2, phase: 'working', playing: true })
    expect(announcement.diagram).toBe(testBenchSteps[0].diagram)
    expect(announcement.diagram.nodes.search).toBeUndefined()
    expect(announcement.work).toMatchObject({ status: 'working', scope: { type: 'region' }, startedAt: new Date(epoch).toISOString() })
    expect(announcement.status).toBe('working')
    expect(testBenchEditPresence(working)).toBeNull()
    expect(working.commits).toHaveLength(1)

    const completed = tick(working)
    const result = buildTestBenchSnapshot(completed)
    expect(completed).toMatchObject({ index: 1, previousIndex: 0, revision: 3, phase: 'complete', playing: true })
    expect(result.diagram).toBe(testBenchSteps[1].diagram)
    expect(result.work).toMatchObject({ id: announcement.work!.id, status: 'complete', startedAt: announcement.work!.startedAt, finishedAt: new Date(epoch + 8000).toISOString() })
    expect(result.status).toBe('idle')
    expect(result.updatedAt).toBe(result.work!.finishedAt!)
    expect(testBenchEditPresence(completed)).toMatchObject({ nodeId: 'search', action: 'Added' })
    expect(completed.commits).toHaveLength(2)
  })

  test('keeps each previous result visible throughout the next work phase', () => {
    let state = play()
    for (let index = 1; index < count; index++) {
      const announcement = buildTestBenchSnapshot(state)
      expect(state).toMatchObject({ index, previousIndex: index - 1, phase: 'working' })
      expect(announcement.diagram).toBe(testBenchSteps[index - 1].diagram)
      expect(testBenchEditPresence(state)).toBeNull()
      state = tick(state)
      const result = buildTestBenchSnapshot(state)
      expect(state.phase).toBe('complete')
      expect(result.diagram).toBe(testBenchSteps[index].diagram)
      expect(result.work!.id).toBe(announcement.work!.id)
      expect(result.work!.status).toBe('complete')
      expect(state.completed).toBe(false)
      state = tick(state)
    }
    expect(state).toMatchObject({ index: count - 1, phase: 'complete', completed: true, playing: false })
    expect(state.commits.map(commit => commit.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect(reducePlayback(state, { type: 'tick', now: epoch + 999999 }, count)).toBe(state)
  })

  test('pauses work without completing it and resumes its remaining time and identity', () => {
    const working = play()
    const paused = reducePlayback(working, { type: 'pause', now: epoch + 2000 }, count)
    const pausedSnapshot = buildTestBenchSnapshot(paused)
    expect(paused).toMatchObject({ playing: false, phase: 'working', elapsedMs: 2000, runningSince: null })
    expect(pausedSnapshot.status).toBe('working')
    expect(pausedSnapshot.work!.status).toBe('working')
    expect(testBenchEditPresence(paused)).toBeNull()
    expect(playbackRemainingMs(paused, epoch + 60000)).toBe(6000)
    const resumed = play(paused, epoch + 60000)
    expect(resumed).toMatchObject({ phase: 'working', revision: working.revision, elapsedMs: 2000, workStartedAt: epoch })
    expect(playbackRemainingMs(resumed, epoch + 61000)).toBe(5000)
    expect(buildTestBenchSnapshot(resumed).work!.id).toBe(pausedSnapshot.work!.id)
    expect(buildTestBenchSnapshot(resumed).updatedAt).toBe(pausedSnapshot.updatedAt)
  })

  test('pauses a result for inspection without renewing its completion timestamp', () => {
    const result = tick(play())
    const paused = reducePlayback(result, { type: 'pause', now: epoch + 9000 }, count)
    const resumed = play(paused, epoch + 60000)
    expect(paused).toMatchObject({ phase: 'complete', playing: false, elapsedMs: 1000 })
    expect(playbackRemainingMs(resumed, epoch + 60000)).toBe(3000)
    expect(buildTestBenchSnapshot(resumed)).toEqual(buildTestBenchSnapshot(result))
    expect(testBenchEditPresence(resumed)).toEqual(testBenchEditPresence(result))
  })

  test('speed changes preserve phase progress, work identity, and the displayed drawing', () => {
    const working = play()
    const fast = reducePlayback(working, { type: 'speed', speed: 'fast', now: epoch + 3000 }, count)
    expect(fast).toMatchObject({ phase: 'working', revision: working.revision, playing: true, elapsedMs: 750, runningSince: epoch + 3000 })
    expect(playbackRemainingMs(fast, epoch + 3000)).toBe(1250)
    expect(buildTestBenchSnapshot(fast)).toEqual(buildTestBenchSnapshot(working))
    const paused = reducePlayback(fast, { type: 'pause', now: epoch + 3250 }, count)
    const slower = reducePlayback(paused, { type: 'speed', speed: 'slow', now: epoch + 9000 }, count)
    expect(slower).toMatchObject({ playing: false, phase: 'working', elapsedMs: 4000 })
    expect(playbackRemainingMs(slower, epoch + 10000)).toBe(4000)
  })

  test('ignores stale timer callbacks after pause, phase changes, or restart', () => {
    const initial = start()
    expect(reducePlayback(initial, { type: 'tick' }, count)).toBe(initial)
    const working = play()
    const oldTick = { type: 'tick' as const, revision: working.revision, phase: working.phase, now: epoch + 8000 }
    const paused = reducePlayback(working, { type: 'pause', now: epoch + 1000 }, count)
    expect(reducePlayback(paused, oldTick, count)).toBe(paused)
    const result = tick(working)
    expect(reducePlayback(result, oldTick, count)).toBe(result)
    const restarted = reducePlayback(working, { type: 'restart', now: epoch + 1000 }, count)
    expect(reducePlayback(play(restarted, epoch + 2000), oldTick, count).phase).toBe('working')
  })

  test('restart clears work and attribution, preserving speed and monotonic revisions', () => {
    const working = reducePlayback(play(), { type: 'speed', speed: 'fast', now: epoch }, count)
    const result = tick(working)
    const restarted = reducePlayback(result, { type: 'restart', now: epoch + 3000 }, count)
    expect(restarted).toMatchObject({ phase: 'ready', index: 0, previousIndex: null, playing: false, completed: false, speed: 'fast', revision: result.revision + 1 })
    expect(restarted.commits).toEqual([{ index: 0, revision: restarted.revision, updatedAt: epoch + 3000 }])
    expect(buildTestBenchSnapshot(restarted).diagram).toBe(testBenchSteps[0].diagram)
    expect(buildTestBenchSnapshot(restarted).work).toBeUndefined()
    expect(testBenchEditPresence(restarted)).toBeNull()
  })

  test('replay starts fresh work from the initial drawing after the final result rests', () => {
    const completed = finish()
    const replayed = play(completed, completed.updatedAt + 10000)
    expect(replayed).toMatchObject({ index: 1, previousIndex: 0, playing: true, completed: false, phase: 'working' })
    expect(replayed.revision).toBeGreaterThan(completed.revision)
    expect(replayed.commits).toHaveLength(1)
    expect(buildTestBenchSnapshot(replayed).diagram).toBe(testBenchSteps[0].diagram)
    expect(buildTestBenchSnapshot(replayed).work!.id).not.toBe(buildTestBenchSnapshot(completed).work!.id)
  })

  test('a single-scene sequence rests without announcing nonexistent work', () => {
    const playing = reducePlayback(start(), { type: 'play', now: epoch }, 1)
    expect(playing).toMatchObject({ index: 0, phase: 'complete', playing: true, workStartedAt: null })
    const completed = reducePlayback(playing, { type: 'tick', now: epoch + 4000 }, 1)
    expect(completed).toMatchObject({ playing: false, completed: true })
  })

  test('allocates two thirds to work and one third to the result at each speed', () => {
    for (const speed of ['slow', 'normal', 'fast'] as const) {
      const work = playbackPhaseDuration({ phase: 'working', speed })
      const result = playbackPhaseDuration({ phase: 'complete', speed })
      expect(work).toBe(result * 2)
      expect(work + result).toBe(playbackDelays[speed])
    }
    expect(initialPlayback).toMatchObject({ phase: 'ready', revision: 1, playing: false, workStartedAt: null })
  })

  test('every ready, working, paused, and completed snapshot passes the shared live boundary', () => {
    let state = start()
    const check = (value: PlaybackState) => {
      const snapshot = buildTestBenchSnapshot(value)
      expect(readLiveSnapshot(snapshot, snapshot.sessionId)).toEqual(snapshot)
    }
    check(state)
    state = play(state)
    while (!state.completed) {
      check(state)
      const paused = reducePlayback(state, { type: 'pause', now: state.updatedAt + 100 }, count)
      check(paused)
      expect(buildTestBenchSnapshot(paused).work!.status).toBe(state.phase === 'working' ? 'working' : 'complete')
      state = tick(state)
    }
    check(state)
    check(play(state, state.updatedAt + 10000))
  })
})
