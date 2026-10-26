import { useLayoutEffect, useRef, useState } from 'react'
import { cancelFrame, frame } from 'motion/react'
import type { ArcDiagramData } from '../types/diagram'
import type { LiveNodeMotion } from '../hooks/useLiveDiagramMotion'
import { resolveDiagramFlow } from '../utils/flowAnimation'
import { bindFlowLayerGeometry, renderFlowLayer, type FlowSvgOptions } from '../utils/flowSvg'

export interface LiveFlowLayerProps {
  data: ArcDiagramData
  motionNodes?: Record<string, LiveNodeMotion>
  options?: FlowSvgOptions
  overflowVisible?: boolean
}

function displayedData(data: ArcDiagramData, motionNodes?: Record<string, LiveNodeMotion>): ArcDiagramData {
  if (!motionNodes) return data
  const nodes = { ...data.nodes }
  for (const [id, node] of Object.entries(nodes)) {
    const values = motionNodes[id]
    if (values) nodes[id] = {
      ...node, x: values.x.get(), y: values.y.get(),
      width: values.width.get(), height: values.height.get(),
    }
  }
  return { ...data, nodes }
}

function FlowContents({ data, motionNodes, options }: LiveFlowLayerProps) {
  const root = useRef<SVGGElement>(null)
  // Geometry revisions never change innerHTML, so the browser retains every
  // animateMotion element and its clock. Only the parent structural key remounts.
  const [markup] = useState(() => ({ __html: renderFlowLayer(data, { ...options, geometryBindings: true }) }))
  useLayoutEffect(() => {
    if (!root.current) return
    const sync = bindFlowLayerGeometry(root.current, options)
    let active = true
    const update = () => { if (active) sync(displayedData(data, motionNodes)) }
    const schedule = () => frame.render(update)
    const unsubscribe = Object.values(motionNodes ?? {}).flatMap(values =>
      [values.x, values.y, values.width, values.height].map(value => value.on('change', schedule)))
    // Also covers static/reduced-motion revisions before their first paint.
    update()
    const visibility = () => queueMicrotask(update)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      active = false
      unsubscribe.forEach(stop => stop())
      cancelFrame(update)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [data, motionNodes, options])
  return <g ref={root} dangerouslySetInnerHTML={markup} />
}

/** Flow playback uses stable SVG animation elements. Motion's shared scheduler
 * updates their route alongside node geometry without React frame commits. */
export function LiveFlowLayer({ data, motionNodes, options = {}, overflowVisible = false }: LiveFlowLayerProps) {
  if (!data.flows?.length) return null
  const structure = JSON.stringify({
    flows: data.flows, connectors: data.connectors, styles: data.connectorStyles,
    nodes: Object.keys(data.nodes).sort(), options,
    // A zero-length/missing route has no SVG children; becoming valid requires
    // new markup. Ordinary position and dimension changes are excluded.
    valid: data.flows.map(source => !!resolveDiagramFlow(data, source)),
  })
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox={`0 0 ${data.layout.width} ${data.layout.height}`}
      style={overflowVisible ? { overflow: 'visible' } : undefined} data-arc-flow-layer>
      <FlowContents key={structure} data={data} motionNodes={motionNodes} options={options} />
    </svg>
  )
}
