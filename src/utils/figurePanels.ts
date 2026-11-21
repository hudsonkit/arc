// Style panels: plates a style pins to canvas corners, filled from the
// diagram's `figure`.
//
// The style owns the layout (rows of cells, spans, case); the diagram owns the
// facts (`figure.title`, `figure.code`, …). A cell reads `{name}` variables and
// is drawn only when every one is set. A row with no drawn cell is dropped, and
// a panel with no drawn row — or a missing `requires` variable — is left out.
//
// One layout and one SVG drawing serve both the standalone export and the
// player, so the two cannot drift apart.

import type { StylePanel, StylePanelCell } from './themes'

const VARIABLE = /\{([A-Za-z_][\w-]*)\}/g

/** Variable names a template reads, in order. */
export function templateVariables(text: string): string[] {
  return [...text.matchAll(VARIABLE)].map(m => m[1])
}

/** Fill a template, or `null` when a variable it reads is not set. */
export function fillTemplate(text: string, vars: Record<string, string>): string | null {
  let missing = false
  const out = text.replace(VARIABLE, (_, name: string) => {
    const value = vars[name]
    if (value === undefined) missing = true
    return value ?? ''
  })
  return missing ? null : out
}

/**
 * The variables a diagram supplies: every non-empty string in `figure`, plus
 * `{id}` from the diagram id, which `{code}` falls back to.
 */
export function figureVariables(diagram: { id?: unknown; figure?: unknown }): Record<string, string> {
  const vars: Record<string, string> = {}
  if (typeof diagram.id === 'string' && diagram.id.trim()) {
    vars.id = diagram.id
    vars.code = diagram.id
  }
  const figure = diagram.figure
  if (figure && typeof figure === 'object' && !Array.isArray(figure)) {
    for (const [name, value] of Object.entries(figure)) {
      if (typeof value === 'string' && value.trim()) vars[name] = value
    }
  }
  return vars
}

// Metrics. Panels set in the style's monospace stack, so width is estimated
// from a fixed pitch; padding absorbs the difference for wider faces.
const PITCH = 0.62
const PAD_X = 11
const LABEL_PX = 8
const VALUE_PX = 11
const PLAIN_PX = 10
const UPPER_TRACKING = 1.2
const LABELED_ROW_H = 32
const PLAIN_ROW_H = 22

export interface PanelCellLayout {
  x: number
  width: number
  label?: string
  value: string
  upper: boolean
  strong: boolean
}

export interface PanelRowLayout {
  y: number
  height: number
  labeled: boolean
  cells: PanelCellLayout[]
}

export interface PanelLayout {
  id: string
  anchor: StylePanel['anchor']
  width: number
  height: number
  rows: PanelRowLayout[]
}

interface FilledCell {
  label?: string
  value: string
  span: number
  upper: boolean
  strong: boolean
}

const textWidth = (text: string, px: number, tracking = 0) => text.length * (px * PITCH + tracking)

function cellSpan(cell: StylePanelCell): number {
  return Number.isInteger(cell.span) && (cell.span as number) > 0 ? (cell.span as number) : 1
}

function fillCell(cell: StylePanelCell, vars: Record<string, string>): FilledCell | null {
  const value = fillTemplate(cell.text, vars)
  if (value === null || !value.trim()) return null
  const upper = cell.case === 'upper'
  return {
    label: cell.label || undefined,
    value: upper ? value.toUpperCase() : value,
    span: cellSpan(cell),
    upper,
    strong: cell.weight === 'strong',
  }
}

function cellNeed(cell: FilledCell, labeled: boolean): number {
  const px = labeled ? VALUE_PX : PLAIN_PX
  const value = textWidth(cell.value, px, cell.upper ? UPPER_TRACKING : 0)
  const label = cell.label ? textWidth(cell.label, LABEL_PX) : 0
  return Math.max(value, label) + PAD_X * 2
}

/** Lay a panel out for these variables, or `null` when nothing in it is drawn. */
export function layoutPanel(panel: StylePanel, vars: Record<string, string>): PanelLayout | null {
  if (panel.requires?.some(name => vars[name] === undefined)) return null
  const rows = panel.rows
    .map(row => row.map(cell => fillCell(cell, vars)).filter((c): c is FilledCell => c !== null))
    .filter(row => row.length > 0)
  if (rows.length === 0) return null

  const labeled = rows.map(row => row.some(c => c.label))
  const columns = Math.max(...rows.map(row => row.reduce((n, c) => n + c.span, 0)))
  // One column width for the whole panel: the widest need per spanned column.
  const unit = Math.ceil(Math.max(...rows.flatMap((row, i) => row.map(c => cellNeed(c, labeled[i]) / c.span))))
  const width = unit * columns

  let y = 0
  const laidOut = rows.map((row, i) => {
    // A row that lost cells stretches the rest to the panel width.
    const spans = row.reduce((n, c) => n + c.span, 0)
    let x = 0
    const cells = row.map((c, j) => {
      const w = j === row.length - 1 ? width - x : Math.round((width * c.span) / spans)
      const out: PanelCellLayout = { x, width: w, label: c.label, value: c.value, upper: c.upper, strong: c.strong }
      x += w
      return out
    })
    const height = labeled[i] ? LABELED_ROW_H : PLAIN_ROW_H
    const laid: PanelRowLayout = { y, height, labeled: labeled[i], cells }
    y += height
    return laid
  })

  return { id: panel.id, anchor: panel.anchor, width, height: y, rows: laidOut }
}

/** Lay out every panel a style declares; panels with nothing to draw drop out. */
export function layoutPanels(panels: StylePanel[] | undefined, vars: Record<string, string>): PanelLayout[] {
  return (panels ?? []).map(p => layoutPanel(p, vars)).filter((p): p is PanelLayout => p !== null)
}

/** Top-left corner for a panel inside a box, `inset` from its edges. */
export function placePanel(
  layout: PanelLayout,
  box: { x: number; y: number; width: number; height: number },
  inset: number,
): { x: number; y: number } {
  const left = layout.anchor.endsWith('left')
  const top = layout.anchor.startsWith('top')
  return {
    x: left ? box.x + inset : box.x + box.width - inset - layout.width,
    y: top ? box.y + inset : box.y + box.height - inset - layout.height,
  }
}

export interface PanelPaint {
  /** Rules and the outer border. */
  line: string
  /** Cell captions. */
  label: string
  /** Values. */
  value: string
  /** Panel fill, so connectors running underneath stay behind the text. */
  fill: string
  font: string
}

const esc = (s: string) => s
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

/** SVG markup for a laid-out panel, drawn at the origin. */
export function panelSvg(layout: PanelLayout, paint: PanelPaint): string {
  const font = esc(paint.font)
  const { width, height } = layout
  // Half-pixel offsets keep 1px rules crisp.
  let out = `<rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" fill="${esc(paint.fill)}" stroke="${esc(paint.line)}" stroke-width="1"/>`
  layout.rows.forEach((row, i) => {
    if (i > 0) out += `<line x1="0.5" y1="${row.y + 0.5}" x2="${width - 0.5}" y2="${row.y + 0.5}" stroke="${esc(paint.line)}" stroke-width="1"/>`
    row.cells.forEach((cell, j) => {
      if (j > 0) out += `<line x1="${cell.x + 0.5}" y1="${row.y + 0.5}" x2="${cell.x + 0.5}" y2="${row.y + row.height - 0.5}" stroke="${esc(paint.line)}" stroke-width="1"/>`
      const tx = cell.x + PAD_X
      if (cell.label) {
        out += `<text x="${tx}" y="${row.y + 12}" font-family="${font}" font-size="${LABEL_PX}" fill="${esc(paint.label)}">${esc(cell.label)}</text>`
      }
      const baseline = row.labeled ? row.y + 26 : row.y + 15
      const size = row.labeled ? VALUE_PX : PLAIN_PX
      const tracking = cell.upper ? ` letter-spacing="${UPPER_TRACKING}"` : ''
      const weight = cell.strong ? ' font-weight="600"' : ''
      out += `<text x="${tx}" y="${baseline}" font-family="${font}" font-size="${size}"${weight}${tracking} fill="${esc(paint.value)}">${esc(cell.value)}</text>`
    })
  })
  return out
}

const ANCHORS: readonly StylePanel['anchor'][] = ['top-left', 'top-right', 'bottom-left', 'bottom-right']
const PANEL_KEYS = ['id', 'anchor', 'requires', 'rows']
const CELL_KEYS = ['label', 'text', 'span', 'case', 'weight']

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Shape problems in a style's `panels`, each prefixed with its path. */
export function validatePanels(value: unknown): string[] {
  if (!Array.isArray(value)) return ['`panels` must be an array']
  const problems: string[] = []
  const ids = new Set<string>()
  const corners = new Map<string, string>()
  value.forEach((panel, i) => {
    const at = `\`panels[${i}]\``
    if (!isObject(panel)) { problems.push(`${at} must be an object`); return }
    if (typeof panel.id !== 'string' || !panel.id) problems.push(`${at}.id must be a non-empty string`)
    else if (ids.has(panel.id)) problems.push(`${at}.id "${panel.id}" is used twice`)
    else ids.add(panel.id)
    if (!ANCHORS.includes(panel.anchor as StylePanel['anchor'])) problems.push(`${at}.anchor must be ${ANCHORS.join(', ')}`)
    else if (corners.has(panel.anchor as string)) problems.push(`${at} and panel "${corners.get(panel.anchor as string)}" both sit in ${String(panel.anchor)}`)
    else corners.set(panel.anchor as string, String(panel.id))
    if (panel.requires !== undefined && (!Array.isArray(panel.requires) || panel.requires.some(r => typeof r !== 'string' || !r))) {
      problems.push(`${at}.requires must be a list of variable names`)
    }
    if (!Array.isArray(panel.rows) || panel.rows.length === 0) problems.push(`${at}.rows must be a non-empty list of rows`)
    else panel.rows.forEach((row, r) => {
      if (!Array.isArray(row) || row.length === 0) { problems.push(`${at}.rows[${r}] must be a non-empty list of cells`); return }
      row.forEach((cell, c) => {
        const cat = `${at}.rows[${r}][${c}]`
        if (!isObject(cell)) { problems.push(`${cat} must be an object`); return }
        if (typeof cell.text !== 'string' || !cell.text) problems.push(`${cat}.text must be a non-empty string`)
        if (cell.label !== undefined && typeof cell.label !== 'string') problems.push(`${cat}.label must be a string`)
        if (cell.span !== undefined && (!Number.isInteger(cell.span) || (cell.span as number) < 1)) problems.push(`${cat}.span must be a positive integer`)
        if (cell.case !== undefined && cell.case !== 'upper') problems.push(`${cat}.case must be "upper"`)
        if (cell.weight !== undefined && cell.weight !== 'strong') problems.push(`${cat}.weight must be "strong"`)
        for (const key of Object.keys(cell)) if (!CELL_KEYS.includes(key)) problems.push(`${cat} has unknown field \`${key}\``)
      })
    })
    for (const key of Object.keys(panel)) if (!PANEL_KEYS.includes(key)) problems.push(`${at} has unknown field \`${key}\``)
  })
  return problems
}
