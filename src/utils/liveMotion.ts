import type { ArcDiagramData, NodePosition } from '../components/ArcDiagram'
import { NODE_SIZES } from './constants'
import { anchorOnNode, connectorGeometry, getContentBounds } from './diagramHelpers'

export interface LiveCamera { x: number; y: number; zoom: number }
export interface LiveBounds { minX: number; minY: number; maxX: number; maxY: number }

type Geometry = 'x' | 'y' | 'width' | 'height' | 'z' | 'isoHeight' | 'isoDepth'
const GEOMETRY: Geometry[] = ['x', 'y', 'width', 'height', 'z', 'isoHeight', 'isoDepth']

function dimensions(node: NodePosition): NodePosition {
  return { ...NODE_SIZES[node.size], ...node }
}

/** Geometry identity is independent of metadata and map/array insertion order.
 * A move within the same overall bounds still counts as a new drawing; a status
 * revision with identical geometry must leave the reader's manual camera alone. */
export function diagramGeometryKey(data: ArcDiagramData): string {
  const nodes = Object.entries(data.nodes).sort(([a], [b]) => a.localeCompare(b)).map(([id, node]) => {
    const geometry = dimensions(node)
    return [id, ...GEOMETRY.map(key => geometry[key] ?? null)]
  })
  const groups = (data.groups ?? []).map(group => [group.id, group.type, group.x, group.y, group.width, group.height])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
  const connectors = data.connectors.map(connector => JSON.stringify([
    connector.id ?? null, connector.from, connector.to, connector.fromAnchor, connector.toAnchor,
    connector.curve ?? 'natural', connector.curveDepth ?? 40,
  ])).sort()
  return JSON.stringify([data.layout.width, data.layout.height, nodes, groups, connectors])
}

/** Include curved/stepped connector excursions, not only boxes. Bezier control
 * points form a conservative hull, so even strongly bowed routes remain framed.
 * Automatic framing fits actual content, retaining layout as an empty-state
 * fallback; legacy following also keeps the authored canvas rectangle in view. */
export function liveDiagramBounds(data: ArcDiagramData, includeLayout = true): LiveBounds {
  const content = getContentBounds(data.nodes, data.groups)
  const bounds = !includeLayout && content ? { ...content } : {
    minX: Math.min(0, content?.minX ?? 0), minY: Math.min(0, content?.minY ?? 0),
    maxX: Math.max(data.layout.width, content?.maxX ?? 0), maxY: Math.max(data.layout.height, content?.maxY ?? 0),
  }
  for (const connector of data.connectors) {
    const from = data.nodes[connector.from], to = data.nodes[connector.to]
    if (!from || !to) continue
    const start = anchorOnNode({ ...NODE_SIZES[from.size], ...from }, connector.fromAnchor)
    const end = anchorOnNode({ ...NODE_SIZES[to.size], ...to }, connector.toAnchor)
    const route = connectorGeometry(start, end, connector.fromAnchor, connector.toAnchor, connector.curve, connector.curveDepth)
    for (const segment of route.segments) {
      const points = [segment.from, segment.to]
      if (segment.kind === 'cubic') points.push(segment.cp1, segment.cp2)
      if (segment.kind === 'quadratic') points.push(segment.control)
      for (const point of points) {
        bounds.minX = Math.min(bounds.minX, point.x - 24)
        bounds.minY = Math.min(bounds.minY, point.y - 24)
        bounds.maxX = Math.max(bounds.maxX, point.x + 24)
        bounds.maxY = Math.max(bounds.maxY, point.y + 24)
      }
    }
  }
  return bounds
}

/** Keep comfortable framing stable through routine revisions. Only pull back
 * when content escapes; explicitly resuming follow can refit smaller content. */
export function followCamera(bounds: LiveBounds, width: number, height: number, current: LiveCamera, padding: number, maxZoom: number, force = false): LiveCamera {
  if (width <= 0 || height <= 0) return current
  const inset = Math.min(Math.max(0, padding), width * 0.4, height * 0.4)
  if (!force && bounds.minX * current.zoom + current.x >= inset - 1
    && bounds.minY * current.zoom + current.y >= inset - 1
    && bounds.maxX * current.zoom + current.x <= width - inset + 1
    && bounds.maxY * current.zoom + current.y <= height - inset + 1) return current
  const fit = Math.max(0.01, Math.min((width - inset * 2) / Math.max(1, bounds.maxX - bounds.minX), (height - inset * 2) / Math.max(1, bounds.maxY - bounds.minY), maxZoom))
  const zoom = force ? fit : Math.min(fit, current.zoom)
  return { zoom, x: width / 2 - (bounds.minX + bounds.maxX) / 2 * zoom, y: height / 2 - (bounds.minY + bounds.maxY) / 2 * zoom }
}
