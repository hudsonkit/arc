import { useCallback, useRef } from 'react'
import { resolveNodeColor } from '../../utils/nodeKinds'

// Colors for mini map node representation
const nodeColors = {
  violet: '#8b5cf6',
  emerald: '#34d399',
  blue: '#60a5fa',
  amber: '#fbbf24',
  zinc: '#71717a',
  sky: '#38bdf8',
  rose: '#fb7185',
  orange: '#fb923c',
}

export default function MiniMap({
  diagram,
  viewportBounds, // { x, y, width, height } in canvas coords
  onViewportChange, // callback when user clicks/drags minimap
  width = 160,
  height = 100,
}) {
  const mapRef = useRef(null)

  // The camera can show space outside the layout. The map has to include that
  // space, or the viewport rectangle is clipped and only a corner of it remains.
  const layout = diagram.layout
  const world = { minX: 0, minY: 0, maxX: layout.width, maxY: layout.height }
  const include = (x, y, w, h) => {
    if (![x, y, w, h].every(Number.isFinite)) return
    world.minX = Math.min(world.minX, x)
    world.minY = Math.min(world.minY, y)
    world.maxX = Math.max(world.maxX, x + w)
    world.maxY = Math.max(world.maxY, y + h)
  }
  for (const [nodeId, node] of Object.entries(diagram.nodes || {}) as [string, import('../../types/diagram').NodePosition][]) {
    if (!diagram.nodeData?.[nodeId]) continue
    const size = node.size || 'm'
    include(node.x, node.y, node.width || (size === 'l' ? 210 : size === 's' ? 95 : size === 'xs' ? 80 : 145), node.height || (size === 'l' ? 85 : size === 's' ? 42 : size === 'xs' ? 36 : 68))
  }
  for (const group of diagram.groups || []) include(group.x, group.y, group.width, group.height)
  for (const image of diagram.images || []) include(image.x, image.y, image.width, image.height)
  if (viewportBounds) include(viewportBounds.x, viewportBounds.y, viewportBounds.width, viewportBounds.height)
  const worldW = Math.max(1, world.maxX - world.minX)
  const worldH = Math.max(1, world.maxY - world.minY)

  const scale = Math.min(width / worldW, height / worldH)
  const mapWidth = worldW * scale
  const mapHeight = worldH * scale

  // The parent pans so this canvas point lands in the middle of the view.
  const handleClick = useCallback((e) => {
    if (!mapRef.current || !onViewportChange) return
    const svg = mapRef.current.querySelector('svg')
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const canvasX = world.minX + ((e.clientX - rect.left) / rect.width) * worldW
    const canvasY = world.minY + ((e.clientY - rect.top) / rect.height) * worldH
    onViewportChange({ x: canvasX, y: canvasY })
  }, [onViewportChange, world.minX, world.minY, worldW, worldH])

  return (
    <div
      ref={mapRef}
      className="arc-canvas-minimap"
      style={{ width: mapWidth + 8, height: mapHeight + 8 }}
      onClick={handleClick}
      role="presentation"
      title="Click to pan the viewport"
    >
      <svg
        width={mapWidth}
        height={mapHeight}
        viewBox={`${world.minX} ${world.minY} ${worldW} ${worldH}`}
      >
        {/* Groups */}
        {(diagram.groups || []).map((group) => (
          <rect
            key={group.id}
            x={group.x}
            y={group.y}
            width={group.width}
            height={group.height}
            fill={nodeColors[group.color] || nodeColors.zinc}
            opacity={0.2}
            rx={2}
          />
        ))}

        {/* Images */}
        {(diagram.images || []).map((image) => (
          <rect
            key={image.id}
            x={image.x}
            y={image.y}
            width={image.width}
            height={image.height}
            fill="#9ca3af"
            opacity={0.3}
          />
        ))}

        {/* Connectors */}
        {diagram.connectors.map((connector, i) => {
          const fromNode = diagram.nodes[connector.from]
          const toNode = diagram.nodes[connector.to]
          if (!fromNode || !toNode) return null

          // Simple center-to-center lines for minimap
          const fromX = fromNode.x + 50
          const fromY = fromNode.y + 25
          const toX = toNode.x + 50
          const toY = toNode.y + 25

          return (
            <line
              key={i}
              x1={fromX}
              y1={fromY}
              x2={toX}
              y2={toY}
              stroke="#9ca3af"
              strokeWidth={2 / scale}
              opacity={0.5}
            />
          )
        })}

        {/* Nodes */}
        {Object.entries(diagram.nodes as Record<string, any>).map(([nodeId, node]) => {
          const data = diagram.nodeData[nodeId]
          if (!data) return null
          const color = nodeColors[resolveNodeColor(data)] || nodeColors.zinc
          const size = node.size || 'm'
          const w = size === 'l' ? 210 : size === 's' ? 95 : size === 'xs' ? 80 : 145
          const h = size === 'l' ? 85 : size === 's' ? 42 : size === 'xs' ? 36 : 68

          return (
            <rect
              key={nodeId}
              x={node.x}
              y={node.y}
              width={node.width || w}
              height={node.height || h}
              fill={color}
              rx={2}
            />
          )
        })}

        {/* The real camera window. It is centred on the drawing when the view is. */}
        {viewportBounds && (
          <rect
            x={viewportBounds.x}
            y={viewportBounds.y}
            width={viewportBounds.width}
            height={viewportBounds.height}
            fill="none"
            stroke="var(--arc-acc, #3b82f6)"
            strokeWidth={1.5 / scale}
            strokeDasharray={`${4 / scale} ${2 / scale}`}
          />
        )}
      </svg>
    </div>
  )
}
