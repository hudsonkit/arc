---
title: API Reference
description: Complete API reference for Arc components and types
order: 3
---

# API Reference

## ArcDiagram Component

```tsx
interface ArcDiagramProps {
  data: ArcDiagramData     // Diagram configuration
  mode?: 'light' | 'dark'  // Color mode (default: 'dark')
  theme?: ThemeId          // Theme preset (default: 'default')
  interactive?: boolean    // Enable zoom/pan (default: true)
  className?: string       // Additional CSS classes

  // Zoom
  defaultZoom?: number | 'fit'  // Initial zoom, or 'fit' to size to the container
  maxFitZoom?: number           // Cap applied when defaultZoom='fit' (default: 1)
  zoomLevels?: number[]         // Zoom steps for the +/- controls

  // Chrome
  showControls?: boolean   // Zoom controls (default: follows `interactive`)
  showLegend?: boolean     // Key for connector styles + labelled groups (default: false)
  showMinimap?: boolean    // Minimap overview, bottom-left (default: false)
  showArcToggle?: boolean  // .arc source toggle (default: true)
  showFocusStory?: boolean // Caption + steps for the active focusTarget (default: false)
  showAutoLayout?: boolean // Auto-layout button (default: false)
  animateFlows?: boolean   // SMIL flow animation layer (default: true)
  flowTime?: number        // Sample flows at a deterministic second instead of animating
  label?: string           // Overrides data.id; pass '' to hide
  labelPosition?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  frame?: BrandSpec['frame']    // Override the theme's edge treatment
  titleBlock?: TitleBlockInfo   // Override title-block fields (themes that opt in)

  // Interaction
  hoverEffects?: boolean | HoverEffectsConfig  // true = all effects (default)
  onNodeHover?: (nodeId: string | null) => void
}
```

Every one of these is live at [`/showcase`](/showcase), which emits the matching
JSX for whatever combination you dial in.

## ArcDiagramData Schema

A generated JSON Schema (draft-07) ships at `schemas/arc-diagram.schema.json` —
use it to validate diagram JSON in tooling or to give agents the exact contract.
Closed object types declare `additionalProperties: false`; the `Record` maps
(`nodes`, `nodeData`, `connectorStyles`, `focusTargets`, `layoutHints.*`) keep
open keys. Regenerate with `bun run generate:schema`.

```typescript
interface ArcDiagramData {
  id?: string                                    // Optional diagram identifier
  layout: { width: number; height: number }     // Canvas dimensions
  nodes: Record<string, NodePosition>           // Node positions by ID
  nodeData: Record<string, NodeData>            // Node display data by ID
  connectors: Connector[]                       // Connection definitions
  connectorStyles: Record<string, ConnectorStyle> // Style definitions
  flows?: DiagramFlow[]                          // Animated message routes across connectors
}
```

## Node Types

```typescript
interface NodePosition {
  x: number           // X coordinate
  y: number           // Y coordinate
  size: 's' | 'm' | 'l'  // Node size (small, medium, large)
}

interface NodeData {
  icon: string        // Lucide icon name (e.g., 'Monitor', 'Server', 'Database')
  name: string        // Display name
  subtitle?: string   // Optional subtitle
  description?: string // Optional description
  color: DiagramColor // Color theme for this node
  source?: DiagramSource // Code this node describes: { path, line?, endLine?, commit? }
}

type DiagramColor = 'violet' | 'emerald' | 'blue' | 'amber' | 'sky' | 'zinc' | 'rose' | 'orange'
```

## Connector Types

```typescript
interface Connector {
  from: string          // Source node ID
  to: string            // Target node ID
  fromAnchor: AnchorPosition  // Where to attach on source
  toAnchor: AnchorPosition    // Where to attach on target
  style: string         // Reference to connectorStyles key
  curve?: 'natural' | 'step'  // Line curve style (default: 'natural')
}

type AnchorPosition = 'left' | 'right' | 'top' | 'bottom' |
                      'bottomLeft' | 'bottomRight' | 'topLeft' | 'topRight'

interface ConnectorStyle {
  color: DiagramColor   // Line color
  strokeWidth: number   // Line thickness (1-4 recommended)
  label?: string        // Optional label text
  labelAlign?: 'left' | 'right' | 'center'  // Label position
  dashed?: boolean      // Dashed line style
}
```

## Flow Animations

`flows[]` sends a marker along an ordered connector route — for a request,
event, or packet — without changing the connector itself:

```typescript
interface DiagramFlow {
  id: string
  label?: string
  legs: DiagramFlowLeg[]                 // ordered connector refs
  direction?: 'forward' | 'reverse'      // default direction for every leg
  speed?: number                         // px/s; ignored when duration is set
  duration?: number                      // total seconds, including leg pauses
  delay?: number                         // seconds before the first run
  hold?: number                          // seconds hidden at each run's end
  repeat?: number | 'indefinite'         // default 'indefinite'
  easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'
  marker?: 'dot' | 'packet' | 'pulse' | 'arrow'
  color?: DiagramColor                   // defaults to the first leg's style color
  size?: number                          // marker diameter in px (default 10)
  trail?: 'none' | 'fade' | 'wake'
}

interface DiagramFlowLeg {
  id?: string                            // preferred connector reference
  from?: string; to?: string             // endpoint-pair fallback
  direction?: 'forward' | 'reverse'
  pause?: number                         // dwell before the next leg
}
```

Standalone SVGs animate via SMIL by default. `<ArcDiagram />` and `render_svg`
accept `flowTime` to sample a deterministic still and `animateFlows={false}` to
suppress motion; `render_png` always samples `flowTime` (default `0`). GIF and
MP4 exports are produced by deterministic frame capture in Chrome plus ffmpeg:
`arc render diagram.json --out artifact.gif --duration 4 --fps 12`, or the MCP
`render_animation` tool with an `output` path ending in `.gif` or `.mp4`.

## Themes

Arc includes 11 built-in themes:

| Theme ID | Name | Description |
|----------|------|-------------|
| default | Default | Balanced, vibrant colors |
| warm | Warm | Editorial, earth tones |
| cool | Cool | Technical, blue-focused |
| mono | Mono | Grayscale for print |
| engineering | Engineering | Structured blueprint plate |
| workbench | Workbench | Quiet hardware/drafting bench |
| tactical | Tactical | Hard-edged field diagram |
| command | Command | Glass mission console |
| spacex | SpaceX | Mission plate, telemetry cyan |
| claude | Claude | Warm parchment, clay accents |
| codex | Codex | Graphite console, mint signal |

### Theme API

```typescript
import { getTheme, getThemeList, THEMES } from '@hudsonkit/arc'

// Get a specific theme
const theme = getTheme('warm')

// List all available themes
const themes = getThemeList()

// Access theme colors
const palette = theme.light.palette.violet
// { border: '#...', bg: '#...', icon: '#...', stroke: '#...' }
```

## Available Icons

Arc uses Lucide React icons. Common architecture icons:

- **Infrastructure**: Server, Database, Cloud, CloudCog, HardDrive, Network, Cpu
- **Interfaces**: Monitor, Smartphone, Laptop, Globe, Terminal
- **Services**: MessageSquare, Mail, Bell, Shield, Lock, Key
- **Data**: FileText, Folder, Package, Archive, Layers
- **Connectivity**: Wifi, Radio, Plug, Cable, Router
- **Actions**: RefreshCw, Download, Upload, Send, Zap

## Source Links

`nodeData[<id>].source` lets a node cite the code it describes:

```json
{ "source": { "path": "src/auth/session.ts", "line": 12, "endLine": 40, "commit": "a1b2c3" } }
```

- `sourceLabel(source)` → `src/auth/session.ts:12-40` (shown on node hover)
- `sourceUrl(source, { repo: 'owner/name' })` → GitHub blob URL pinned at `ref` ?? `source.commit` ?? 'HEAD'; without `repo` returns `path#L<line>` for local tooling
- Nodes carry `data-arc-source="<path>"` so embedders can attach click-throughs
- `validateDiagram` flags malformed refs as `semantic/invalid-source` (fixable via `remove-source`)

## Export Formats

The Arc Editor and CLI can export diagrams as:
- **JSON**: Full diagram configuration
- **TypeScript**: Type-safe diagram constant
- **SVG**: Vector graphic (light or dark; flow animations are SMIL)
- **PNG**: Raster image sampled at `flowTime`
- **GIF / MP4**: Flow animations rendered from deterministic frames
