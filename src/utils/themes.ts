import { hostThemeMode } from '../../packages/viewer/src/theme/host'

// Diagram color themes - palettes and background treatments
// Separate from templates (structural) - themes handle colors only

export type ThemeId = 'inherit' | 'default' | 'warm' | 'cool' | 'mono' | 'engineering' | 'workbench' | 'tactical' | 'command' | 'spacex' | 'claude' | 'codex'

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
  canvas?: string          // Actual CSS surface color for deterministic SVG/HTML exports
  grid: {
    color: string          // Dot grid color (CSS color value)
    opacity: number        // Grid opacity
    size: number           // Grid spacing in px
  }
}

// Optional brand design language layered on a theme's colors — typography,
// node geometry, and connector treatment. Omit for color-only themes.
export interface BrandSpec {
  /** Font stack for the whole diagram (node names inherit this). */
  fontFamily?: string
  /** Monospace stack for subtitles + connector labels. */
  monoFamily?: string
  /** Stylesheet URL injected once so the families load (e.g. Google Fonts). */
  fontImport?: string
  /** Node + icon corner radius (CSS length). '0px' = square tiles. */
  nodeRadius?: string
  /** Node border width (CSS length), overrides the default 2px. */
  nodeBorderWidth?: string
  /** Uppercase + letter-space the subtitle and connector labels. */
  upperLabels?: boolean
  /** Arrowhead shape at connector ends. */
  arrowhead?: 'triangle' | 'chevron'
  /** Background grid system. */
  gridType?: 'dots' | 'lines' | 'crosshair' | 'none'
  /** Edge/frame treatment at the diagram boundary. */
  frame?: 'hairline' | 'inset' | 'brackets' | 'ticks' | 'cropmarks' | 'corners' | 'sheet' | 'reticle' | 'none'
  /** Render an engineering-drawing title block in the bottom-right corner. */
  titleBlock?: boolean
  /** Node silhouette. 'chamfer' cuts all four corners, 'notch' cuts the top-right;
   *  both are drawn with clip-path, not rounding. See utils/nodeShape.ts. */
  nodeShape?: 'rounded' | 'square' | 'chamfer' | 'notch' | 'pill'
  /** Ornament on the node shell — supersedes accentBar, which still works. */
  nodeDecor?: 'none' | 'bar-left' | 'bar-top' | 'ticks' | 'rule' | 'dot' | 'stripe'
  /** Overall node opacity (0–1). */
  nodeOpacity?: number
  /** Frosted glass backdrop on nodes. */
  nodeGlass?: boolean
  /** Colored accent stripe on the node shell. */
  accentBar?: 'left' | 'top' | 'none'
  /** Soft bloom on connector strokes. */
  connectorGlow?: boolean
}

/** Resolve CSS border-radius from brand shape overrides. */
export function resolveNodeRadius(brand?: BrandSpec): string | undefined {
  if (brand?.nodeRadius != null) return brand.nodeRadius
  switch (brand?.nodeShape) {
    case 'square': return '0px'
    // Cut silhouettes are clipped, not rounded — any radius would fight the cut.
    case 'chamfer':
    case 'notch': return '0px'
    case 'pill': return '9999px'
    default: return undefined
  }
}

export interface Theme {
  id: ThemeId
  name: string
  description: string
  /** Preferred mode when a render caller does not specify one. */
  defaultMode?: 'light' | 'dark'
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
  /** Optional brand design language (typography, node shape, arrows). */
  brand?: BrandSpec
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
  brand: {
    nodeDecor: 'bar-left',
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
  brand: {
    nodeDecor: 'dot',
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
  brand: {
    nodeShape: 'square',
    nodeDecor: 'rule',
  },
}

// Engineering - systematic technical blue on structured gray (graph grid)
// Shared technical palette — the three style explorations use ONE color scheme
// (cohesive indigo/blue/teal/amber/gray) and differ by grid, frame, and type,
// not color. Mid-tone so it reads on any of their dark surfaces.
const techDark: ColorPalette = {
  violet:  { border: 'border-[#7c8cff]/55', bg: 'bg-[#7c8cff]/[0.08]', icon: 'text-[#7c8cff]', stroke: '#7c8cff' },
  emerald: { border: 'border-[#2dd4bf]/55', bg: 'bg-[#2dd4bf]/[0.08]', icon: 'text-[#2dd4bf]', stroke: '#2dd4bf' },
  blue:    { border: 'border-[#4f8cff]/55', bg: 'bg-[#4f8cff]/[0.08]', icon: 'text-[#4f8cff]', stroke: '#4f8cff' },
  amber:   { border: 'border-[#e0a83d]/55', bg: 'bg-[#e0a83d]/[0.08]', icon: 'text-[#e0a83d]', stroke: '#e0a83d' },
  sky:     { border: 'border-[#54b6e6]/55', bg: 'bg-[#54b6e6]/[0.08]', icon: 'text-[#54b6e6]', stroke: '#54b6e6' },
  zinc:    { border: 'border-[#8b93a0]/55', bg: 'bg-[#8b93a0]/[0.08]', icon: 'text-[#8b93a0]', stroke: '#8b93a0' },
  rose:    { border: 'border-[#e0726e]/55', bg: 'bg-[#e0726e]/[0.08]', icon: 'text-[#e0726e]', stroke: '#e0726e' },
  orange:  { border: 'border-[#e0884a]/55', bg: 'bg-[#e0884a]/[0.08]', icon: 'text-[#e0884a]', stroke: '#e0884a' },
}

const engineeringTheme: Theme = {
  id: 'engineering',
  name: 'Engineering',
  description: 'Graph grid, technical mono',
  defaultMode: 'dark',
  light: {
    palette: {
      violet:  { border: 'border-[#4589ff]', bg: 'bg-[#4589ff]/10', icon: 'text-[#4589ff]', stroke: '#4589ff' },
      emerald: { border: 'border-[#007d79]', bg: 'bg-[#007d79]/10', icon: 'text-[#007d79]', stroke: '#007d79' },
      blue:    { border: 'border-[#0f62fe]', bg: 'bg-[#0f62fe]/10', icon: 'text-[#0f62fe]', stroke: '#0f62fe' },
      amber:   { border: 'border-[#6f6f6f]', bg: 'bg-[#6f6f6f]/10', icon: 'text-[#6f6f6f]', stroke: '#6f6f6f' },
      sky:     { border: 'border-[#1192e8]', bg: 'bg-[#1192e8]/10', icon: 'text-[#1192e8]', stroke: '#1192e8' },
      zinc:    { border: 'border-[#525252]', bg: 'bg-[#525252]/10', icon: 'text-[#525252]', stroke: '#525252' },
      rose:    { border: 'border-[#6f6f6f]', bg: 'bg-[#6f6f6f]/10', icon: 'text-[#6f6f6f]', stroke: '#6f6f6f' },
      orange:  { border: 'border-[#393939]', bg: 'bg-[#393939]/10', icon: 'text-[#393939]', stroke: '#393939' },
    },
    background: {
      container: 'bg-[#f4f4f4] border border-[#e0e0e0] shadow-sm',
      grid: { color: 'rgba(22, 22, 22, 0.08)', opacity: 0.4, size: 16 },
    },
    text: { primary: 'text-[#161616]', secondary: 'text-[#525252]', muted: 'text-[#8d8d8d]' },
  },
  dark: {
    palette: techDark,
    background: {
      container: 'bg-[#0e1116] border border-[#393939]',
      grid: { color: 'rgba(125, 170, 255, 0.20)', opacity: 1, size: 18 },
    },
    text: { primary: 'text-[#f4f4f4]', secondary: 'text-[#c6c6c6]', muted: 'text-[#8d8d8d]' },
  },
  brand: {
    fontFamily: "system-ui, -apple-system, sans-serif",
    monoFamily: "'JetBrains Mono', ui-monospace, monospace",
    nodeShape: 'square',
    nodeDecor: 'ticks',
    nodeBorderWidth: '1px',
    upperLabels: true,
    arrowhead: 'chevron',
    gridType: 'lines',
    frame: 'sheet',
    titleBlock: true,
  },
}

// Workbench - dark slate with signature intent colors
const workbenchTheme: Theme = {
  id: 'workbench',
  name: 'Workbench',
  description: 'Slate workbench, intent colors',
  defaultMode: 'dark',
  light: {
    palette: {
      violet:  { border: 'border-[#634dbf]', bg: 'bg-[#634dbf]/10', icon: 'text-[#634dbf]', stroke: '#634dbf' },
      emerald: { border: 'border-[#238551]', bg: 'bg-[#238551]/10', icon: 'text-[#238551]', stroke: '#238551' },
      blue:    { border: 'border-[#2d72d2]', bg: 'bg-[#2d72d2]/10', icon: 'text-[#2d72d2]', stroke: '#2d72d2' },
      amber:   { border: 'border-[#c87619]', bg: 'bg-[#c87619]/10', icon: 'text-[#c87619]', stroke: '#c87619' },
      sky:     { border: 'border-[#147eb3]', bg: 'bg-[#147eb3]/10', icon: 'text-[#147eb3]', stroke: '#147eb3' },
      zinc:    { border: 'border-[#5f6b7c]', bg: 'bg-[#5f6b7c]/10', icon: 'text-[#5f6b7c]', stroke: '#5f6b7c' },
      rose:    { border: 'border-[#cd4246]', bg: 'bg-[#cd4246]/10', icon: 'text-[#cd4246]', stroke: '#cd4246' },
      orange:  { border: 'border-[#9e2b0e]', bg: 'bg-[#9e2b0e]/10', icon: 'text-[#9e2b0e]', stroke: '#9e2b0e' },
    },
    background: {
      container: 'bg-[#f6f7f9] border border-[#d3d8de]',
      grid: { color: 'rgba(95, 107, 124, 0.18)', opacity: 0.4, size: 20 },
    },
    text: { primary: 'text-[#1c2127]', secondary: 'text-[#404854]', muted: 'text-[#738091]' },
  },
  dark: {
    palette: techDark,
    background: {
      container: 'bg-[#1c2127] border border-[#2f343c]',
      grid: { color: 'rgba(180, 188, 200, 0.22)', opacity: 1, size: 16 },
    },
    text: { primary: 'text-[#f6f7f9]', secondary: 'text-[#abb3bf]', muted: 'text-[#738091]' },
  },
  brand: {
    fontFamily: "'Inter', system-ui, sans-serif",
    monoFamily: "'JetBrains Mono', ui-monospace, monospace",
    fontImport: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap',
    nodeRadius: '3px',
    nodeDecor: 'rule',
    nodeBorderWidth: '1px',
    upperLabels: false,
    arrowhead: 'triangle',
    gridType: 'dots',
    frame: 'hairline',
  },
}

// Tactical - tactical near-black with signature amber
const tacticalTheme: Theme = {
  id: 'tactical',
  name: 'Tactical',
  description: 'Tactical black, signature amber',
  defaultMode: 'dark',
  light: {
    palette: {
      violet:  { border: 'border-[#6b6b73]', bg: 'bg-[#6b6b73]/[0.07]', icon: 'text-[#6b6b73]', stroke: '#6b6b73' },
      emerald: { border: 'border-[#5e6f50]', bg: 'bg-[#5e6f50]/[0.07]', icon: 'text-[#5e6f50]', stroke: '#5e6f50' },
      blue:    { border: 'border-[#5a6f80]', bg: 'bg-[#5a6f80]/[0.07]', icon: 'text-[#5a6f80]', stroke: '#5a6f80' },
      amber:   { border: 'border-[#a8741a]', bg: 'bg-[#a8741a]/[0.14]', icon: 'text-[#a8741a]', stroke: '#a8741a' },
      sky:     { border: 'border-[#5f7d87]', bg: 'bg-[#5f7d87]/[0.07]', icon: 'text-[#5f7d87]', stroke: '#5f7d87' },
      zinc:    { border: 'border-[#6b6f73]', bg: 'bg-[#6b6f73]/[0.07]', icon: 'text-[#6b6f73]', stroke: '#6b6f73' },
      rose:    { border: 'border-[#a8463d]', bg: 'bg-[#a8463d]/10', icon: 'text-[#a8463d]', stroke: '#a8463d' },
      orange:  { border: 'border-[#a85e22]', bg: 'bg-[#a85e22]/12', icon: 'text-[#a85e22]', stroke: '#a85e22' },
    },
    background: {
      container: 'bg-[#e7e3da] border border-[#cfc8ba]',
      grid: { color: 'rgba(40, 40, 40, 0.1)', opacity: 0.4, size: 20 },
    },
    text: { primary: 'text-[#1a1c1d]', secondary: 'text-[#4a4f52]', muted: 'text-[#80868a]' },
  },
  dark: {
    palette: techDark,
    background: {
      container: 'bg-[#0b0d0e] border border-[#23292d]',
      grid: { color: 'rgba(224, 168, 61, 0.20)', opacity: 1, size: 24 },
    },
    text: { primary: 'text-[#e8e6e1]', secondary: 'text-[#9aa0a4]', muted: 'text-[#5f676c]' },
  },
  brand: {
    fontFamily: "'Chakra Petch', system-ui, sans-serif",
    monoFamily: "'JetBrains Mono', ui-monospace, monospace",
    fontImport: 'https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap',
    nodeShape: 'notch',
    nodeDecor: 'stripe',
    nodeBorderWidth: '1px',
    upperLabels: true,
    arrowhead: 'chevron',
    gridType: 'crosshair',
    frame: 'reticle',
  },
}

// Command — editor-aligned HUD console (cyan glass tiles, crosshair grid)
const commandTheme: Theme = {
  id: 'command',
  name: 'Command',
  description: 'HUD console, cyan glass, crosshair grid',
  defaultMode: 'dark',
  light: {
    palette: {
      violet:  { border: 'border-[#6e7cff]/60', bg: 'bg-[#6e7cff]/[0.07]', icon: 'text-[#5a68e8]', stroke: '#5a68e8' },
      emerald: { border: 'border-[#1f9a84]/60', bg: 'bg-[#1f9a84]/[0.07]', icon: 'text-[#1f9a84]', stroke: '#1f9a84' },
      blue:    { border: 'border-[#2b7fd4]/65', bg: 'bg-[#2b7fd4]/[0.09]', icon: 'text-[#2b7fd4]', stroke: '#2b7fd4' },
      amber:   { border: 'border-[#c4882a]/60', bg: 'bg-[#c4882a]/[0.08]', icon: 'text-[#b87a1f]', stroke: '#b87a1f' },
      sky:     { border: 'border-[#2b9fd4]/60', bg: 'bg-[#2b9fd4]/[0.08]', icon: 'text-[#2490c4]', stroke: '#2490c4' },
      zinc:    { border: 'border-[#6b7785]/55', bg: 'bg-[#6b7785]/[0.06]', icon: 'text-[#5c6878]', stroke: '#5c6878' },
      rose:    { border: 'border-[#d45d6a]/55', bg: 'bg-[#d45d6a]/[0.07]', icon: 'text-[#c44e5c]', stroke: '#c44e5c' },
      orange:  { border: 'border-[#d47a2a]/55', bg: 'bg-[#d47a2a]/[0.07]', icon: 'text-[#c46e22]', stroke: '#c46e22' },
    },
    background: {
      container: 'bg-[#e8edf3]/90 border border-[#c5d0dc]',
      grid: { color: 'rgba(43, 127, 212, 0.14)', opacity: 0.55, size: 40 },
    },
    text: { primary: 'text-[#0c1014]', secondary: 'text-[#3a4248]', muted: 'text-[#6b7785]' },
  },
  dark: {
    palette: {
      violet:  { border: 'border-[#8b9cff]/50', bg: 'bg-[#8b9cff]/[0.07]', icon: 'text-[#8b9cff]', stroke: '#8b9cff' },
      emerald: { border: 'border-[#3dd6b5]/50', bg: 'bg-[#3dd6b5]/[0.07]', icon: 'text-[#3dd6b5]', stroke: '#3dd6b5' },
      blue:    { border: 'border-[#4db8ff]/55', bg: 'bg-[#4db8ff]/[0.08]', icon: 'text-[#4db8ff]', stroke: '#4db8ff' },
      amber:   { border: 'border-[#e0b04a]/50', bg: 'bg-[#e0b04a]/[0.08]', icon: 'text-[#e0b04a]', stroke: '#e0b04a' },
      sky:     { border: 'border-[#5ec8e8]/50', bg: 'bg-[#5ec8e8]/[0.07]', icon: 'text-[#5ec8e8]', stroke: '#5ec8e8' },
      zinc:    { border: 'border-[#8b93a0]/45', bg: 'bg-[#8b93a0]/[0.06]', icon: 'text-[#9aa4ae]', stroke: '#9aa4ae' },
      rose:    { border: 'border-[#f0808c]/45', bg: 'bg-[#f0808c]/[0.07]', icon: 'text-[#f0808c]', stroke: '#f0808c' },
      orange:  { border: 'border-[#e89850]/45', bg: 'bg-[#e89850]/[0.07]', icon: 'text-[#e89850]', stroke: '#e89850' },
    },
    background: {
      container: 'bg-[#06090e]/95 border border-[#1a2533]',
      grid: { color: 'rgba(77, 184, 255, 0.16)', opacity: 0.9, size: 40 },
    },
    text: { primary: 'text-[#e8edf2]', secondary: 'text-[#b4bec9]', muted: 'text-[#7d8a98]' },
  },
  brand: {
    fontFamily: "'Space Grotesk', system-ui, sans-serif",
    monoFamily: "'JetBrains Mono', ui-monospace, monospace",
    nodeShape: 'chamfer',
    nodeDecor: 'dot',
    nodeBorderWidth: '1px',
    nodeOpacity: 0.88,
    nodeGlass: true,
    upperLabels: false,
    arrowhead: 'chevron',
    gridType: 'crosshair',
    frame: 'corners',
    connectorGlow: true,
  },
}

// SpaceX/xAI — mission plate: monochrome hardware, telemetry cyan, cut corners
const spacexTheme: Theme = {
  id: 'spacex',
  name: 'SpaceX',
  description: 'Mission plate, telemetry cyan',
  defaultMode: 'dark',
  light: {
    palette: {
      violet:  { border: 'border-[#4f5d75]', bg: 'bg-[#4f5d75]/[0.08]', icon: 'text-[#4f5d75]', stroke: '#4f5d75' },
      emerald: { border: 'border-[#1f6f5f]', bg: 'bg-[#1f6f5f]/[0.08]', icon: 'text-[#1f6f5f]', stroke: '#1f6f5f' },
      blue:    { border: 'border-[#005288]', bg: 'bg-[#005288]/[0.08]', icon: 'text-[#005288]', stroke: '#005288' },
      amber:   { border: 'border-[#9a6b12]', bg: 'bg-[#9a6b12]/[0.10]', icon: 'text-[#7a5300]', stroke: '#9a6b12' },
      sky:     { border: 'border-[#0284c7]', bg: 'bg-[#0284c7]/[0.08]', icon: 'text-[#0284c7]', stroke: '#0284c7' },
      zinc:    { border: 'border-[#52525b]', bg: 'bg-[#52525b]/[0.07]', icon: 'text-[#52525b]', stroke: '#52525b' },
      rose:    { border: 'border-[#a82032]', bg: 'bg-[#a82032]/[0.08]', icon: 'text-[#a82032]', stroke: '#a82032' },
      orange:  { border: 'border-[#b45309]', bg: 'bg-[#b45309]/[0.09]', icon: 'text-[#b45309]', stroke: '#b45309' },
    },
    background: {
      container: 'bg-[#f4f4f1] border border-[#c8c9c4] shadow-sm',
      canvas: '#f4f4f1',
      grid: { color: 'rgba(17, 24, 39, 0.13)', opacity: 0.75, size: 20 },
    },
    text: { primary: 'text-[#111318]', secondary: 'text-[#4b5563]', muted: 'text-[#8a919c]' },
  },
  dark: {
    palette: {
      violet:  { border: 'border-[#a7b0bd]/60', bg: 'bg-[#a7b0bd]/[0.08]', icon: 'text-[#a7b0bd]', stroke: '#a7b0bd' },
      emerald: { border: 'border-[#5eead4]/60', bg: 'bg-[#5eead4]/[0.08]', icon: 'text-[#5eead4]', stroke: '#5eead4' },
      blue:    { border: 'border-[#67e8f9]/60', bg: 'bg-[#67e8f9]/[0.08]', icon: 'text-[#67e8f9]', stroke: '#67e8f9' },
      amber:   { border: 'border-[#fbbf24]/60', bg: 'bg-[#fbbf24]/[0.08]', icon: 'text-[#fbbf24]', stroke: '#fbbf24' },
      sky:     { border: 'border-[#22d3ee]/65', bg: 'bg-[#22d3ee]/[0.09]', icon: 'text-[#22d3ee]', stroke: '#22d3ee' },
      zinc:    { border: 'border-[#a1a1aa]/55', bg: 'bg-[#a1a1aa]/[0.07]', icon: 'text-[#a1a1aa]', stroke: '#a1a1aa' },
      rose:    { border: 'border-[#fb7185]/55', bg: 'bg-[#fb7185]/[0.08]', icon: 'text-[#fb7185]', stroke: '#fb7185' },
      orange:  { border: 'border-[#fdba74]/55', bg: 'bg-[#fdba74]/[0.08]', icon: 'text-[#fdba74]', stroke: '#fdba74' },
    },
    background: {
      container: 'bg-[#050608] border border-[#2b2f36]',
      canvas: '#050608',
      grid: { color: 'rgba(125, 211, 252, 0.18)', opacity: 1, size: 24 },
    },
    text: { primary: 'text-[#f4f4f5]', secondary: 'text-[#b6bdc8]', muted: 'text-[#737b86]' },
  },
  brand: {
    fontFamily: "'Inter Tight', 'Arial Narrow', system-ui, sans-serif",
    monoFamily: "'IBM Plex Mono', 'JetBrains Mono', ui-monospace, monospace",
    fontImport: 'https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap',
    nodeShape: 'chamfer',
    nodeDecor: 'ticks',
    nodeBorderWidth: '1px',
    nodeOpacity: 0.96,
    upperLabels: true,
    arrowhead: 'chevron',
    gridType: 'crosshair',
    frame: 'reticle',
    titleBlock: true,
  },
}

// Claude — warm editorial parchment with a clay signature
const claudeTheme: Theme = {
  id: 'claude',
  name: 'Claude',
  description: 'Warm parchment, clay accents',
  defaultMode: 'light',
  light: {
    palette: {
      violet:  { border: 'border-[#7c5cbf]', bg: 'bg-[#7c5cbf]/[0.08]', icon: 'text-[#6546a8]', stroke: '#7c5cbf' },
      emerald: { border: 'border-[#5f7f4f]', bg: 'bg-[#5f7f4f]/[0.09]', icon: 'text-[#4f6d42]', stroke: '#5f7f4f' },
      blue:    { border: 'border-[#4f6f8f]', bg: 'bg-[#4f6f8f]/[0.08]', icon: 'text-[#405f7d]', stroke: '#4f6f8f' },
      amber:   { border: 'border-[#c47a2c]', bg: 'bg-[#c47a2c]/[0.10]', icon: 'text-[#9a5f1d]', stroke: '#c47a2c' },
      sky:     { border: 'border-[#5b8fa8]', bg: 'bg-[#5b8fa8]/[0.09]', icon: 'text-[#4b748c]', stroke: '#5b8fa8' },
      zinc:    { border: 'border-[#6f6a61]', bg: 'bg-[#6f6a61]/[0.08]', icon: 'text-[#5b564e]', stroke: '#6f6a61' },
      rose:    { border: 'border-[#c45a4a]', bg: 'bg-[#c45a4a]/[0.09]', icon: 'text-[#a84435]', stroke: '#c45a4a' },
      orange:  { border: 'border-[#d97757]', bg: 'bg-[#d97757]/[0.11]', icon: 'text-[#b85c3d]', stroke: '#d97757' },
    },
    background: {
      container: 'bg-[#f6f1e8] border border-[#e4d7c4] shadow-lg',
      canvas: '#f6f1e8',
      grid: { color: 'rgba(141, 115, 85, 0.16)', opacity: 0.55, size: 24 },
    },
    text: { primary: 'text-[#211a15]', secondary: 'text-[#5f544a]', muted: 'text-[#8d8174]' },
  },
  dark: {
    palette: {
      violet:  { border: 'border-[#b8a1e6]/55', bg: 'bg-[#b8a1e6]/[0.08]', icon: 'text-[#b8a1e6]', stroke: '#b8a1e6' },
      emerald: { border: 'border-[#a3b18a]/55', bg: 'bg-[#a3b18a]/[0.08]', icon: 'text-[#a3b18a]', stroke: '#a3b18a' },
      blue:    { border: 'border-[#8fb0c9]/55', bg: 'bg-[#8fb0c9]/[0.08]', icon: 'text-[#8fb0c9]', stroke: '#8fb0c9' },
      amber:   { border: 'border-[#e0a458]/55', bg: 'bg-[#e0a458]/[0.10]', icon: 'text-[#e0a458]', stroke: '#e0a458' },
      sky:     { border: 'border-[#8fc1d4]/55', bg: 'bg-[#8fc1d4]/[0.08]', icon: 'text-[#8fc1d4]', stroke: '#8fc1d4' },
      zinc:    { border: 'border-[#a39e93]/50', bg: 'bg-[#a39e93]/[0.07]', icon: 'text-[#a39e93]', stroke: '#a39e93' },
      rose:    { border: 'border-[#e09084]/55', bg: 'bg-[#e09084]/[0.08]', icon: 'text-[#e09084]', stroke: '#e09084' },
      orange:  { border: 'border-[#f0a88f]/60', bg: 'bg-[#f0a88f]/[0.10]', icon: 'text-[#f0a88f]', stroke: '#f0a88f' },
    },
    background: {
      container: 'bg-[#211c18] border border-[#4a3f35]',
      canvas: '#211c18',
      grid: { color: 'rgba(240, 168, 143, 0.12)', opacity: 0.6, size: 24 },
    },
    text: { primary: 'text-[#f4efe8]', secondary: 'text-[#d0c6b8]', muted: 'text-[#96897b]' },
  },
  brand: {
    fontFamily: "'Source Serif 4', Georgia, 'Times New Roman', serif",
    monoFamily: "'IBM Plex Mono', 'JetBrains Mono', ui-monospace, monospace",
    fontImport: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Source+Serif+4:opsz,wght@8..60,400;8..60,500;8..60,600&display=swap',
    nodeShape: 'rounded',
    nodeRadius: '14px',
    nodeDecor: 'bar-left',
    nodeBorderWidth: '1px',
    nodeOpacity: 0.98,
    upperLabels: false,
    arrowhead: 'triangle',
    gridType: 'dots',
    frame: 'inset',
  },
}

// Codex — OpenAI-style console: quiet graphite, mint signal, dense mono labels
const codexTheme: Theme = {
  id: 'codex',
  name: 'Codex',
  description: 'Graphite console, mint signal',
  defaultMode: 'dark',
  light: {
    palette: {
      violet:  { border: 'border-[#6d28d9]', bg: 'bg-[#6d28d9]/[0.08]', icon: 'text-[#6d28d9]', stroke: '#6d28d9' },
      emerald: { border: 'border-[#0f9d6e]', bg: 'bg-[#0f9d6e]/[0.09]', icon: 'text-[#0f9d6e]', stroke: '#0f9d6e' },
      blue:    { border: 'border-[#2563eb]', bg: 'bg-[#2563eb]/[0.08]', icon: 'text-[#2563eb]', stroke: '#2563eb' },
      amber:   { border: 'border-[#b45309]', bg: 'bg-[#b45309]/[0.09]', icon: 'text-[#92400e]', stroke: '#b45309' },
      sky:     { border: 'border-[#0891b2]', bg: 'bg-[#0891b2]/[0.08]', icon: 'text-[#0e7490]', stroke: '#0891b2' },
      zinc:    { border: 'border-[#52525b]', bg: 'bg-[#52525b]/[0.07]', icon: 'text-[#52525b]', stroke: '#52525b' },
      rose:    { border: 'border-[#e11d48]', bg: 'bg-[#e11d48]/[0.08]', icon: 'text-[#be123c]', stroke: '#e11d48' },
      orange:  { border: 'border-[#ea580c]', bg: 'bg-[#ea580c]/[0.09]', icon: 'text-[#c2410c]', stroke: '#ea580c' },
    },
    background: {
      container: 'bg-[#f7f7f8] border border-[#d9dbe0] shadow-sm',
      canvas: '#f7f7f8',
      grid: { color: 'rgba(15, 23, 42, 0.09)', opacity: 0.5, size: 20 },
    },
    text: { primary: 'text-[#111318]', secondary: 'text-[#4b5563]', muted: 'text-[#8a919c]' },
  },
  dark: {
    palette: {
      violet:  { border: 'border-[#a5b4fc]/55', bg: 'bg-[#a5b4fc]/[0.08]', icon: 'text-[#a5b4fc]', stroke: '#a5b4fc' },
      emerald: { border: 'border-[#34d399]/60', bg: 'bg-[#34d399]/[0.09]', icon: 'text-[#34d399]', stroke: '#34d399' },
      blue:    { border: 'border-[#93c5fd]/55', bg: 'bg-[#93c5fd]/[0.08]', icon: 'text-[#93c5fd]', stroke: '#93c5fd' },
      amber:   { border: 'border-[#fbbf24]/55', bg: 'bg-[#fbbf24]/[0.08]', icon: 'text-[#fbbf24]', stroke: '#fbbf24' },
      sky:     { border: 'border-[#67e8f9]/55', bg: 'bg-[#67e8f9]/[0.08]', icon: 'text-[#67e8f9]', stroke: '#67e8f9' },
      zinc:    { border: 'border-[#a1a1aa]/50', bg: 'bg-[#a1a1aa]/[0.07]', icon: 'text-[#a1a1aa]', stroke: '#a1a1aa' },
      rose:    { border: 'border-[#fb7185]/55', bg: 'bg-[#fb7185]/[0.08]', icon: 'text-[#fb7185]', stroke: '#fb7185' },
      orange:  { border: 'border-[#fdba74]/55', bg: 'bg-[#fdba74]/[0.08]', icon: 'text-[#fdba74]', stroke: '#fdba74' },
    },
    background: {
      container: 'bg-[#0b0d10] border border-[#263238]',
      canvas: '#0b0d10',
      grid: { color: 'rgba(52, 211, 153, 0.11)', opacity: 0.7, size: 20 },
    },
    text: { primary: 'text-[#f3f4f6]', secondary: 'text-[#b6bec9]', muted: 'text-[#7d8791]' },
  },
  brand: {
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
    monoFamily: "'Geist Mono', 'JetBrains Mono', ui-monospace, monospace",
    fontImport: 'https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500;600&family=Inter:wght@400;500;600;700&display=swap',
    nodeShape: 'rounded',
    nodeRadius: '12px',
    nodeDecor: 'rule',
    nodeBorderWidth: '1px',
    nodeOpacity: 0.95,
    nodeGlass: true,
    upperLabels: false,
    arrowhead: 'triangle',
    gridType: 'dots',
    frame: 'inset',
    connectorGlow: true,
  },
}

export const THEMES: Record<ThemeId, Theme> = {
  inherit: {
    id: 'inherit', name: 'Inherit from host',
    description: 'Use the host page semantic CSS tokens',
    light: hostThemeMode('light'), dark: hostThemeMode('dark'),
    brand: { fontFamily: 'var(--arc-diagram-font, inherit)', monoFamily: 'var(--arc-diagram-font-mono, ui-monospace, monospace)' },
  },
  default: defaultTheme,
  warm: warmTheme,
  cool: coolTheme,
  mono: monoTheme,
  engineering: engineeringTheme,
  workbench: workbenchTheme,
  tactical: tacticalTheme,
  command: commandTheme,
  spacex: spacexTheme,
  claude: claudeTheme,
  codex: codexTheme,
}

export const DEFAULT_THEME: ThemeId = 'workbench'

export function getTheme(id: ThemeId): Theme {
  return THEMES[id] || THEMES[DEFAULT_THEME]
}

/** CSS surface color for deterministic exports; falls back to the container color. */
export function themeCanvas(id: ThemeId, mode: 'light' | 'dark'): string {
  const background = THEMES[id][mode].background
  return background.canvas || background.container.match(/#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3}/)?.[0] || (mode === 'dark' ? '#0a0a0c' : '#ffffff')
}

export function getThemeList() {
  return Object.values(THEMES).map(t => ({
    id: t.id,
    name: t.name,
    description: t.description,
  }))
}
