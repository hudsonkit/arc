import { hostThemeTokens } from '../../theme/host'
import { getTheme, type ThemeId } from '../../themes'

function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '')
  if (!/^[0-9a-f]{6}$/i.test(value)) return hex
  const red = Number.parseInt(value.slice(0, 2), 16)
  const green = Number.parseInt(value.slice(2, 4), 16)
  const blue = Number.parseInt(value.slice(4, 6), 16)
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}
import type { SequenceThemeTokens } from './types'

export function getSequenceThemeTokens(
  mode: 'light' | 'dark',
  themeId: ThemeId = 'default',
): SequenceThemeTokens {
  if (themeId === 'inherit') {
    const t = hostThemeTokens(mode)
    return {
      background: t.background, surface: t.surface, border: t.border,
      text: t.foreground, textSecondary: t.muted, textMuted: t.muted,
      lifeline: t.border, messageSolid: t.line, messageDashed: t.muted, messageLabel: t.foreground,
      actorFill: t.surface, actorStroke: t.accent, actorText: t.foreground,
      participantFill: t.surface, participantStroke: t.border, participantText: t.foreground,
      noteFill: t.surface, noteStroke: t.border, noteText: t.foreground,
      localFill: t.surface, localStroke: t.success, localText: t.foreground,
      modelFill: t.surface, modelStroke: t.warning, modelText: t.foreground,
      fragmentFill: t.surface, fragmentStroke: t.border, fragmentLabelBg: t.background,
      fragmentLabelText: t.foreground, fragmentDivider: t.border,
      highlight: t.accent, dimOpacity: 0.45,
    }
  }
  const arcTheme = getTheme(themeId)[mode]
  const violet = arcTheme.palette.violet.stroke
  const emerald = arcTheme.palette.emerald.stroke
  const amber = arcTheme.palette.amber.stroke

  if (mode === 'dark') {
    return {
      background: '#09090b',
      surface: '#18181b',
      border: '#3f3f46',
      text: '#fafafa',
      textSecondary: '#a1a1aa',
      textMuted: '#71717a',
      lifeline: '#3f3f46',
      messageSolid: '#a1a1aa',
      messageDashed: '#71717a',
      messageLabel: '#e4e4e7',
      actorFill: withAlpha(violet, 0.14),
      actorStroke: violet,
      actorText: '#ddd6fe',
      participantFill: '#18181b',
      participantStroke: '#52525b',
      participantText: '#e4e4e7',
      noteFill: 'rgba(39, 39, 42, 0.95)',
      noteStroke: '#52525b',
      noteText: '#d4d4d8',
      localFill: withAlpha(emerald, 0.12),
      localStroke: emerald,
      localText: '#a7f3d0',
      modelFill: withAlpha(amber, 0.12),
      modelStroke: amber,
      modelText: '#fde68a',
      fragmentFill: 'rgba(113, 113, 122, 0.08)',
      fragmentStroke: '#52525b',
      fragmentLabelBg: '#27272a',
      fragmentLabelText: '#e4e4e7',
      fragmentDivider: '#3f3f46',
      highlight: violet,
      dimOpacity: 0.45,
    }
  }

  return {
    background: '#ffffff',
    surface: '#fafafa',
    border: '#e4e4e7',
    text: '#18181b',
    textSecondary: '#52525b',
    textMuted: '#71717a',
    lifeline: '#d4d4d8',
    messageSolid: '#3f3f46',
    messageDashed: '#71717a',
    messageLabel: '#27272a',
    actorFill: withAlpha(violet, 0.1),
    actorStroke: violet,
    actorText: '#5b21b6',
    participantFill: '#ffffff',
    participantStroke: '#a1a1aa',
    participantText: '#18181b',
    noteFill: '#f4f4f5',
    noteStroke: '#d4d4d8',
    noteText: '#3f3f46',
    localFill: withAlpha(emerald, 0.1),
    localStroke: emerald,
    localText: '#065f46',
    modelFill: withAlpha(amber, 0.1),
    modelStroke: amber,
    modelText: '#92400e',
    fragmentFill: 'rgba(113, 113, 122, 0.06)',
    fragmentStroke: '#a1a1aa',
    fragmentLabelBg: '#f4f4f5',
    fragmentLabelText: '#3f3f46',
    fragmentDivider: '#d4d4d8',
    highlight: violet,
    dimOpacity: 0.45,
  }
}

/** Classify note text for cool (local) vs warm (model) accent */
export function classifyNoteAccent(
  text: string[],
): 'local' | 'model' | 'default' {
  const joined = text.join(' ').toLowerCase()
  if (/no model|local|control plane|sse|broker|menu/.test(joined)) {
    return 'local'
  }
  if (
    /model|inference|token|allowance|api|prompt|skill|agents\.md|reply context/.test(
      joined,
    )
  ) {
    return 'model'
  }
  return 'default'
}
