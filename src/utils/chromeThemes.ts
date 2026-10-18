// Chrome themes — the skin of the application shell (nav, inspector, canvas
// backdrop, accent). Distinct from a diagram theme, which colors the drawing.
//
// The skins themselves live in src/chrome-themes.css, keyed by a
// `data-arc-chrome` attribute on <html>. This module is the registry plus the
// same tiny store pattern as uiScale.ts.

export interface ChromeTheme {
  id: string
  name: string
  description: string
  /** Accent used for the picker swatch (light, dark). */
  swatch: [string, string]
}

export const CHROME_THEMES: ChromeTheme[] = [
  { id: 'console', name: 'Console', description: 'Signal blue, soft glow', swatch: ['#2b7fd4', '#4db8ff'] },
  { id: 'graphite', name: 'Graphite', description: 'Neutral, no chroma', swatch: ['#4d5a68', '#b6c2ce'] },
  { id: 'amber', name: 'Amber', description: 'Warm terminal', swatch: ['#a86a12', '#ffb534'] },
  { id: 'viridian', name: 'Viridian', description: 'Phosphor green', swatch: ['#12795d', '#45e0a8'] },
  { id: 'paper', name: 'Paper', description: 'Drafting table', swatch: ['#7a4a24', '#d9b184'] },
  { id: 'spacex', name: 'SpaceX', description: 'Mission console, telemetry cyan', swatch: ['#005288', '#67e8f9'] },
  { id: 'claude', name: 'Claude', description: 'Warm parchment and clay', swatch: ['#c96442', '#f0a88f'] },
  { id: 'codex', name: 'Codex', description: 'Graphite console, mint signal', swatch: ['#0f9d6e', '#34d399'] },
]

export const DEFAULT_CHROME_THEME = 'graphite'

const STORAGE_KEY = 'arc-chrome-theme'

export function getChromeThemeMeta(id: string): ChromeTheme {
  return CHROME_THEMES.find(t => t.id === id) ?? CHROME_THEMES[0]
}

function load(): string {
  if (typeof window === 'undefined') return DEFAULT_CHROME_THEME
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw && CHROME_THEMES.some(t => t.id === raw) ? raw : DEFAULT_CHROME_THEME
  } catch {
    return DEFAULT_CHROME_THEME
  }
}

/** Write the skin onto <html>. */
export function applyChromeTheme(id: string) {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-arc-chrome', id)
}

// --- module store -----------------------------------------------------------

let current = DEFAULT_CHROME_THEME
let hydrated = false
const listeners = new Set<(id: string) => void>()

/** Cached snapshot — stable value, safe to read during render. */
export function getChromeTheme(): string {
  if (!hydrated && typeof window !== 'undefined') {
    current = load()
    hydrated = true
  }
  return current
}

export function setChromeTheme(id: string) {
  current = getChromeThemeMeta(id).id
  hydrated = true
  applyChromeTheme(current)
  try {
    window.localStorage.setItem(STORAGE_KEY, current)
  } catch {
    // Private mode / quota — the skin still applies for this session.
  }
  listeners.forEach(fn => fn(current))
}

export function subscribeChromeTheme(fn: (id: string) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
