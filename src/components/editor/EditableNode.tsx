import { memo } from 'react'
import { getIconComponent } from '../../utils/iconRegistry'
import { resolveNodeColor, resolveNodeIcon } from '../../utils/nodeKinds'
import { NODE_SIZES } from '../../utils/constants'
import { Node as PlayerNode } from '../ArcDiagram'
import { radiusForShape, resolveNodeShape, shapeCut, shapeOutlinePath, type NodeShape } from '../../utils/nodeShape'
import { resolveNodeRadius, type BrandSpec, type Theme } from '../../utils/themes'

type ResolvedThemeMode = Theme['light'] | Theme['dark']

// Color mappings for different accent positions
const accentClasses = {
  left: {
    violet: 'border-l-4 border-l-violet-500',
    emerald: 'border-l-4 border-l-emerald-500',
    blue: 'border-l-4 border-l-blue-500',
    amber: 'border-l-4 border-l-amber-500',
    zinc: 'border-l-4 border-l-zinc-500',
    sky: 'border-l-4 border-l-sky-500',
  },
  top: {
    violet: 'border-t-3 border-t-violet-500',
    emerald: 'border-t-3 border-t-emerald-500',
    blue: 'border-t-3 border-t-blue-500',
    amber: 'border-t-3 border-t-amber-500',
    zinc: 'border-t-3 border-t-zinc-500',
    sky: 'border-t-3 border-t-sky-500',
  },
  none: {
    violet: '', emerald: '', blue: '', amber: '', zinc: '', sky: '',
  },
}

// Icon container border colors
const iconBorderColors = {
  colored: {
    violet: 'border-violet-500/50',
    emerald: 'border-emerald-500/50',
    blue: 'border-blue-500/50',
    amber: 'border-amber-500/50',
    zinc: 'border-zinc-600',
    sky: 'border-sky-500/50',
  },
  muted: {
    violet: 'border-zinc-600',
    emerald: 'border-zinc-600',
    blue: 'border-zinc-600',
    amber: 'border-zinc-600',
    zinc: 'border-zinc-600',
    sky: 'border-zinc-600',
  },
  none: {
    violet: 'border-transparent',
    emerald: 'border-transparent',
    blue: 'border-transparent',
    amber: 'border-transparent',
    zinc: 'border-transparent',
    sky: 'border-transparent',
  },
}

// Icon colors
const iconColors = {
  violet: 'text-violet-400',
  emerald: 'text-emerald-400',
  blue: 'text-blue-400',
  amber: 'text-amber-400',
  zinc: 'text-zinc-400',
  sky: 'text-sky-400',
}

// Subtitle colors
const subtitleColorMap = {
  colored: {
    violet: 'text-violet-400',
    emerald: 'text-emerald-400',
    blue: 'text-blue-400',
    amber: 'text-amber-400',
    zinc: 'text-zinc-500',
    sky: 'text-sky-400',
  },
  muted: {
    violet: 'text-zinc-500',
    emerald: 'text-zinc-500',
    blue: 'text-zinc-500',
    amber: 'text-zinc-500',
    zinc: 'text-zinc-500',
    sky: 'text-zinc-500',
  },
}

interface EditableNodeProps {
  nodeId: string
  node: { x: number; y: number; size?: string; width?: number; height?: number }
  data: { icon?: string; name: string; subtitle?: string; description?: string; color?: string; kind?: string; shape?: NodeShape }
  layout: { width: number; height: number }
  template: {
    node?: Record<string, unknown>
    canvas?: { background?: string }
  }
  isSelected: boolean
  onPointerDown: (e: React.PointerEvent, nodeId: string) => void
  onClick: (nodeId: string, e: React.MouseEvent) => void
  onContextMenu?: (nodeId: string, e: React.MouseEvent) => void
  onMouseEnter: () => void
  onMouseLeave: () => void
  themeColors?: ResolvedThemeMode | null
  brand?: BrandSpec
}

function SelectionOutline({ width, height, shape, cut, radius }: {
  width: number
  height: number
  shape: ReturnType<typeof resolveNodeShape>
  cut: number
  radius?: string
}) {
  const outline = shapeOutlinePath(shape, width + 6, height + 6, cut + 3)
  if (outline) {
    return (
      <svg
        className="absolute pointer-events-none"
        style={{ left: -3, top: -3 }}
        width={width + 6}
        height={height + 6}
        aria-hidden="true"
      >
        <path d={outline} fill="none" stroke="#3b82f6" strokeWidth={2} />
      </svg>
    )
  }

  return (
    <span
      className="absolute pointer-events-none"
      style={{ inset: -3, border: '2px solid #3b82f6', borderRadius: radius || '12px' }}
      aria-hidden="true"
    />
  )
}

const EditableNode = memo(function EditableNode({
  nodeId,
  node,
  data,
  layout,
  template,
  isSelected,
  onPointerDown,
  onClick,
  onContextMenu,
  onMouseEnter,
  onMouseLeave,
  themeColors,
  brand,
}: EditableNodeProps) {
  const Icon = getIconComponent(resolveNodeIcon(data))
  const size = node.size || 'm'
  const color = resolveNodeColor(data)
  // Custom dimensions override preset sizes
  const presetSize = NODE_SIZES[size] || NODE_SIZES.m
  const width = node.width || presetSize.width
  const height = node.height || presetSize.height

  const isLarge = size === 'l'
  const isSmall = size === 's' || size === 'xs'
  const isExtraSmall = size === 'xs'

  // Convert to percentages for proper scaling with SVG viewBox
  const leftPercent = (node.x / layout.width) * 100
  const topPercent = (node.y / layout.height) * 100
  const widthPercent = (width / layout.width) * 100
  const heightPercent = (height / layout.height) * 100

  // Resolve color through theme palette when available
  const resolvedPalette = themeColors?.palette?.[color as keyof typeof themeColors.palette]
  const isThemed = !!resolvedPalette
  // Detect light mode from the theme's background container class
  const isLightTheme = isThemed && !themeColors?.background?.container?.includes('950') && !themeColors?.background?.container?.includes('arc-inherit-dark')

  // Get template-specific styles (used when no theme override)
  const nodeStyle = (template?.node || {}) as Record<string, string>

  // Ring offset color based on mode
  const ringOffsetClass = isLightTheme ? 'ring-offset-white' : (template?.canvas?.background?.includes('white') ? 'ring-offset-white' : 'ring-offset-zinc-950')

  // When a theme is active, use the player's Node component directly — same rendering, same styles
  if (isThemed) {
    const colorMode = isLightTheme ? 'light' : 'dark'
    const themeRadius = resolveNodeRadius(brand)
    const shape = resolveNodeShape(data.shape || brand?.nodeShape, themeRadius)
    const selectionRadius = data.shape ? radiusForShape(shape, themeRadius) : themeRadius
    const cut = shapeCut(size as keyof typeof NODE_SIZES)
    return (
      <div
        className="cursor-move select-none pointer-events-auto"
        style={{ position: 'absolute', left: node.x, top: node.y, width, height }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onPointerDown={(e) => onPointerDown(e, nodeId)}
        onClick={(e) => { e.stopPropagation(); onClick(nodeId, e) }}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onContextMenu?.(nodeId, e) }}
      >
        <PlayerNode
          node={{ x: 0, y: 0, size: (size as any) }}
          // Spread, don't cherry-pick: the fields this used to drop
          // (description, and now shape) are exactly the ones that made the
          // editor disagree with what the player renders.
          data={{ ...data, color: resolveNodeColor(data) } as any}
          mode={colorMode as any}
          themeColors={themeColors!}
          brand={brand}
        />
        {isSelected && <SelectionOutline width={width} height={height} shape={shape} cut={cut} radius={selectionRadius} />}
      </div>
    )
  }

  // Default rendering (no theme override) — original editor style
  const accentPosition = (nodeStyle.accentPosition || 'left') as keyof typeof accentClasses
  const accentClass = accentClasses[accentPosition]?.[color as keyof typeof accentClasses['left']] || ''
  const iconBorderStyle = (nodeStyle.iconBorderStyle || 'colored') as keyof typeof iconBorderColors
  const iconBorderClass = iconBorderColors[iconBorderStyle]?.[color as keyof typeof iconBorderColors['colored']] || ''
  const subtitleStyle = (nodeStyle.subtitleStyle || 'colored') as keyof typeof subtitleColorMap
  const subtitleColorClass = subtitleColorMap[subtitleStyle]?.[color as keyof typeof subtitleColorMap['colored']] || 'text-zinc-500'

  return (
    <div
      className="absolute cursor-move select-none pointer-events-auto"
      style={{
        left: `${leftPercent}%`,
        top: `${topPercent}%`,
        width: `${widthPercent}%`,
        height: `${heightPercent}%`,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onPointerDown={(e) => onPointerDown(e, nodeId)}
      onClick={(e) => {
        e.stopPropagation()
        onClick(nodeId, e)
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onContextMenu?.(nodeId, e)
      }}
    >
      <div
        className={`
          relative h-full
          ${nodeStyle.background || 'bg-zinc-900'}
          border ${nodeStyle.border || 'border-zinc-800'}
          ${nodeStyle.borderRadius || 'rounded-xl'}
          ${accentClass}
          ${isLarge ? 'px-5 py-4' : isSmall ? 'px-3 py-2.5' : 'px-4 py-3'}
          transition-all duration-150
          ${isSelected ? `ring-2 ring-blue-500 ring-offset-2 ${ringOffsetClass}` : ''}
        `}
      >
        <div className="flex items-start gap-3">
          <div
            className={`
              flex-shrink-0 rounded-lg
              ${isLarge ? 'w-12 h-12' : isSmall ? 'w-8 h-8' : 'w-10 h-10'}
              flex items-center justify-center
              ${nodeStyle.iconBackground || 'bg-zinc-900'}
              border ${iconBorderClass}
            `}
          >
            <Icon className={`${isLarge ? 'w-6 h-6' : isSmall ? 'w-4 h-4' : 'w-5 h-5'} ${iconColors[color]}`} />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <div className={`font-semibold ${nodeStyle.textColor || 'text-white'} ${isLarge ? 'text-base' : isSmall ? 'text-xs' : 'text-sm'}`}>
              {data.name}
            </div>
            {data.subtitle && (
              <div className={`font-mono ${subtitleColorClass} ${isExtraSmall ? 'text-[8px]' : isSmall ? 'text-[9px]' : 'text-[11px]'}`}>
                {data.subtitle}
              </div>
            )}
          </div>
        </div>
        {data.description && !isSmall && !isExtraSmall && (
          <div className={`mt-2 ${nodeStyle.descriptionColor || 'text-zinc-500'} ${isLarge ? 'text-xs' : 'text-[11px]'}`}>
            {data.description}
          </div>
        )}
      </div>
    </div>
  )
})

export default EditableNode
