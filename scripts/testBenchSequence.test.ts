import { describe, expect, test } from 'bun:test'
import { testBenchSteps } from '../src/apps/arc-live/testBenchSequence'
import fixture from '../src/apps/arc-live/fixtures/motion-test-bench.arc.json'
import { NODE_SIZES } from '../src/utils/constants'
import { normalizeLiveDiagram } from '../src/utils/liveDiagramValidation'
import { followCamera, liveDiagramBounds } from '../src/utils/liveMotion'

const compactDiagram = normalizeLiveDiagram(fixture)

describe('motion test bench sequence', () => {
  test('provides eight valid snapshots with stable document identity and metadata', () => {
    expect(testBenchSteps).toHaveLength(8)
    expect(new Set(testBenchSteps.map(step => step.label)).size).toBe(8)
    expect(testBenchSteps.map(step => Object.keys(step.diagram.nodes).length)).toEqual([12, 13, 14, 15, 15, 15, 15, 15])
    expect(testBenchSteps.map(step => step.diagram.connectors.length)).toEqual([14, 15, 16, 17, 17, 17, 17, 17])
    for (const { diagram } of testBenchSteps) {
      expect(normalizeLiveDiagram(diagram)).toEqual(diagram)
      expect(diagram.id).toBe(compactDiagram.id)
      expect(diagram.connectorStyles).toEqual(compactDiagram.connectorStyles)
      expect(Object.keys(diagram.nodeData).sort()).toEqual(Object.keys(diagram.nodes).sort())
      for (const id of Object.keys(diagram.nodes)) expect(diagram.nodeData[id]).toEqual(compactDiagram.nodeData[id])
      expect(diagram.connectors).toEqual(compactDiagram.connectors.filter(connector => diagram.nodes[connector.from] && diagram.nodes[connector.to]))
    }
  })

  test('adds one node and its connection at a time without moving existing boxes', () => {
    for (const [index, addedId] of ['search', 'audit', 'reports'].entries()) {
      const before = testBenchSteps[index].diagram
      const after = testBenchSteps[index + 1].diagram
      expect(Object.keys(after.nodes).filter(id => !before.nodes[id])).toEqual([addedId])
      expect(Object.keys(before.nodes).filter(id => !after.nodes[id])).toEqual([])
      for (const id of Object.keys(before.nodes)) expect(after.nodes[id]).toEqual(before.nodes[id])
      expect(after.connectors.filter(connector => !before.connectors.some(previous => previous.id === connector.id))).toHaveLength(1)
      expect(after.layout).toEqual(before.layout)
    }
  })

  test('moves exactly the named node in each movement step', () => {
    for (const [index, movedId] of ['cache', 'worker2', 'search'].entries()) {
      const before = testBenchSteps[index + 3].diagram
      const after = testBenchSteps[index + 4].diagram
      expect(Object.keys(after.nodes).sort()).toEqual(Object.keys(before.nodes).sort())
      const changed = Object.keys(after.nodes).filter(id => JSON.stringify(after.nodes[id]) !== JSON.stringify(before.nodes[id]))
      expect(changed).toEqual([movedId])
      expect(after.nodeData).toEqual(before.nodeData)
      expect(after.connectors).toEqual(before.connectors)
    }
  })

  test('keeps boxes within the authored canvas without overlap at every stop', () => {
    for (const { diagram } of testBenchSteps) {
      const rectangles = Object.entries(diagram.nodes).map(([id, node]) => ({ id, ...NODE_SIZES[node.size], ...node }))
      for (const node of rectangles) {
        expect(node.x).toBeGreaterThanOrEqual(0)
        expect(node.y).toBeGreaterThanOrEqual(0)
        expect(node.x + node.width).toBeLessThanOrEqual(diagram.layout.width)
        expect(node.y + node.height).toBeLessThanOrEqual(diagram.layout.height)
      }
      const overlaps: string[] = []
      for (let first = 0; first < rectangles.length; first++) {
        for (const other of rectangles.slice(first + 1)) {
          const node = rectangles[first]
          if (node.x < other.x + other.width && node.x + node.width > other.x && node.y < other.y + other.height && node.y + node.height > other.y) {
            overlaps.push(`${node.id}/${other.id}`)
          }
        }
      }
      expect(overlaps).toEqual([])
    }
  })

  test('extends far enough to exercise camera zoom on a wide viewport', () => {
    const before = liveDiagramBounds(testBenchSteps[5].diagram, false)
    const after = liveDiagramBounds(testBenchSteps[6].diagram, false)
    const camera = { x: 0, y: 0, zoom: 1 }
    const initial = followCamera(before, 1833, 900, camera, 80, 1, true)
    const expanded = followCamera(after, 1833, 900, initial, 80, 1, true)
    expect(initial.zoom).toBe(1)
    expect(expanded.zoom).toBeLessThan(0.9)
    expect(after.maxX - after.minX).toBe(1960)
  })

  test('restores the exact compact fixture and keeps snapshots independent', () => {
    expect(testBenchSteps[7].diagram).toEqual(compactDiagram)
    for (let index = 1; index < testBenchSteps.length; index++) {
      const before = testBenchSteps[index - 1].diagram
      const after = testBenchSteps[index].diagram
      expect(after).not.toBe(before)
      expect(after.nodes.api).not.toBe(before.nodes.api)
      expect(after.nodeData.api).not.toBe(before.nodeData.api)
      expect(after.connectors[0]).not.toBe(before.connectors[0])
    }
  })

  test('announces additions in future regions and moves on their existing boxes', () => {
    for (const [index, id] of ['search', 'audit', 'reports'].entries()) {
      const step = testBenchSteps[index + 1]
      expect(testBenchSteps[index].diagram.nodes[id]).toBeUndefined()
      expect(step.scope.type).toBe('region')
      if (step.scope.type !== 'region') throw new Error('Addition needs a region')
      const node = step.diagram.nodes[id]
      expect(step.scope.x).toBeLessThan(node.x)
      expect(step.scope.y).toBeLessThan(node.y)
      expect(step.scope.x + step.scope.width).toBeGreaterThan(node.x + NODE_SIZES[node.size].width)
      expect(step.scope.y + step.scope.height).toBeGreaterThan(node.y + NODE_SIZES[node.size].height)
    }
    expect(testBenchSteps[4].scope).toEqual({ type: 'nodes', nodeIds: ['cache'] })
    expect(testBenchSteps[5].scope).toEqual({ type: 'nodes', nodeIds: ['worker2'] })
    const extended = testBenchSteps[6].scope
    expect(extended.type).toBe('region')
    if (extended.type !== 'region') throw new Error('Extended move needs a region')
    expect(extended.x).toBeLessThan(testBenchSteps[5].diagram.nodes.search.x)
    expect(extended.x + extended.width).toBeGreaterThan(testBenchSteps[6].diagram.nodes.search.x + 160)
    expect(testBenchSteps[7].scope).toEqual({ type: 'canvas' })
  })
})
