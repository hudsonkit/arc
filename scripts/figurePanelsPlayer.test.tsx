import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import ArcDiagram from '../src/components/ArcDiagram'
import type { ArcStyle } from '../src/utils/themes'

const tokens = {
  background: '#fbfaf7', foreground: '#1b1a17', muted: '#6b665c', surface: '#ffffff', border: '#d9d4c7',
  line: '#8a8475', accent: '#2f5bd3', success: '#2e7d4f', warning: '#b7791f', danger: '#c0392b',
}

const style: ArcStyle = {
  id: 'test',
  version: '1',
  modes: { light: tokens, dark: tokens },
  panels: [{
    id: 'plate',
    anchor: 'bottom-right',
    requires: ['title'],
    rows: [
      [{ text: '{title}', case: 'upper', span: 2 }],
      [{ label: 'Code', text: '{code}' }, { label: 'Rev', text: '{rev}' }],
    ],
  }],
}

const diagram = {
  id: 'custody',
  layout: { width: 400, height: 200 },
  nodes: { a: { x: 20, y: 20, size: 'm' as const } },
  nodeData: { a: { name: 'A', icon: 'Server', color: 'blue' as const } },
  connectors: [],
  connectorStyles: {},
}

describe('the player draws style panels', () => {
  test('from the diagram figure, in the panel corner', () => {
    const html = renderToStaticMarkup(
      <ArcDiagram data={{ ...diagram, figure: { title: 'Board custody', code: 'BC-01', rev: 'A' } }} style={style} mode="light" />,
    )
    expect(html).toContain('data-arc-panel="plate"')
    expect(html).toContain('>BOARD CUSTODY<')
    expect(html).toContain('>BC-01<')
    expect(html).toMatch(/data-arc-panel="plate"[^>]*style="[^"]*bottom:12px[^"]*right:12px/)
  })

  test('not at all without the required title', () => {
    const html = renderToStaticMarkup(<ArcDiagram data={diagram} style={style} mode="light" />)
    expect(html).not.toContain('data-arc-panel')
  })

  test('a panel takes over the label in its corner', () => {
    const data = { ...diagram, figure: { title: 'Board custody', code: 'BC-01' } }
    const shared = renderToStaticMarkup(<ArcDiagram data={data} style={style} labelPosition="bottom-right" />)
    const apart = renderToStaticMarkup(<ArcDiagram data={data} style={style} labelPosition="top-left" />)
    expect(shared).not.toContain('>custody<')
    expect(apart).toContain('>custody<')
  })
})
