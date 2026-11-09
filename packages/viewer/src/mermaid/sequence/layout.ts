/**
 * Deterministic sequence layout — pure functions, no DOM measurement.
 * Long labels wrap within maxLabelWidth and grow their row height.
 */

import type {
  ArcSequenceDocument,
  SequenceEvent,
  SequenceFragmentElseEvent,
  SequenceFragmentStartEvent,
  SequenceMessageEvent,
  SequenceNoteEvent,
} from '../types'
import type {
  SequenceLaidOutFragment,
  SequenceLaidOutFragmentLane,
  SequenceLaidOutMessage,
  SequenceLaidOutNote,
  SequenceLayout,
  SequenceLayoutMetrics,
} from './types'

const DEFAULT_WIDTH = 960
const PADDING_X = 22
const PADDING_Y = 16
const HEADER_HEIGHT = 46
const HEADER_BOX_W = 102
const HEADER_BOX_H = 34
const MIN_PARTICIPANT_GAP = 112
const ROW_GAP = 7
const MESSAGE_MIN_HEIGHT = 24
const NOTE_PAD_Y = 8
const NOTE_PAD_X = 10
const FRAGMENT_PAD = 9
const FRAGMENT_LABEL_H = 18
const LANE_SEP = 6
/**
 * Average advance of the 10px system sans the parts render with (measured
 * ~4.7px for mixed-case labels), rounded up: an estimate that runs short lets a
 * line spill past its lane, one that runs long wraps labels that would fit.
 */
const CHAR_WIDTH = 5.3
const LINE_HEIGHT = 14
/** Baseline-to-baseline distance for message labels and note text. */
const LABEL_LINE_HEIGHT = 12
/** Gap between a message label's last baseline and its arrow. */
const LABEL_ARROW_GAP = 5
/** Clearance a message label keeps from the lifelines at either end. */
const LABEL_LANE_INSET = 10
/** A label never wraps narrower than this, however tight its lanes. */
const MIN_LABEL_WIDTH = 84

const textWidth = (text: string) => text.length * CHAR_WIDTH

/** Greedy word wrap of one segment to a pixel width. */
function wrapSegment(text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length === 0) return ['']
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (textWidth(next) > maxWidth && current) {
      lines.push(current)
      current = word
    } else {
      current = next
    }
  }
  if (current) lines.push(current)
  return lines
}

/**
 * Wrap to `maxWidth` without orphans: keep the line count greedy wrapping
 * needs, then find the narrowest width that still fits in that many lines, so
 * "…loaded before the / turn" becomes three even lines instead.
 */
function wrapBalanced(text: string, maxWidth: number): string[] {
  const greedy = wrapSegment(text, maxWidth)
  if (greedy.length < 2) return greedy
  let lo = Math.max(...text.split(/\s+/).map(textWidth))
  let hi = maxWidth
  let best = greedy
  while (hi - lo > 1) {
    const mid = (lo + hi) / 2
    const lines = wrapSegment(text, mid)
    if (lines.length <= greedy.length) {
      best = lines
      hi = mid
    } else {
      lo = mid
    }
  }
  return best
}

/** Wrap every authored segment (Mermaid `<br>` breaks stay breaks). */
function wrapLabel(label: string[], maxWidth: number): string[] {
  if (label.length === 0) return ['']
  const lines = label.flatMap((segment) => wrapBalanced(segment, maxWidth))
  return lines.length ? lines : ['']
}

function estimateTextWidth(text: string, maxWidth: number): { lines: string[]; height: number; width: number } {
  const lines = wrapSegment(text, maxWidth)
  const width = Math.min(maxWidth, Math.max(0, ...lines.map(textWidth)))
  return { lines, height: lines.length * LINE_HEIGHT, width }
}

function estimateLabelBlock(label: string[], maxWidth: number): { height: number; width: number; lines: string[] } {
  if (label.length === 0) return { height: LINE_HEIGHT, width: 0, lines: [''] }
  const allLines: string[] = []
  let maxW = 0
  let totalH = 0
  for (const segment of label) {
    const est = estimateTextWidth(segment, maxWidth)
    allLines.push(...est.lines)
    maxW = Math.max(maxW, est.width)
    totalH += est.height
  }
  return { height: Math.max(LINE_HEIGHT, totalH), width: maxW, lines: allLines }
}

interface FlatRow {
  kind: 'message' | 'note' | 'fragmentStart' | 'fragmentElse' | 'fragmentEnd' | 'spacer'
  event?: SequenceEvent
  height: number
  order: number
}

function participantIndex(
  doc: ArcSequenceDocument,
  id: string,
): number {
  const idx = doc.participants.findIndex((p) => p.id === id)
  return idx >= 0 ? idx : 0
}

function spanX(
  participantX: Record<string, number>,
  ids: string[],
  boxHalf = HEADER_BOX_W / 2,
): { x: number; width: number } {
  if (ids.length === 0) {
    const xs = Object.values(participantX)
    const min = Math.min(...xs)
    const max = Math.max(...xs)
    return { x: min - boxHalf, width: max - min + boxHalf * 2 }
  }
  const xs = ids.map((id) => participantX[id] ?? 0)
  const min = Math.min(...xs)
  const max = Math.max(...xs)
  return { x: min - boxHalf, width: Math.max(boxHalf * 2, max - min + boxHalf * 2) }
}

export interface SequenceLayoutOptions {
  width?: number
  maxLabelWidth?: number
}

export function layoutSequence(
  document: ArcSequenceDocument,
  options: SequenceLayoutOptions = {},
): SequenceLayout {
  const targetWidth = options.width ?? DEFAULT_WIDTH
  const maxLabelWidth = options.maxLabelWidth ?? 160
  const n = document.participants.length || 1

  const usable = targetWidth - PADDING_X * 2
  const gap = Math.max(MIN_PARTICIPANT_GAP, usable / Math.max(n, 1))
  const contentWidth = Math.max(targetWidth, PADDING_X * 2 + gap * (n - 1) + HEADER_BOX_W)
  const startX = PADDING_X + HEADER_BOX_W / 2 + Math.max(0, (contentWidth - PADDING_X * 2 - gap * (n - 1) - HEADER_BOX_W) / 2)

  const participantX: Record<string, number> = {}
  document.participants.forEach((p, i) => {
    participantX[p.id] = startX + i * gap
  })

  // Wrap each label once, here, at the width its lanes actually give it, and
  // size the row from those lines. The parts draw these same lines, so a row
  // can never be shorter than its label and a label never lands on its arrow.
  const messageLines = new Map<number, string[]>()
  const noteLines = new Map<number, string[]>()

  // Build rows in authored order
  const rows: FlatRow[] = []
  for (const event of document.events) {
    if (event.type === 'message') {
      const self = event.from === event.to
      const span = Math.abs(
        (participantX[event.to] ?? startX) - (participantX[event.from] ?? startX),
      )
      const wrapWidth = self
        ? maxLabelWidth
        : Math.max(MIN_LABEL_WIDTH, Math.min(maxLabelWidth, span - LABEL_LANE_INSET * 2))
      const lines = wrapLabel(event.label, wrapWidth)
      messageLines.set(event.order, lines)
      const extra = (lines.length - 1) * LABEL_LINE_HEIGHT
      const h = self
        ? Math.max(MESSAGE_MIN_HEIGHT, extra + 36) + ROW_GAP
        : MESSAGE_MIN_HEIGHT + 2 + extra + ROW_GAP
      rows.push({ kind: 'message', event, height: h, order: event.order })
    } else if (event.type === 'note') {
      const spanIds =
        event.placement === 'over'
          ? expandParticipantRange(document, event.participants)
          : event.participants
      const { width } = spanX(participantX, spanIds)
      const lines = wrapLabel(event.text, Math.max(80, width - NOTE_PAD_X * 2))
      noteLines.set(event.order, lines)
      const h = Math.max(32, lines.length * LABEL_LINE_HEIGHT + NOTE_PAD_Y * 2 + 2) + ROW_GAP
      rows.push({ kind: 'note', event, height: h, order: event.order })
    } else if (event.type === 'fragmentStart') {
      rows.push({
        kind: 'fragmentStart',
        event,
        height: FRAGMENT_LABEL_H + FRAGMENT_PAD,
        order: event.order,
      })
    } else if (event.type === 'fragmentElse') {
      rows.push({
        kind: 'fragmentElse',
        event,
        height: FRAGMENT_LABEL_H + LANE_SEP,
        order: event.order,
      })
    } else if (event.type === 'fragmentEnd') {
      rows.push({
        kind: 'fragmentEnd',
        event,
        height: FRAGMENT_PAD,
        order: event.order,
      })
    }
  }

  const headerY = PADDING_Y
  let y = headerY + HEADER_HEIGHT + 12
  const rowTops: number[] = []
  const rowHeights: number[] = []
  const orderY = new Map<number, number>()
  const orderH = new Map<number, number>()

  for (const row of rows) {
    rowTops.push(y)
    rowHeights.push(row.height)
    orderY.set(row.order, y)
    orderH.set(row.order, row.height)
    y += row.height
  }

  const contentBottom = y + PADDING_Y
  const metrics: SequenceLayoutMetrics = {
    width: contentWidth,
    height: contentBottom,
    paddingX: PADDING_X,
    paddingY: PADDING_Y,
    headerHeight: HEADER_HEIGHT,
    participantGap: gap,
    participantX,
    rowTops,
    rowHeights,
  }

  const messages: SequenceLaidOutMessage[] = []
  const notes: SequenceLaidOutNote[] = []

  for (const row of rows) {
    if (row.kind === 'message' && row.event?.type === 'message') {
      const ev = row.event as SequenceMessageEvent
      const fromX = participantX[ev.from] ?? startX
      const toX = participantX[ev.to] ?? startX
      const top = orderY.get(ev.order) ?? 0
      const h = orderH.get(ev.order) ?? MESSAGE_MIN_HEIGHT
      const self = ev.from === ev.to
      const labelLines = messageLines.get(ev.order) ?? ev.label
      messages.push({
        event: ev,
        // A straight arrow sits under its whole label block; a self-call's
        // loop is centred in its row with the label beside it.
        y: self
          ? top + (h - ROW_GAP) / 2
          : top + MESSAGE_MIN_HEIGHT / 2 + 2 + (labelLines.length - 1) * LABEL_LINE_HEIGHT,
        fromX,
        toX,
        self,
        labelLines,
        labelLineHeight: LABEL_LINE_HEIGHT,
        labelGap: LABEL_ARROW_GAP,
      })
    }
    if (row.kind === 'note' && row.event?.type === 'note') {
      const ev = row.event as SequenceNoteEvent
      const top = orderY.get(ev.order) ?? 0
      const h = (orderH.get(ev.order) ?? 36) - ROW_GAP
      const spanIds =
        ev.placement === 'over'
          ? expandParticipantRange(document, ev.participants)
          : ev.participants
      const { x, width } = spanX(participantX, spanIds)
      const lines = noteLines.get(ev.order) ?? ev.text
      const textW = Math.max(0, ...lines.map(textWidth))
      notes.push({
        event: ev,
        x,
        y: top,
        width: Math.max(width, textW + NOTE_PAD_X * 2),
        height: h,
        lines,
        lineHeight: LABEL_LINE_HEIGHT,
      })
    }
  }

  // Fragments: pair start/else/end by stack
  const fragments = layoutFragments(document, rows, orderY, orderH, participantX, startX)

  return { metrics, messages, notes, fragments }
}

function expandParticipantRange(
  doc: ArcSequenceDocument,
  ids: string[],
): string[] {
  if (ids.length <= 1) return ids
  const a = participantIndex(doc, ids[0])
  const b = participantIndex(doc, ids[ids.length - 1])
  const lo = Math.min(a, b)
  const hi = Math.max(a, b)
  return doc.participants.slice(lo, hi + 1).map((p) => p.id)
}

function layoutFragments(
  document: ArcSequenceDocument,
  rows: FlatRow[],
  orderY: Map<number, number>,
  orderH: Map<number, number>,
  participantX: Record<string, number>,
  _startX: number,
): SequenceLaidOutFragment[] {
  const fragments: SequenceLaidOutFragment[] = []
  type Frame = {
    start: SequenceFragmentStartEvent
    elses: SequenceFragmentElseEvent[]
    endOrder?: number
  }
  const stack: Frame[] = []
  const completed: Frame[] = []

  for (const row of rows) {
    if (row.kind === 'fragmentStart' && row.event?.type === 'fragmentStart') {
      stack.push({ start: row.event, elses: [] })
    } else if (row.kind === 'fragmentElse' && row.event?.type === 'fragmentElse') {
      const top = stack[stack.length - 1]
      if (top) top.elses.push(row.event)
    } else if (row.kind === 'fragmentEnd' && row.event?.type === 'fragmentEnd') {
      const frame = stack.pop()
      if (frame) {
        frame.endOrder = row.event.order
        completed.push(frame)
      }
    }
  }

  // All participants for fragment width (full interaction width)
  const allIds = document.participants.map((p) => p.id)
  const { x, width } = spanX(participantX, allIds, HEADER_BOX_W / 2 + 8)

  for (const frame of completed) {
    const startY = orderY.get(frame.start.order) ?? 0
    const endOrder = frame.endOrder ?? frame.start.order
    const endY = (orderY.get(endOrder) ?? startY) + (orderH.get(endOrder) ?? 0)
    const height = Math.max(40, endY - startY)

    const lanes: SequenceLaidOutFragmentLane[] = []
    // First lane: from start to first else (or end)
    const firstElse = frame.elses[0]
    const firstEnd = firstElse ? firstElse.order : endOrder
    lanes.push({
      label: frame.start.label,
      y: startY,
      height: Math.max(
        FRAGMENT_LABEL_H,
        (orderY.get(firstEnd) ?? startY) - startY,
      ),
      startOrder: frame.start.order,
      endOrder: firstEnd,
    })

    for (let i = 0; i < frame.elses.length; i++) {
      const el = frame.elses[i]
      const next = frame.elses[i + 1]
      const laneEnd = next ? next.order : endOrder
      const ly = orderY.get(el.order) ?? startY
      lanes.push({
        label: el.label,
        y: ly,
        height: Math.max(
          FRAGMENT_LABEL_H,
          (orderY.get(laneEnd) ?? ly) - ly,
        ),
        startOrder: el.order,
        endOrder: laneEnd,
      })
    }

    fragments.push({
      id: frame.start.id,
      kind: frame.start.kind,
      label: frame.start.label,
      x: x - 4,
      y: startY,
      width: width + 8,
      height,
      depth: frame.start.depth,
      lanes,
    })
  }

  return fragments
}

export { estimateLabelBlock, wrapLabel, HEADER_BOX_W, HEADER_BOX_H, HEADER_HEIGHT, PADDING_Y }
