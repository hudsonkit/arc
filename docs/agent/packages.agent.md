# Packages — Agent Context

## Decision Tree

```
Need to render a 2D architecture diagram in React?
├─ Yes, minimal install → @arach/arc-viewer
├─ Yes, plus editor utils / autoLayout / ascii → @arach/arc
└─ No → see below

Need Mermaid sequenceDiagram support?
└─ @arach/arc-viewer (ArcMermaidPlayer, importMermaid)

Need isometric / tier-based YAML diagrams?
└─ @arach/arc-iso (vanilla renderToElement also available)

Need the full drag-and-drop studio?
└─ Clone github.com/hudsonkit/arc, bun run dev, open /editor

Contributing to Arc itself?
└─ This monorepo — packages/* are publish targets, src/ is the studio app
```

## Published Packages

| Package | npm | What it ships |
|---------|-----|---------------|
| `@arach/arc` | [npm](https://www.npmjs.com/package/@arach/arc) | `ArcDiagram`, editor components, themes, `autoLayout`, `renderAscii`, session utils |
| `@arach/arc-viewer` | [npm](https://www.npmjs.com/package/@arach/arc-viewer) | Lightweight `ArcDiagram` + Mermaid sequence player |
| `@arach/arc-iso` | [npm](https://www.npmjs.com/package/@arach/arc-iso) | Isometric renderer (`ArcDiagramIsometric`, YAML config) |

## Two Diagram Formats

**2D flow** (`ArcDiagramData`) — nodes with x/y, connectors with anchors:

```typescript
// src/types/diagram.ts
{ layout, nodes, nodeData, connectors, connectorStyles }
```

**Isometric tiers** (`DiagramConfig`) — YAML-style tier stacks:

```yaml
title: Data Platform
theme: light
style: blueprint
```

Parsed by `parseYamlConfig()` in `@arach/arc`. Do not mix formats in one file.

## Repo Layout vs npm

| Path | Role |
|------|------|
| `src/` | Studio app + shared source built into `@arach/arc` |
| `lib/` | Published `@arach/arc` build output (do not edit by hand) |
| `packages/viewer/` | `@arach/arc-viewer` source |
| `packages/iso/` | `@arach/arc-iso` source |
| `packages/arc-editor/` | Standalone editor package (npx entry) |

## Peer Dependencies

All React packages require `react` and `react-dom` (^18 or ^19).
`ArcDiagram` expects Tailwind v3+ with the default color palette available.

## When to Use What

| Scenario | Use |
|----------|-----|
| Docs site embed | `@arach/arc-viewer` or `@arach/arc` |
| Need `autoLayout` / `renderAscii` | `@arach/arc` |
| Blueprint isometric plate | `@arach/arc-iso` or `_meta.isoStyle` in studio |
| Design visually, export JSON | Studio at `/editor` |
| Agent generates diagram from description | Edit JSON directly — no package install needed |
