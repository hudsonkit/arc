// Host styles: a style value the host passes in, resolved to a Theme.
//
// A style is data, not a name — Arc never looks one up. It carries two modes of
// role tokens, optional per-color overrides, fonts, the existing BrandSpec, and
// a default perspective. The host still chooses light or dark.
//
// Palette resolution, per logical color:
//   style.modes[mode].colors[color] → role token (HOST_COLOR_ROLES) → neutral fallback

import { HOST_COLOR_ROLES, hostFallbackTokens } from '../../packages/viewer/src/theme/host'
import type { Diagnostic } from './diagramDiagnostics'
import { validatePanels } from './figurePanels'
import type { ArcStyle, ArcStyleColor, ArcStyleMode, BrandSpec, ColorPalette, Theme } from './themes'

export type StyleMode = 'light' | 'dark'

export const ARC_STYLE_COLORS = ['violet', 'emerald', 'blue', 'amber', 'sky', 'zinc', 'rose', 'orange'] as const satisfies readonly ArcStyleColor[]
export const ARC_STYLE_TOKENS = ['background', 'foreground', 'muted', 'surface', 'border', 'line', 'accent', 'success', 'warning', 'danger'] as const

export type ArcStyleToken = typeof ARC_STYLE_TOKENS[number]

const DEFAULT_FONT = 'ui-sans-serif, system-ui, sans-serif'
const DEFAULT_MONO = 'ui-monospace, monospace'

export interface ResolvedStyleTokens {
  tokens: Record<ArcStyleToken, string>
  colors: Record<ArcStyleColor, string>
  font: string
  mono: string
}

/** Literal values for one mode — what a standalone export paints. */
export function resolveStyleTokens(style: ArcStyle, mode: StyleMode): ResolvedStyleTokens {
  const source: Partial<ArcStyleMode> = style.modes?.[mode] ?? {}
  const neutral = hostFallbackTokens(mode)
  const tokens = Object.fromEntries(ARC_STYLE_TOKENS.map(name => [name, source[name] || neutral[name]])) as Record<ArcStyleToken, string>
  const colors = Object.fromEntries(ARC_STYLE_COLORS.map(color => [
    color,
    source.colors?.[color] || tokens[HOST_COLOR_ROLES[color]],
  ])) as Record<ArcStyleColor, string>
  return {
    tokens,
    colors,
    font: style.type?.font || DEFAULT_FONT,
    mono: style.type?.mono || DEFAULT_MONO,
  }
}

/** CSS variables a style writes onto the diagram root, one per token and logical color. */
export function arcStyleVars(style: ArcStyle, mode: StyleMode): Record<string, string> {
  const r = resolveStyleTokens(style, mode)
  const vars: Record<string, string> = {}
  for (const name of ARC_STYLE_TOKENS) vars[`--arc-diagram-${name}`] = r.tokens[name]
  for (const color of ARC_STYLE_COLORS) vars[`--arc-diagram-${color}`] = r.colors[color]
  vars['--arc-diagram-font'] = r.font
  vars['--arc-diagram-font-mono'] = r.mono
  return vars
}

/** Wrap a literal in its variable, so a host stylesheet can still re-point it. */
const viaVar = (name: string, literal: string) => `var(--arc-diagram-${name}, ${literal})`

export interface StyleThemeOptions {
  /** Paint literal values instead of `var(--arc-diagram-*, literal)`. Default false. */
  literal?: boolean
}

/** The per-mode Theme slice a style resolves to. */
export function arcStyleThemeMode(style: ArcStyle, mode: StyleMode, options: StyleThemeOptions = {}): Theme['light'] {
  const r = resolveStyleTokens(style, mode)
  const paint = (name: string, literal: string) => options.literal ? literal : viaVar(name, literal)
  const palette = Object.fromEntries(ARC_STYLE_COLORS.map(color => [color, {
    border: 'arc-host-border',
    bg: 'arc-host-surface',
    icon: `arc-style-${color}`,
    stroke: paint(color, r.colors[color]),
  }])) as unknown as ColorPalette
  return {
    palette,
    background: {
      container: `arc-inherit-${mode}`,
      canvas: paint('background', r.tokens.background),
      grid: { color: paint('border', r.tokens.border), opacity: 0.25, size: 24 },
    },
    text: { primary: 'arc-host-foreground', secondary: 'arc-host-muted', muted: 'arc-host-muted' },
  }
}

/** Brand for a style: the style's drawing language plus its fonts. */
export function arcStyleBrand(style: ArcStyle, options: StyleThemeOptions = {}): BrandSpec {
  const font = style.type?.font || DEFAULT_FONT
  const mono = style.type?.mono || DEFAULT_MONO
  return {
    ...style.brand,
    fontFamily: options.literal ? font : viaVar('font', font),
    monoFamily: options.literal ? mono : viaVar('font-mono', mono),
  }
}

/** A style as a Theme, so every existing renderer path can paint it. */
export function arcStyleTheme(style: ArcStyle, options: StyleThemeOptions = {}): Theme {
  return {
    // `inherit` keeps the host-token class paths (HOST_THEME_CSS) working.
    id: 'inherit',
    name: style.id,
    description: `Host style ${style.id}@${style.version}`,
    light: arcStyleThemeMode(style, 'light', options),
    dark: arcStyleThemeMode(style, 'dark', options),
    brand: arcStyleBrand(style, options),
  }
}

/** Per-color icon classes; HOST_THEME_CSS only knows the five roles. */
export const ARC_STYLE_CSS = ARC_STYLE_COLORS
  .map(color => `.arc-styled .arc-style-${color} { color: var(--arc-diagram-${color}); }`)
  .join('\n')

export interface PerspectiveMeta {
  viewMode?: '2d' | 'isometric'
  isoStyle?: 'solid' | 'blueprint' | 'cyanotype'
}

/** The diagram's `_meta` wins; the style supplies what it leaves unset. */
export function resolveStylePerspective(
  meta: PerspectiveMeta | undefined,
  style: ArcStyle | undefined,
  fallback: Required<PerspectiveMeta> = { viewMode: '2d', isoStyle: 'solid' },
): Required<PerspectiveMeta> {
  return {
    viewMode: meta?.viewMode ?? style?.perspective?.default ?? fallback.viewMode,
    isoStyle: meta?.isoStyle ?? style?.perspective?.isoStyle ?? fallback.isoStyle,
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Shape check for a style file. Returns problems; an empty list means usable. */
export function validateArcStyle(value: unknown): string[] {
  const problems: string[] = []
  if (!isObject(value)) return ['a style must be a JSON object']
  if (typeof value.id !== 'string' || !value.id) problems.push('`id` must be a non-empty string')
  if (typeof value.version !== 'string' || !value.version) problems.push('`version` must be a non-empty string')
  if (!isObject(value.modes)) {
    problems.push('`modes` must have `light` and `dark`')
  } else {
    for (const mode of ['light', 'dark'] as const) {
      const m = value.modes[mode]
      if (!isObject(m)) { problems.push(`\`modes.${mode}\` is missing`); continue }
      for (const token of ARC_STYLE_TOKENS) {
        if (typeof m[token] !== 'string' || !m[token]) problems.push(`\`modes.${mode}.${token}\` must be a CSS color string`)
      }
      if (m.colors !== undefined) {
        if (!isObject(m.colors)) problems.push(`\`modes.${mode}.colors\` must be an object`)
        else for (const [key, v] of Object.entries(m.colors)) {
          if (!(ARC_STYLE_COLORS as readonly string[]).includes(key)) problems.push(`\`modes.${mode}.colors.${key}\` is not a logical color (${ARC_STYLE_COLORS.join(', ')})`)
          else if (typeof v !== 'string' || !v) problems.push(`\`modes.${mode}.colors.${key}\` must be a CSS color string`)
        }
      }
    }
  }
  if (value.type !== undefined) {
    if (!isObject(value.type)) problems.push('`type` must be an object')
    else for (const k of ['font', 'mono'] as const) {
      if (value.type[k] !== undefined && typeof value.type[k] !== 'string') problems.push(`\`type.${k}\` must be a string`)
    }
  }
  if (value.brand !== undefined && !isObject(value.brand)) problems.push('`brand` must be an object')
  if (value.perspective !== undefined) {
    const p = value.perspective
    if (!isObject(p)) problems.push('`perspective` must be an object')
    else {
      if (p.default !== undefined && p.default !== '2d' && p.default !== 'isometric') problems.push('`perspective.default` must be "2d" or "isometric"')
      if (p.isoStyle !== undefined && !['solid', 'blueprint', 'cyanotype'].includes(p.isoStyle as string)) problems.push('`perspective.isoStyle` must be solid, blueprint or cyanotype')
    }
  }
  if (value.panels !== undefined) {
    problems.push(...validatePanels(value.panels))
    // The legacy title block owns the bottom-right corner when it is on.
    if (Array.isArray(value.panels) && isObject(value.brand) && value.brand.titleBlock === true
      && value.panels.some(p => isObject(p) && p.anchor === 'bottom-right')) {
      problems.push('`brand.titleBlock` and a bottom-right panel both sit in the bottom-right corner; drop one')
    }
  }
  for (const key of Object.keys(value)) {
    if (!['id', 'version', 'modes', 'type', 'brand', 'perspective', 'panels'].includes(key)) problems.push(`unknown field \`${key}\``)
  }
  return problems
}

/** Parse + validate, throwing one readable error. */
export function parseArcStyle(value: unknown): ArcStyle {
  const problems = validateArcStyle(value)
  if (problems.length) throw new Error(`Invalid Arc style: ${problems.join('; ')}`)
  return value as ArcStyle
}

/**
 * What a style does to a diagram, as `arc check --style` diagnostics.
 * A style replaces the theme, so an authored `_meta.themeId` will not paint.
 */
export function styleDiagnostics(diagram: unknown, style: ArcStyle): Diagnostic[] {
  const meta = isObject(diagram) && isObject(diagram._meta) ? diagram._meta : undefined
  if (meta?.themeId === undefined) return []
  return [{
    code: 'style/theme-ignored',
    severity: 'warning',
    subject: { type: 'diagram' },
    message: `\`_meta.themeId\` "${String(meta.themeId)}" is ignored: style "${style.id}" paints this diagram`,
    evidence: { themeId: meta.themeId, style: style.id, version: style.version },
  }]
}
