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

## Native exploded views

`ArcExploded` renders a typed assembly with separate assembled and exploded positions. Open the [exploded examples](/exploded) to inspect the AI stack and phone, change separation, or download their source.

```tsx
import { ArcExploded, phoneExploded, renderExplodedSvg } from '@hudsonkit/arc'

<ArcExploded
  document={phoneExploded}
  progress={1}
  mode="light"
  style={{ width: '100%', height: 700 }}
/>

const svg = renderExplodedSvg(phoneExploded) // Fully exploded, standalone SVG
const assembledSvg = renderExplodedSvg(phoneExploded, { progress: 0, mode: 'dark' })
```

The component is controlled. `progress` defaults to `1` (exploded); `0` means assembled. Intermediate values move parts along the vertical world axis. The caller controls animation timing. The example page respects reduced motion and provides a keyboard-accessible slider.

| Property | Default | Behavior |
| --- | --- | --- |
| `document` | Required | An `ExplodedDocument` with `kind: 'exploded'` and `version: 1` |
| `progress` | `1` | A finite number from 0 to 1 |
| `mode` | `'light'` | `'light'` or `'dark'` |
| `labels` | `true` | Labels and horizontal leaders at full separation |
| `guides` | `true` | Dashed assembly guides behind parts |
| `className`, `style` | Unset | React container styling; set its height to fit the embedding surface |

`renderExplodedSvg(document, options)` accepts the same render options. It uses the same scene geometry as React. Exports contain their colors and geometry, with system-font fallbacks and no external assets. The exporter has no DOM dependency.

### Assembly document

An assembly contains 1–100 parts. All distances use the same world unit. The fixed 2:1 dimetric projection maps `(x, y, z)` to `(x - y, (x + y) / 2 - z)`.

Each part has a stable `id`, `label`, world footprint (`x`, `y`, `width`, `depth`, optional `radius`), positive `height`, `assembledZ`, and integer `level`. Optional `description` supplies the label's second line. `tone` is `surface`, `muted`, `dark`, or `accent`.

- `assembledZ` is the absolute elevation of the part's bottom face. It is never inferred from separation order.
- `level` orders separation from bottom to top. Parts on one level move together and preserve their relative assembled elevations. Level numbers can be sparse.
- `gap` is an optional minimum air gap. Layout derives a gap from projected footprints and solid thickness, then increases it to clear labels and horizontal leaders.
- `housing: { wall, floor }` creates an open tray. A child's `containerId` references that housing. Children must fit its rounded cavity in the assembled state and have a higher separation level. Coordinates remain absolute.
- `details` contains local footprints on a part's top face. A detail's optional `height` creates a raised solid; omitting it creates a flat mark. Details use the same `tone` values. Housing contents use separate parts instead.

`layoutExploded(document, labels?)` returns part elevations, leader anchors, the chosen gap, and stable bounds covering both assembly states. `validateExplodedDocument(unknown)` validates JSON and throws a field-specific error. Rendering calls validation automatically. Invalid dimensions, duplicate IDs, containment cycles, and contents outside a housing are rejected.

If labels conflict within the same level, layout reports the part IDs. Reposition those parts or set `labels={false}` and provide a separate legend. The label-free layout can use a smaller gap. Both examples provide such a legend on narrow screens.

### Current integration boundary

This document family is exported from `@hudsonkit/arc`. Use `ArcExploded` for these documents. The graph editor, graph CLI/MCP exporters, `@hudsonkit/arc-viewer`, and `@hudsonkit/arc-iso` do not accept this family yet. Existing graph schemas and the legacy 30-degree isometric projection remain separate.

The initial renderer supports rounded slabs, open housings, and top-face details. It does not perform general CAD collision detection or render arbitrary meshes, transparency, or intersecting solids. Author non-intersecting assemblies and use `containerId` for cavity contents.

The geometry and example direction were informed by [Cathryn Lavery's Diagram Design](https://github.com/cathrynlavery/diagram-design). Arc implements the model, layout, renderer, and exports natively.

## Panel cubes

`ArcPanelCube` renders a conceptual shell with three named front faces and three
quiet rear panels. The plates separate outward along their normals. Graphite
gradients, edge highlights, a soft shadow, and fine callouts are included in both
React and static SVG output. See the [interactive example](/panel-cube).

```tsx
import { useState } from 'react'
import { ArcPanelCube, fieldRecorderCube, renderPanelCubeSvg } from '@hudsonkit/arc'

function RecorderCube() {
  const [rotation, setRotation] = useState({ yaw: 0, pitch: 0 })

  return (
    <ArcPanelCube
      data={fieldRecorderCube}
      progress={1}
      rotation={rotation}
      onRotationChange={setRotation}
      rotationHandles
      activeFace="capture"
      style={{ width: '100%', height: 480 }}
    />
  )
}

const svg = renderPanelCubeSvg(fieldRecorderCube, {
  progress: 1,
  rotation: { yaw: 30, pitch: 15 },
})
```

| Property | Default | Behavior |
| --- | --- | --- |
| `data` | Required | A `PanelCubeDocument` with `kind: 'panel-cube'`, `version: 1`, `id`, `title`, optional `description`, and `faces` |
| `progress` | `1` | Separation from 0 (closed) to 1 (open), with a fixed viewport |
| `rotation` | `{ yaw: 0, pitch: 0 }` | A `PanelCubeRotation` in degrees, relative to the initial view |
| `onRotationChange` | Unset | Enables pointer drag and keyboard rotation; receives the next `{ yaw, pitch }` for the host to store |
| `rotationHandles` | `false` | Adds interactive **Turn** and **Tilt** rings around the object when `onRotationChange` is supplied |
| `onRotateStart` | Unset | Called when free dragging crosses its threshold, a ring is grabbed, or a rotation key is used; use it to stop host-controlled auto-spin |
| `activeFace` | `null` | The ID of the emphasized face |
| `labels` | `true` | Callouts around the object; provide external labels when disabling them |
| `onFaceChange` | Unset | Transient hover/focus callback with a face ID or `null` |
| `onFaceSelect` | Unset | Face activation by click, Enter, or Space |
| `className`, `style` | Unset | Container styling; give the illustration a height |

Each face has a unique `id`, `label`, optional `description`, and `side` of
`'top'`, `'left'`, or `'right'`. Include each side exactly once. The renderer
validates the document. Keep labels short; the example places descriptions below
the object on all screen sizes.

With `onRotationChange`, drag the object with a mouse, pen, or touch. Focus it
and use the arrow keys to rotate, or Home to reset the view. Interactive pitch
is limited to -75–75 degrees; yaw can turn freely. Rotation changes the projected
3D geometry. The renderer accepts any finite yaw and pitch for authored stills.

Set `rotationHandles` to add **Turn** and **Tilt** rings with draggable grips
around the cube. Turn changes only `rotation.yaw`; Tilt changes only
`rotation.pitch`. Each ring supports mouse, pen, touch, and keyboard input.
Focus a ring and use the arrow keys to adjust its axis, or Home to reset only
that axis. Free dragging on the cube continues to adjust both axes.
The rings fade in on hover or keyboard focus and stay visible during a drag.
They fade out when interaction ends; retained mouse focus does not keep them
visible. Touch layouts keep the rings visible, and reduced motion removes the fade.

The host controls animation and selection. Optional **Auto-spin**, **Stop spin**,
and **Reset view** controls accompany manual rotation. The example starts closed;
only **Open cube** and **Close cube** change expansion. Hover, focus, rotation,
and face selection preserve that choice. Auto-spin turns at 12
degrees per second and stops when dragging, keyboard rotation, or a ring handle
is used. It is unavailable under `prefers-reduced-motion: reduce`; opening and
closing also change directly to the target under that preference. Visible part
buttons support touch and keyboard selection.

This is a conceptual illustration of three aspects of a whole, not a dimensional
model. Its transparent canvas and graphite material are intended for a light
surface.

`layoutPanelCube(data, progress, rotation?)` returns the projected geometry for
that view. `renderPanelCubeSvg(data, { progress, rotation, activeFace, labels })`
captures one static state using the same scene as React. Pass the current
`rotation` to preserve the view the reader chose. Interactive rotation rings are
React controls and are excluded from static SVG. The SVG contains its gradients
and shadow, has no DOM dependency, and is deterministic. React instances have
separate SVG IDs. When embedding identical exported SVG strings inline, isolate
them (for example, with an `<img>`); their deterministic IDs are identical.
Review each rotation axis independently and check that leaders stay short,
uncluttered, and attached to the intended panel across views.

This API is exported by `@hudsonkit/arc`. The architecture editor, graph CLI/MCP
tools, `@hudsonkit/arc-viewer`, and `@hudsonkit/arc-iso` do not accept this document
family.
