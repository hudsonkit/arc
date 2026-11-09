import { describe, expect, test } from 'bun:test'
import { placeWorkLabel, workLabelObstacles, workScopeBounds } from '../src/apps/arc-live/workPresence'

const canvas = { minX: -50, minY: 0, maxX: 900, maxY: 600 }
const nodes = [
  { id: 'api', x: 100, y: 120, width: 150, height: 80, opacity: 1, data: undefined },
  { id: 'db', x: 320, y: 210, width: 180, height: 90, opacity: 1, data: undefined },
]
describe('announced work geometry', () => {
  test('prepares empty space without requiring a node to exist', () => {
    expect(workScopeBounds({ type: 'region', x: 1200, y: -100, width: 250, height: 200 }, nodes, canvas))
      .toEqual({ minX: 1200, minY: -100, maxX: 1450, maxY: 100 })
  })
  test('spans selected boxes at their interpolated positions', () => {
    expect(workScopeBounds({ type: 'nodes', nodeIds: ['api', 'db'] }, nodes, canvas))
      .toEqual({ minX: 100, minY: 120, maxX: 500, maxY: 300 })
    expect(workScopeBounds({ type: 'nodes', nodeIds: ['gone'] }, nodes, canvas)).toBeNull()
  })
  test('whole-diagram scope includes connector and group bounds from the canvas', () => {
    expect(workScopeBounds({ type: 'canvas' }, nodes, canvas)).toEqual(canvas)
  })
})

describe('work label placement', () => {
  // The README poster's layout: a store above a saved review, joined by a
  // vertical "Reopen" connector that crosses the top edge of the work region.
  const column = [
    { id: 'store', x: 840, y: 120, width: 200, height: 80, opacity: 1, data: undefined },
    { id: 'saved', x: 840, y: 440, width: 200, height: 80, opacity: 1, data: undefined },
  ]
  const reopen = [{ id: 'store-saved', from: 'store', to: 'saved', fromAnchor: 'bottom' as const, toAnchor: 'top' as const, style: 'read' }]
  const styles = { read: { label: 'Reopen' } }
  const region = { minX: 790, minY: 390, maxX: 1110, maxY: 580 }
  const size = { width: 280, height: 30 }

  test('a label never sits on a connector that crosses its default spot', () => {
    const obstacles = workLabelObstacles(column, reopen, styles)
    const placed = placeWorkLabel({ region, size, gap: 9, obstacles })
    expect(placed.clear).toBe(true)
    const box = { minX: placed.x, maxX: placed.x + size.width, minY: placed.y, maxY: placed.y + size.height }
    const lineX = 940
    const crossesLine = box.minX < lineX && box.maxX > lineX && box.maxY > 200 && box.minY < 440
    expect(crossesLine).toBe(false)
  })

  test('keeps the conventional spot above the region when it is free', () => {
    const placed = placeWorkLabel({ region, size, gap: 9, obstacles: workLabelObstacles([column[1]], [], styles) })
    expect(placed).toEqual({ placement: { side: 'above', offset: 0 }, x: 790, y: 390 - 9 - 30, clear: true })
  })

  test('slides into the visible canvas and keeps a clear previous choice', () => {
    const view = { minX: 0, minY: 0, maxX: 1000, maxY: 1000 }
    const previous = { side: 'below' as const, offset: -70 }
    const placed = placeWorkLabel({ region, size, gap: 9, view, obstacles: workLabelObstacles([], [], {}), previous })
    expect(placed.placement).toEqual(previous)
    const clamped = placeWorkLabel({ region, size, gap: 9, view, obstacles: workLabelObstacles([], [], {}) })
    expect(clamped.x + size.width).toBeLessThanOrEqual(1000)
  })

  test('stays above the region by sliding beside the connector, and avoids chrome', () => {
    const obstacles = workLabelObstacles(column, reopen, styles)
    const placed = placeWorkLabel({ region, size, gap: 9, obstacles })
    expect(placed.placement.side).toBe('above')
    expect(placed.x + size.width).toBeLessThan(940)
    // Chrome across the band above (a toolbar, say) pushes the label to another side.
    const chrome = { ...obstacles, rects: [...obstacles.rects, { minX: 0, minY: 0, maxX: 2000, maxY: 380 }] }
    const pushed = placeWorkLabel({ region, size, gap: 9, obstacles: chrome })
    expect(pushed.clear).toBe(true)
    expect(pushed.placement.side).not.toBe('above')
  })

  test('ignores boxes that have faded out', () => {
    const faded = [{ ...column[0], opacity: 0 }]
    expect(workLabelObstacles(faded, reopen, styles)).toEqual({ rects: [], paths: [] })
  })
})
