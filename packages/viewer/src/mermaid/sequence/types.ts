/**
 * Sequence renderer presentation + extensibility contracts.
 */

import type { CSSProperties, ReactNode } from 'react'
import type {
  SequenceEvent,
  SequenceFragmentElseEvent,
  SequenceFragmentEndEvent,
  SequenceFragmentStartEvent,
  SequenceMessageEvent,
  SequenceNoteEvent,
  SequenceParticipant,
  ArcSequenceDocument,
} from '../types'
import type { ThemeId } from '../../themes'

// ---------------------------------------------------------------------------
// Layout model (measured coordinates; owned by the sequence renderer)
// ---------------------------------------------------------------------------

export interface SequenceLayoutMetrics {
  width: number
  height: number
  paddingX: number
  paddingY: number
  headerHeight: number
  participantGap: number
  /** Center X for each participant id */
  participantX: Record<string, number>
  rowTops: number[]
  rowHeights: number[]
}

export interface SequenceLaidOutMessage {
  event: SequenceMessageEvent
  y: number
  fromX: number
  toX: number
  self: boolean
  /** Label already wrapped to the lanes it spans; parts should draw these lines. */
  labelLines?: string[]
  /** Baseline-to-baseline distance for `labelLines`. */
  labelLineHeight?: number
  /** Gap between the label's last baseline and the arrow. */
  labelGap?: number
}

export interface SequenceLaidOutNote {
  event: SequenceNoteEvent
  x: number
  y: number
  width: number
  height: number
  /** Note text already wrapped (and balanced) to the note's width. */
  lines?: string[]
  /** Baseline-to-baseline distance for `lines`. */
  lineHeight?: number
}

export interface SequenceLaidOutFragmentLane {
  label?: string
  y: number
  height: number
  /** Event orders (inclusive) covered by this lane body */
  startOrder: number
  endOrder: number
}

export interface SequenceLaidOutFragment {
  id: string
  kind: string
  label?: string
  x: number
  y: number
  width: number
  height: number
  depth: number
  lanes: SequenceLaidOutFragmentLane[]
}

export interface SequenceLayout {
  metrics: SequenceLayoutMetrics
  messages: SequenceLaidOutMessage[]
  notes: SequenceLaidOutNote[]
  fragments: SequenceLaidOutFragment[]
}

// ---------------------------------------------------------------------------
// Theme tokens (inline colors for deterministic SVG / no Tailwind dependency)
// ---------------------------------------------------------------------------

export interface SequenceThemeTokens {
  background: string
  surface: string
  border: string
  text: string
  textSecondary: string
  textMuted: string
  lifeline: string
  messageSolid: string
  messageDashed: string
  messageLabel: string
  actorFill: string
  actorStroke: string
  actorText: string
  participantFill: string
  participantStroke: string
  participantText: string
  noteFill: string
  noteStroke: string
  noteText: string
  /** Cool/green family — local control plane */
  localFill: string
  localStroke: string
  localText: string
  /** Warm/amber family — model inference */
  modelFill: string
  modelStroke: string
  modelText: string
  fragmentFill: string
  fragmentStroke: string
  fragmentLabelBg: string
  fragmentLabelText: string
  fragmentDivider: string
  highlight: string
  dimOpacity: number
}

// ---------------------------------------------------------------------------
// Part props (extensible building blocks)
// ---------------------------------------------------------------------------

export interface SequencePartContext {
  /** Per-renderer id namespace for SVG markers and accessibility ids. */
  idPrefix: string
  mode: 'light' | 'dark'
  themeId: ThemeId
  tokens: SequenceThemeTokens
  layout: SequenceLayout
  document: ArcSequenceDocument
  interactive: boolean
  highlightedParticipantId: string | null
  dimmed: boolean
  noteAccent: (event: SequenceNoteEvent) => 'local' | 'model' | 'default'
}

export interface ActorHeaderProps {
  participant: SequenceParticipant
  x: number
  y: number
  width: number
  height: number
  context: SequencePartContext
  emphasized: boolean
  onPointerEnter?: () => void
  onPointerLeave?: () => void
  onFocus?: () => void
  onBlur?: () => void
  onClick?: () => void
}

export interface ParticipantHeaderProps {
  participant: SequenceParticipant
  x: number
  y: number
  width: number
  height: number
  context: SequencePartContext
  emphasized: boolean
  onPointerEnter?: () => void
  onPointerLeave?: () => void
  onFocus?: () => void
  onBlur?: () => void
  onClick?: () => void
}

export interface LifelineProps {
  participant: SequenceParticipant
  x: number
  y1: number
  y2: number
  context: SequencePartContext
  emphasized: boolean
}

export interface MessagePartProps {
  laidOut: SequenceLaidOutMessage
  context: SequencePartContext
  emphasized: boolean
  onPointerEnter?: () => void
  onPointerLeave?: () => void
  onActivate?: () => void
}

export interface NotePartProps {
  laidOut: SequenceLaidOutNote
  context: SequencePartContext
  emphasized: boolean
}

export interface FragmentPartProps {
  laidOut: SequenceLaidOutFragment
  context: SequencePartContext
}

/** Pluggable part components for sequence rendering */
export interface SequenceRendererParts {
  ActorHeader?: (props: ActorHeaderProps) => ReactNode
  ParticipantHeader?: (props: ParticipantHeaderProps) => ReactNode
  Lifeline?: (props: LifelineProps) => ReactNode
  Message?: (props: MessagePartProps) => ReactNode
  Note?: (props: NotePartProps) => ReactNode
  Fragment?: (props: FragmentPartProps) => ReactNode
}

/** Player / interaction hooks — never required for static export fidelity */
export interface SequencePlayerInteractions {
  onParticipantHover?: (participantId: string | null) => void
  onParticipantFocus?: (participantId: string | null) => void
  onParticipantActivate?: (participantId: string) => void
  onMessageHover?: (messageId: string | null) => void
  onMessageActivate?: (messageId: string) => void
  /** Controlled highlight; when omitted, internal hover/focus state is used */
  highlightedParticipantId?: string | null
  /** Controlled message emphasis used by timeline players. */
  activeMessageId?: string | null
  /** Dim unrelated lifelines/messages when a participant is highlighted. Default true when interactive */
  dimUnrelated?: boolean
}

export interface SequencePresentationOptions {
  /** Target width; height grows with content. Default 960 */
  width?: number
  /** Visual scale applied after layout. Default 1. */
  scale?: number
  /** Max message label width before wrap. Default 160 */
  maxLabelWidth?: number
  /** Override theme tokens partially */
  tokens?: Partial<SequenceThemeTokens>
  /** Replace individual part renderers */
  parts?: SequenceRendererParts
  /** Map authored note semantics to a presentation role. Defaults to neutral. */
  noteAccent?: (
    event: SequenceNoteEvent,
  ) => 'local' | 'model' | 'default'
  /** Interaction hooks */
  interactions?: SequencePlayerInteractions
  /** Inline style on root */
  style?: CSSProperties
}

export type {
  SequenceEvent,
  SequenceMessageEvent,
  SequenceNoteEvent,
  SequenceFragmentStartEvent,
  SequenceFragmentElseEvent,
  SequenceFragmentEndEvent,
  SequenceParticipant,
  ArcSequenceDocument,
}
