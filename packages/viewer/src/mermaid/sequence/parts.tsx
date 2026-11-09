/**
 * Default sequence part renderers — SVG building blocks.
 * Replace any via SequenceRendererParts for customization.
 */

import {
  HEADER_BOX_H,
  HEADER_BOX_W,
} from './layout'
import type {
  ActorHeaderProps,
  FragmentPartProps,
  LifelineProps,
  MessagePartProps,
  NotePartProps,
  ParticipantHeaderProps,
  SequenceRendererParts,
} from './types'

function wrapLines(
  text: string[],
  maxChars: number,
): string[] {
  const out: string[] = []
  for (const segment of text) {
    if (segment.length <= maxChars) {
      out.push(segment)
      continue
    }
    const words = segment.split(/\s+/)
    let cur = ''
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w
      if (next.length > maxChars && cur) {
        out.push(cur)
        cur = w
      } else {
        cur = next
      }
    }
    if (cur) out.push(cur)
  }
  return out.length ? out : ['']
}

export function DefaultActorHeader({
  participant,
  x,
  y,
  width,
  height,
  context,
  emphasized,
  onPointerEnter,
  onPointerLeave,
  onFocus,
  onBlur,
  onClick,
}: ActorHeaderProps) {
  const { tokens, interactive } = context
  const opacity = context.dimmed && !emphasized ? tokens.dimOpacity : 1
  const cx = x
  const top = y + 3
  const stroke = emphasized ? tokens.highlight : tokens.actorStroke

  return (
    <g
      opacity={opacity}
      style={{ transition: 'opacity 160ms ease-out' }}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      onClick={onClick}
      tabIndex={interactive ? 0 : undefined}
      role={interactive ? 'button' : undefined}
      aria-label={`Actor ${participant.label}`}
    >
      {/* Compact "human spark": a tiny orbital portrait rather than a stick figure. */}
      <circle
        cx={cx}
        cy={top + 6}
        r={6.5}
        fill="none"
        stroke={stroke}
        strokeWidth={1}
        opacity={emphasized ? 0.5 : 0.26}
      />
      <circle
        cx={cx}
        cy={top + 6}
        r={3.7}
        fill={tokens.actorFill}
        stroke={stroke}
        strokeWidth={emphasized ? 1.7 : 1.3}
      />
      <path
        d={`M ${cx - 9.5} ${top + 22} C ${cx - 9} ${top + 16.5}, ${cx - 5.5} ${top + 14}, ${cx - 2.5} ${top + 13.5} M ${cx + 2.5} ${top + 13.5} C ${cx + 5.5} ${top + 14}, ${cx + 9} ${top + 16.5}, ${cx + 9.5} ${top + 22}`}
        fill="none"
        stroke={stroke}
        strokeWidth={emphasized ? 1.8 : 1.4}
        strokeLinecap="round"
      />
      <text
        x={cx}
        y={y + height}
        textAnchor="middle"
        fill={tokens.actorText}
        fontSize={10}
        fontFamily="ui-sans-serif, system-ui, -apple-system, sans-serif"
        fontWeight={600}
      >
        {participant.label}
      </text>
      {/* invisible hit target */}
      <rect
        x={x - width / 2}
        y={y}
        width={width}
        height={height + 14}
        fill="transparent"
      />
    </g>
  )
}

export function DefaultParticipantHeader({
  participant,
  x,
  y,
  width,
  height,
  context,
  emphasized,
  onPointerEnter,
  onPointerLeave,
  onFocus,
  onBlur,
  onClick,
}: ParticipantHeaderProps) {
  const { tokens, interactive } = context
  const opacity = context.dimmed && !emphasized ? tokens.dimOpacity : 1
  const boxW = width
  const boxH = height
  const lines = wrapLines([participant.label], Math.floor(boxW / 7))

  return (
    <g
      opacity={opacity}
      style={{ transition: 'opacity 160ms ease-out' }}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      onClick={onClick}
      tabIndex={interactive ? 0 : undefined}
      role={interactive ? 'button' : undefined}
      aria-label={`Participant ${participant.label}`}
    >
      <rect
        x={x - boxW / 2}
        y={y}
        width={boxW}
        height={boxH}
        rx={7}
        ry={7}
        fill={tokens.participantFill}
        stroke={emphasized ? tokens.highlight : tokens.participantStroke}
        strokeWidth={emphasized ? 1.75 : 1}
      />
      {lines.map((ln, i) => (
        <text
          key={i}
          x={x}
          y={y + boxH / 2 + (i - (lines.length - 1) / 2) * 12}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={tokens.participantText}
          fontSize={10}
          fontFamily="ui-sans-serif, system-ui, -apple-system, sans-serif"
          fontWeight={600}
        >
          {ln}
        </text>
      ))}
    </g>
  )
}

export function DefaultLifeline({
  participant,
  x,
  y1,
  y2,
  context,
  emphasized,
}: LifelineProps) {
  const { tokens } = context
  const opacity = context.dimmed && !emphasized ? tokens.dimOpacity : 1
  return (
    <line
      x1={x}
      y1={y1}
      x2={x}
      y2={y2}
      stroke={emphasized ? tokens.highlight : tokens.lifeline}
      strokeWidth={emphasized ? 1.5 : 0.85}
      strokeDasharray={emphasized ? undefined : '3 4'}
      opacity={opacity}
      style={{ transition: 'opacity 160ms ease-out, stroke 160ms ease-out' }}
      data-participant={participant.id}
    />
  )
}

export function DefaultMessage({
  laidOut,
  context,
  emphasized,
  onPointerEnter,
  onPointerLeave,
  onActivate,
}: MessagePartProps) {
  const { tokens, interactive } = context
  const { event, y, fromX, toX, self } = laidOut
  const dashed = event.line === 'dashed'
  const stroke = dashed ? tokens.messageDashed : tokens.messageSolid
  const color = emphasized ? tokens.highlight : stroke
  const opacity = context.dimmed && !emphasized ? tokens.dimOpacity : 1
  const markerId = `${context.idPrefix}-arrow-${event.id}`
  const label = event.label.join(' ')
  const lines = laidOut.labelLines ?? wrapLines(event.label, 28)
  const lineHeight = laidOut.labelLineHeight ?? 11
  const labelGap = laidOut.labelGap ?? 5

  const arrowHead = (
    <marker
      id={markerId}
      markerWidth="7"
      markerHeight="7"
      refX="5.5"
      refY="2.75"
      orient="auto"
      markerUnits="strokeWidth"
    >
      {event.arrow === 'open' ? (
        <path d="M0,0 L5.5,2.75 L0,5.5" fill="none" stroke={color} strokeWidth="1.1" />
      ) : (
        <path d="M0,0 L5.5,2.75 L0,5.5 Z" fill={color} />
      )}
    </marker>
  )

  if (self) {
    const loopW = 36
    const loopH = 18
    const path = `M ${fromX} ${y - loopH / 2} L ${fromX + loopW} ${y - loopH / 2} L ${fromX + loopW} ${y + loopH / 2} L ${fromX} ${y + loopH / 2}`
    return (
      <g
        opacity={opacity}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        onClick={onActivate}
        style={{ cursor: interactive ? 'pointer' : undefined }}
        role={interactive ? 'button' : undefined}
        tabIndex={interactive ? 0 : undefined}
        aria-label={`Message: ${label}`}
        onKeyDown={
          interactive
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onActivate?.()
                }
              }
            : undefined
        }
      >
        <defs>{arrowHead}</defs>
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth={emphasized ? 2 : 1.5}
          strokeDasharray={dashed ? '5 4' : undefined}
          markerEnd={`url(#${markerId})`}
        />
        {lines.map((ln, i) => (
          <text
            key={i}
            x={fromX + loopW + 6}
            y={y + 1 + (i - (lines.length - 1) / 2) * lineHeight}
            fill={tokens.messageLabel}
            fontSize={10}
            fontFamily="ui-sans-serif, system-ui, -apple-system, sans-serif"
            dominantBaseline="middle"
          >
            {ln}
          </text>
        ))}
      </g>
    )
  }

  const dir = toX >= fromX ? 1 : -1
  const x1 = fromX
  const x2 = toX - dir * 2
  const midX = (x1 + x2) / 2
  // Stack the label upward from the arrow: the last line sits just above it,
  // earlier lines above that, so no wrapped line can fall onto the shaft.
  const labelY = y - labelGap - (lines.length - 1) * lineHeight

  return (
    <g
      opacity={opacity}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onClick={onActivate}
      style={{
        cursor: interactive ? 'pointer' : undefined,
        transition: 'opacity 160ms ease-out',
      }}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={`Message: ${label}`}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onActivate?.()
              }
            }
          : undefined
      }
    >
      <defs>{arrowHead}</defs>
      <line
        x1={x1}
        y1={y}
        x2={x2}
        y2={y}
        stroke={color}
        strokeWidth={emphasized ? 2 : 1.35}
        strokeDasharray={dashed ? '5 4' : undefined}
        markerEnd={`url(#${markerId})`}
      />
      {/* hit area */}
      <line
        x1={x1}
        y1={y}
        x2={x2}
        y2={y}
        stroke="transparent"
        strokeWidth={12}
      />
      {lines.map((ln, i) => (
        <text
          key={i}
          x={midX}
          y={labelY + i * lineHeight}
          textAnchor="middle"
          fill={tokens.messageLabel}
          fontSize={10}
          fontFamily="ui-sans-serif, system-ui, -apple-system, sans-serif"
          fontWeight={dashed ? 400 : 500}
        >
          {ln}
        </text>
      ))}
    </g>
  )
}

export function DefaultNote({ laidOut, context, emphasized }: NotePartProps) {
  const { tokens } = context
  const accent = context.noteAccent(laidOut.event)
  const fill =
    accent === 'local'
      ? tokens.localFill
      : accent === 'model'
        ? tokens.modelFill
        : tokens.noteFill
  const stroke =
    accent === 'local'
      ? tokens.localStroke
      : accent === 'model'
        ? tokens.modelStroke
        : tokens.noteStroke
  const textColor =
    accent === 'local'
      ? tokens.localText
      : accent === 'model'
        ? tokens.modelText
        : tokens.noteText
  const opacity = context.dimmed && !emphasized ? tokens.dimOpacity : 1
  const lines =
    laidOut.lines ??
    wrapLines(laidOut.event.text, Math.max(12, Math.floor((laidOut.width - 16) / 6.5)))
  const lineHeight = laidOut.lineHeight ?? 12
  const { x, y, width, height } = laidOut

  return (
    <g opacity={opacity} style={{ transition: 'opacity 160ms ease-out' }}>
      {/* Accent fills are translucent; an opaque base keeps lifelines from
          striking through the note's text. */}
      <rect x={x} y={y} width={width} height={height} rx={8} ry={8} fill={tokens.background} />
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={8}
        ry={8}
        fill={fill}
        stroke={emphasized ? tokens.highlight : stroke}
        strokeWidth={emphasized ? 1.5 : 1}
      />
      {lines.map((ln, i) => (
        <text
          key={i}
          x={x + width / 2}
          y={y + height / 2 + (i - (lines.length - 1) / 2) * lineHeight}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={textColor}
          fontSize={10}
          fontFamily="ui-sans-serif, system-ui, -apple-system, sans-serif"
        >
          {ln}
        </text>
      ))}
    </g>
  )
}

export function DefaultFragment({ laidOut, context }: FragmentPartProps) {
  const { tokens } = context
  const { x, y, width, height, kind, label, lanes } = laidOut
  const kindLabel = kind.toUpperCase()

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={8}
        ry={8}
        fill={tokens.fragmentFill}
        stroke={tokens.fragmentStroke}
        strokeWidth={1}
      />
      {/* kind badge */}
      <rect
        x={x + 7}
        y={y + 4}
        width={Math.max(34, kindLabel.length * 6.5 + 14)}
        height={16}
        rx={4}
        ry={4}
        fill={tokens.fragmentLabelBg}
        stroke={tokens.fragmentStroke}
        strokeWidth={1}
      />
      <text
        x={x + 7 + Math.max(34, kindLabel.length * 6.5 + 14) / 2}
        y={y + 12}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={tokens.fragmentLabelText}
        fontSize={9}
        fontWeight={700}
        fontFamily="ui-sans-serif, system-ui, -apple-system, sans-serif"
      >
        {kindLabel}
      </text>
      {label && (
        <text
          x={x + 7 + Math.max(34, kindLabel.length * 6.5 + 14) + 7}
          y={y + 12}
          dominantBaseline="middle"
          fill={tokens.textSecondary}
          fontSize={10}
          paintOrder="stroke"
          stroke={tokens.background}
          strokeWidth={4}
          strokeLinejoin="round"
          fontFamily="ui-sans-serif, system-ui, -apple-system, sans-serif"
        >
          {label}
        </text>
      )}
      {/* else lane dividers + labels */}
      {lanes.slice(1).map((lane, i) => (
        <g key={i}>
          <line
            x1={x + 6}
            y1={lane.y}
            x2={x + width - 6}
            y2={lane.y}
            stroke={tokens.fragmentDivider}
            strokeWidth={1}
            strokeDasharray="4 3"
          />
          <text
            x={x + 12}
            y={lane.y + 12}
            fill={tokens.textSecondary}
            fontSize={10}
            fontWeight={600}
            paintOrder="stroke"
            stroke={tokens.background}
            strokeWidth={4}
            strokeLinejoin="round"
            fontFamily="ui-sans-serif, system-ui, -apple-system, sans-serif"
          >
            {`else${lane.label ? ` ${lane.label}` : ''}`}
          </text>
        </g>
      ))}
    </g>
  )
}

export const defaultSequenceParts: Required<SequenceRendererParts> = {
  ActorHeader: DefaultActorHeader,
  ParticipantHeader: DefaultParticipantHeader,
  Lifeline: DefaultLifeline,
  Message: DefaultMessage,
  Note: DefaultNote,
  Fragment: DefaultFragment,
}

export { HEADER_BOX_W, HEADER_BOX_H }
