export const playbackDelays = { slow: 12000, normal: 6000, fast: 3000 } as const
export type PlaybackSpeed = keyof typeof playbackDelays
export type PlaybackPhase = 'ready' | 'working' | 'complete'
export type PlaybackState = {
  index: number
  previousIndex: number | null
  revision: number
  playing: boolean
  completed: boolean
  speed: PlaybackSpeed
  phase: PlaybackPhase
  elapsedMs: number
  runningSince: number | null
  workStartedAt: number | null
  workFinishedAt: number | null
  updatedAt: number
  commits: { index: number; revision: number; updatedAt: number }[]
}
export const initialPlayback: PlaybackState = {
  index: 0, previousIndex: null, revision: 1, playing: false, completed: false, speed: 'slow', phase: 'ready',
  elapsedMs: 0, runningSince: null, workStartedAt: null, workFinishedAt: null, updatedAt: 0,
  commits: [{ index: 0, revision: 1, updatedAt: 0 }],
}
export type PlaybackAction = (
  | { type: 'play' | 'pause' | 'restart' }
  | { type: 'tick'; revision?: number; phase?: PlaybackPhase }
  | { type: 'speed'; speed: PlaybackSpeed }
) & { now?: number }

export function playbackPhaseDuration(state: Pick<PlaybackState, 'phase' | 'speed'>): number {
  return state.phase === 'ready' ? 0 : playbackDelays[state.speed] * (state.phase === 'working' ? 2 / 3 : 1 / 3)
}

function elapsedAt(state: PlaybackState, now: number): number {
  return Math.min(playbackPhaseDuration(state), state.elapsedMs + (state.runningSince === null ? 0 : Math.max(0, now - state.runningSince)))
}

export function playbackRemainingMs(state: PlaybackState, now: number): number {
  return Math.max(0, playbackPhaseDuration(state) - elapsedAt(state, now))
}

function reset(state: PlaybackState, now: number): PlaybackState {
  const revision = state.revision + 1
  return { ...initialPlayback, speed: state.speed, revision, updatedAt: now, commits: [{ index: 0, revision, updatedAt: now }] }
}

function beginWork(state: PlaybackState, index: number, now: number): PlaybackState {
  return {
    ...state, index, previousIndex: state.index, revision: state.revision + 1, phase: 'working',
    playing: true, completed: false, elapsedMs: 0, runningSince: now,
    workStartedAt: now, workFinishedAt: null, updatedAt: now,
  }
}

export function reducePlayback(state: PlaybackState, action: PlaybackAction, count: number): PlaybackState {
  // The hook supplies the clock; explicit times also make pause/resume testable.
  const now = Math.max(state.updatedAt, action.now ?? state.updatedAt)
  const last = Math.max(0, count - 1)
  switch (action.type) {
    case 'play': {
      if (state.playing) return state
      const current = state.completed ? reset(state, now) : state
      if (current.phase === 'ready') {
        return last === 0
          ? { ...current, phase: 'complete', playing: true, runningSince: now }
          : beginWork(current, 1, now)
      }
      return { ...current, playing: true, runningSince: now }
    }
    case 'pause':
      return state.playing ? { ...state, playing: false, elapsedMs: elapsedAt(state, now), runningSince: null } : state
    case 'restart': return reset(state, now)
    case 'speed': {
      if (action.speed === state.speed) return state
      const progress = playbackPhaseDuration(state) ? elapsedAt(state, now) / playbackPhaseDuration(state) : 0
      const next = { ...state, speed: action.speed }
      return { ...next, elapsedMs: playbackPhaseDuration(next) * progress, runningSince: state.playing ? now : null }
    }
    case 'tick': {
      if (!state.playing || (action.revision !== undefined && action.revision !== state.revision) || (action.phase !== undefined && action.phase !== state.phase)) return state
      if (state.phase === 'working') {
        const revision = state.revision + 1
        return {
          ...state, revision, phase: 'complete', elapsedMs: 0, runningSince: now,
          workFinishedAt: now, updatedAt: now,
          commits: [...state.commits, { index: state.index, revision, updatedAt: now }],
        }
      }
      if (state.phase === 'ready') return state
      if (state.index === last) return { ...state, playing: false, completed: true, elapsedMs: playbackPhaseDuration(state), runningSince: null }
      return beginWork(state, state.index + 1, now)
    }
  }
}
