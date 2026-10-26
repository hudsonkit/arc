import type { ArcDiagramData } from '../../types/diagram'
import type { LiveWorkScope } from '../../types/live'
import { NODE_SIZES } from '../../utils/constants'
import { normalizeLiveDiagram } from '../../utils/liveDiagramValidation'
import fixture from './fixtures/motion-test-bench.arc.json'

const compactDiagram = normalizeLiveDiagram(fixture)

function withoutNodes(ids: string[]): ArcDiagramData {
  const omitted = new Set(ids)
  return normalizeLiveDiagram({
    ...compactDiagram,
    nodes: Object.fromEntries(Object.entries(compactDiagram.nodes).filter(([id]) => !omitted.has(id))),
    nodeData: Object.fromEntries(Object.entries(compactDiagram.nodeData).filter(([id]) => !omitted.has(id))),
    connectors: compactDiagram.connectors.filter(connector => !omitted.has(connector.from) && !omitted.has(connector.to)),
  })
}

function moveNode(diagram: ArcDiagramData, id: string, x: number, y: number, width = diagram.layout.width): ArcDiagramData {
  return normalizeLiveDiagram({
    ...diagram,
    layout: { ...diagram.layout, width },
    nodes: { ...diagram.nodes, [id]: { ...diagram.nodes[id], x, y } },
  })
}

const cacheAligned = moveNode(compactDiagram, 'cache', 530, 70)
const workerCloser = moveNode(cacheAligned, 'worker2', 530, 590)
const searchExtended = moveNode(workerCloser, 'search', 1850, 430, 2070)

function targetRegion(id: string, from = compactDiagram, to = from): LiveWorkScope {
  const first = from.nodes[id], last = to.nodes[id]
  const firstSize = NODE_SIZES[first.size], lastSize = NODE_SIZES[last.size]
  const x = Math.min(first.x, last.x) - 28
  const y = Math.min(first.y, last.y) - 28
  return {
    type: 'region', x, y,
    width: Math.max(first.x + (first.width ?? firstSize.width), last.x + (last.width ?? lastSize.width)) + 28 - x,
    height: Math.max(first.y + (first.height ?? firstSize.height), last.y + (last.height ?? lastSize.height)) + 28 - y,
  }
}

export type TestBenchStep = { label: string; diagram: ArcDiagramData; scope: LiveWorkScope }

// Authored snapshots keep unrelated boxes still. Each document is detached so
// playback and restart can reuse the sequence without sharing mutable state.
export const testBenchSteps: readonly TestBenchStep[] = [
  { label: 'Start with the core architecture', diagram: withoutNodes(['search', 'audit', 'reports']), scope: { type: 'canvas' } },
  { label: 'Add a search index for recent events', diagram: withoutNodes(['audit', 'reports']), scope: targetRegion('search') },
  { label: 'Add an audit trail from object storage', diagram: withoutNodes(['reports']), scope: targetRegion('audit') },
  { label: 'Turn indexed events into reports', diagram: normalizeLiveDiagram(compactDiagram), scope: targetRegion('reports') },
  { label: 'Align the cache above the data services', diagram: cacheAligned, scope: { type: 'nodes', nodeIds: ['cache'] } },
  { label: 'Bring Worker 02 closer to the processing lane', diagram: workerCloser, scope: { type: 'nodes', nodeIds: ['worker2'] } },
  { label: 'Extend the search lane to test camera framing', diagram: searchExtended, scope: targetRegion('search', workerCloser, searchExtended) },
  { label: 'Return to the compact architecture', diagram: normalizeLiveDiagram(compactDiagram), scope: { type: 'canvas' } },
]
