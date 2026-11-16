import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import ArcDiagram from '../src/components/ArcDiagram'
import IsoDiagram from '../src/iso/ArcDiagram'
import type { DiagramConfig } from '../src/iso/types'
import { ArcExploded, keyboardExploded } from '../src/exploded'
import { ArcPanelCube, fieldRecorderCube } from '../src/panel-cube'
import { ARC_ROOT_CLASS } from '../src/utils/cssScope'

const diagram = {
  layout: { width: 400, height: 200 },
  nodes: { a: { x: 20, y: 20, size: 'm' as const } },
  nodeData: { a: { name: 'A', icon: 'Server', color: 'blue' as const } },
  connectors: [],
  connectorStyles: {},
}

/** The class list of the first element in the markup. */
function rootClasses(markup: string): string[] {
  const match = /^<[a-z]+[^>]*?\sclass="([^"]*)"/.exec(markup)
  return match ? match[1].split(/\s+/) : []
}

// lib/arc.css only styles elements inside `.arc-root` (scripts/scopeCss.mjs),
// so every component the library exports has to render it on its root.
describe('Arc component roots carry the stylesheet scope class', () => {
  test('ArcDiagram, including with the refit props', () => {
    expect(rootClasses(renderToStaticMarkup(<ArcDiagram data={diagram} />))).toContain(ARC_ROOT_CLASS)
    const refit = renderToStaticMarkup(<ArcDiagram data={diagram} className="host" defaultZoom="fit" fitKey="320x200" fitMeasure="layout" />)
    expect(rootClasses(refit)).toEqual(expect.arrayContaining([ARC_ROOT_CLASS, 'host']))
  })

  test('ArcDiagramIsometric', () => {
    const config: DiagramConfig = { id: 'test', title: 'Test', theme: 'light', canvas: { width: 400, height: 400 }, origin: { x: 200, y: 300 }, tiers: [{ name: 'Runtime', elevation: 0 }], floorSize: { width: 120, depth: 80 }, nodes: [{ tier: 0, x: 10, y: 10, width: 90, depth: 40, height: 12, color: 'rose', label: 'Runtime' }] }
    expect(rootClasses(renderToStaticMarkup(<IsoDiagram config={config} options={{ animate: false }} />))).toContain(ARC_ROOT_CLASS)
  })

  test('ArcExploded and ArcPanelCube', () => {
    expect(rootClasses(renderToStaticMarkup(<ArcExploded document={keyboardExploded} className="host" />))).toEqual([ARC_ROOT_CLASS, 'host'])
    expect(rootClasses(renderToStaticMarkup(<ArcPanelCube data={fieldRecorderCube} />))).toEqual([ARC_ROOT_CLASS, 'arc-panel-cube'])
  })
})
