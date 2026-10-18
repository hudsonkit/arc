import { HOST_THEME_CSS } from '../../theme/host'
/**
 * Native Arc sequence diagram renderer (not an ArcDiagramData projection).
 */

import { useId, useMemo, useState, useCallback } from 'react'
import type { ThemeId } from '../../themes'
import type { ArcSequenceDocument, SequenceMessageEvent } from '../types'
import { layoutSequence, HEADER_BOX_W, HEADER_BOX_H, HEADER_HEIGHT, PADDING_Y } from './layout'
import { getSequenceThemeTokens } from './theme'
import { defaultSequenceParts } from './parts'
import type {
  SequencePartContext,
  SequencePresentationOptions,
  SequenceRendererParts,
} from './types'

export interface SequenceRendererProps {
  document: ArcSequenceDocument
  mode?: 'light' | 'dark'
  theme?: ThemeId
  interactive?: boolean
  className?: string
  title?: string
  description?: string
  presentation?: SequencePresentationOptions
}

function resolveParts(overrides?: SequenceRendererParts): Required<SequenceRendererParts> {
  return {
    ActorHeader: overrides?.ActorHeader ?? defaultSequenceParts.ActorHeader,
    ParticipantHeader:
      overrides?.ParticipantHeader ?? defaultSequenceParts.ParticipantHeader,
    Lifeline: overrides?.Lifeline ?? defaultSequenceParts.Lifeline,
    Message: overrides?.Message ?? defaultSequenceParts.Message,
    Note: overrides?.Note ?? defaultSequenceParts.Note,
    Fragment: overrides?.Fragment ?? defaultSequenceParts.Fragment,
  }
}

function neutralNoteAccent(): 'default' {
  return 'default'
}

export function SequenceRenderer({
  document,
  mode = 'light',
  theme = 'default',
  interactive = true,
  className = '',
  title,
  description,
  presentation,
}: SequenceRendererProps) {
  const idPrefix = `arc-seq-${useId().replace(/:/g, '')}`
  const tokens = useMemo(
    () => ({
      ...getSequenceThemeTokens(mode, theme),
      ...presentation?.tokens,
    }),
    [mode, theme, presentation?.tokens],
  )

  const layout = useMemo(
    () =>
      layoutSequence(document, {
        width: presentation?.width ?? 960,
        maxLabelWidth: presentation?.maxLabelWidth ?? 160,
      }),
    [document, presentation?.width, presentation?.maxLabelWidth],
  )

  const parts = useMemo(
    () => resolveParts(presentation?.parts),
    [presentation?.parts],
  )

  const interactions = presentation?.interactions
  const activeMessage = useMemo<SequenceMessageEvent | undefined>(
    () =>
      interactions?.activeMessageId
        ? document.events.find(
            (event): event is SequenceMessageEvent =>
              event.type === 'message' &&
              event.id === interactions.activeMessageId,
          )
        : undefined,
    [document.events, interactions?.activeMessageId],
  )
  const controlledHighlight = interactions?.highlightedParticipantId
  const [internalHighlight, setInternalHighlight] = useState<string | null>(null)
  const highlight =
    controlledHighlight !== undefined ? controlledHighlight : internalHighlight

  const dimUnrelated =
    interactions?.dimUnrelated ??
    (interactive && (highlight != null || activeMessage != null))

  const relatedIds = useMemo(() => {
    if (!highlight) return null
    const set = new Set<string>([highlight])
    for (const m of document.events) {
      if (m.type === 'message' && (m.from === highlight || m.to === highlight)) {
        set.add(m.from)
        set.add(m.to)
      }
      if (m.type === 'note' && m.participants.includes(highlight)) {
        m.participants.forEach((p) => set.add(p))
      }
    }
    return set
  }, [document.events, highlight])

  const isEmphasizedParticipant = useCallback(
    (id: string) => {
      if (activeMessage) {
        return activeMessage.from === id || activeMessage.to === id
      }
      if (!highlight) return false
      return relatedIds?.has(id) ?? id === highlight
    },
    [activeMessage, highlight, relatedIds],
  )

  const isEmphasizedMessage = useCallback(
    (id: string, from: string, to: string) => {
      if (activeMessage) {
        return activeMessage.id === id
      }
      if (!highlight) return false
      return from === highlight || to === highlight
    },
    [activeMessage, highlight],
  )

  const setHighlight = useCallback(
    (id: string | null) => {
      if (controlledHighlight === undefined) setInternalHighlight(id)
      interactions?.onParticipantHover?.(id)
    },
    [controlledHighlight, interactions],
  )

  const a11yTitle =
    title ??
    `Sequence diagram with ${document.participants.length} participants`
  const a11yDesc =
    description ??
    buildAutoDescription(document)

  const context: SequencePartContext = {
    idPrefix,
    mode,
    themeId: theme,
    tokens,
    layout,
    document,
    interactive,
    highlightedParticipantId: highlight,
    dimmed: Boolean(dimUnrelated && (highlight || activeMessage)),
    noteAccent: presentation?.noteAccent ?? neutralNoteAccent,
  }

  const { metrics } = layout
  const lifelineTop = PADDING_Y + HEADER_HEIGHT
  const lifelineBottom = metrics.height - 12

  const {
    ActorHeader,
    ParticipantHeader,
    Lifeline,
    Message,
    Note,
    Fragment,
  } = parts

  return (
    <div
      className={`${theme === 'inherit' ? `arc-inherit-${mode} arc-host-sequence` : ''} ${className}`}
      style={{
        width: '100%',
        minWidth: 0,
        overflowX: 'auto',
        ...presentation?.style,
      }}
      data-arc-mermaid-family="sequence"
    >
      {theme === 'inherit' && <style>{HOST_THEME_CSS}</style>}
      <svg
        viewBox={`0 0 ${metrics.width} ${metrics.height}`}
        width={`${(presentation?.scale ?? 1) * 100}%`}
        height="auto"
        role="img"
        aria-labelledby={`${idPrefix}-title ${idPrefix}-desc`}
        style={{
          display: 'block',
          background: tokens.background,
          borderRadius: 10,
          minWidth: Math.min(metrics.width * (presentation?.scale ?? 1), 680),
          maxWidth: metrics.width * (presentation?.scale ?? 1),
        }}
      >
        <title id={`${idPrefix}-title`}>{a11yTitle}</title>
        <desc id={`${idPrefix}-desc`}>{a11yDesc}</desc>

        {/* Background */}
        <rect
          x={0}
          y={0}
          width={metrics.width}
          height={metrics.height}
          fill={tokens.background}
          rx={10}
        />

        {/* Fragments behind messages */}
        {layout.fragments.map((f) => (
          <Fragment key={f.id} laidOut={f} context={context} />
        ))}

        {/* Lifelines */}
        {document.participants.map((p) => (
          <Lifeline
            key={`life-${p.id}`}
            participant={p}
            x={metrics.participantX[p.id]}
            y1={lifelineTop}
            y2={lifelineBottom}
            context={context}
            emphasized={isEmphasizedParticipant(p.id)}
          />
        ))}

        {/* Participant headers */}
        {document.participants.map((p) => {
          const x = metrics.participantX[p.id]
          const y = PADDING_Y
          const emphasized = isEmphasizedParticipant(p.id)
          const handlers = interactive
            ? {
                onPointerEnter: () => setHighlight(p.id),
                onPointerLeave: () => setHighlight(null),
                onFocus: () => {
                  setHighlight(p.id)
                  interactions?.onParticipantFocus?.(p.id)
                },
                onBlur: () => {
                  setHighlight(null)
                  interactions?.onParticipantFocus?.(null)
                },
                onClick: () => interactions?.onParticipantActivate?.(p.id),
              }
            : {}

          if (p.kind === 'actor') {
            return (
              <ActorHeader
                key={p.id}
                participant={p}
                x={x}
                y={y}
                width={HEADER_BOX_W}
                height={HEADER_BOX_H + 8}
                context={context}
                emphasized={emphasized}
                {...handlers}
              />
            )
          }
          return (
            <ParticipantHeader
              key={p.id}
              participant={p}
              x={x}
              y={y}
              width={HEADER_BOX_W}
              height={HEADER_BOX_H}
              context={context}
              emphasized={emphasized}
              {...handlers}
            />
          )
        })}

        {/* Notes */}
        {layout.notes.map((n) => (
          <Note
            key={n.event.id}
            laidOut={n}
            context={context}
            emphasized={
              highlight != null &&
              n.event.participants.some((id) => relatedIds?.has(id))
            }
          />
        ))}

        {/* Messages */}
        {layout.messages.map((m) => (
          <Message
            key={m.event.id}
            laidOut={m}
            context={context}
            emphasized={isEmphasizedMessage(
              m.event.id,
              m.event.from,
              m.event.to,
            )}
            onPointerEnter={
              interactive
                ? () => interactions?.onMessageHover?.(m.event.id)
                : undefined
            }
            onPointerLeave={
              interactive
                ? () => interactions?.onMessageHover?.(null)
                : undefined
            }
            onActivate={
              interactive
                ? () => interactions?.onMessageActivate?.(m.event.id)
                : undefined
            }
          />
        ))}
      </svg>
    </div>
  )
}

function buildAutoDescription(doc: ArcSequenceDocument): string {
  const names = doc.participants.map((p) => p.label).join(', ')
  const msgCount = doc.events.filter((e) => e.type === 'message').length
  const noteCount = doc.events.filter((e) => e.type === 'note').length
  const fragCount = doc.events.filter((e) => e.type === 'fragmentStart').length
  return `Participants: ${names}. ${msgCount} messages, ${noteCount} notes, ${fragCount} fragments.`
}

export default SequenceRenderer
