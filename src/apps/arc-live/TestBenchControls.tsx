import { Pause, Play, RotateCcw } from 'lucide-react'
import { useLiveDiagram } from './LiveDiagramContext'
import type { PlaybackSpeed } from './testBenchPlayback'

export function TestBenchControls() {
  const { testBench: bench } = useLiveDiagram()
  if (!bench) return null
  return <div className="arc-live-test-bench" aria-label="Motion test bench controls">
    <div className="arc-live-test-bench-step" role="status">
      <span>Sample sequence · {bench.index + 1} / {bench.count} · {bench.phase === 'ready' ? 'Ready' : bench.phase === 'working' ? bench.playing ? 'Working' : 'Paused' : 'Result'}</span>
      <strong>{bench.label}</strong>
    </div>
    <div className="arc-live-test-bench-actions">
      <button type="button" className="arc-live-control" onClick={() => bench.dispatch({ type: bench.playing ? 'pause' : 'play' })} aria-label={bench.playing ? 'Pause sequence' : bench.completed ? 'Replay sequence' : 'Play sequence'}>
        {bench.playing ? <Pause size={14} /> : <Play size={14} />} {bench.playing ? 'Pause' : bench.completed ? 'Replay' : 'Play'}
      </button>
      <button type="button" className="arc-live-control" onClick={() => bench.dispatch({ type: 'restart' })} aria-label="Restart sequence"><RotateCcw size={14} /> Restart</button>
      <select className="arc-live-control" aria-label="Playback speed" value={bench.speed} onChange={event => bench.dispatch({ type: 'speed', speed: event.target.value as PlaybackSpeed })}>
        <option value="slow">Slow · 12s</option>
        <option value="normal">Normal · 6s</option>
        <option value="fast">Fast · 3s</option>
      </select>
    </div>
  </div>
}
