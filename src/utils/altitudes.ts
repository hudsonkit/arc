// Fractal altitudes: a node may name a child diagram by id (`nodeData.child`).
// The host passes the whole set; one style at the viewer root paints all of it.
// A child link is only an id into that set — it carries no style of its own.

import { diagramImpacts, type ClaimDiagram, type ImpactMatch } from './impacted'

export interface AltitudeNode {
  name?: string
  child?: string
  source?: { path?: unknown }
  watches?: unknown
}

export interface AltitudeDiagram extends ClaimDiagram {
  id?: string
  nodeData: Record<string, AltitudeNode | undefined>
}

export type DiagramSet<D extends AltitudeDiagram = AltitudeDiagram> = Record<string, D>

/** One step down: in `diagram`, the node `node` (whose `child`, if any, is the next step). */
export interface AltitudeStep {
  diagram: string
  node: string
}

export interface DeepestClaim {
  /** Root first. Every step but the last is a node whose `child` is the next step's diagram. */
  path: AltitudeStep[]
  /** The claims the last node made against the changed files. */
  matches: ImpactMatch[]
}

/** The child diagram id a node opens into, when the set holds it. */
export function childOf(diagrams: DiagramSet, diagramId: string, nodeId: string): string | undefined {
  const child = diagrams[diagramId]?.nodeData?.[nodeId]?.child
  return typeof child === 'string' && child && diagrams[child] ? child : undefined
}

/**
 * Diagram ids from the root down to the plate a path opens, e.g.
 * `['system', 'auth', 'session']`. Stops at the first step that does not
 * resolve, so a stale path still opens the deepest plate it can.
 */
export function altitudeStack(rootId: string, diagrams: DiagramSet, path: AltitudeStep[] = []): string[] {
  const stack = [rootId]
  for (const step of path) {
    if (step.diagram !== stack[stack.length - 1]) break
    const child = childOf(diagrams, step.diagram, step.node)
    if (!child || stack.includes(child)) break
    stack.push(child)
  }
  return stack
}

/**
 * Walk child links from the root and return the path to the deepest node that
 * claims any of `changedFiles` (via `source.path` or `watches`, the same rules
 * as `arc impacted`). Ancestors on the path need not claim the files
 * themselves — they are the way down. Ties go to the node with more matched
 * files, then to declaration order. Cycles are walked once.
 */
export function deepestClaim(rootId: string, diagrams: DiagramSet, changedFiles: string[]): DeepestClaim | null {
  let best: DeepestClaim | null = null
  const better = (candidate: DeepestClaim) => !best
    || candidate.path.length > best.path.length
    || (candidate.path.length === best.path.length && candidate.matches.length > best.matches.length)

  const visit = (diagramId: string, prefix: AltitudeStep[], seen: Set<string>) => {
    const diagram = diagrams[diagramId]
    if (!diagram) return
    const byNode = new Map<string, ImpactMatch[]>()
    for (const match of diagramImpacts(diagram, changedFiles)) {
      if (!match.node) continue
      const list = byNode.get(match.node) ?? []
      list.push(match)
      byNode.set(match.node, list)
    }
    for (const nodeId of Object.keys(diagram.nodeData ?? {})) {
      const path = [...prefix, { diagram: diagramId, node: nodeId }]
      const matches = byNode.get(nodeId)
      if (matches) {
        const candidate = { path, matches }
        if (better(candidate)) best = candidate
      }
      const child = childOf(diagrams, diagramId, nodeId)
      if (child && !seen.has(child)) visit(child, path, new Set([...seen, child]))
    }
  }

  visit(rootId, [], new Set([rootId]))
  return best
}
