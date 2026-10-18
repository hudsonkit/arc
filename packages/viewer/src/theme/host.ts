/** Shared CSS contract for host-themed diagrams. Prefix avoids Arc shell tokens. */
export const HOST_TOKEN_NAMES = ['background', 'foreground', 'muted', 'surface', 'border', 'line', 'accent', 'success', 'warning', 'danger', 'font', 'font-mono'] as const
export type HostTokenName = typeof HOST_TOKEN_NAMES[number]
export type HostThemeTokens = Record<HostTokenName, string>

export function hostThemeTokens(mode: 'light' | 'dark'): HostThemeTokens {
  const dark = mode === 'dark'
  const fallback: HostThemeTokens = {
    background: dark ? '#09090b' : '#ffffff',
    foreground: dark ? '#fafafa' : '#18181b',
    muted: dark ? '#a1a1aa' : '#52525b',
    surface: dark ? '#18181b' : '#f4f4f5',
    border: dark ? '#71717a' : '#a1a1aa',
    line: dark ? '#a1a1aa' : '#52525b',
    accent: dark ? '#93c5fd' : '#2563eb',
    success: dark ? '#6ee7b7' : '#047857',
    warning: dark ? '#fcd34d' : '#92400e',
    danger: dark ? '#fda4af' : '#be123c',
    font: 'inherit',
    'font-mono': 'ui-monospace, monospace',
  }
  return Object.fromEntries(HOST_TOKEN_NAMES.map(name => [name, `var(--arc-diagram-${name}, ${fallback[name]})`])) as HostThemeTokens
}

export const HOST_COLOR_ROLES = {
  violet: 'accent', emerald: 'success', blue: 'accent', amber: 'warning',
  sky: 'accent', zinc: 'line', rose: 'danger', orange: 'warning',
} as const

/** Preserve preset hex output exactly; CSS variables need color-mix for alpha. */
export function colorAlpha(color: string, hexAlpha: string): string {
  return color.startsWith('var(')
    ? `color-mix(in srgb, ${color} ${parseInt(hexAlpha, 16) / 255 * 100}%, transparent)`
    : `${color}${hexAlpha}`
}

export function hostThemeMode(mode: 'light' | 'dark') {
  const t = hostThemeTokens(mode)
  const palette = Object.fromEntries(Object.entries(HOST_COLOR_ROLES).map(([color, role]) => [color, {
    border: 'arc-host-border', bg: 'arc-host-surface', icon: `arc-host-${role}`, stroke: t[role],
  }])) as Record<keyof typeof HOST_COLOR_ROLES, { border: string; bg: string; icon: string; stroke: string }>
  return {
    palette,
    background: { container: `arc-inherit-${mode}`, canvas: t.background, grid: { color: t.border, opacity: 0.25, size: 24 } },
    text: { primary: 'arc-host-foreground', secondary: 'arc-host-muted', muted: 'arc-host-muted' },
  }
}

// Included by renderers so viewer consumers do not need a second stylesheet.
// Only host-theme classes match; neighboring preset diagrams are unaffected.
export const HOST_THEME_CSS = (['light', 'dark'] as const).map(mode => {
  const t = hostThemeTokens(mode)
  const root = `.arc-inherit-${mode}`
  return `${root} { background: ${t.background}; color: ${t.foreground}; border: 1px solid ${t.border}; font-family: ${t.font}; }
${root} .arc-host-surface, ${root} [data-arc-node] { background: ${t.surface}; }
${root} .arc-host-border, ${root} [data-arc-node] { border-color: ${t.border}; }
${root} .arc-host-foreground { color: ${t.foreground}; }
${root} .arc-host-muted { color: ${t.muted}; }
${root}.arc-host-sequence text { font-family: ${t.font}; }
${root} .font-mono { font-family: ${t['font-mono']}; }
${(['accent', 'success', 'warning', 'danger', 'line'] as const).map(role => `${root} .arc-host-${role} { color: ${t[role]}; }`).join('\n')}`
}).join('\n')
