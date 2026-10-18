import { hostThemeMode } from './theme/host'

// Diagram color themes - palettes and background treatments
// Separate from templates (structural) - themes handle colors only

export type ThemeId = 'inherit' | 'default' | 'warm' | 'cool' | 'mono'

export interface ColorPalette {
  violet:  { border: string; bg: string; icon: string; stroke: string }
  emerald: { border: string; bg: string; icon: string; stroke: string }
  blue:    { border: string; bg: string; icon: string; stroke: string }
  amber:   { border: string; bg: string; icon: string; stroke: string }
  sky:     { border: string; bg: string; icon: string; stroke: string }
  zinc:    { border: string; bg: string; icon: string; stroke: string }
  rose:    { border: string; bg: string; icon: string; stroke: string }
  orange:  { border: string; bg: string; icon: string; stroke: string }
}

export interface ThemeBackground {
  container: string        // Container background + border classes
  grid: {
    color: string          // Dot grid color (CSS color value)
    opacity: number        // Grid opacity
    size: number           // Grid spacing in px
  }
}

export interface Theme {
  id: ThemeId
  name: string
  description: string
  light: {
    palette: ColorPalette
    background: ThemeBackground
    text: { primary: string; secondary: string; muted: string }
  }
  dark: {
    palette: ColorPalette
    background: ThemeBackground
    text: { primary: string; secondary: string; muted: string }
  }
}

// Default theme - clean and neutral
const defaultTheme: Theme = {
  id: 'default',
  name: 'Default',
  description: 'Clean, neutral colors',
  light: {
    palette: {
      violet:  { border: 'border-violet-300',  bg: 'bg-gradient-to-br from-violet-50 to-violet-100/50',   icon: 'text-violet-600',  stroke: '#8b5cf6' },
      emerald: { border: 'border-emerald-300', bg: 'bg-gradient-to-br from-emerald-50 to-emerald-100/50', icon: 'text-emerald-600', stroke: '#10b981' },
      blue:    { border: 'border-blue-300',    bg: 'bg-gradient-to-br from-blue-50 to-blue-100/50',       icon: 'text-blue-600',    stroke: '#3b82f6' },
      amber:   { border: 'border-amber-300',   bg: 'bg-gradient-to-br from-amber-50 to-amber-100/50',     icon: 'text-amber-600',   stroke: '#f59e0b' },
      sky:     { border: 'border-sky-300',     bg: 'bg-gradient-to-br from-sky-50 to-sky-100/50',         icon: 'text-sky-600',     stroke: '#0ea5e9' },
      zinc:    { border: 'border-zinc-300',    bg: 'bg-gradient-to-br from-zinc-50 to-zinc-100/50',       icon: 'text-zinc-600',    stroke: '#71717a' },
      rose:    { border: 'border-rose-300',    bg: 'bg-gradient-to-br from-rose-50 to-rose-100/50',       icon: 'text-rose-600',    stroke: '#f43f5e' },
      orange:  { border: 'border-orange-300',  bg: 'bg-gradient-to-br from-orange-50 to-orange-100/50',   icon: 'text-orange-600',  stroke: '#f97316' },
    },
    background: {
      container: 'bg-white/80 border border-zinc-200 shadow-lg',
      grid: { color: 'rgba(16, 21, 24, 0.12)', opacity: 0.35, size: 24 },
    },
    text: { primary: 'text-zinc-900', secondary: 'text-zinc-600', muted: 'text-zinc-500' },
  },
  dark: {
    palette: {
      violet:  { border: 'border-violet-400/50',  bg: 'bg-violet-500/10',  icon: 'text-violet-400',  stroke: '#a78bfa' },
      emerald: { border: 'border-emerald-400/50', bg: 'bg-emerald-500/10', icon: 'text-emerald-400', stroke: '#34d399' },
      blue:    { border: 'border-blue-400/50',    bg: 'bg-blue-500/10',    icon: 'text-blue-400',    stroke: '#60a5fa' },
      amber:   { border: 'border-amber-400/50',   bg: 'bg-amber-500/10',   icon: 'text-amber-400',   stroke: '#fbbf24' },
      sky:     { border: 'border-sky-400/50',     bg: 'bg-sky-500/10',     icon: 'text-sky-400',     stroke: '#38bdf8' },
      zinc:    { border: 'border-zinc-600',       bg: 'bg-zinc-800/50',    icon: 'text-zinc-400',    stroke: '#71717a' },
      rose:    { border: 'border-rose-400/50',    bg: 'bg-rose-500/10',    icon: 'text-rose-400',    stroke: '#fb7185' },
      orange:  { border: 'border-orange-400/50',  bg: 'bg-orange-500/10',  icon: 'text-orange-400',  stroke: '#fb923c' },
    },
    background: {
      container: 'bg-zinc-950 border border-zinc-800',
      grid: { color: '#71717a', opacity: 0.08, size: 24 },
    },
    text: { primary: 'text-white', secondary: 'text-zinc-400', muted: 'text-zinc-600' },
  },
}

// Warm theme - editorial, paper-like feel
const warmTheme: Theme = {
  id: 'warm',
  name: 'Warm',
  description: 'Soft, editorial warmth',
  light: {
    palette: {
      violet:  { border: 'border-violet-300/70',  bg: 'bg-gradient-to-br from-violet-50/90 to-violet-100/50',   icon: 'text-violet-500',  stroke: '#a78bfa' },
      emerald: { border: 'border-emerald-300/70', bg: 'bg-gradient-to-br from-emerald-50/90 to-emerald-100/50', icon: 'text-emerald-500', stroke: '#6ee7b7' },
      blue:    { border: 'border-blue-300/70',    bg: 'bg-gradient-to-br from-blue-50/90 to-blue-100/50',       icon: 'text-blue-500',    stroke: '#93c5fd' },
      amber:   { border: 'border-amber-300/70',   bg: 'bg-gradient-to-br from-amber-50/90 to-amber-100/50',     icon: 'text-amber-500',   stroke: '#fcd34d' },
      sky:     { border: 'border-sky-300/70',     bg: 'bg-gradient-to-br from-sky-50/90 to-sky-100/50',         icon: 'text-sky-500',     stroke: '#7dd3fc' },
      zinc:    { border: 'border-stone-300/70',   bg: 'bg-gradient-to-br from-stone-50/90 to-stone-100/50',     icon: 'text-stone-500',   stroke: '#a8a29e' },
      rose:    { border: 'border-rose-300/70',    bg: 'bg-gradient-to-br from-rose-50/90 to-rose-100/50',       icon: 'text-rose-500',    stroke: '#fda4af' },
      orange:  { border: 'border-orange-300/70',  bg: 'bg-gradient-to-br from-orange-50/90 to-orange-100/50',   icon: 'text-orange-500',  stroke: '#fdba74' },
    },
    background: {
      container: 'bg-gradient-to-br from-amber-50/80 via-orange-50/40 to-stone-100/60 border border-stone-200/60',
      grid: { color: 'rgba(180, 160, 140, 0.3)', opacity: 0.5, size: 24 },
    },
    text: { primary: 'text-stone-800', secondary: 'text-stone-600', muted: 'text-stone-400' },
  },
  dark: {
    palette: {
      violet:  { border: 'border-violet-400/40',  bg: 'bg-violet-500/8',  icon: 'text-violet-300',  stroke: '#c4b5fd' },
      emerald: { border: 'border-emerald-400/40', bg: 'bg-emerald-500/8', icon: 'text-emerald-300', stroke: '#a7f3d0' },
      blue:    { border: 'border-blue-400/40',    bg: 'bg-blue-500/8',    icon: 'text-blue-300',    stroke: '#bfdbfe' },
      amber:   { border: 'border-amber-400/40',   bg: 'bg-amber-500/8',   icon: 'text-amber-300',   stroke: '#fde68a' },
      sky:     { border: 'border-sky-400/40',     bg: 'bg-sky-500/8',     icon: 'text-sky-300',     stroke: '#bae6fd' },
      zinc:    { border: 'border-stone-500/40',   bg: 'bg-stone-600/10',  icon: 'text-stone-300',   stroke: '#d6d3d1' },
      rose:    { border: 'border-rose-400/40',    bg: 'bg-rose-500/8',    icon: 'text-rose-300',    stroke: '#fecdd3' },
      orange:  { border: 'border-orange-400/40',  bg: 'bg-orange-500/8',  icon: 'text-orange-300',  stroke: '#fed7aa' },
    },
    background: {
      container: 'bg-gradient-to-br from-stone-950 via-stone-900 to-stone-950 border border-stone-700/50',
      grid: { color: 'rgba(168, 162, 158, 0.15)', opacity: 0.15, size: 24 },
    },
    text: { primary: 'text-stone-100', secondary: 'text-stone-400', muted: 'text-stone-600' },
  },
}

// Cool theme - crisp, modern blues
const coolTheme: Theme = {
  id: 'cool',
  name: 'Cool',
  description: 'Crisp, modern blues',
  light: {
    palette: {
      violet:  { border: 'border-indigo-300',  bg: 'bg-gradient-to-br from-indigo-50 to-indigo-100/50',   icon: 'text-indigo-600',  stroke: '#6366f1' },
      emerald: { border: 'border-teal-300',    bg: 'bg-gradient-to-br from-teal-50 to-teal-100/50',       icon: 'text-teal-600',    stroke: '#14b8a6' },
      blue:    { border: 'border-blue-300',    bg: 'bg-gradient-to-br from-blue-50 to-blue-100/50',       icon: 'text-blue-600',    stroke: '#3b82f6' },
      amber:   { border: 'border-cyan-300',    bg: 'bg-gradient-to-br from-cyan-50 to-cyan-100/50',       icon: 'text-cyan-600',    stroke: '#06b6d4' },
      sky:     { border: 'border-sky-300',     bg: 'bg-gradient-to-br from-sky-50 to-sky-100/50',         icon: 'text-sky-600',     stroke: '#0ea5e9' },
      zinc:    { border: 'border-slate-300',   bg: 'bg-gradient-to-br from-slate-50 to-slate-100/50',     icon: 'text-slate-600',   stroke: '#64748b' },
      rose:    { border: 'border-fuchsia-300', bg: 'bg-gradient-to-br from-fuchsia-50 to-fuchsia-100/50', icon: 'text-fuchsia-600', stroke: '#d946ef' },
      orange:  { border: 'border-violet-300',  bg: 'bg-gradient-to-br from-violet-50 to-violet-100/50',   icon: 'text-violet-600',  stroke: '#8b5cf6' },
    },
    background: {
      container: 'bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-100 border border-slate-200',
      grid: { color: 'rgba(71, 85, 105, 0.15)', opacity: 0.4, size: 24 },
    },
    text: { primary: 'text-slate-900', secondary: 'text-slate-600', muted: 'text-slate-400' },
  },
  dark: {
    palette: {
      violet:  { border: 'border-indigo-400/50',  bg: 'bg-indigo-500/10',  icon: 'text-indigo-400',  stroke: '#818cf8' },
      emerald: { border: 'border-teal-400/50',    bg: 'bg-teal-500/10',    icon: 'text-teal-400',    stroke: '#2dd4bf' },
      blue:    { border: 'border-blue-400/50',    bg: 'bg-blue-500/10',    icon: 'text-blue-400',    stroke: '#60a5fa' },
      amber:   { border: 'border-cyan-400/50',    bg: 'bg-cyan-500/10',    icon: 'text-cyan-400',    stroke: '#22d3ee' },
      sky:     { border: 'border-sky-400/50',     bg: 'bg-sky-500/10',     icon: 'text-sky-400',     stroke: '#38bdf8' },
      zinc:    { border: 'border-slate-500',      bg: 'bg-slate-700/30',   icon: 'text-slate-400',   stroke: '#94a3b8' },
      rose:    { border: 'border-fuchsia-400/50', bg: 'bg-fuchsia-500/10', icon: 'text-fuchsia-400', stroke: '#e879f9' },
      orange:  { border: 'border-violet-400/50',  bg: 'bg-violet-500/10',  icon: 'text-violet-400',  stroke: '#a78bfa' },
    },
    background: {
      container: 'bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 border border-slate-700',
      grid: { color: 'rgba(148, 163, 184, 0.1)', opacity: 0.1, size: 24 },
    },
    text: { primary: 'text-slate-100', secondary: 'text-slate-400', muted: 'text-slate-600' },
  },
}

// Mono theme - grayscale elegance
const monoTheme: Theme = {
  id: 'mono',
  name: 'Mono',
  description: 'Elegant grayscale',
  light: {
    palette: {
      violet:  { border: 'border-zinc-400',   bg: 'bg-gradient-to-br from-zinc-100 to-zinc-200/50', icon: 'text-zinc-700', stroke: '#52525b' },
      emerald: { border: 'border-zinc-400',   bg: 'bg-gradient-to-br from-zinc-100 to-zinc-200/50', icon: 'text-zinc-700', stroke: '#52525b' },
      blue:    { border: 'border-zinc-400',   bg: 'bg-gradient-to-br from-zinc-100 to-zinc-200/50', icon: 'text-zinc-700', stroke: '#52525b' },
      amber:   { border: 'border-zinc-400',   bg: 'bg-gradient-to-br from-zinc-100 to-zinc-200/50', icon: 'text-zinc-700', stroke: '#52525b' },
      sky:     { border: 'border-zinc-400',   bg: 'bg-gradient-to-br from-zinc-100 to-zinc-200/50', icon: 'text-zinc-700', stroke: '#52525b' },
      zinc:    { border: 'border-zinc-400',   bg: 'bg-gradient-to-br from-zinc-100 to-zinc-200/50', icon: 'text-zinc-700', stroke: '#52525b' },
      rose:    { border: 'border-zinc-400',   bg: 'bg-gradient-to-br from-zinc-100 to-zinc-200/50', icon: 'text-zinc-700', stroke: '#52525b' },
      orange:  { border: 'border-zinc-400',   bg: 'bg-gradient-to-br from-zinc-100 to-zinc-200/50', icon: 'text-zinc-700', stroke: '#52525b' },
    },
    background: {
      container: 'bg-zinc-100 border border-zinc-300',
      grid: { color: 'rgba(63, 63, 70, 0.08)', opacity: 0.5, size: 20 },
    },
    text: { primary: 'text-zinc-900', secondary: 'text-zinc-600', muted: 'text-zinc-400' },
  },
  dark: {
    palette: {
      violet:  { border: 'border-zinc-600', bg: 'bg-zinc-800/60', icon: 'text-zinc-300', stroke: '#a1a1aa' },
      emerald: { border: 'border-zinc-600', bg: 'bg-zinc-800/60', icon: 'text-zinc-300', stroke: '#a1a1aa' },
      blue:    { border: 'border-zinc-600', bg: 'bg-zinc-800/60', icon: 'text-zinc-300', stroke: '#a1a1aa' },
      amber:   { border: 'border-zinc-600', bg: 'bg-zinc-800/60', icon: 'text-zinc-300', stroke: '#a1a1aa' },
      sky:     { border: 'border-zinc-600', bg: 'bg-zinc-800/60', icon: 'text-zinc-300', stroke: '#a1a1aa' },
      zinc:    { border: 'border-zinc-600', bg: 'bg-zinc-800/60', icon: 'text-zinc-300', stroke: '#a1a1aa' },
      rose:    { border: 'border-zinc-600', bg: 'bg-zinc-800/60', icon: 'text-zinc-300', stroke: '#a1a1aa' },
      orange:  { border: 'border-zinc-600', bg: 'bg-zinc-800/60', icon: 'text-zinc-300', stroke: '#a1a1aa' },
    },
    background: {
      container: 'bg-zinc-900 border border-zinc-700',
      grid: { color: 'rgba(161, 161, 170, 0.06)', opacity: 0.1, size: 20 },
    },
    text: { primary: 'text-zinc-100', secondary: 'text-zinc-400', muted: 'text-zinc-600' },
  },
}

export const THEMES: Record<ThemeId, Theme> = {
  inherit: {
    id: 'inherit', name: 'Inherit from host',
    description: 'Use the host page semantic CSS tokens',
    light: hostThemeMode('light'), dark: hostThemeMode('dark'),
  },
  default: defaultTheme,
  warm: warmTheme,
  cool: coolTheme,
  mono: monoTheme,
}

export const DEFAULT_THEME: ThemeId = 'default'

export function getTheme(id: ThemeId): Theme {
  return THEMES[id] || THEMES[DEFAULT_THEME]
}

export function getThemeList() {
  return Object.values(THEMES).map(t => ({
    id: t.id,
    name: t.name,
    description: t.description,
  }))
}
