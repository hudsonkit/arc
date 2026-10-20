import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowUpRight, Download, RotateCcw, Play, Pause } from 'lucide-react'
import { ArcPanelCube, fieldRecorderCube, renderPanelCubeSvg, type PanelCubeRotation } from '@hudsonkit/arc'
import { useMeta } from '../hooks/useMeta'
import ArcMark from './ArcMark'
import '../panel-cube.css'

const data = fieldRecorderCube

export default function PanelCubeShowcase() {
  const [open, setOpen] = useState(false)
  const [selectedFace, setSelectedFace] = useState<string | null>(null)
  const [inspectedFace, setInspectedFace] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [source, setSource] = useState(false)
  const [compact, setCompact] = useState(false)
  const [rotation, setRotation] = useState<PanelCubeRotation>({ yaw: 0, pitch: 0 })
  const [autoSpin, setAutoSpin] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [hidden, setHidden] = useState(false)
  const currentProgress = useRef(0)
  const activeFace = inspectedFace ?? selectedFace

  useMeta({
    title: 'Panel cube | Arc',
    description: 'An interactive graphite shell with floating panels and fine callouts, defined in editable Arc data.',
    url: '/panel-cube',
  })

  useEffect(() => {
    const media = window.matchMedia('(max-width: 640px)')
    const update = () => setCompact(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => {
      setReducedMotion(media.matches)
      if (media.matches) setAutoSpin(false)
    }
    const visibility = () => setHidden(document.hidden)
    update()
    visibility()
    media.addEventListener('change', update)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      media.removeEventListener('change', update)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [])

  useEffect(() => {
    if (!autoSpin || reducedMotion || hidden || source) return
    let frame = 0, previous: number | null = null
    const tick = (time: number) => {
      const elapsed = previous === null ? 0 : Math.max(0, Math.min(0.05, (time - previous) / 1000))
      previous = time
      setRotation(view => ({ ...view, yaw: (view.yaw + elapsed * 12) % 360 }))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [autoSpin, reducedMotion, hidden, source])

  useEffect(() => {
    const target = open ? 1 : 0
    const from = currentProgress.current
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    let frame = 0
    const update = (value: number) => {
      currentProgress.current = value
      setProgress(value)
    }
    const finish = () => {
      if (media.matches) { cancelAnimationFrame(frame); update(target) }
    }
    if (media.matches) update(target)
    else {
      const start = performance.now()
      const tick = (time: number) => {
        // rAF timestamps refer to the frame start, which can precede this effect.
        const t = Math.max(0, Math.min(1, (time - start) / 680))
        update(t === 1 ? target : from + (target - from) * (1 - (1 - t) ** 4))
        if (t < 1) frame = requestAnimationFrame(tick)
      }
      frame = requestAnimationFrame(tick)
    }
    media.addEventListener('change', finish)
    return () => { cancelAnimationFrame(frame); media.removeEventListener('change', finish) }
  }, [open])

  function download(format: 'svg' | 'json') {
    const value = format === 'svg'
      ? renderPanelCubeSvg(data, { progress, activeFace, labels: true, rotation })
      : JSON.stringify(data, null, 2)
    const url = URL.createObjectURL(new Blob([value], {
      type: format === 'svg' ? 'image/svg+xml' : 'application/json',
    }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${data.id}.${format}`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  function selectFace(id: string) {
    setAutoSpin(false)
    setSelectedFace(id)
    setSource(false)
  }

  return <div className="pc-page">
    <header className="pc-header">
      <Link className="pc-brand" to="/" aria-label="Arc home">
        <ArcMark width={28} height={28} /><strong>Arc</strong>
      </Link>
      <Link to="/examples"><ArrowLeft size={14} /> All examples</Link>
    </header>
    <main className="pc-main">
      <div className="pc-heading">
        <p className="pc-eyebrow">Panel cube</p>
        <h1>An idea, from every side.</h1>
        <p>A quiet object that opens up to explain itself.</p>
      </div>

      <section className="pc-study" aria-label="Interactive panel cube example">
        <div className="pc-study-bar">
          <span>{data.title}<span className="pc-study-kind"> / concept study</span></span>
          <div className="pc-view-switch" role="group" aria-label="Example view">
            <button aria-pressed={!source} onClick={() => setSource(false)}>Illustration</button>
            <button aria-pressed={source} onClick={() => {
              setSource(true); setInspectedFace(null)
            }}>Source</button>
          </div>
        </div>
        {source ? <pre className="pc-source" tabIndex={0} aria-label="Panel cube JSON source">
          <code>{JSON.stringify(data, null, 2)}</code>
        </pre> : <div className="pc-object">
          <ArcPanelCube
            data={data}
            progress={progress}
            activeFace={activeFace}
            onFaceChange={setInspectedFace}
            onFaceSelect={selectFace}
            rotation={rotation}
            onRotationChange={setRotation}
            onRotateStart={() => setAutoSpin(false)}
            rotationHandles
            labels={!compact}
            className="pc-diagram"
          />
        </div>}
        <div className="pc-controls">
          <p>{source ? 'Edit the labels and descriptions to tell your own story.' : 'Grab a ring to turn or tilt. Drag the cube to rotate freely.'}</p>
          <div className="pc-actions">
            <button
              className="pc-reset"
              disabled={source}
              onClick={() => { setAutoSpin(false); setRotation({ yaw: 0, pitch: 0 }) }}
            ><RotateCcw size={13} aria-hidden="true" />Reset view</button>
            <button
              className="pc-spin"
              disabled={source || reducedMotion}
              title={reducedMotion ? 'Auto-spin is off with reduced motion' : undefined}
              aria-pressed={autoSpin}
              onClick={() => setAutoSpin(!autoSpin)}
            >{autoSpin ? <Pause size={13} aria-hidden="true" /> : <Play size={13} aria-hidden="true" />}{autoSpin ? 'Stop spin' : 'Auto-spin'}</button>
            <button
              className="pc-open"
              disabled={source}
              aria-pressed={open}
              onClick={() => {
                setOpen(!open)
                if (open) { setSelectedFace(null); setInspectedFace(null) }
              }}
            >{open ? 'Close cube' : 'Open cube'}<span aria-hidden="true">{open ? '−' : '+'}</span></button>
          </div>
        </div>
      </section>

      <div className="pc-parts" aria-label="Explore the recorder">
        {data.faces.map((face, index) => <button
          key={face.id}
          aria-pressed={activeFace === face.id}
          onClick={() => selectFace(face.id)}
        >
          <span className="pc-part-heading"><span className="pc-part-index">{String(index + 1).padStart(2, '0')}</span><strong>{face.label}</strong><ArrowUpRight size={16} aria-hidden="true" /></span>
          <span className="pc-part-description">{face.description}</span>
        </button>)}
      </div>

      <footer className="pc-footer">
        <p>A conceptual view of capture, storage, and playback.<br />Define the parts in text; Arc gives them shape.</p>
        <div className="pc-downloads">
          <button onClick={() => download('svg')}><Download size={14} /> SVG</button>
          <button onClick={() => download('json')}>JSON <span aria-hidden="true">↓</span></button>
        </div>
      </footer>
    </main>
  </div>
}
