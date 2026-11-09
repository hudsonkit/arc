import { PRINT_COLORS, PRINT_DOTS } from './materials'
/**
 * ArcDiagram - Lightweight isometric diagram renderer
 * Core isometric component, optimized for embedding.
 */
import React, { useState, useEffect, useId, useMemo } from 'react'
import { isoToScreen, isoBox, isoTopFaceMatrix } from '../utils/isometric'
import { isoWireBox } from '../utils/isoWire'
import { getIsoStyle } from '../utils/isoStyles'
import TechnicalDefs from '../components/technical/TechnicalDefs'
import TechnicalBackdrop from '../components/technical/TechnicalBackdrop'
import TechnicalPlate from '../components/technical/TechnicalPlate'
import { TechnicalBox, TechnicalCallout } from '../components/technical/TechnicalNode'
import type { DiagramConfig, DiagramNode, PlayerOptions } from './types'

// Typography
const MONO_FONT = '"JetBrains Mono", "Fira Code", "SF Mono", Consolas, monospace'

// Color palettes
const DARK_COLORS: Record<string, { top: string; side: string; front: string }> = {
  blue: { top: '#3b82f6', side: '#2563eb', front: '#1d4ed8' },
  violet: { top: '#8b5cf6', side: '#7c3aed', front: '#6d28d9' },
  cyan: { top: '#06b6d4', side: '#0891b2', front: '#0e7490' },
  emerald: { top: '#10b981', side: '#059669', front: '#047857' },
  amber: { top: '#f59e0b', side: '#d97706', front: '#b45309' },
  rose: { top: '#f43f5e', side: '#e11d48', front: '#be123c' },
  slate: { top: '#475569', side: '#334155', front: '#1e293b' },
}

const LIGHT_COLORS: Record<string, { top: string; side: string; front: string }> = {
  blue: { top: '#93c5fd', side: '#60a5fa', front: '#3b82f6' },
  violet: { top: '#c4b5fd', side: '#a78bfa', front: '#8b5cf6' },
  cyan: { top: '#67e8f9', side: '#22d3ee', front: '#06b6d4' },
  emerald: { top: '#6ee7b7', side: '#34d399', front: '#10b981' },
  amber: { top: '#fcd34d', side: '#fbbf24', front: '#f59e0b' },
  rose: { top: '#fda4af', side: '#fb7185', front: '#f43f5e' },
  slate: { top: '#e2e8f0', side: '#cbd5e1', front: '#94a3b8' },
}

// Interpolate colors for rounded corner shading
function interpolateColor(darkColor: string, lightColor: string, intensity: number): string {
  const parseHex = (hex: string) => {
    const h = hex.replace('#', '')
    return {
      r: parseInt(h.substring(0, 2), 16),
      g: parseInt(h.substring(2, 4), 16),
      b: parseInt(h.substring(4, 6), 16),
    }
  }
  const dark = parseHex(darkColor)
  const light = parseHex(lightColor)
  const r = Math.round(dark.r + (light.r - dark.r) * intensity)
  const g = Math.round(dark.g + (light.g - dark.g) * intensity)
  const b = Math.round(dark.b + (light.b - dark.b) * intensity)
  return `rgb(${r},${g},${b})`
}

// Isometric text on top face
function IsoText({ x, y, z, children, fontSize = 8, color = '#1e293b', shadow }: {
  x: number; y: number; z: number; children: string; fontSize?: number; color?: string; shadow?: string
}) {
  const pos = isoToScreen(x, y, z)
  return (
    <g transform={`translate(${pos.screenX}, ${pos.screenY})`} filter={shadow}>
      <g transform={`matrix(${isoTopFaceMatrix()})`}>
        <text x={0} y={0} textAnchor="middle" fill={color} fontSize={fontSize}
          fontWeight={600} fontFamily={MONO_FONT}
          style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {children}
        </text>
      </g>
    </g>
  )
}

// Floor plane
function FloorPlane({ width, depth, elevation, color, opacity, borderColor, theme, isGround }: {
  width: number; depth: number; elevation: number; color: string; opacity: number;
  borderColor?: string; theme: 'dark' | 'light'; isGround?: boolean
}) {
  const thickness = isGround ? 8 : 2
  const box = isoBox(width, depth, thickness, 0, 0)
  const pos = isoToScreen(0, 0, elevation)

  return (
    <g transform={`translate(${pos.screenX}, ${pos.screenY})`}>
      {isGround && (
        <g transform="translate(4, 4)" opacity={0.2}>
          <path d={box.top} fill="#000" />
        </g>
      )}
      <path d={box.top} fill={color} opacity={opacity} />
      {isGround && (
        <>
          <path d={box.left} fill={theme === 'dark' ? '#0f172a' : '#cbd5e1'} opacity={0.8} />
          <path d={box.right} fill={theme === 'dark' ? '#1e293b' : '#94a3b8'} opacity={0.8} />
        </>
      )}
      <path d={box.top} fill="none"
        stroke={borderColor || (theme === 'dark' ? '#475569' : '#94a3b8')}
        strokeWidth={isGround ? 1.5 : 0.75} opacity={isGround ? 1 : 0.6} />
    </g>
  )
}

export interface ArcDiagramProps {
  config: DiagramConfig
  options?: PlayerOptions
  className?: string
  style?: React.CSSProperties
  /** Fired when a node box is clicked (drill-in). */
  onNodeClick?: (node: DiagramNode, meta: { tier: number; index: number }) => void
  /** Fired when a layer floor is clicked (solo). */
  onLayerClick?: (tier: number) => void
}

export default function ArcDiagram({ config, options = {}, className, style, onNodeClick, onLayerClick }: ArcDiagramProps) {
  const { interactive = true, animate = true, showLabels = true, expandOnHover = true } = options
  const { theme, canvas, origin, tiers, floorSize, nodes, cornerRadius = 0 } = config

  // Technical styles ('blueprint', 'cyanotype') swap the shaded solids for
  // line art on paper; 'solid' keeps the original renderer.
  const techStyle = getIsoStyle(config.style)
  const technical = techStyle.technical
  const uid = useId().replace(/:/g, '')

  const print = !technical && config.material === 'retro-print'
  const colors = print ? PRINT_COLORS : theme === 'dark' ? DARK_COLORS : LIGHT_COLORS
  const bgColor = technical ? techStyle.paper.to : print ? (theme === 'dark' ? '#202624' : '#f4efe6') : theme === 'dark' ? '#0f172a' : '#fafafa'
  const textColor = technical ? techStyle.ink.text : print ? '#202a29' : theme === 'dark' ? '#e2e8f0' : '#1e293b'
  const labelColor = technical ? techStyle.ink.muted : print ? (theme === 'dark' ? '#c5c4b7' : '#505b56') : theme === 'dark' ? '#64748b' : '#94a3b8'

  // Component numbers for the index table and the on-box tags, in a stable
  // bottom-tier-first reading order.
  const componentNumbers = useMemo(() => {
    const ordered = nodes
      .map((node, i) => ({ node, i }))
      .sort((a, b) => (a.node.tier - b.node.tier) || (a.node.y - b.node.y) || (a.node.x - b.node.x))
    const map = new Map<number, number>()
    ordered.forEach(({ i }, rank) => map.set(i, rank + 1))
    return map
  }, [nodes])

  // The packaged renderer draws on a fixed canvas, so the plate frames the
  // sheet itself rather than the drawing's extent.
  const plate = { minX: 16, minY: 16, maxX: canvas.width - 16, maxY: canvas.height - 16 }


  // Entrance animation
  // Without animation every tier starts visible, so a server render
  // (renderToStaticMarkup, where effects never run) still draws the scene.
  const [animatedTiers, setAnimatedTiers] = useState<Set<number>>(
    () => (animate ? new Set() : new Set(tiers.map((_, i) => i))),
  )

  useEffect(() => {
    if (animate) {
      setAnimatedTiers(new Set())
      tiers.forEach((_, index) => {
        setTimeout(() => {
          setAnimatedTiers(prev => new Set([...prev, index]))
        }, index * 150 + 100)
      })
    } else {
      setAnimatedTiers(new Set(tiers.map((_, i) => i)))
    }
  }, [config.id, animate, tiers.length])

  // Hover state
  const [hoveredTier, setHoveredTier] = useState<number | null>(null)
  // Click-driven state: soloed layer + selected node (drill-in / focus)
  const [soloTier, setSoloTier] = useState<number | null>(null)
  const [selected, setSelected] = useState<{ tier: number; index: number } | null>(null)

  // Sort nodes back-to-front (painter's algorithm)
  const sortedNodes = [...nodes].sort((a, b) => {
    const aElev = tiers[a.tier]?.elevation || 0
    const bElev = tiers[b.tier]?.elevation || 0
    if (aElev !== bElev) return aElev - bElev
    const aDepth = (a.x + a.width) + (a.y + a.depth)
    const bDepth = (b.x + b.width) + (b.y + b.depth)
    return bDepth - aDepth
  })

  return (
    <div className={className} style={{ display: 'inline-block', ...style }}>
      <svg width={canvas.width} height={canvas.height} style={{ backgroundColor: bgColor }}
        onClick={() => { if (interactive) { setSelected(null); setSoloTier(null) } }}>
        <defs>
          {print && <pattern id={`print-${config.id}`} width="64" height="64" patternUnits="userSpaceOnUse">
            {PRINT_DOTS.map((dot, i) => <circle key={i} cx={dot.x} cy={dot.y} r={dot.r} fill="#26362e" opacity={0.32} />)}
          </pattern>}
          <pattern id={`grid-${config.id}`} width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="12" cy="12" r="0.5" fill={theme === 'dark' ? '#1e293b' : '#e2e8f0'} />
          </pattern>
          <filter id={`glow-${config.id}`} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="4" stdDeviation="8"
              floodColor={theme === 'dark' ? '#60a5fa' : '#3b82f6'} floodOpacity="0.3" />
          </filter>
          {/* Ambient depth behind the scene */}
          <radialGradient id={`bg-${config.id}`} cx="48%" cy="34%" r="82%">
            <stop offset="0%" stopColor={theme === 'dark' ? '#16203a' : '#ffffff'} />
            <stop offset="55%" stopColor={theme === 'dark' ? '#0e1526' : '#f2f5f9'} />
            <stop offset="100%" stopColor={theme === 'dark' ? '#080d18' : '#e7ecf2'} />
          </radialGradient>
          {/* Soft contact shadow for grounding boxes */}
          <filter id={`contact-${config.id}`} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
          {/* Material: top-face sheen (light from above-back) + side-face falloff */}
          <linearGradient id={`sheen-${config.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.18" />
            <stop offset="55%" stopColor="#ffffff" stopOpacity="0.04" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`shade-${config.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#000000" stopOpacity="0" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.24" />
          </linearGradient>
          {/* Soft legibility shadow for labels (replaces the hard outline) */}
          <filter id={`label-${config.id}`} x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="0.5" stdDeviation="0.7" floodColor="#000000" floodOpacity="0.7" />
          </filter>
        </defs>

        {technical ? (
          <>
            <TechnicalDefs uid={uid} style={techStyle} />
            <TechnicalBackdrop
              style={techStyle}
              rect={{ x: 0, y: 0, width: canvas.width, height: canvas.height }}
              className=""
            />
          </>
        ) : (
          <>
            <rect width="100%" height="100%" fill={print ? bgColor : `url(#bg-${config.id})`} />
            <rect width="100%" height="100%" fill={`url(#grid-${config.id})`} opacity="0.5" />
          </>
        )}


        <g transform={`translate(${origin.x}, ${origin.y})`}>
          {tiers.map((tier, tierIndex) => {
            const tierNodes = sortedNodes.filter(n => n.tier === tierIndex)
            const hasEntered = animatedTiers.has(tierIndex)

            // A layer is "active" (lifted out) when soloed, or hovered while nothing is soloed/selected.
            const isActive = interactive && (soloTier === tierIndex || (soloTier === null && selected === null && hoveredTier === tierIndex))
            const anyFocus = interactive && (soloTier !== null || hoveredTier !== null || selected !== null)
            const holdsSelected = selected?.tier === tierIndex
            const dimmed = anyFocus && !isActive && !holdsSelected

            const entranceOffset = hasEntered ? 0 : 60
            const entranceOpacity = hasEntered ? 1 : 0
            const lift = isActive && expandOnHover ? { x: 10, y: -34 } : { x: 0, y: 0 } // expand-out on hover/solo
            const scale = isActive ? 1.03 : 1

            const floorCenter = isoToScreen(floorSize.width / 2, floorSize.depth / 2, tier.elevation)
            const off = tier.offset || { x: 0, y: 0 } // projected per-layer offset (staggered layers)

            return (
              <g key={tierIndex}
                data-tier={tierIndex}
                onMouseEnter={() => interactive && setHoveredTier(tierIndex)}
                onMouseLeave={() => interactive && setHoveredTier(null)}
                onClick={(e) => {
                  if (!interactive) return
                  e.stopPropagation()
                  setSelected(null)
                  setSoloTier(prev => (prev === tierIndex ? null : tierIndex))
                  onLayerClick?.(tierIndex)
                }}
                style={{
                  transform: `translate(${off.x + lift.x}px, ${off.y + lift.y}px) translate(${floorCenter.screenX}px, ${floorCenter.screenY + entranceOffset}px) scale(${scale}) translate(${-floorCenter.screenX}px, ${-floorCenter.screenY}px)`,
                  transition: 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.4s ease-out',
                  opacity: entranceOpacity * (dimmed ? 0.35 : 1),
                  filter: isActive ? `url(#glow-${config.id})` : 'none',
                  cursor: interactive ? 'pointer' : 'default',
                }}>

                {/* Floor */}
                {technical ? (
                  <TechnicalFloor
                    width={floorSize.width}
                    depth={floorSize.depth}
                    elevation={tierIndex === 0 ? -2 : tier.elevation}
                    ink={tierIndex === 0 ? techStyle.ink.line : techStyle.ink.hidden}
                    isGround={tierIndex === 0}
                  />
                ) : (
                  <FloorPlane
                    width={floorSize.width} depth={floorSize.depth}
                    elevation={tierIndex === 0 ? -2 : tier.elevation}
                    color={tier.floorColor || (theme === 'dark' ? '#0f172a' : '#f8fafc')}
                    opacity={tier.floorOpacity || (tierIndex === 0 ? 0.95 : 0.5)}
                    borderColor={tier.borderColor} theme={theme} isGround={tierIndex === 0}
                  />
                )}

                {/* Nodes — technical styles draw every box, then every callout */}
                {technical && tierNodes.map((node, i) => {
                  const nodeElevation = tier.elevation + 5
                  const pos = isoToScreen(node.x, node.y, nodeElevation)
                  const wire = isoWireBox(node.width, node.depth, node.height, pos.screenX, pos.screenY)
                  const isSelected = selected?.tier === tierIndex && selected?.index === i
                  const nodeDim = interactive && selected !== null && !isSelected
                  return (
                    <TechnicalBox
                      key={`tech-${i}`}
                      uid={uid}
                      style={techStyle}
                      box={wire}
                      color={node.color}
                      tag={componentNumbers.get(nodes.indexOf(node))}
                      selected={isSelected}
                      opacity={(node.opacity ?? 1) * (nodeDim ? 0.3 : 1)}
                      onClick={interactive ? () => {
                        setSoloTier(null)
                        setSelected(prev => (prev && prev.tier === tierIndex && prev.index === i ? null : { tier: tierIndex, index: i }))
                        onNodeClick?.(node, { tier: tierIndex, index: i })
                        if (node.link) { try { window.open(node.link, '_blank') } catch { /* noop */ } }
                      } : undefined}
                    />
                  )
                })}

                {technical && showLabels && tierNodes.map((node, i) => {
                  const nodeElevation = tier.elevation + 5
                  const pos = isoToScreen(node.x, node.y, nodeElevation)
                  const wire = isoWireBox(node.width, node.depth, node.height, pos.screenX, pos.screenY)
                  const isSelected = selected?.tier === tierIndex && selected?.index === i
                  const nodeDim = interactive && selected !== null && !isSelected
                  return (
                    <TechnicalCallout
                      key={`tech-label-${i}`}
                      style={techStyle}
                      box={wire}
                      name={node.label}
                      selected={isSelected}
                      opacity={nodeDim ? 0.3 : 1}
                    />
                  )
                })}

                {!technical && tierNodes.map((node, i) => {
                  const nodeElevation = tier.elevation + 5
                  const pos = isoToScreen(node.x, node.y, nodeElevation)
                  const box = isoBox(node.width, node.depth, node.height, pos.screenX, pos.screenY, cornerRadius)
                  const nodeColors = colors[node.color] || colors.slate
                  const isSelected = selected?.tier === tierIndex && selected?.index === i
                  const nodeDim = interactive && selected !== null && !isSelected
                  const sp = isoToScreen(node.x - 3, node.y - 3, tier.elevation)
                  const shadowTop = isoBox(node.width + 6, node.depth + 6, 0, sp.screenX, sp.screenY, cornerRadius).top

                  return (
                    <g key={i}
                      data-node={`${tierIndex}-${i}`}
                      opacity={(node.opacity ?? 1) * (nodeDim ? 0.3 : 1)}
                      onClick={interactive ? (e) => {
                        e.stopPropagation()
                        setSoloTier(null)
                        setSelected(prev => (prev && prev.tier === tierIndex && prev.index === i ? null : { tier: tierIndex, index: i }))
                        onNodeClick?.(node, { tier: tierIndex, index: i })
                        if (node.link) { try { window.open(node.link, '_blank') } catch { /* noop */ } }
                      } : undefined}
                      style={{ cursor: interactive ? 'pointer' : 'default', transition: 'opacity 0.3s ease-out' }}>
                      {/* Soft contact shadow grounding the box on its floor */}
                      <path d={shadowTop} fill="#000000" opacity={0.3} filter={`url(#contact-${config.id})`} />
                      {/* Corners and faces */}
                      {box.cornerBackRight?.map((seg: { path: string; intensity: number }, idx: number) => (
                        <path key={`cbr-${idx}`} d={seg.path}
                          fill={interpolateColor(nodeColors.front, nodeColors.side, seg.intensity)} />
                      ))}
                      {box.cornerBackLeft?.map((seg: { path: string; intensity: number }, idx: number) => (
                        <path key={`cbl-${idx}`} d={seg.path}
                          fill={interpolateColor(nodeColors.side, nodeColors.front, seg.intensity)} />
                      ))}
                      <path d={box.left} fill={nodeColors.side} />
                      <path d={box.left} fill={`url(#${print ? "print" : "shade"}-${config.id})`} />
                      <path d={box.right} fill={nodeColors.front} />
                      <path d={box.right} fill={`url(#${print ? "print" : "shade"}-${config.id})`} />
                      {box.cornerFrontRight?.map((seg: { path: string; intensity: number }, idx: number) => (
                        <path key={`cfr-${idx}`} d={seg.path}
                          fill={interpolateColor(nodeColors.front, nodeColors.side, seg.intensity)} />
                      ))}
                      {box.cornerFrontLeft?.map((seg: { path: string; intensity: number }, idx: number) => (
                        <path key={`cfl-${idx}`} d={seg.path}
                          fill={interpolateColor(nodeColors.front, nodeColors.side, seg.intensity)} />
                      ))}
                      <path d={box.top} fill={nodeColors.top} />
                      <path d={box.top} fill={`url(#${print ? "print" : "sheen"}-${config.id})`} />
                      <path d={box.top} fill="none" stroke={isSelected ? '#ffffff' : 'rgba(255,255,255,0.28)'}
                        strokeWidth={isSelected ? 1.4 : 0.75} strokeLinejoin="round" />

                      {/* Label */}
                      {showLabels && node.label && (
                        <IsoText x={node.x + node.width / 2} y={node.y + node.depth / 2}
                          z={nodeElevation + node.height + 2}
                          fontSize={node.width > 70 ? 9 : 8} color={textColor}
                          shadow={print ? undefined : `url(#label-${config.id})`}>
                          {node.label}
                        </IsoText>
                      )}
                    </g>
                  )
                })}

                {/* Tier label */}
                {showLabels && (
                  <text
                    x={isoToScreen(-25, floorSize.depth / 2, tier.elevation + 15).screenX - 35}
                    y={isoToScreen(-25, floorSize.depth / 2, tier.elevation + 15).screenY}
                    fill={labelColor} fontSize={9} fontWeight={500} fontFamily={MONO_FONT}
                    opacity={technical ? 0.9 : 0.6}
                    style={{ letterSpacing: '0.05em', textTransform: technical ? 'uppercase' : 'none' }}>
                    {tier.name}
                  </text>
                )}
              </g>
            )
          })}
        </g>

        {/* Drafting plate: frame, component index, title block */}
        {technical && (
          <TechnicalPlate
            style={techStyle}
            plate={plate}
            rows={nodes
              .map((node, i) => ({
                n: componentNumbers.get(i) || i + 1,
                name: node.label,
                subtitle: tiers[node.tier]?.name,
                color: node.color,
              }))
              .sort((a, b) => a.n - b.n)}
            title={config.title}
            tally={`${String(nodes.length).padStart(2, '0')} CMP / ${String(tiers.length).padStart(2, '0')} TIER`}
            className=""
          />
        )}
      </svg>
    </div>
  )
}

/** Floor plane as a drafting outline rather than a filled slab. */
function TechnicalFloor({ width, depth, elevation, ink, isGround }: {
  width: number; depth: number; elevation: number; ink: string; isGround?: boolean
}) {
  const pos = isoToScreen(0, 0, elevation)
  const top = isoBox(width, depth, 0, pos.screenX, pos.screenY).top
  return (
    <path
      d={top}
      fill="none"
      stroke={ink}
      strokeWidth={isGround ? 1 : 0.7}
      strokeDasharray={isGround ? undefined : '5 4'}
      opacity={isGround ? 0.9 : 0.7}
    />
  )
}
