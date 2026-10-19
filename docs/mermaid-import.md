# Project Mermaid diagrams into Arc architecture data

Use `importMermaid()` when an existing Mermaid flowchart or state diagram must
render through `ArcDiagram`. The adapter returns positioned `ArcDiagramData`
and reports syntax that the projection cannot preserve.

```ts
import { importMermaid } from '@hudsonkit/arc-viewer'

const source = `flowchart LR
  APP[Web app] -->|HTTPS| API[API]
  API --> DB[(Database)]`

const result = importMermaid(source, {
  width: 960,
  height: 560,
  defaultSize: 'm',
})

result.diagram      // positioned ArcDiagramData
result.warnings     // source-specific, non-fatal losses
result.unsupported  // de-duplicated unsupported capability names
```

## Bring source from Pele or Beautiful Mermaid

[Pele](https://pele.run/) and
[Beautiful Mermaid](https://github.com/lukilabs/beautiful-mermaid) both render
Mermaid text. Use that original text with Arc's supported flowchart, state, or
sequence APIs. Arc supplies the layout, styling, and interaction.

Compatibility covers the syntax listed below and in the
[native sequence guide](./mermaid-sequences.md). Arc does not import those
renderers' SVG output or theme configuration, and does not support their full
diagram catalogs. Review parser diagnostics before using imported source.

## Choose the correct Mermaid API

`importMermaid()` is a compatibility adapter. It projects Mermaid concepts
into architecture nodes and connectors. The adapter does not replace Arc's
native Mermaid document model.

Use `parseMermaid()`, `<ArcMermaid />`, or `<ArcMermaidPlayer />` for a sequence
diagram. Those APIs preserve participants, lifelines, ordered messages, notes,
and fragments. If `importMermaid()` receives a sequence diagram, the result
includes a warning that the projection is lossy.

## Supported input

The adapter recognizes these declarations:

- `flowchart` and `graph`
- `stateDiagram-v2` and `stateDiagram`
- `sequenceDiagram` as an explicit compatibility projection

For flowcharts, the adapter preserves standalone nodes, nodes declared inside
edges, solid and dotted edges, edge labels, and `<br>` label segments. For
state diagrams, the adapter preserves named states, transitions, and start and
end markers.

The adapter reports subgraphs, direction directives, Mermaid styling,
interaction directives, notes, fragments, and other unsupported syntax. Check
`warnings` and `unsupported` before publishing a generated diagram.

Arc's architecture auto-layout currently uses a left-to-right flow. If a
flowchart declares another direction, the adapter returns
`direction directives` in `unsupported`.

## Determinism and safety

`importMermaid()` normalizes line endings and ignores leading Mermaid comments
when it detects the diagram declaration. The adapter does not execute Mermaid
JavaScript, click handlers, initialization directives, HTML, or theme CSS.
Identifiers that normalize to the same Arc key receive stable numeric suffixes
and a warning instead of overwriting one another.
The same source and options produce the same Arc data for a fixed Arc version.
