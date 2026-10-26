import type { ArcCanvasOverlayNode } from '../../components/ArcDiagram'
import type { LiveWorkScope } from '../../types/live'
import type { LiveBounds } from '../../utils/liveMotion'

/** Scope is authored before work; node scopes follow the displayed spring geometry. */
export function workScopeBounds(scope: LiveWorkScope, nodes: ArcCanvasOverlayNode[], canvas: LiveBounds): LiveBounds | null {
  if (scope.type === 'canvas') return canvas
  if (scope.type === 'region') return {
    minX: scope.x, minY: scope.y, maxX: scope.x + scope.width, maxY: scope.y + scope.height,
  }
  const selected = nodes.filter(node => scope.nodeIds.includes(node.id) && node.opacity > 0)
  if (!selected.length) return null
  return {
    minX: Math.min(...selected.map(node => node.x)),
    minY: Math.min(...selected.map(node => node.y)),
    maxX: Math.max(...selected.map(node => node.x + node.width)),
    maxY: Math.max(...selected.map(node => node.y + node.height)),
  }
}
