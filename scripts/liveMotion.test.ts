import { describe, expect, it } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ArcDiagram from '../src/components/ArcDiagram'
import { diagramGeometryKey, followCamera, liveDiagramBounds } from '../src/utils/liveMotion'
import type { ArcDiagramData } from '../src/components/ArcDiagram'

function drawing(x = 120): ArcDiagramData {
  return {
    id: 'system', layout: { width: 700, height: 400 },
    nodes: { api: { x, y: 100, size: 'm' }, db: { x: 440, y: 100, size: 'm' } },
    nodeData: { api: { name: 'API' }, db: { name: 'Database' } },
    connectors: [{ id: 'request', from: 'api', to: 'db', fromAnchor: 'right', toAnchor: 'left', style: 'request' }],
    connectorStyles: { request: {} },
  }
}

describe('live diagram rendering contract', () => {
  it('renders authored icon names safely while preserving Lucide aliases', () => {
    for (const icon of ['Icon', 'icons', 'createLucideIcon', 'default', 'missing-icon']) {
      const data = drawing()
      data.nodeData.api.icon = icon
      data.views = [{ id: 'overview', title: 'Overview', steps: [{ icon, label: 'Inspect' }] }]
      expect(() => renderToStaticMarkup(createElement(ArcDiagram, {
        data, defaultViewId: 'overview', showViews: true,
      }))).not.toThrow()
    }
    for (const icon of ['Server', 'ServerIcon', 'LucideServer']) {
      const data = drawing()
      data.nodeData.api.icon = icon
      expect(renderToStaticMarkup(createElement(ArcDiagram, { data }))).toContain('lucide-server')
    }
  })

  it('supplies static canvas overlays with authored geometry, custom dimensions, and zoom', () => {
    const data = drawing()
    data.nodes.api.width = 240
    data.nodes.api.height = 100
    let overlayNodes: unknown
    let overlayZoom: number | undefined
    let overlayCamera: unknown
    let overlayViewport: unknown
    const markup = renderToStaticMarkup(createElement(ArcDiagram, {
      data, defaultZoom: 0.6, autoFrameUpdates: true,
      renderCanvasOverlay: ({ nodes, zoom, camera, viewport }) => {
        overlayNodes = nodes
        overlayZoom = zoom
        overlayCamera = camera
        overlayViewport = viewport
        return createElement('span', { 'data-test-overlay': true }, 'Presence')
      },
    }))
    expect(overlayNodes).toEqual([
      { id: 'api', x: 120, y: 100, width: 240, height: 100, data: data.nodeData.api, opacity: 1 },
      { id: 'db', x: 440, y: 100, width: 160, height: 75, data: data.nodeData.db, opacity: 1 },
    ])
    expect(overlayZoom).toBe(0.6)
    expect(overlayCamera).toEqual({ x: 0, y: 0 })
    expect(overlayViewport).toEqual({ width: 0, height: 0 })
    expect(markup).toContain('overflow-clip')
    expect(markup.indexOf('data-test-overlay')).toBeGreaterThan(markup.indexOf('data-arc-node-id="db"'))
    expect(markup.indexOf('data-test-overlay')).toBeLessThan(markup.indexOf('title="Zoom out"'))
  })

})

describe('live following camera', () => {
  const bounds = { minX: 0, minY: 0, maxX: 700, maxY: 400 }
  it('leaves a comfortable camera unchanged for ordinary revisions and removal', () => {
    const camera = { x: 150, y: 100, zoom: 1 }
    expect(followCamera(bounds, 1000, 600, camera, 60, 1)).toBe(camera)
    expect(followCamera({ ...bounds, maxX: 400 }, 1000, 600, camera, 60, 1)).toBe(camera)
  })
  it('pulls back for growth and only zooms in on an explicit resume', () => {
    const camera = { x: 150, y: 100, zoom: 1 }
    const expanded = { ...bounds, minX: -300, maxX: 1500 }
    const next = followCamera(expanded, 1000, 600, camera, 60, 1)
    expect(next.zoom).toBeLessThan(1)
    expect(expanded.minX * next.zoom + next.x).toBeCloseTo(60)
    expect(expanded.maxX * next.zoom + next.x).toBeCloseTo(940)
    expect(followCamera(bounds, 1000, 600, next, 60, 1).zoom).toBe(next.zoom)
    expect(followCamera(bounds, 1000, 600, next, 60, 1, true).zoom).toBe(1)
  })
  it('includes group and bowed connector excursions beyond the canvas', () => {
    const data = drawing()
    data.groups = [{ id: 'large', x: -120, y: 0, width: 800, height: 500, type: 'rect', color: 'zinc' }]
    data.connectors[0] = { ...data.connectors[0], fromAnchor: 'top', toAnchor: 'top', curve: 'natural', curveDepth: 120 }
    const fit = liveDiagramBounds(data)
    expect(fit.minX).toBe(-120)
    expect(fit.minY).toBeLessThan(0)
    expect(fit.maxY).toBe(500)
  })
  it('does not produce negative zoom for tiny or unmeasured viewports', () => {
    const camera = { x: 0, y: 0, zoom: 1 }
    expect(followCamera(bounds, 0, 0, camera, 80, 1)).toBe(camera)
    expect(followCamera(bounds, 100, 60, camera, 80, 1).zoom).toBeGreaterThan(0)
  })
})

describe('whole-diagram automatic framing', () => {
  it('ignores metadata and insertion order, but notices moves within unchanged bounds', () => {
    const original = drawing()
    const key = diagramGeometryKey(original)
    const metadata = structuredClone(original)
    metadata.id = 'renamed-drawing'
    metadata.nodeData.api.name = 'Renamed service'
    metadata.connectors[0].label = 'New caption'
    metadata.connectorStyles.request.color = 'blue'
    metadata.nodes = { db: metadata.nodes.db, api: metadata.nodes.api }
    expect(diagramGeometryKey(metadata)).toBe(key)

    const moved = structuredClone(original)
    moved.nodes.api.x += 10
    expect(liveDiagramBounds(moved)).toEqual(liveDiagramBounds(original))
    expect(diagramGeometryKey(moved)).not.toBe(key)
    const resized = structuredClone(original)
    resized.nodes.api.width = 170
    expect(diagramGeometryKey(resized)).not.toBe(key)
    const rerouted = structuredClone(original)
    rerouted.connectors[0].curveDepth = 80
    expect(diagramGeometryKey(rerouted)).not.toBe(key)
    const newLayout = structuredClone(original)
    newLayout.layout.width += 100
    expect(diagramGeometryKey(newLayout)).not.toBe(key)
  })

  it('fits all content, zooms out and back in, and leaves authored positions untouched', () => {
    const data = drawing()
    const positions = structuredClone(data.nodes)
    const smallBounds = liveDiagramBounds(data, false)
    expect(smallBounds.minX).toBe(120)
    expect(smallBounds.maxX).toBe(600)
    expect(smallBounds.maxY).toBeLessThan(data.layout.height)
    const initial = followCamera(smallBounds, 1000, 600, { x: 0, y: 0, zoom: 1 }, 60, 1, true)
    data.nodes.far = { x: 1400, y: -100, size: 'm' }
    const largeBounds = liveDiagramBounds(data, false)
    const expanded = followCamera(largeBounds, 1000, 600, initial, 60, 1, true)
    expect(expanded.zoom).toBeLessThan(initial.zoom)
    expect(largeBounds.minX * expanded.zoom + expanded.x).toBeCloseTo(60)
    expect(largeBounds.maxX * expanded.zoom + expanded.x).toBeCloseTo(940)
    expect((largeBounds.minY + largeBounds.maxY) / 2 * expanded.zoom + expanded.y).toBeCloseTo(300)
    delete data.nodes.far
    const contracted = followCamera(liveDiagramBounds(data, false), 1000, 600, expanded, 60, 1, true)
    expect(contracted.zoom).toBe(initial.zoom)
    expect(contracted).toEqual(initial)
    expect(data.nodes).toEqual(positions)
  })

  it('retains groups and curved routes while using layout only for an empty drawing', () => {
    const data = drawing()
    data.groups = [{ id: 'group', x: -200, y: -50, width: 850, height: 260, color: 'zinc', type: 'rect' }]
    data.connectors[0] = { ...data.connectors[0], fromAnchor: 'top', toAnchor: 'top', curveDepth: 120 }
    const bounds = liveDiagramBounds(data, false)
    expect(bounds.minX).toBe(-200)
    expect(bounds.minY).toBeLessThan(-50)
    expect(bounds.maxX).toBe(650)
    expect(bounds.maxY).toBe(210)
    data.nodes = {}
    data.groups = []
    data.connectors = []
    expect(liveDiagramBounds(data, false)).toEqual({ minX: 0, minY: 0, maxX: 700, maxY: 400 })
  })
})
