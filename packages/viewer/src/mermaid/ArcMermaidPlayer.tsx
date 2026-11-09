import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Expand,
  Minus,
  Pause,
  Play,
  Plus,
  Scan,
} from 'lucide-react'
import { ArcMermaid } from './ArcMermaid'
import { parseMermaid } from './parseMermaid'
import { getSequenceThemeTokens } from './sequence/theme'
import type { ArcMermaidProps, ArcSequenceDocument } from './types'

export interface ArcMermaidPlayerProps extends ArcMermaidProps {
  defaultZoom?: number | 'fit'
  minZoom?: number
  maxZoom?: number
  zoomStep?: number
  showControls?: boolean
  showPlayback?: boolean
  /** Message index to open on. `-1` is the overview. */
  defaultStep?: number
  autoplayMs?: number
  onStepChange?: (step: number, eventId: string | null) => void
}

function getSequenceDocument(
  source: string | undefined,
  document: ArcMermaidProps['document'],
): ArcSequenceDocument | null {
  if (document?.family === 'sequence') return document
  if (document) return null
  const parsed = source == null ? null : parseMermaid(source).document
  return parsed?.family === 'sequence' ? parsed : null
}

export function ArcMermaidPlayer({
  source,
  document,
  mode = 'light',
  theme = 'default',
  className = '',
  title,
  description,
  sequence,
  defaultZoom = 'fit',
  minZoom = 0.5,
  maxZoom = 2.5,
  zoomStep = 0.2,
  showControls = true,
  showPlayback = true,
  defaultStep = -1,
  autoplayMs = 1400,
  onStepChange,
}: ArcMermaidPlayerProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const sequenceDocument = useMemo(
    () => getSequenceDocument(source, document),
    [source, document],
  )
  const steps = useMemo(
    () =>
      sequenceDocument?.events.filter(
        (event): event is Extract<typeof event, { type: 'message' }> =>
          event.type === 'message',
      ) ?? [],
    [sequenceDocument],
  )

  const [zoom, setZoom] = useState(defaultZoom === 'fit' ? 1 : defaultZoom)
  const [stepIndex, setStepIndex] = useState(defaultStep)
  const [playing, setPlaying] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)

  const activeMessageId =
    stepIndex >= 0 && stepIndex < steps.length ? steps[stepIndex].id : null

  useEffect(() => {
    onStepChange?.(stepIndex, activeMessageId)
  }, [activeMessageId, onStepChange, stepIndex])

  useEffect(() => {
    if (!playing || steps.length === 0) return
    const timer = window.setInterval(() => {
      setStepIndex((current) => {
        if (current >= steps.length - 1) {
          setPlaying(false)
          return current
        }
        return current + 1
      })
    }, autoplayMs)
    return () => window.clearInterval(timer)
  }, [autoplayMs, playing, steps.length])

  useEffect(() => {
    const syncFullscreen = () => {
      setFullscreen(documentElementFullscreen() === rootRef.current)
    }
    globalThis.document?.addEventListener('fullscreenchange', syncFullscreen)
    return () =>
      globalThis.document?.removeEventListener('fullscreenchange', syncFullscreen)
  }, [])

  const setBoundedZoom = (next: number) => {
    setZoom(Math.min(maxZoom, Math.max(minZoom, Number(next.toFixed(2)))))
  }

  const moveStep = (delta: number) => {
    setPlaying(false)
    setStepIndex((current) =>
      Math.min(steps.length - 1, Math.max(-1, current + delta)),
    )
  }

  const togglePlayback = () => {
    if (steps.length === 0) return
    if (stepIndex >= steps.length - 1) setStepIndex(-1)
    setPlaying((value) => !value)
  }

  const toggleFullscreen = async () => {
    const element = rootRef.current
    if (!element) return
    if (documentElementFullscreen() === element) {
      await globalThis.document.exitFullscreen?.()
    } else {
      await element.requestFullscreen?.()
    }
  }

  const mergedSequence = {
    ...sequence,
    scale: zoom * (sequence?.scale ?? 1),
    interactions: {
      ...sequence?.interactions,
      activeMessageId:
        sequence?.interactions?.activeMessageId !== undefined
          ? sequence.interactions.activeMessageId
          : activeMessageId,
    },
  }

  const dark = mode === 'dark'
  const playerTokens = useMemo(
    () => getSequenceThemeTokens(mode, theme),
    [mode, theme],
  )
  const chrome = {
    background: playerTokens.background,
    border: playerTokens.border,
    surface: dark ? 'rgba(24,24,27,.9)' : 'rgba(255,255,255,.92)',
    text: playerTokens.text,
    muted: playerTokens.textSecondary,
    active: playerTokens.highlight,
  }

  return (
    <div
      ref={rootRef}
      className={className}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight' && showPlayback) moveStep(1)
        if (event.key === 'ArrowLeft' && showPlayback) moveStep(-1)
      }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        minWidth: 0,
        minHeight: fullscreen ? '100vh' : undefined,
        background: chrome.background,
        border: `1px solid ${chrome.border}`,
        borderRadius: fullscreen ? 0 : 12,
        overflow: 'hidden',
        color: chrome.text,
        outline: 'none',
      }}
      data-arc-mermaid-player
    >
      {showControls && (
        <div
          style={{
            minHeight: 44,
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 6,
            padding: '6px 8px',
            borderBottom: `1px solid ${chrome.border}`,
            background: chrome.surface,
            backdropFilter: 'blur(14px)',
            fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <ControlButton
              label="Zoom out"
              color={chrome.text}
              border={chrome.border}
              onClick={() => setBoundedZoom(zoom - zoomStep)}
            >
              <Minus size={15} />
            </ControlButton>
            <button
              type="button"
              onClick={() => setZoom(1)}
              title="Fit diagram"
              style={{
                height: 28,
                minWidth: 50,
                border: `1px solid ${chrome.border}`,
                borderRadius: 8,
                background: 'transparent',
                color: chrome.muted,
                fontSize: 11,
                fontWeight: 650,
                cursor: 'pointer',
              }}
            >
              {Math.round(zoom * 100)}%
            </button>
            <ControlButton
              label="Zoom in"
              color={chrome.text}
              border={chrome.border}
              onClick={() => setBoundedZoom(zoom + zoomStep)}
            >
              <Plus size={15} />
            </ControlButton>
            <ControlButton
              label="Fit diagram"
              color={chrome.text}
              border={chrome.border}
              onClick={() => setZoom(1)}
            >
              <Scan size={15} />
            </ControlButton>
          </div>

          <div style={{ flex: 1 }} />

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              marginLeft: 'auto',
            }}
          >
            {showPlayback && steps.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
              <ControlButton
                label="Previous message"
                color={chrome.text}
                border={chrome.border}
                disabled={stepIndex < 0}
                onClick={() => moveStep(-1)}
              >
                <ChevronLeft size={16} />
              </ControlButton>
              <ControlButton
                label={playing ? 'Pause sequence' : 'Play sequence'}
                color={playing ? chrome.active : chrome.text}
                border={playing ? chrome.active : chrome.border}
                onClick={togglePlayback}
              >
                {playing ? <Pause size={15} /> : <Play size={15} />}
              </ControlButton>
              <ControlButton
                label="Next message"
                color={chrome.text}
                border={chrome.border}
                disabled={stepIndex >= steps.length - 1}
                onClick={() => moveStep(1)}
              >
                <ChevronRight size={16} />
              </ControlButton>
              <span
                aria-live="polite"
                style={{
                  minWidth: 68,
                  color: chrome.muted,
                  fontSize: 11,
                  textAlign: 'center',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {stepIndex < 0 ? 'Overview' : `${stepIndex + 1} / ${steps.length}`}
              </span>
              </div>
            )}

            <ControlButton
              label={fullscreen ? 'Exit fullscreen' : 'Expand player'}
              color={chrome.text}
              border={chrome.border}
              onClick={toggleFullscreen}
            >
              <Expand size={15} />
            </ControlButton>
          </div>
        </div>
      )}

      <div
        style={{
          flex: 1,
          minWidth: 0,
          overflow: 'auto',
          padding: fullscreen ? 20 : 10,
          background: chrome.background,
        }}
      >
        <ArcMermaid
          source={source}
          document={document}
          mode={mode}
          theme={theme}
          interactive
          title={title}
          description={description}
          sequence={mergedSequence}
        />
      </div>
    </div>
  )
}

function documentElementFullscreen(): Element | null {
  return typeof globalThis.document === 'undefined'
    ? null
    : globalThis.document.fullscreenElement
}

function ControlButton({
  label,
  color,
  border,
  disabled,
  onClick,
  children,
}: {
  label: string
  color: string
  border: string
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: 28,
        height: 28,
        display: 'grid',
        placeItems: 'center',
        border: `1px solid ${border}`,
        borderRadius: 8,
        background: 'transparent',
        color,
        opacity: disabled ? 0.34 : 1,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      {children}
    </button>
  )
}
