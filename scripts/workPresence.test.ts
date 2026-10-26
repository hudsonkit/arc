import { describe, expect, test } from 'bun:test'
import { workScopeBounds } from '../src/apps/arc-live/workPresence'

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
