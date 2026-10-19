---
title: Diagram diffs
description: Diff two diagrams and render the change set — added, removed, moved, changed.
section: Guides
order: 37
---

# Diagram diffs

`diffDiagram(base, head)` returns a flat `DiagramDelta` — what changed between
two versions of a diagram.

```ts
import { diffDiagram } from '@hudsonkit/arc'

const delta = diffDiagram(baseDoc, headDoc)
```

```jsonc
{
  "nodes": {
    "added": ["cache"],
    "removed": [{ "id": "legacy", "position": { "x": 620, "y": 170, "size": "m" }, "data": { /* base NodeData */ } }],
    "moved":  [{ "id": "api", "from": { "x": 340, "y": 90, "size": "m" }, "to": { "x": 340, "y": 200, "size": "m" } }],
    "changed":[{ "id": "api", "fields": ["name", "color"] }]
  },
  "connectors": {
    "added":   [{ "connector": { "from": "api", "to": "cache", "/*…*/": "" } }],
    "removed": [{ "connector": { "from": "api", "to": "db" } }],
    "changed": [{ "key": "web->api", "before": {}, "after": {}, "fields": ["curve"] }]
  },
  "connectorStyles": { "added": ["cache"], "removed": ["sql"], "changed": [] },
  "groups": { "added": ["edge"], "removed": [], "changed": [] },
  "layoutChanged": false
}
```

Matching rules:

- Nodes, styles, and groups match by key (`nodes`/`nodeData` id, style key, `GroupShape.id`).
- Connectors match by `id` when both sides carry one, else by `from→to`. Two
  connectors with different ids never pair; an id'd connector can pair-match an
  id-less one on the same endpoints (gaining/losing an `id` is a `changed`
  entry, not remove+add).
- Parallel `from→to` edges are paired in document order and flagged
  `ambiguous: true` — the pairing is positional, not authored.
- Positions compare exactly. A `moved` entry means `x`/`y`/`size` changed;
  `changed` means `nodeData` fields changed. Both can apply to one node.

## Render the delta

```tsx
<ArcDiagram data={head} delta={diffDiagram(base, head)} />
```

`data` stays the source of truth — the delta only overlays it:

- **added** nodes and connectors get an accent ring / halo in their own palette color
- **changed** entries get the same mark, dashed
- **removed** nodes and connectors draw as dashed ghosts (geometry is carried on
  the delta itself — no base document needed)
- **moved** nodes ghost at the old position with a trace line to the new one

Delta rendering is 2D-only; the `delta` prop is ignored under
`defaultViewMode="isometric"`. Unset, it renders nothing and costs nothing.

## CLI

```bash
arc diff base.json head.json            # DiagramDelta JSON
arc diff base.json head.json --summary  # counts only
```

The command validates both inputs first; an error-severity diagnostic on either
side exits non-zero and reports the diagnostics instead of a delta.

## MCP

`diff_diagram` takes `{ base, head }` (same JSON input as `validate_diagram`)
and returns the `DiagramDelta` JSON — pipe it straight into a review UI or a PR
bot.
