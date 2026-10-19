import { hostThemeTokens, colorAlpha } from '../../packages/viewer/src/theme/host'
import { NODE_SIZES } from './constants'
import type { AnchorPosition } from '../types/editor'
import type { ArcDiagramData } from '../types/diagram'
import { anchorOnNode, arrowShape, connectorEndAngle, connectorPath, connectorStartAngle } from './diagramHelpers'
import { renderFlowLayer } from './flowSvg'
import { resolveNodeColor, resolveNodeIcon } from './nodeKinds'
import { resolveNodeDecor, resolveNodeShape, shapeCut, shapeFillPath } from './nodeShape'
import { getTheme, resolveNodeRadius, themeCanvas, type BrandSpec, type Theme, type ThemeId } from './themes'

// Anchor position on a node box — the same geometry the editor and player use.
function getAnchorPosition(x: number, y: number, width: number, height: number, position: AnchorPosition) {
  return anchorOnNode({ x, y, width, height }, position)
}

// Node colors for SVG export
const nodeColors = {
  violet: { bg: '#8b5cf6', text: '#ffffff' },
  emerald: { bg: '#34d399', text: '#ffffff' },
  blue: { bg: '#60a5fa', text: '#ffffff' },
  amber: { bg: '#fbbf24', text: '#1f2937' },
  zinc: { bg: '#71717a', text: '#ffffff' },
  sky: { bg: '#38bdf8', text: '#ffffff' },
  rose: { bg: '#f43f5e', text: '#ffffff' },
  orange: { bg: '#f97316', text: '#ffffff' },
}

const groupColors = {
  violet: { fill: 'rgba(139, 92, 246, 0.1)', stroke: 'rgba(139, 92, 246, 0.5)' },
  emerald: { fill: 'rgba(52, 211, 153, 0.1)', stroke: 'rgba(52, 211, 153, 0.5)' },
  blue: { fill: 'rgba(96, 165, 250, 0.1)', stroke: 'rgba(96, 165, 250, 0.5)' },
  amber: { fill: 'rgba(251, 191, 36, 0.1)', stroke: 'rgba(251, 191, 36, 0.5)' },
  zinc: { fill: 'rgba(113, 113, 122, 0.1)', stroke: 'rgba(113, 113, 122, 0.5)' },
  sky: { fill: 'rgba(56, 189, 248, 0.1)', stroke: 'rgba(56, 189, 248, 0.5)' },
  rose: { fill: 'rgba(244, 63, 94, 0.1)', stroke: 'rgba(244, 63, 94, 0.5)' },
  orange: { fill: 'rgba(249, 115, 22, 0.1)', stroke: 'rgba(249, 115, 22, 0.5)' },
}

type ExportMode = 'light' | 'dark'

// Tailwind alpha suffix on a color class: `border-[#a1a1aa]/55` -> 0.55.
function classAlpha(className: string | undefined): number | undefined {
  const match = className?.match(/\/(\d{1,3})(?=\s|$)/)
  return match ? Math.min(1, parseInt(match[1], 10) / 100) : undefined
}

function classColor(className: string | undefined, fallback: string): string {
  const match = className?.match(/#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})/)
  if (match) return match[0]
  if (className?.includes('text-white')) return '#ffffff'
  if (className?.includes('text-zinc-700')) return '#334155'
  if (className?.includes('text-zinc-300')) return '#cbd5e1'
  return fallback
}

function hexWithAlpha(color: string, alpha: number): string {
  if (color.startsWith('var(')) return colorAlpha(color, Math.round(alpha * 255).toString(16).padStart(2, '0'))
  const hex = color.replace('#', '')
  if (hex.length !== 3 && hex.length !== 6) return color
  return `${color}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`
}

// Grid motifs match ArcDiagram's gridMotif(): dots at cell origin, corner-L
// lines, and a crosshair plus per cell — the crosshair grid additionally gets
// edge registration ticks and a 5x major graticule, like the player's.
function svgGridPattern(gridType: string, color: string, size: number, x: number, y: number, w: number, h: number, opacity?: number): string {
  if (gridType === 'none') return ''
  const wrap = (defs: string, extraRect = '') =>
    `<defs>${defs}</defs><g${opacity !== undefined ? ` opacity="${opacity}"` : ''}><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#grid)"/>${extraRect}</g>`
  if (gridType === 'lines') {
    return wrap(`<pattern id="grid" width="${size}" height="${size}" patternUnits="userSpaceOnUse"><path d="M ${size} 0 L 0 0 0 ${size}" fill="none" stroke="${color}" stroke-width="1"/></pattern>`)
  }
  if (gridType === 'crosshair') {
    const c = size / 2, r = 3, tk = 2
    const plus = `M ${c} ${c - r} L ${c} ${c + r} M ${c - r} ${c} L ${c + r} ${c}`
    const edgeTicks = `M ${c} 0 L ${c} ${tk} M ${c} ${size} L ${c} ${size - tk} M 0 ${c} L ${tk} ${c} M ${size} ${c} L ${size - tk} ${c}`
    const M = size * 5, C = M / 2, mr = 5
    const major = `M ${C} ${C - mr} L ${C} ${C + mr} M ${C - mr} ${C} L ${C + mr} ${C}`
    const defs = `<pattern id="grid" width="${size}" height="${size}" patternUnits="userSpaceOnUse"><path d="${plus}" stroke="${color}" stroke-width="1"/><path d="${edgeTicks}" stroke="${color}" stroke-width="1" opacity="0.5"/></pattern>` +
      `<pattern id="grid-major" width="${M}" height="${M}" patternUnits="userSpaceOnUse"><path d="${major}" stroke="${color}" stroke-width="1"/></pattern>`
    return wrap(defs, `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#grid-major)"/>`)
  }
  return wrap(`<pattern id="grid" width="${size}" height="${size}" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="${color}"/></pattern>`)
}

// Frame treatments follow DiagramFrame in ArcDiagram: inset treatments sit 12px
// inside the canvas edge; brackets/reticle are flush at the edge.
function svgFrame(frame: BrandSpec['frame'], x: number, y: number, w: number, h: number, color: string): string {
  if (!frame || frame === 'none') return ''
  const stroke = (wt: number, extra = '') => `stroke="${color}" stroke-width="${wt}" fill="none" ${extra}`
  const inset = 12
  if (frame === 'hairline') {
    return `<rect x="${x + 0.5}" y="${y + 0.5}" width="${w - 1}" height="${h - 1}" ${stroke(1)}/>`
  }
  if (frame === 'inset') {
    return `<rect x="${x + inset}" y="${y + inset}" width="${w - inset * 2}" height="${h - inset * 2}" ${stroke(1)}/>`
  }
  if (frame === 'sheet') {
    return `<rect x="${x + inset}" y="${y + inset}" width="${w - inset * 2}" height="${h - inset * 2}" ${stroke(1)}/>` +
      `<rect x="${x + inset + 4}" y="${y + inset + 4}" width="${w - (inset + 4) * 2}" height="${h - (inset + 4) * 2}" ${stroke(1, 'opacity="0.35"')}/>`
  }
  if (frame === 'brackets') {
    // Flush at the diagram's boundary corners, weight 2.
    const t = 26, o = 1
    return `<path d="M ${x + o} ${y + o + t} V ${y + o} H ${x + o + t} M ${x + w - o - t} ${y + o} H ${x + w - o} V ${y + o + t} M ${x + w - o} ${y + h - o - t} V ${y + h - o} H ${x + w - o - t} M ${x + o + t} ${y + h - o} H ${x + o} V ${y + h - o - t}" ${stroke(2)}/>`
  }
  if (frame === 'corners') {
    const t = 24, ix = x + inset, iy = y + inset, iw = w - inset * 2, ih = h - inset * 2
    return `<path d="M ${ix} ${iy + t} V ${iy} H ${ix + t} M ${ix + iw - t} ${iy} H ${ix + iw} V ${iy + t} M ${ix + iw} ${iy + ih - t} V ${iy + ih} H ${ix + iw - t} M ${ix + t} ${iy + ih} H ${ix} V ${iy + ih - t}" ${stroke(1)}/>`
  }
  if (frame === 'ticks') {
    // Inset rule + 6px registration ticks straddling each edge every 16px.
    const rx = x + inset, ry = y + inset, rw = w - inset * 2, rh = h - inset * 2
    let ticks = ''
    for (let tx = rx + 8; tx <= rx + rw - 4; tx += 16) ticks += `M ${tx} ${ry - 3} V ${ry + 3} M ${tx} ${ry + rh - 3} V ${ry + rh + 3} `
    for (let ty = ry + 8; ty <= ry + rh - 4; ty += 16) ticks += `M ${rx - 3} ${ty} H ${rx + 3} M ${rx + rw - 3} ${ty} H ${rx + rw + 3} `
    return `<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" ${stroke(1, 'opacity="0.2"')}/><path d="${ticks.trim()}" ${stroke(1)}/>`
  }
  if (frame === 'cropmarks') {
    // Open-corner trim marks: a short mark on each edge near each corner.
    const rx = x + inset, ry = y + inset, rw = w - inset * 2, rh = h - inset * 2
    const gap = 8, len = 14
    const d = [
      `M ${rx + gap} ${ry} H ${rx + gap + len}`, `M ${rx} ${ry + gap} V ${ry + gap + len}`,
      `M ${rx + rw - gap} ${ry} H ${rx + rw - gap - len}`, `M ${rx + rw} ${ry + gap} V ${ry + gap + len}`,
      `M ${rx + gap} ${ry + rh} H ${rx + gap + len}`, `M ${rx} ${ry + rh - gap} V ${ry + rh - gap - len}`,
      `M ${rx + rw - gap} ${ry + rh} H ${rx + rw - gap - len}`, `M ${rx + rw} ${ry + rh - gap} V ${ry + rh - gap - len}`,
    ].join(' ')
    return `<path d="${d}" ${stroke(1)}/>`
  }
  if (frame === 'reticle') {
    // Calibrated bezel: flush corner brackets + centered edge ticks + a faint
    // inset rule that lands on grid lines (inset 12 = half the 24px cell).
    const t = 26, o = 0.75, tk = 8, cx = x + w / 2, cy = y + h / 2
    const brackets = `M ${x + o} ${y + o + t} V ${y + o} H ${x + o + t} M ${x + w - o - t} ${y + o} H ${x + w - o} V ${y + o + t} M ${x + w - o} ${y + h - o - t} V ${y + h - o} H ${x + w - o - t} M ${x + o + t} ${y + h - o} H ${x + o} V ${y + h - o - t}`
    const ticks = `M ${cx} ${y} V ${y + tk} M ${cx} ${y + h} V ${y + h - tk} M ${x} ${cy} H ${x + tk} M ${x + w} ${cy} H ${x + w - tk}`
    return `<rect x="${x + inset}" y="${y + inset}" width="${w - inset * 2}" height="${h - inset * 2}" ${stroke(1, 'opacity="0.35"')}/>` +
      `<path d="${brackets}" ${stroke(1.5)}/><path d="${ticks}" ${stroke(1)}/>`
  }
  return ''
}



// Node ornament placement mirrors NodeDecoration in ArcDiagram: bars hug the
// edge at 2px, the status dot sits top-right, ticks clear the chamfer cut, and
// the stripe is a hatched flag in the bottom-right. `textY` (rule only) is the
// baseline under the header row; `cut` insets marks on cut silhouettes.
function svgNodeDecor(decor: string, w: number, h: number, accent: string, cut: number, ruleY: number, padX: number): string {
  if (decor === 'bar-left') return `<rect x="0" y="0" width="2" height="${h}" fill="${accent}"/>`
  if (decor === 'bar-top') return `<rect x="0" y="0" width="${w}" height="2" fill="${accent}"/>`
  if (decor === 'rule') return `<line x1="${padX}" y1="${ruleY}" x2="${w - padX}" y2="${ruleY}" stroke="${accent}" stroke-width="1" opacity="0.2"/>`
  if (decor === 'dot') {
    const i = Math.max(3, cut - 2)
    return `<circle cx="${w - 8 - i * 0.25}" cy="${8 + i * 0.25}" r="4.5" fill="${accent}" opacity="0.25"/><circle cx="${w - 8 - i * 0.25}" cy="${8 + i * 0.25}" r="2" fill="${accent}"/>`
  }
  if (decor === 'ticks') {
    // Registration L's in all four corners, inset past the chamfer cut.
    const i = Math.max(3, cut - 2), arm = 6
    const p = `M ${i} ${i + arm} V ${i} H ${i + arm} M ${w - i - arm} ${i} H ${w - i} V ${i + arm} M ${w - i} ${h - i - arm} V ${h - i} H ${w - i - arm} M ${i + arm} ${h - i} H ${i} V ${h - i - arm}`
    return `<path d="${p}" stroke="${accent}" stroke-width="1" fill="none" opacity="0.75"/>`
  }
  if (decor === 'stripe') {
    // Hatched 26x26 flag tucked in the bottom-right corner (clear of a notch).
    const s = 26
    let lines = ''
    for (let o = 4; o < s * 2; o += 4) {
      const x1 = Math.max(0, o - s), y1 = Math.min(s, o)
      const x2 = Math.min(s, o), y2 = Math.max(0, o - s)
      lines += `M ${w - s + x1} ${h - s + y1} L ${w - s + x2} ${h - s + y2} `
    }
    return `<path d="${lines.trim()}" stroke="${accent}" stroke-width="1" opacity="0.4"/>`
  }
  return ''
}

// Engineering plate mirroring ArcDiagram's TitleBlock: a title strip over
// DWG NO / SCALE / REV / SHEET cells, anchored to the canvas' bottom-right
// chrome inset.
function svgTitleBlock(theme: Theme | undefined, drawing: string, right: number, bottom: number, ink: string, muted: string, accent: string): string {
  if (!theme?.brand?.titleBlock) return ''
  const mono = theme.brand.monoFamily || theme.brand.fontFamily || 'ui-monospace, monospace'
  const family = escapeXml(mono)
  const title = drawing || 'System Architecture'
  const cells: Array<[string, string]> = [
    ['DWG NO', drawing || '—'],
    ['SCALE', 'NTS'],
    ['REV', 'A'],
    ['SHEET', '1 / 1'],
  ]
  // Mono pitch ≈ 0.62em: label at 6.5px, value at 10.5px.
  const widths = cells.map(([label, value]) =>
    Math.ceil(Math.max(label.length * 6.5 * 0.62, value.length * 10.5 * 0.62)) + 20)
  const stripH = 19, cellH = 24
  const blockW = widths.reduce((a, b) => a + b, 0)
  const x = right - blockW, y = bottom - stripH - cellH
  let out = `<g><rect x="${x}" y="${y}" width="${blockW}" height="${stripH + cellH}" fill="none" stroke="${accent}" stroke-width="1"/>`
  out += `<line x1="${x}" y1="${y + stripH}" x2="${x + blockW}" y2="${y + stripH}" stroke="${accent}" stroke-width="1"/>`
  out += `<text x="${x + 10}" y="${y + 13}" font-family="${family}" font-size="9" font-weight="600" letter-spacing="1.5" fill="${muted}">${escapeXml(title.toUpperCase())}</text>`
  let cx = x
  cells.forEach(([label, value], i) => {
    if (i > 0) out += `<line x1="${cx}" y1="${y + stripH}" x2="${cx}" y2="${y + stripH + cellH}" stroke="${accent}" stroke-width="1"/>`
    out += `<text x="${cx + 10}" y="${y + stripH + 8}" font-family="${family}" font-size="6.5" letter-spacing="0.9" fill="${muted}">${escapeXml(label)}</text>`
    out += `<text x="${cx + 10}" y="${y + stripH + 19}" font-family="${family}" font-size="10.5" letter-spacing="0.3" fill="${ink}">${escapeXml(value)}</text>`
    cx += widths[i]
  })
  return out + '</g>'
}

/**
 * Generate SVG string from diagram data
 */
export function generateSVG(diagram: any, options: any = {}) {
  const { padding = 20 } = options
  const theme = options.theme ? getTheme(options.theme as ThemeId) : undefined
  const mode = (options.mode ?? theme?.defaultMode ?? 'light') as ExportMode
  const themeColors = theme?.[mode]
  const brand = theme?.brand
  const host = theme?.id === 'inherit' ? hostThemeTokens(mode) : undefined
  const fontFamily = (host ? 'var(--arc-diagram-font, ui-sans-serif, system-ui, sans-serif)' : brand?.fontFamily) || 'ui-sans-serif, system-ui, sans-serif'
  const monoFamily = brand?.monoFamily || fontFamily
  const backgroundColor = options.backgroundColor ?? (theme ? themeCanvas(theme.id, mode) : '#ffffff')
  const ink = host?.foreground ?? (themeColors ? classColor(themeColors.text.primary, mode === 'dark' ? '#f4f4f5' : '#111827') : '#ffffff')
  const mutedInk = host?.muted ?? (themeColors ? classColor(themeColors.text.secondary, mode === 'dark' ? '#a1a1aa' : '#475569') : '#ffffff')
  const accent = themeColors?.palette.zinc.stroke || '#71717a'
  const showGrid = options.includeGrid ?? Boolean(brand?.gridType && brand.gridType !== 'none')

  // Use export zone if defined, otherwise full layout
  const bounds = diagram.exportZone || {
    x: 0,
    y: 0,
    width: diagram.layout.width,
    height: diagram.layout.height,
  }

  const viewBox = `${bounds.x - padding} ${bounds.y - padding} ${bounds.width + padding * 2} ${bounds.height + padding * 2}`
  const svgWidth = bounds.width + padding * 2
  const svgHeight = bounds.height + padding * 2

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="${viewBox}">\n`

  // Brand font import — resolves when the SVG is inlined in an HTML document
  // (the PNG render path) or opened standalone in a browser; image contexts
  // that block external fetches simply fall back to the family stack.
  if (brand?.fontImport) {
    svg += `  <style>@import url("${escapeXml(brand.fontImport)}");</style>\n`
  }
  if (brand?.connectorGlow) {
    svg += `  <defs><filter id="arc-glow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="2"/></filter></defs>\n`
  }

  // Background
  svg += `  <rect x="${bounds.x - padding}" y="${bounds.y - padding}" width="${bounds.width + padding * 2}" height="${bounds.height + padding * 2}" fill="${backgroundColor}"/>\n`

  // Branded themes draw their grid by default; includeGrid can force or suppress it.
  if (showGrid && (themeColors || diagram.grid?.enabled)) {
    const gridSize = themeColors?.background.grid.size || diagram.grid?.size || 20
    const gridColor = themeColors?.background.grid.color || diagram.grid?.color || '#e5e7eb'
    const gridType = brand?.gridType || diagram.grid?.type || 'dots'
    const gridOpacity = themeColors?.background.grid.opacity
    svg += `  ${svgGridPattern(gridType, gridColor, gridSize, bounds.x - padding, bounds.y - padding, bounds.width + padding * 2, bounds.height + padding * 2, gridOpacity)}\n`
  }

  // Groups (render first, behind everything)
  const groups = diagram.groups || []
  for (const group of groups) {
    const colors = groupColors[group.color] || groupColors.zinc
    const tone = themeColors?.palette[group.color]
    // Group frames follow DiagramGroups: 8px radius, ~6% fill wash, ~55% stroke,
    // and an 11px semibold label tucked inside the top-left corner.
    const groupFill = tone ? hexWithAlpha(tone.stroke, 0.06) : colors.fill
    const groupStroke = tone?.stroke || colors.stroke
    if (group.type === 'circle') {
      svg += `  <ellipse cx="${group.x + group.width / 2}" cy="${group.y + group.height / 2}" rx="${group.width / 2}" ry="${group.height / 2}" fill="${groupFill}" stroke="${groupStroke}" stroke-opacity="0.55" stroke-width="1.5"${group.dashed ? ' stroke-dasharray="8 4"' : ''}/>\n`
    } else {
      svg += `  <rect x="${group.x}" y="${group.y}" width="${group.width}" height="${group.height}" rx="8" fill="${groupFill}" stroke="${groupStroke}" stroke-opacity="0.55" stroke-width="1.5"${group.dashed ? ' stroke-dasharray="8 4"' : ''}/>\n`
    }
    if (group.label) {
      const label = brand?.upperLabels ? group.label.toUpperCase() : group.label
      svg += `  <text x="${group.x + 12}" y="${group.y + 19}" fill="${groupStroke}" font-size="11" font-weight="600" letter-spacing="0.7" font-family="${escapeXml(fontFamily)}">${escapeXml(label)}</text>\n`
    }
  }

  // Images
  const images = diagram.images || []
  for (const image of images) {
    svg += `  <image href="${image.src}" x="${image.x}" y="${image.y}" width="${image.width}" height="${image.height}" opacity="${image.opacity ?? 1}" preserveAspectRatio="xMidYMid meet"/>\n`
  }

  // Connectors
  for (const connector of diagram.connectors) {
    const fromNode = diagram.nodes[connector.from]
    const toNode = diagram.nodes[connector.to]
    if (!fromNode || !toNode) continue

    const fromSize = NODE_SIZES[fromNode.size] || NODE_SIZES.m
    const toSize = NODE_SIZES[toNode.size] || NODE_SIZES.m

    const style = diagram.connectorStyles?.[connector.style] || { color: 'zinc' as const }
    const color = style.color ?? 'zinc'
    const strokeColor = themeColors?.palette[color]?.stroke || nodeColors[color]?.bg || accent
    const lineStyle = style.lineStyle ?? (style.dashed ? 'dashed' : 'solid')
    const dashAttr = lineStyle === 'dashed' ? ' stroke-dasharray="6 3"' : lineStyle === 'dotted' ? ' stroke-dasharray="0.1 6" stroke-linecap="round"' : ''
    const opacityAttr = style.opacity != null ? ` stroke-opacity="${style.opacity}"` : ''

    const fromPos = getAnchorPosition(
      fromNode.x,
      fromNode.y,
      fromNode.width || fromSize.width,
      fromNode.height || fromSize.height,
      connector.fromAnchor
    )
    const toPos = getAnchorPosition(
      toNode.x,
      toNode.y,
      toNode.width || toSize.width,
      toNode.height || toSize.height,
      connector.toAnchor
    )

    // Same bezier the editor draws (curve / curveDepth honored).
    const curveDepth = connector.curveDepth ?? 40
    const path = connectorPath(fromPos, toPos, connector.fromAnchor, connector.toAnchor, connector.curve, curveDepth)
    const strokeWidth = style.strokeWidth || 2

    if (brand?.connectorGlow) {
      svg += `  <path d="${path}" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth + 4}" stroke-opacity="0.18" stroke-linecap="round" filter="url(#arc-glow)"${dashAttr}/>\n`
    }
    svg += `  <path d="${path}" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}"${dashAttr}${opacityAttr}/>\n`

    // Arrowheads orient to the path's end tangent and land their tip exactly
    // on the anchor — the endpoint secant mis-rotates them on curved runs.
    const showArrow = style.showArrow !== false
    if (themeColors) {
      const headShape = arrowShape(brand?.arrowhead === 'chevron' ? 'dart' : 'arrow', 8)
      const head = (px: number, py: number, angle: number) => headShape?.d
        ? `<path d="${headShape.d}" fill="${strokeColor}" fill-opacity="0.88" transform="translate(${px} ${py}) rotate(${angle})"/>`
        : ''
      if (showArrow) {
        const angle = connectorEndAngle(fromPos, toPos, connector.fromAnchor, connector.toAnchor, connector.curve, curveDepth)
        svg += `  ${head(toPos.x, toPos.y, angle)}\n`
      }
      if (style.bidirectional) {
        const angle = connectorStartAngle(fromPos, toPos, connector.fromAnchor, connector.toAnchor, connector.curve, curveDepth)
        svg += `  ${head(fromPos.x, fromPos.y, angle)}\n`
      }
    } else {
      svg += `  <circle cx="${toPos.x}" cy="${toPos.y}" r="4" fill="${strokeColor}"/>\n`
    }

    // Label placement mirrors the player: vertical runs (the delta-Y-dominant
    // ones) carry it beside the midpoint stem on the labelAlign side;
    // horizontal runs carry it above the midpoint.
    if (style.label) {
      const midX = (fromPos.x + toPos.x) / 2
      const midY = (fromPos.y + toPos.y) / 2
      const label = brand?.upperLabels ? style.label.toUpperCase() : style.label
      const isVertical = Math.abs(toPos.y - fromPos.y) > Math.abs(toPos.x - fromPos.x)
      let lx = midX, ly = midY - 8, anchor = 'middle'
      if (isVertical) {
        const side = style.labelAlign === 'left' ? -1 : 1
        lx = midX + 8 * side
        ly = midY + 4
        anchor = side > 0 ? 'start' : 'end'
      }
      svg += `  <text x="${lx}" y="${ly}" text-anchor="${anchor}" fill="${strokeColor}" font-size="10" font-family="${escapeXml(monoFamily)}"${brand?.upperLabels ? ' letter-spacing="1"' : ''}>${escapeXml(label)}</text>\n`
    }
  }

  // Flow markers ride above connectors but below node shells.
  if (diagram.flows?.length) {
    svg += `  ${renderFlowLayer(diagram as ArcDiagramData, {
      themeColors,
      fontFamily,
      backgroundColor,
      flowTime: options.flowTime,
      animate: options.animateFlows !== false,
    })}\n`
  }

  // Nodes
  for (const [nodeId, node] of Object.entries(diagram.nodes as Record<string, any>)) {
    const data = diagram.nodeData[nodeId]
    if (!data) continue

    const size = NODE_SIZES[node.size] || NODE_SIZES.m
    const width = node.width || size.width
    const height = node.height || size.height
    const resolvedColor = resolveNodeColor(data)
    const colors = nodeColors[resolvedColor] || nodeColors.zinc
    const tone = themeColors?.palette[resolvedColor]
    const nodeAccent = tone?.stroke || colors.bg
    const nodeFill = host?.surface ?? (themeColors
      ? hexWithAlpha(nodeAccent, brand?.nodeGlass ? 0.10 : mode === 'dark' ? 0.12 : 0.08)
      : colors.bg)
    const nodeText = themeColors ? ink : colors.text
    const nodeRadius = resolveNodeRadius(brand)
    const shape = resolveNodeShape(data.shape || brand?.nodeShape, nodeRadius)
    const cut = shapeCut(node.size)
    const shapePath = shapeFillPath(shape, width, height, cut)
    const decor = resolveNodeDecor(data.decor || brand?.nodeDecor, brand?.accentBar)
    const nodeOpacity = brand?.nodeOpacity ?? 1
    const borderWidth = parseFloat(brand?.nodeBorderWidth || '') || 1
    // The border classes encode their own alpha (`border-[#x]/AA`) — honor it;
    // a class without one is opaque.
    const borderOpacity = themeColors ? (classAlpha(tone?.border) ?? 1) : 0
    const rx = nodeRadius ? parseFloat(nodeRadius) : 12

    // Centered header block, like the flex column in the player: name +
    // subtitle + description stack and center as one unit, with the player's
    // size ramp (l12 / m,xs11 / s9, subtitle 9/8, description 9) and paddings
    // (l px-5, s px-3, else px-4).
    const fontSize = node.size === 'l' ? 12 : node.size === 's' ? 9 : 11
    const subSize = node.size === 's' ? 8 : 9
    const descSize = 9
    const showSub = Boolean(data.subtitle)
    const showDesc = Boolean(data.description) && node.size !== 's'
    const blockH = fontSize + (showSub ? 4 + subSize : 0) + (showDesc ? 4 + descSize : 0)
    const textTop = height / 2 - blockH / 2
    const nameBase = textTop + fontSize * 0.8
    const subBase = textTop + fontSize + 4 + subSize * 0.8
    const descBase = textTop + fontSize + (showSub ? 4 + subSize : 0) + 4 + descSize * 0.8
    // The rule decor is a hairline under the header row (name + subtitle).
    const ruleY = (showSub ? subBase : nameBase) + 7
    const padX = node.size === 'l' ? 20 : node.size === 's' ? 12 : 16

    svg += `  <g opacity="${nodeOpacity}">\n`
    const silhouette = shapePath
      ? `<path d="${shapePath}"/>`
      : `<rect width="${width}" height="${height}" rx="${rx}"/>`
    const clipId = `clip-${String(nodeId).replace(/[^a-zA-Z0-9_-]/g, '-')}`
    if (shapePath) {
      svg += `    <path d="${shapePath}" transform="translate(${node.x} ${node.y})" fill="${nodeFill}"${themeColors ? ` stroke="${host?.border ?? nodeAccent}" stroke-width="${borderWidth}" stroke-opacity="${borderOpacity}"` : ''}/>\n`
    } else {
      svg += `    <rect x="${node.x}" y="${node.y}" width="${width}" height="${height}" rx="${rx}" fill="${nodeFill}"${themeColors ? ` stroke="${host?.border ?? nodeAccent}" stroke-width="${borderWidth}" stroke-opacity="${borderOpacity}"` : ''}/>\n`
    }
    svg += `    <defs><clipPath id="${clipId}">${silhouette}</clipPath></defs>\n`
    if (decor !== 'none') {
      // Clip decor to the silhouette so edge marks stay inside cut corners,
      // exactly like the player's clipped shells.
      svg += `    <g transform="translate(${node.x} ${node.y})" clip-path="url(#${clipId})">${svgNodeDecor(decor, width, height, nodeAccent, cut, ruleY, padX)}</g>\n`
    }

    // Text rides inside the silhouette clip too — the player's shell is
    // overflow:hidden, so an over-long string trims at the box edge the same
    // way. Node-local coords: the clip path's silhouette sits at 0,0.
    const lx = width / 2
    svg += `    <g transform="translate(${node.x} ${node.y})" clip-path="url(#${clipId})">\n`
    svg += `    <text x="${lx}" y="${nameBase}" text-anchor="middle" fill="${nodeText}" font-size="${fontSize}" font-weight="500" font-family="${escapeXml(fontFamily)}"${brand?.fontFamily ? ' letter-spacing="-0.165"' : ''}>${escapeXml(data.name || 'Node')}</text>\n`
    if (showSub) {
      const subtitle = brand?.upperLabels ? data.subtitle.toUpperCase() : data.subtitle
      svg += `    <text x="${lx}" y="${subBase}" text-anchor="middle" fill="${themeColors ? mutedInk : colors.text}" opacity="0.72" font-size="${subSize}" font-family="${escapeXml(brand?.upperLabels ? monoFamily : fontFamily)}"${brand?.upperLabels ? ' letter-spacing="0.54"' : ''}>${escapeXml(subtitle)}</text>\n`
    }
    if (showDesc) {
      svg += `    <text x="${lx}" y="${descBase}" text-anchor="middle" fill="${themeColors ? mutedInk : colors.text}" opacity="0.65" font-size="${descSize}" font-family="${escapeXml(fontFamily)}">${escapeXml(data.description)}</text>\n`
    }
    svg += `    </g>\n`
    svg += `  </g>\n`
  }

  if (themeColors && brand?.frame && brand.frame !== 'none') {
    // Frame rides the canvas edge (same as the player's absolute inset-0 shell).
    svg += `  ${svgFrame(brand.frame, bounds.x - padding, bounds.y - padding, bounds.width + padding * 2, bounds.height + padding * 2, accent)}\n`
  }

  if (themeColors && brand?.titleBlock) {
    // Anchored to the canvas' bottom-right chrome inset — 12px, or 28 when the
    // frame treatment already rules an inset line the block would sit on.
    const chromeInset = brand?.frame === 'sheet' || brand?.frame === 'inset' ? 28 : 12
    svg += `  ${svgTitleBlock(theme, diagram.id || '', bounds.x + bounds.width + padding - chromeInset, bounds.y + bounds.height + padding - chromeInset, ink, mutedInk, accent)}\n`
  }

  svg += `</svg>`
  return svg
}

/**
 * Generate PNG from diagram using canvas
 */
export async function generatePNG(diagram: any, options: any = {}) {
  const { scale = 2 } = options

  // Generate SVG first
  const svgString = generateSVG(diagram, options)

  // Create blob and image
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
  const svgUrl = URL.createObjectURL(svgBlob)

  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      // Create canvas
      const canvas = document.createElement('canvas')
      canvas.width = img.width * scale
      canvas.height = img.height * scale

      const ctx = canvas.getContext('2d')
      ctx.scale(scale, scale)
      ctx.drawImage(img, 0, 0)

      URL.revokeObjectURL(svgUrl)

      // Convert to blob
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob)
        } else {
          reject(new Error('Failed to generate PNG'))
        }
      }, 'image/png')
    }
    img.onerror = () => {
      URL.revokeObjectURL(svgUrl)
      reject(new Error('Failed to load SVG'))
    }
    img.src = svgUrl
  })
}

/**
 * Create a shareable data URL for the diagram
 */
export function createShareableLink(diagram: any) {
  // Compress diagram to minimal JSON
  const minimalDiagram = {
    l: diagram.layout,
    n: diagram.nodes,
    d: diagram.nodeData,
    c: diagram.connectors,
    s: diagram.connectorStyles,
    g: diagram.groups,
    i: diagram.images,
    e: diagram.exportZone,
  }

  const json = JSON.stringify(minimalDiagram)
  const encoded = btoa(encodeURIComponent(json))

  // For now, return a hash-based URL (works with client-side routing)
  // In production, this could be a proper backend URL
  const baseUrl = window.location.origin + window.location.pathname
  return `${baseUrl}#/view/${encoded}`
}

/**
 * Decode a shareable link back to diagram data
 */
export function decodeShareableLink(encoded: any) {
  try {
    const json = decodeURIComponent(atob(encoded))
    const data = JSON.parse(json)
    return {
      layout: data.l,
      nodes: data.n,
      nodeData: data.d,
      connectors: data.c,
      connectorStyles: data.s,
      groups: data.g || [],
      images: data.i || [],
      exportZone: data.e || null,
    }
  } catch (e) {
    console.error('Failed to decode shareable link:', e)
    return null
  }
}

/**
 * Download a file
 */
export function downloadFile(content, filename, type: any) {
  const blob = content instanceof Blob ? content : new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Escape XML special characters
 */
function escapeXml(str) {
  if (!str) return ''
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Generate TypeScript source file for ArcDiagram component
 */
export function generateTypeScript(diagram: any) {
  // Use export zone for bounds, or full layout
  const bounds = diagram.exportZone || {
    x: 0,
    y: 0,
    width: diagram.layout.width,
    height: diagram.layout.height,
  }

  // Filter nodes to those within bounds (with some margin)
  const margin = 50
  const visibleNodes = {}
  const visibleNodeData = {}

  for (const [id, node] of Object.entries(diagram.nodes as Record<string, any>)) {
    const data = diagram.nodeData[id]
    if (!data) continue

    const size = NODE_SIZES[node.size] || NODE_SIZES.m
    const nodeRight = node.x + (node.width || size.width)
    const nodeBottom = node.y + (node.height || size.height)

    // Check if node overlaps with bounds
    if (node.x < bounds.x + bounds.width + margin &&
        nodeRight > bounds.x - margin &&
        node.y < bounds.y + bounds.height + margin &&
        nodeBottom > bounds.y - margin) {
      // Adjust position relative to bounds
      visibleNodes[id] = {
        x: node.x - bounds.x,
        y: node.y - bounds.y,
        size: node.size || 'm',
      }
      visibleNodeData[id] = {
        icon: resolveNodeIcon(data),
        name: data.name || 'Node',
        ...(data.subtitle && { subtitle: data.subtitle }),
        ...(data.description && { description: data.description }),
        color: resolveNodeColor(data),
        ...(data.kind && { kind: data.kind }),
      }
    }
  }

  // Filter connectors to those between visible nodes
  const visibleConnectors = diagram.connectors.filter(
    c => visibleNodes[c.from] && visibleNodes[c.to]
  ).map(c => ({
    from: c.from,
    to: c.to,
    fromAnchor: c.fromAnchor,
    toAnchor: c.toAnchor,
    style: c.style,
    ...(c.curve && { curve: c.curve }),
  }))

  // Get used connector styles
  const usedStyles = new Set(visibleConnectors.map((c: any) => c.style))
  const visibleConnectorStyles: Record<string, any> = {}
  for (const styleName of usedStyles) {
    const style = diagram.connectorStyles?.[styleName as string]
    if (style) {
      visibleConnectorStyles[styleName as string] = {
        color: style.color || 'zinc',
        strokeWidth: style.strokeWidth || 2,
        ...(style.label && { label: style.label }),
        ...(style.dashed && { dashed: true }),
      }
    }
  }

  // Build the data object
  const data = {
    layout: { width: bounds.width, height: bounds.height },
    nodes: visibleNodes,
    nodeData: visibleNodeData,
    connectors: visibleConnectors,
    connectorStyles: visibleConnectorStyles,
  }

  // Format as clean TypeScript
  return `import type { ArcDiagramData } from '@hudsonkit/arc'

const diagram: ArcDiagramData = ${formatAsTS(data)}

export default diagram
`
}

/**
 * Format object as clean TypeScript (single quotes, unquoted keys)
 */
function formatAsTS(obj, indent = 0) {
  const spaces = '  '.repeat(indent)
  const innerSpaces = '  '.repeat(indent + 1)

  if (obj === null || obj === undefined) {
    return 'null'
  }

  if (typeof obj === 'string') {
    return `'${obj.replace(/'/g, "\\'")}'`
  }

  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return String(obj)
  }

  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]'
    const items = obj.map(item => `${innerSpaces}${formatAsTS(item, indent + 1)}`).join(',\n')
    return `[\n${items},\n${spaces}]`
  }

  if (typeof obj === 'object') {
    const entries = Object.entries(obj)
    if (entries.length === 0) return '{}'

    // Check if it's a simple object that can be on one line
    const isSimple = entries.every(([, v]) =>
      typeof v !== 'object' || v === null
    ) && JSON.stringify(obj).length < 80

    if (isSimple && indent > 0) {
      const pairs = entries.map(([k, v]) => `${k}: ${formatAsTS(v, indent + 1)}`).join(', ')
      return `{ ${pairs} }`
    }

    const pairs = entries.map(([k, v]) => {
      // Use unquoted key if valid identifier
      const key = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k) ? k : `'${k}'`
      return `${innerSpaces}${key}: ${formatAsTS(v, indent + 1)}`
    }).join(',\n')

    return `{\n${pairs},\n${spaces}}`
  }

  return String(obj)
}
