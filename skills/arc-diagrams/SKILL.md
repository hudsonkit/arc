---
name: arc-diagrams
description: Create architecture diagrams using Arc's JSON format. Use when asked to "create an architecture diagram", "draw a system diagram", "visualize the architecture", or "make a diagram of".
---

# Arc Diagrams

Arc is a visual diagram editor for creating architecture diagrams. This skill enables you to generate Arc-compatible diagram configs that can be rendered in React applications.

## When to Use

Activate this skill when the user asks to:
- "Create an architecture diagram"
- "Draw a system diagram"
- "Visualize the architecture"
- "Make a diagram showing..."
- "Design a flow diagram"

## Diagram Format

Arc diagrams are JSON objects with this structure:

```typescript
interface ArcDiagramData {
  layout: { width: number; height: number }
  nodes: Record<string, NodePosition>
  nodeData: Record<string, NodeData>
  connectors: Connector[]
  connectorStyles: Record<string, ConnectorStyle>
  flows?: DiagramFlow[]
}
```

## Creating a Diagram

### 1. Define Layout

Set canvas dimensions (default 1600x900 for editor, smaller for exports):

```json
"layout": { "width": 860, "height": 400 }
```

### 2. Position Nodes

Each node needs an `x`, `y` position and `size`:

```json
"nodes": {
  "frontend": { "x": 50,  "y": 100, "size": "l" },
  "api":      { "x": 300, "y": 100, "size": "m" },
  "database": { "x": 550, "y": 100, "size": "m" }
}
```

**Size options** (canonical — use these):
| Size | Key | Dimensions (px) |
|------|-----|-----------------|
| Extra Small | `xs` | 80 × 36 |
| Small | `s` | 110 × 48 |
| Medium | `m` | 160 × 75 |
| Large | `l` | 220 × 90 |

Source: `src/utils/constants.ts` → `NODE_SIZES`. Do **not** use `large`/`normal`/`small`.

### 3. Define Node Data

Each node needs an icon, name, and color:

```json
"nodeData": {
  "frontend": {
    "icon": "Monitor",
    "name": "Frontend",
    "subtitle": "React",
    "description": "User interface",
    "color": "violet"
  },
  "api": {
    "icon": "Server",
    "name": "API",
    "subtitle": "Node.js",
    "description": "REST endpoints",
    "color": "emerald"
  },
  "database": {
    "icon": "Database",
    "name": "PostgreSQL",
    "subtitle": "Storage",
    "description": "Persistent data",
    "color": "blue"
  }
}
```

**Available icons (from Lucide):**
- **Devices:** Monitor, Server, Smartphone, Watch, Cloud, Cpu, Database, HardDrive
- **Network:** Wifi, Globe
- **Users:** User, Users
- **Security:** Lock, Key, Shield
- **Media:** Mic, Camera, Speaker, Headphones
- **Code:** Code, Terminal, FileCode, Folder
- **Data:** Zap, Activity, BarChart, PieChart
- **Flow:** ArrowRight, ArrowDown, RefreshCw, Repeat
- **Structure:** Box, Package, Layers, Grid
- **UI:** Settings, Bell, Mail, MessageSquare, Search, Filter
- **Actions:** Download, Upload, Play, Pause, Square, Circle

**Available colors:**
`violet` | `emerald` | `blue` | `amber` | `sky` | `zinc` | `rose` | `orange`

### 4. Connect Nodes

Define connections between nodes:

```json
"connectors": [
  {
    "from": "frontend",
    "to": "api",
    "fromAnchor": "right",
    "toAnchor": "left",
    "style": "http"
  },
  {
    "from": "api",
    "to": "database",
    "fromAnchor": "right",
    "toAnchor": "left",
    "style": "sql"
  }
]
```

**Anchor positions:**
`top` | `bottom` | `left` | `right` | `bottomLeft` | `bottomRight` | `topLeft` | `topRight`

**Optional:** Add `"curve": "natural"` or `"curve": "step"` for curved connectors.

**Stable identity:** Give a connector an `id` when it may be referenced by a focus story or guided view, reviewed in a diff, or when another connector shares the same `from`/`to` pair. Without an `id`, a connector is only addressable by endpoint pair or array index.

**Guided views:** when the diagram explains a flow a reader should follow in order, add `views[]` — `{id, title, node?, nodes?, connectors?, mode?, caption?, steps?}` per chapter. The player draws a chapter rail (`showViews`) and `/player/<session>?view=<id>` deep-links a chapter. A view anchored on `node` inherits that node's `focusTargets` story; declare `nodes`/`connectors`/`mode` to override it.

### 5. Animate message flows

Add `flows[]` when a message or packet should travel the diagram rather than a connector merely having motion styling:

```json
"flows": [
  {
    "id": "request",
    "label": "Request",
    "legs": [
      { "id": "client-api" },
      { "id": "api-db", "pause": 0.4 }
    ],
    "duration": 3,
    "delay": 0.2,
    "hold": 0.6,
    "repeat": "indefinite",
    "easing": "ease-in-out",
    "marker": "packet",
    "color": "emerald",
    "size": 11,
    "trail": "wake"
  }
]
```

- Each leg references a connector by stable `id` (preferred) or endpoint `{ "from": "...", "to": "..." }`; add `direction: "reverse"` to run a leg backwards and `pause` to dwell between hops.
- Timing is deterministic: `speed` is px/s (default 160), `duration` is total route seconds including pauses and overrides `speed`, `delay`/`hold` are seconds, and `repeat` is a count or `"indefinite"`.
- `marker` is `dot` (default), `packet`, `pulse`, or `arrow`; `trail` is `none`, `fade`, or `wake`; `color`/`size` tune the marker.
- Standalone SVG animates via SMIL, `render_svg`/`render_png` can sample a still at `flowTime`, and `arc render --format gif|mp4` or MCP `render_animation` captures deterministic frames through Chrome and encodes with ffmpeg.

### 6. Style Connectors

Define appearance for each connector style:

```json
"connectorStyles": {
  "http": { "color": "amber", "strokeWidth": 2, "label": "HTTP" },
  "sql": { "color": "blue", "strokeWidth": 2, "label": "SQL" },
  "async": { "color": "zinc", "strokeWidth": 1.5, "dashed": true }
}
```

## Complete Example

Here's a full diagram for a typical web application:

```json
{
  "layout": { "width": 700, "height": 300 },
  "nodes": {
    "client":   { "x": 50,  "y": 100, "size": "l" },
    "api":      { "x": 300, "y": 100, "size": "m" },
    "cache":    { "x": 300, "y": 220, "size": "s" },
    "database": { "x": 520, "y": 100, "size": "m" }
  },
  "nodeData": {
    "client":   { "icon": "Monitor",  "name": "Client",   "subtitle": "React",    "color": "violet" },
    "api":      { "icon": "Server",   "name": "API",      "subtitle": "Express",  "color": "emerald" },
    "cache":    { "icon": "Zap",      "name": "Cache",    "subtitle": "Redis",    "color": "amber" },
    "database": { "icon": "Database", "name": "Database", "subtitle": "Postgres", "color": "blue" }
  },
  "connectors": [
    { "from": "client", "to": "api",      "fromAnchor": "right",  "toAnchor": "left", "style": "http" },
    { "from": "api",    "to": "database", "fromAnchor": "right",  "toAnchor": "left", "style": "sql" },
    { "from": "api",    "to": "cache",    "fromAnchor": "bottom", "toAnchor": "top",  "style": "cache" }
  ],
  "connectorStyles": {
    "http":  { "color": "amber",   "strokeWidth": 2, "label": "HTTP" },
    "sql":   { "color": "blue",    "strokeWidth": 2, "label": "SQL" },
    "cache": { "color": "emerald", "strokeWidth": 2, "label": "cache" }
  }
}
```

## Layout judgment

The contract past "does it validate": a good Arc diagram reads top-to-bottom or left-to-right in one glance. These are the composition rules `validateDiagram` partially enforces (`composition/*` warnings) and the rest is on you.

**Budget.** ≤12 nodes per flat view. Past ~16 without `groups`/`layoutHints`/`views`, `composition/too-dense` warns — the fix is chaptering, not a bigger canvas: split into `groups` + `layoutHints` for regions, or `views[]` for a walkthrough.

**One spine.** Pick one dominant flow direction and hold it: left→right for request/data paths, top→bottom for stacks and pipelines. Everything not on the spine (replicas, sidecars, observability taps) sits on a parallel lane — above/below for a horizontal spine — and reads as secondary: `zinc` color, `dashed`, thinner `strokeWidth`.

**Spacing math.** `NODE_SIZES` are xs 80×36, s 110×48, m 160×75, l 220×90. Budget ~150–200px of horizontal pitch between connected nodes (edge gap ≈ 40–80px of clear channel for the stroke + label), ~60–100px vertically. Keep sibling nodes on one baseline and aligned to a ~50px grid when hand-placing.

**When to autoLayout.** Call `autoLayout()` (or the editor's auto-layout) when node count exceeds ~8, when groups own their members via `layoutHints`, or when the graph is dense and any hand order will cross edges. Hand-place only when the shape itself carries meaning (a ring, a hub-and-spoke) and the node count is small.

**Labels.** The name row is what scans. Budget by size: xs ~5, s ~9, m ~17, l ~26 chars (`composition/label-overflow` warns past it, and suggests the next size up). Prefer `subtitle` for the qualifier instead of a long name — "API" + subtitle "Express" beats "Express API Server".

**Routing.** Anchors take the direction of travel: `right→left` on a horizontal spine, `bottom→top` on a vertical one. Never route a connector through an unrelated node (`geometry/connector-through-node` is an error). Diagonal corner anchors (`bottomRight` etc.) are for fan-out, not the spine. Give an `id` to any connector a focus story or view will reference, and to parallel edges sharing `from`/`to`.

## Validation and repair

Always validate before handing off JSON.

- In the repo, call `validateDiagram(value)` from `src/utils/diagramDiagnostics.ts`.
- Through MCP, call `validate_diagram`; it returns `{ ok, diagnostics }`.
- `validateDiagramShape()` remains the low-level shape gate; `validateDiagram` wraps it and adds repairable diagnostics.

Each diagnostic has a stable `code`, `severity`, `subject`, human `message`, optional `evidence`, and `supportedFixes`.

Repair loop:

1. Read `diagnostics`; fix `severity: "error"` before warnings.
2. Apply one `supportedFixes` entry when offered, or make the direct correction it names.
3. Re-validate the edited document.
4. Repeat until no error-severity diagnostics remain; leave warnings only when intentional.

Common codes:

- `shape/*` — malformed document or entries; fix these before anything else.
- `semantic/dangling-connector-endpoint` — retarget `from`/`to` or remove the connector.
- `semantic/unknown-*` and `semantic/duplicate-connector-id` — use the suggested valid value or unique connector `id`.
- `geometry/node-overlap`, `geometry/connector-through-node`, `geometry/node-outside-layout` — move nodes or run `autoLayout()`.
- `composition/too-dense`, `composition/label-overflow` — advisory budget warnings: chapter the diagram, or resize the node.

## Preview and export

- `render_ascii` previews a diagram in plain text without external dependencies.
- `render_svg` returns deterministic SVG markup; authored `flows` animate via SMIL by default, `flowTime` samples a deterministic still, and `animateFlows: false` disables them.
- `render_png` returns MCP image content when Chrome/Chromium is installed; set `ARC_CHROME` when it is not on `PATH`, and use `flowTime` to choose a deterministic animation frame. If it returns `render/chrome-unavailable`, continue with ASCII/SVG or ask the user to install Chrome/Chromium.
- `render_animation` writes a GIF or MP4 for diagrams with `flows`; set `output` to a `.gif`/`.mp4` path, optionally `duration`, `fps`, `scale`, `theme`, and `mode`. It needs Chrome/Chromium plus ffmpeg (`ARC_CHROME`/`ARC_FFMPEG`).
- `render_html` emits paste-ready output: `format=component` for a React TSX component, `format=iframe` for a studio embed tag, or `format=html` for a standalone SVG page.
- The CLI equivalent is `arc render diagram.json --out artifact.gif --duration 4 --fps 12`.

## Output

When generating a diagram, output:
1. The complete JSON config
2. Brief explanation of the architecture shown
3. Suggest the user save it as a `.arc.json` file or paste into the Arc editor

## TypeScript Export

For React projects, diagrams can be exported as TypeScript:

```typescript
import type { ArcDiagramData } from '@hudsonkit/arc'

const diagram: ArcDiagramData = {
  // ... config here
}

export default diagram
```
