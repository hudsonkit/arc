# API Reference - Agent Context

Canonical types: `src/types/diagram.ts` and `lib/index.d.ts` (published).

## ArcDiagram Component

```tsx
interface ArcDiagramProps {
  data: ArcDiagramData
  mode?: 'light' | 'dark'
  theme?: ThemeId
  interactive?: boolean
  defaultZoom?: number | 'fit'
  maxFitZoom?: number
  hoverEffects?: boolean | HoverEffectsConfig
  showControls?: boolean
  showMinimap?: boolean
  showLegend?: boolean
  showFocusStory?: boolean
  showViews?: boolean                      // chapter rail for data.views
  view?: string | null                     // controlled active view id
  defaultViewId?: string                   // uncontrolled initial view
  onViewChange?: (viewId: string | null) => void
  frame?: BrandSpec['frame']
  onNodeHover?: (nodeId: string | null) => void
  className?: string
}
```

## ArcDiagramData Schema

```typescript
interface ArcDiagramData {
  legend?: 'auto' | 'all' | 'hidden'  // legend policy; prop overrides
  _meta?: FileMeta                    // saved viewer/editor state; `locale` is BCP-47
  id?: string
  layout: { width: number; height: number }
  layoutHints?: LayoutHints
  nodes: Record<string, NodePosition>
  nodeData: Record<string, NodeData>
  connectors: Connector[]
  connectorStyles: Record<string, ConnectorStyle>
  groups?: GroupShape[]
  focusTargets?: Record<string, FocusTarget>
  views?: DiagramView[]                    // ordered guided chapters
}
```

## Node Types

```typescript
interface NodePosition {
  x: number
  y: number
  size: 'xs' | 's' | 'm' | 'l'
}

interface NodeData {
  icon?: string          // Lucide icon name (string, not component); omit when kind supplies it
  name: string
  subtitle?: string
  description?: string
  color?: DiagramColor   // omit when kind supplies it; overrides the kind default
  kind?: NodeKind        // 'frontend'|'backend'|'service'|'database'|'cache'|'queue'|
                         // 'storage'|'gateway'|'security'|'user'|'external'|'observability'
  shape?: NodeShape      // per-node override; omit to follow theme
  source?: DiagramSource   // code evidence: {path, line?, endLine?, commit?}
}

type DiagramColor = 'violet' | 'emerald' | 'blue' | 'amber' | 'sky' | 'zinc' | 'rose' | 'orange'
```

## Connector Types

```typescript
interface Connector {
  from: string
  to: string
  fromAnchor: AnchorPosition
  toAnchor: AnchorPosition
  style: string
  curve?: 'natural' | 'step'
}

type AnchorPosition = 'left' | 'right' | 'top' | 'bottom' |
                      'bottomLeft' | 'bottomRight' | 'topLeft' | 'topRight'

interface ConnectorStyle {
  color: DiagramColor
  strokeWidth: number
  label?: string
  dashed?: boolean
}
```

## Advanced Fields

```typescript
// Group frames
interface GroupShape {
  id: string; x: number; y: number; width: number; height: number
  type: 'rect' | 'circle'; color: DiagramColor
  label?: string; dashed?: boolean
}

// Auto-layout hints (see docs/group-layout.md)
interface LayoutHints {
  nodes?: Record<string, { group?: string; layer?: number; order?: number }>
  groups?: Record<string, { direction?: 'horizontal' | 'vertical'; padding?: number; ... }>
}

// Hover/select story (player chrome)
interface FocusTarget {
  mode?: 'append' | 'replace'
  nodes?: string[]
  connectors?: Array<{ from: string; to: string } | { id: string }>
  caption?: string
  steps?: Array<{ icon: string; label: string }>
}

// Guided view / chapter (player chrome; see docs/views.md)
interface DiagramView {
  id: string            // stable slug — deep-link key (/player/<s>?view=<id>)
  title: string
  node?: string         // anchor: behaves like selecting the node
  mode?: 'append' | 'replace'
  nodes?: string[]
  connectors?: Array<{ from: string; to: string } | { id: string }>
  caption?: string
  steps?: Array<{ icon: string; label: string }>
}
```

## Saved File Metadata

```json
{
  "layout": { ... },
  "nodes": { ... },
  "_meta": {
    "themeId": "engineering",
    "colorMode": "light",
    "viewMode": "2d",
    "isoStyle": "blueprint",
    "viewport": { "width": 800, "height": 400 }
  }
}
```

## Utilities

```typescript
import { ArcDiagram, autoLayout, renderAscii, validateDiagramShape, isDiagramShape, toTypeScriptSource, getTheme, getThemeList } from '@hudsonkit/arc'

const err = validateDiagramShape(json)  // null = valid, else error string
const ascii = renderAscii(diagram)
const laidOut = autoLayout(diagram)
const ts = toTypeScriptSource(diagram, 'myDiagram')
```

## Theme API

```typescript
import { getTheme, getThemeList, THEMES } from '@hudsonkit/arc'

const theme = getTheme('engineering')
const palette = theme.light.palette.violet
```

Theme IDs: `default`, `warm`, `cool`, `mono`, `engineering`, `workbench`, `tactical`, `command`, `spacex`, `claude`, `codex`

## Valid Values Quick Reference

| Property | Valid Values |
|----------|-------------|
| `size` | `'xs'`, `'s'`, `'m'`, `'l'` |
| `color` | `'violet'`, `'emerald'`, `'blue'`, `'amber'`, `'sky'`, `'zinc'`, `'rose'`, `'orange'` |
| `theme` | eleven ThemeIds above |
| `mode` | `'light'`, `'dark'` |
| `anchor` | `'left'`, `'right'`, `'top'`, `'bottom'`, corner variants |
| `curve` | `'natural'`, `'step'` |

## Icons (Lucide string names)

**Infrastructure**: Server, Database, Cloud, CloudCog, HardDrive, Network, Cpu
**Interfaces**: Monitor, Smartphone, Laptop, Globe, Terminal
**Services**: MessageSquare, Mail, Bell, Shield, Lock, Key
**Data**: FileText, Folder, Package, Archive, Layers
**Connectivity**: Wifi, Radio, Plug, Cable, Router
**Actions**: RefreshCw, Download, Upload, Send, Zap

Full registry: `src/utils/iconRegistry.ts`
