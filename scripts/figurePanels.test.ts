import { describe, expect, test } from 'bun:test'
import {
  fillTemplate,
  figureVariables,
  layoutPanel,
  panelSvg,
  placePanel,
  templateVariables,
  validatePanels,
} from '../src/utils/figurePanels'
import { validateArcStyle } from '../src/utils/arcStyle'
import { validateDiagram } from '../src/utils/diagramDiagnostics'
import type { ArcStyle, StylePanel } from '../src/utils/themes'
import { renderDiagramSvg } from './renderImage'

const light = {
  background: '#fbfaf7', foreground: '#1b1a17', muted: '#6b665c', surface: '#ffffff', border: '#d9d4c7',
  line: '#8a8475', accent: '#2f5bd3', success: '#2e7d4f', warning: '#b7791f', danger: '#c0392b',
}
const dark = { ...light, background: '#121110', foreground: '#f1eee6', surface: '#1c1b19' }

// Title over Code (two columns), Rev and Sheet; shown only with a title.
const plate: StylePanel = {
  id: 'plate',
  anchor: 'bottom-right',
  requires: ['title'],
  rows: [
    [{ text: '{title}', case: 'upper', weight: 'strong', span: 4 }],
    [
      { label: 'Code', text: '{code}', span: 2 },
      { label: 'Rev', text: '{rev}' },
      { label: 'Sheet', text: '{sheet}' },
    ],
  ],
}

const style: ArcStyle = { id: 'test', version: '1', modes: { light, dark }, panels: [plate] }

const diagram = {
  id: 'checkout',
  layout: { width: 400, height: 200 },
  nodes: { a: { x: 20, y: 20, size: 'm' as const } },
  nodeData: { a: { icon: 'Box', name: 'A', color: 'zinc' as const } },
  connectors: [],
  connectorStyles: {},
}

describe('templates', () => {
  test('reads variable names in order', () => {
    expect(templateVariables('{sheet} of {sheets}')).toEqual(['sheet', 'sheets'])
    expect(templateVariables('Draft')).toEqual([])
  })

  test('fills when every variable is set, and returns null otherwise', () => {
    expect(fillTemplate('{sheet} of {sheets}', { sheet: '1', sheets: '3' })).toBe('1 of 3')
    expect(fillTemplate('{sheet} of {sheets}', { sheet: '1' })).toBeNull()
    expect(fillTemplate('Draft', {})).toBe('Draft')
  })

  test('figure strings become variables; code falls back to the diagram id', () => {
    expect(figureVariables({ id: 'checkout' })).toEqual({ id: 'checkout', code: 'checkout' })
    expect(figureVariables({ id: 'checkout', figure: { code: 'CF-01', title: 'Checkout flow', rev: '' } }))
      .toEqual({ id: 'checkout', code: 'CF-01', title: 'Checkout flow' })
  })
})

describe('layout', () => {
  const full = { title: 'Checkout flow', code: 'CF-01', rev: 'A', sheet: '1 / 1' }

  test('lays out every row when every variable is set', () => {
    const layout = layoutPanel(plate, full)!
    expect(layout.rows.map(r => r.cells.map(c => c.value))).toEqual([['CHECKOUT FLOW'], ['CF-01', 'A', '1 / 1']])
    // Code spans two of four columns; every row fills the panel width.
    const [code, rev, sheet] = layout.rows[1].cells
    expect(code.width).toBe(rev.width + sheet.width)
    for (const row of layout.rows) {
      const last = row.cells[row.cells.length - 1]
      expect(last.x + last.width).toBe(layout.width)
    }
  })

  test('drops a cell whose variable is missing and stretches the rest of its row', () => {
    const layout = layoutPanel(plate, { title: 'Checkout flow', code: 'CF-01', sheet: '1 / 1' })!
    const cells = layout.rows[1].cells
    expect(cells.map(c => c.label)).toEqual(['Code', 'Sheet'])
    expect(cells[1].x + cells[1].width).toBe(layout.width)
  })

  test('drops a row with no drawn cell', () => {
    const layout = layoutPanel(plate, { title: 'Checkout flow' })!
    expect(layout.rows).toHaveLength(1)
  })

  test('leaves the panel out when a required variable is missing', () => {
    expect(layoutPanel(plate, { code: 'CF-01', rev: 'A' })).toBeNull()
  })

  test('leaves the panel out when nothing in it is drawn', () => {
    expect(layoutPanel({ ...plate, requires: undefined }, {})).toBeNull()
  })

  test('places a panel in its corner, inset from the edges', () => {
    const layout = layoutPanel(plate, full)!
    const box = { x: -20, y: -20, width: 440, height: 240 }
    expect(placePanel(layout, box, 12)).toEqual({ x: 420 - 12 - layout.width, y: 220 - 12 - layout.height })
    expect(placePanel({ ...layout, anchor: 'top-left' }, box, 12)).toEqual({ x: -8, y: -8 })
  })

  test('escapes values in the drawing', () => {
    const layout = layoutPanel({ id: 'p', anchor: 'top-left', rows: [[{ text: '{title}' }]] }, { title: 'A <b> & "c"' })!
    const svg = panelSvg(layout, { line: '#000', label: '#111', value: '#222', fill: '#fff', font: '"SF Mono", monospace' })
    expect(svg).toContain('A &lt;b&gt; &amp; &quot;c&quot;')
    expect(svg).toContain('font-family="&quot;SF Mono&quot;, monospace"')
  })
})

describe('export', () => {
  test('draws the panel from the diagram figure', () => {
    const { svg } = renderDiagramSvg({ ...diagram, figure: { title: 'Checkout flow', code: 'CF-01', rev: 'A', sheet: '1 / 1' } }, { style, mode: 'light' })
    expect(svg).toContain('data-arc-panel="plate"')
    expect(svg).toContain('>CHECKOUT FLOW<')
    expect(svg).toContain('>CF-01<')
    expect(svg).toContain(`stroke="${light.line}"`)
  })

  test('draws nothing for a diagram without the required title', () => {
    const { svg } = renderDiagramSvg(diagram, { style, mode: 'dark' })
    expect(svg).not.toContain('data-arc-panel')
  })

  test('a style without panels draws none', () => {
    const { svg } = renderDiagramSvg({ ...diagram, figure: { title: 'Checkout flow' } }, { style: { ...style, panels: undefined }, mode: 'light' })
    expect(svg).not.toContain('data-arc-panel')
  })
})

describe('validation', () => {
  test('a style with a well-formed panel is valid', () => {
    expect(validateArcStyle(style)).toEqual([])
  })

  test('reports malformed panels by path', () => {
    const problems = validatePanels([
      { id: 'a', anchor: 'middle', rows: [] },
      { id: 'a', anchor: 'top-left', rows: [[{ text: '', span: 0, case: 'lower', extra: 1 }]], requires: [''] },
    ])
    expect(problems).toEqual(expect.arrayContaining([
      '`panels[0]`.anchor must be top-left, top-right, bottom-left, bottom-right',
      '`panels[0]`.rows must be a non-empty list of rows',
      '`panels[1]`.id "a" is used twice',
      '`panels[1]`.requires must be a list of variable names',
      '`panels[1]`.rows[0][0].text must be a non-empty string',
      '`panels[1]`.rows[0][0].span must be a positive integer',
      '`panels[1]`.rows[0][0].case must be "upper"',
      '`panels[1]`.rows[0][0] has unknown field `extra`',
    ]))
  })

  test('two panels cannot share a corner', () => {
    expect(validatePanels([plate, { ...plate, id: 'other' }])).toContain('`panels[1]` and panel "plate" both sit in bottom-right')
  })

  test('the legacy title block and a bottom-right panel conflict', () => {
    expect(validateArcStyle({ ...style, brand: { titleBlock: true } }).join('\n')).toContain('both sit in the bottom-right corner')
  })

  test('a diagram figure must hold strings', () => {
    const ok = validateDiagram({ ...diagram, figure: { title: 'Checkout flow', code: 'CF-01' } })
    expect(ok.filter(d => d.code === 'semantic/invalid-figure')).toEqual([])
    const bad = validateDiagram({ ...diagram, figure: { rev: 2 } })
    expect(bad.find(d => d.code === 'semantic/invalid-figure')?.message).toBe('`figure.rev` must be a string')
  })
})
