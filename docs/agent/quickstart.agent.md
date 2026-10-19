# Quickstart - Agent Context

## Install

```bash
npm install @hudsonkit/arc          # or: bun add @hudsonkit/arc
# Visual studio (not an npm one-liner for full shell):
git clone https://github.com/hudsonkit/arc && cd arc && bun install && bun run dev
```

## Minimal Example

```tsx
import { ArcDiagram } from '@hudsonkit/arc'
import type { ArcDiagramData } from '@hudsonkit/arc'

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
  return <ArcDiagram data={diagram} mode="light" theme="default" defaultZoom="fit" />
}
```

## Auto-layout (skip hand-positioning)

```typescript
import { autoLayout } from '@hudsonkit/arc'

const diagram = autoLayout({
  nodeData: {
    client: { icon: 'Monitor', name: 'Client', color: 'violet' },
    api: { icon: 'Server', name: 'API', color: 'emerald' },
    db: { icon: 'Database', name: 'DB', color: 'blue' },
  },
  connectors: [
    { from: 'client', to: 'api', style: 'http' },
    { from: 'api', to: 'db', style: 'sql' },
  ],
  connectorStyles: {
    http: { color: 'violet', strokeWidth: 2, label: 'HTTP' },
    sql: { color: 'blue', strokeWidth: 2, label: 'SQL' },
  },
})
```

## Props Reference

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `data` | `ArcDiagramData` | required | Diagram config |
| `mode` | `'light' \| 'dark'` | `'light'` | Color mode |
| `theme` | `ThemeId` | `'default'` | Diagram theme |
| `interactive` | `boolean` | `true` | Pan/zoom |
| `defaultZoom` | `number \| 'fit'` | `1` | Initial zoom |
| `maxFitZoom` | `number` | `1` | Cap when `defaultZoom='fit'` |
| `hoverEffects` | `boolean \| object` | `true` | Hover highlighting |
| `showLegend` | `boolean` | `false` | Connector/group key |

## Theme Options

Eleven diagram themes, each with light/dark: `default`, `warm`, `cool`, `mono`,
`engineering`, `workbench`, `tactical`, `command`, `spacex`, `claude`, `codex`.

```tsx
<ArcDiagram data={d} mode="light" theme="engineering" />
<ArcDiagram data={d} mode="dark" theme="tactical" />
```

## Dev Commands

```bash
bun run dev        # Studio at http://localhost:5188/editor
bun run build
bun run lint
bun run typecheck
```

## Verify Your Work

See `docs/agent/verification.agent.md` for dev server URLs, session seeding,
and the `/capture/:sessionId` PNG endpoint.
