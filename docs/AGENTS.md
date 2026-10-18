---
title: LLM Documentation
description: Agent-friendly documentation for AI coding assistants
order: 6
---

# arc

> Diagrams as Code - Visual editor for architecture diagrams that live in your codebase

## Critical Context

**IMPORTANT:** Read these rules before making any changes:

- Arc exports four npm packages: @arach/arc (full editor), @arach/arc-viewer (lightweight viewer), @arach/arc-iso (isometric renderer), and @arach/arc-mcp (MCP server)
- Diagrams are stored as declarative JSON/TypeScript configs, not binary files
- The editor uses useReducer + Context for state management (EditorProvider)
- Never modify diagram configs without understanding the schema in src/types/
- Exports should be deterministic - same input = same output for diffability

## Project Structure

| Component | Path |
|-----------|------|
| Editor | src/components/editor/ |
| Isometric | src/iso/ |
| Landing Page | src/components/LandingPage.tsx |
| Documentation | src/components/docs/ |
| Utilities | src/utils/ |
| Types | src/types/ |

## Quick Navigation

- Entry point: `src/main.tsx`
- Routes: `src/App.tsx`
- Editor shell: `src/apps/arc-editor/createArcApp.tsx`
- Canvas + reducer: `src/components/editor/`
- Diagram schema: `src/types/diagram.ts`
- Example diagrams: `src/components/diagrams/*.diagram.ts`
- Contributor guide: `CLAUDE.md` (repo root)

## MCP Support

**Shipped** as the `arc-mcp` bin on `@arach/arc-mcp` (`packages/mcp/src/server.ts`). See `docs/agent/mcp.agent.md`.

## Package Decision Tree

| Goal | Use |
|------|-----|
| Render 2D diagram in React | `@arach/arc` or `@arach/arc-viewer` |
| Mermaid sequences | `@arach/arc-viewer` |
| Isometric renderer | `@arach/arc-iso` |
| Full visual studio | Clone repo → `bun run dev` → `/editor` |

Details: `docs/agent/packages.agent.md`

## Overview

Arc is a React component library for rendering beautiful, interactive architecture diagrams. It provides a declarative JSON format for defining diagrams and multiple built-in themes.

## Why Arc?

Architecture diagrams typically live in design tools, disconnected from the code they describe. Arc keeps diagrams as declarative configs that:

- **Version with your code** - Diffs show exactly what changed
- **Render anywhere** - Use the lightweight player or export to SVG/PNG
- **Stay consistent** - Templates enforce color palettes and sizing rules

## Packages

| Package | Description |
|---------|-------------|
| `@arach/arc` | Full editor + renderer |
| `@arach/arc-viewer` | Lightweight diagram viewer |
| `@arach/arc-iso` | Isometric diagram renderer |
| `@arach/arc-mcp` | MCP server — diagram tools for AI agents |

## Key Features

- **Declarative Format** - Diagrams are data structures
- **Templates** - Structural presets for layout
- **Themes** - Color and decor palettes (default, warm, cool, mono, engineering, workbench, tactical, command, spacex, claude, codex)
- **Export** - SVG, PNG, JSON, TypeScript

## Links

- [GitHub Repository](https://github.com/hudsonkit/arc)
- [NPM: @arach/arc](https://www.npmjs.com/package/@arach/arc)
- [NPM: @arach/arc-mcp](https://www.npmjs.com/package/@arach/arc-mcp)

## Quickstart

### Installation

```bash
npm install @arach/arc
```

### Quick Start

```tsx
import { ArcDiagram } from '@arach/arc'
import type { ArcDiagramData } from '@arach/arc'

const diagram: ArcDiagramData = {
  layout: { width: 600, height: 300 },
  nodes: {
    frontend: { x: 50, y: 100, size: 'm' },
    backend: { x: 250, y: 100, size: 'm' },
    database: { x: 450, y: 100, size: 'm' },
  },
  nodeData: {
    frontend: { icon: 'Monitor', name: 'Frontend', color: 'violet' },
    backend: { icon: 'Server', name: 'Backend', color: 'emerald' },
    database: { icon: 'Database', name: 'Database', color: 'blue' },
  },
  connectors: [
    { from: 'frontend', to: 'backend', fromAnchor: 'right', toAnchor: 'left', style: 'api' },
    { from: 'backend', to: 'database', fromAnchor: 'right', toAnchor: 'left', style: 'db' },
  ],
  connectorStyles: {
    api: { color: 'violet', strokeWidth: 2, label: 'REST' },
    db: { color: 'blue', strokeWidth: 2, label: 'SQL' },
  },
}

function App() {
  return <ArcDiagram data={diagram} mode="light" theme="default" />
}
```

### Vanilla JavaScript

```html
<script type="module">
  import { renderDiagram } from '@arach/arc-iso'
  renderDiagram(document.getElementById('diagram'), diagramConfig)
</script>
```

## Development

```bash
bun run dev      # Start dev server (http://localhost:5188/editor)
bun run build    # Production build
bun run lint     # Run ESLint
bun run typecheck
```

## Architecture

### Major Modules

| Module | Path | Purpose |
|--------|------|---------|
| Editor | `src/components/editor/` | Visual drag-and-drop editor |
| Isometric | `src/iso/` | Isometric renderer |
| Utils | `src/utils/` | Shared helpers |

### State Model

```typescript
{
  diagram: { layout, nodes, nodeData, connectors, connectorStyles },
  editor: { selectedNodeIds, selectedConnectorIndex, mode, pendingConnector, isDragging, viewMode, themeId, colorMode },
  meta: { filename, isDirty, lastSaved },
  history: { past, future }
}
```

### Data Flow

1. User Action → Dispatch action to reducer
2. Reducer → Updates state immutably, pushes to history
3. Context → Propagates new state to components
4. Canvas → Re-renders affected nodes/connectors

### Diagram Config

```json
{
  "layout": { "width": 700, "height": 340 },
  "nodes": { "nodeId": { "x": 25, "y": 15, "size": "m" } },
  "nodeData": { "nodeId": { "icon": "Monitor", "name": "...", "color": "violet" } },
  "connectors": [{ "from": "a", "to": "b", "fromAnchor": "right", "toAnchor": "left", "style": "http" }],
  "connectorStyles": { "http": { "color": "amber", "strokeWidth": 2, "label": "HTTP" } }
}
```

## API Reference

### ArcDiagram Component

```tsx
interface ArcDiagramProps {
  data: ArcDiagramData     // Diagram configuration
  mode?: 'light' | 'dark'  // Color mode (default: 'light')
  theme?: ThemeId          // Theme preset (default: 'default')
  interactive?: boolean    // Enable zoom/pan (default: true)
  className?: string       // Additional CSS classes
}
```

### ArcDiagramData Schema

```typescript
interface ArcDiagramData {
  id?: string
  layout: { width: number; height: number }
  legend?: 'auto' | 'all' | 'hidden'  // authored legend policy
  _meta?: FileMeta                    // viewer/editor state; `locale` is BCP-47
  nodes: Record<string, NodePosition>
  nodeData: Record<string, NodeData>
  connectors: Connector[]
  connectorStyles: Record<string, ConnectorStyle>
  focusTargets?: Record<string, FocusTarget>
  flows?: DiagramFlow[]              // animated message routes — docs/api.md
  views?: DiagramView[]              // ordered guided chapters — docs/views.md
}
```

### Node Types

```typescript
interface NodePosition {
  x: number
  y: number
  size: 'xs' | 's' | 'm' | 'l'
}

interface NodeData {
  icon?: string          // Lucide name; omit when `kind` supplies it
  name: string
  subtitle?: string
  description?: string
  color?: DiagramColor   // omit when `kind` supplies it; overrides the kind default
  kind?: NodeKind        // semantic role — supplies default icon + color
  shape?: NodeShape      // per-node silhouette override
  source?: DiagramSource // { path, line?, endLine?, commit? } — code evidence link
}

type DiagramColor = 'violet' | 'emerald' | 'blue' | 'amber' | 'sky' | 'zinc' | 'rose' | 'orange'

// Semantic roles — `src/utils/nodeKinds.ts` maps each to a default palette
// color + Lucide icon, resolved at render time.
type NodeKind = 'frontend' | 'backend' | 'service' | 'database' | 'cache' | 'queue' |
                'storage' | 'gateway' | 'security' | 'user' | 'external' | 'observability'
```

### Connector Types

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
  labelAlign?: 'left' | 'right' | 'center'
  dashed?: boolean
}

interface DiagramFlow {
  id: string
  legs: Array<{ id?: string; from?: string; to?: string; direction?: 'forward' | 'reverse'; pause?: number }>
  direction?: 'forward' | 'reverse'
  speed?: number                    // px/s; ignored when duration is set
  duration?: number                 // total seconds including pauses
  delay?: number; hold?: number
  repeat?: number | 'indefinite'
  easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'
  marker?: 'dot' | 'packet' | 'pulse' | 'arrow'
  color?: DiagramColor
  size?: number
  trail?: 'none' | 'fade' | 'wake'
}
```

## Themes

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
import { getTheme, getThemeList, THEMES } from '@arach/arc'

const theme = getTheme('warm')
const themes = getThemeList()
const palette = theme.light.palette.violet
```

## Available Icons

Arc uses Lucide React icons:

- **Infrastructure**: Server, Database, Cloud, CloudCog, HardDrive, Network, Cpu
- **Interfaces**: Monitor, Smartphone, Laptop, Globe, Terminal
- **Services**: MessageSquare, Mail, Bell, Shield, Lock, Key
- **Data**: FileText, Folder, Package, Archive, Layers
- **Connectivity**: Wifi, Radio, Plug, Cable, Router
- **Actions**: RefreshCw, Download, Upload, Send, Zap

## Export Formats

- **JSON**: Full diagram configuration
- **TypeScript**: Type-safe diagram constant
- **SVG**: Vector graphic (light or dark; flows animate via SMIL)
- **PNG**: Raster image sampled at `flowTime`
- **GIF/MP4**: Animated flow artifacts via Chrome frames + ffmpeg
