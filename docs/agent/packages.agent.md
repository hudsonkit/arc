# Packages — Agent Context

## Decision Tree

```
Need to render a 2D architecture diagram in React?
├─ Yes, minimal install → @hudsonkit/arc-viewer
├─ Yes, plus editor utils / autoLayout / ascii → @hudsonkit/arc
└─ No → see below

Need Mermaid sequenceDiagram support?
└─ @hudsonkit/arc-viewer (ArcMermaidPlayer, importMermaid)

Need isometric / tier-based YAML diagrams?
└─ @hudsonkit/arc-iso (vanilla renderToElement also available)

Need the full drag-and-drop studio?
└─ Clone github.com/hudsonkit/arc, bun run dev, open /editor

Contributing to Arc itself?
└─ This monorepo — packages/* are publish targets, src/ is the studio app
```

## Published Packages

| Package | npm | What it ships |
|---------|-----|---------------|
| `@hudsonkit/arc` | [npm](https://www.npmjs.com/package/@hudsonkit/arc) | `ArcDiagram`, editor components, themes, `autoLayout`, `renderAscii`, session utils |
| `@hudsonkit/arc-viewer` | [npm](https://www.npmjs.com/package/@hudsonkit/arc-viewer) | Lightweight `ArcDiagram` + Mermaid sequence player |
| `@hudsonkit/arc-iso` | [npm](https://www.npmjs.com/package/@hudsonkit/arc-iso) | Isometric renderer (`ArcDiagramIsometric`, YAML config) |

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

Parsed by `parseYamlConfig()` in `@hudsonkit/arc`. Do not mix formats in one file.

## Repo Layout vs npm

| Path | Role |
|------|------|
| `src/` | Studio app + shared source built into `@hudsonkit/arc` |
| `lib/` | Published `@hudsonkit/arc` build output (do not edit by hand) |
| `packages/viewer/` | `@hudsonkit/arc-viewer` source |
| `packages/iso/` | `@hudsonkit/arc-iso` source |
| `packages/arc-editor/` | Standalone editor package (npx entry) |

## Peer Dependencies

All React packages require `react` and `react-dom` (^18 or ^19).
`ArcDiagram` expects Tailwind v3+ with the default color palette available.

## When to Use What

| Scenario | Use |
|----------|-----|
| Docs site embed | `@hudsonkit/arc-viewer` or `@hudsonkit/arc` |
| Need `autoLayout` / `renderAscii` | `@hudsonkit/arc` |
| Blueprint isometric plate | `@hudsonkit/arc-iso` or `_meta.isoStyle` in studio |
| Design visually, export JSON | Studio at `/editor` |
| Agent generates diagram from description | Edit JSON directly — no package install needed |
