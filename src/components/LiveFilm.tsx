import { useCallback, useEffect, useRef, useState } from 'react'

type LiveFilmProps = {
  src: string
  poster: string
  width: number
  height: number
  label: string
  describedBy?: string
  /** true: never start playback on its own (reduced motion) */
  still?: boolean
}

function clock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const whole = Math.floor(seconds)
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

function PlayGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M5 3.5v9l7-4.5z" fill="currentColor" />
    </svg>
  )
}

function PauseGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M5 3.5v9M11 3.5v9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function RestartGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 8a4.5 4.5 0 1 0 1.3-3.2" />
      <path d="M3.5 2.8v2.4h2.4" />
    </svg>
  )
}

/**
 * The landing's live-review film: muted, playing only while it is on screen, with a thin control bar
 * drawn in the landing's own type and lines instead of the browser's controls.
 */
export default function LiveFilm({ src, poster, width, height, label, describedBy, still = false }: LiveFilmProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [started, setStarted] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  // once the reader pauses, scrolling back must not start the film again
  const heldByReader = useRef(false)

  // Follow the playhead every frame while playing; `timeupdate` alone steps a few times a second.
  useEffect(() => {
    if (!playing) return
    let frame = 0
    const tick = () => {
      const video = videoRef.current
      if (video) setTime(video.currentTime)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing])

  // Play while at least half the film is on screen; pause when it leaves.
  useEffect(() => {
    const video = videoRef.current
    if (!video || still || typeof IntersectionObserver === 'undefined') return
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData
    if (saveData) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !heldByReader.current) void video.play().catch(() => {})
      else if (!entry.isIntersecting) video.pause()
    }, { threshold: 0.5 })
    observer.observe(video)
    return () => observer.disconnect()
  }, [still])

  const toggle = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      heldByReader.current = false
      void video.play().catch(() => {})
    } else {
      heldByReader.current = true
      video.pause()
    }
  }, [])

  const restart = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = 0
    setTime(0)
    heldByReader.current = false
    void video.play().catch(() => {})
  }, [])

  const seek = useCallback((value: number) => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = value
    setTime(value)
  }, [])

  const progress = duration > 0 ? Math.min(time / duration, 1) : 0

  return (
    <div className="tl-film" data-playing={playing || undefined}>
      <div className="tl-film-screen">
        <video
          ref={videoRef}
          className="tl-live-video"
          muted
          loop
          playsInline
          preload="metadata"
          width={width}
          height={height}
          poster={poster}
          aria-label={label}
          aria-describedby={describedBy}
          onClick={toggle}
          onPlay={() => { setPlaying(true); setStarted(true) }}
          onPause={() => setPlaying(false)}
          onLoadedMetadata={event => setDuration(event.currentTarget.duration)}
          onTimeUpdate={event => { if (!playing) setTime(event.currentTarget.currentTime) }}
        >
          <source src={src} type="video/mp4" />
          <a href={src}>Download the Arc live preview video.</a>
        </video>
        {!started && (
          <button type="button" className="tl-film-start" onClick={toggle} aria-label={`Play: ${label}`}>
            <PlayGlyph />
          </button>
        )}
      </div>
      <div className="tl-film-bar">
        <button type="button" className="tl-film-button" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? <PauseGlyph /> : <PlayGlyph />}
        </button>
        <input
          type="range"
          className="tl-film-track"
          min={0}
          max={duration || 0}
          step={0.01}
          value={time}
          onChange={event => seek(Number(event.currentTarget.value))}
          aria-label="Seek"
          aria-valuetext={`${clock(time)} of ${clock(duration)}`}
          style={{ '--tl-film-progress': `${progress * 100}%` } as React.CSSProperties}
        />
        <span className="tl-film-clock">{clock(time)} / {clock(duration)}</span>
        <button type="button" className="tl-film-button" onClick={restart} aria-label="Play from the start">
          <RestartGlyph />
        </button>
      </div>
    </div>
  )
}
