# Spatial illustrations

The tiered renderer uses `DiagramConfig` from `@hudsonkit/arc-iso`, not
`ArcDiagramData`. Its `canvas`, `origin`, `tiers`, `floorSize`, and array of `nodes`
are a separate contract. Start with [layered-service.iso.json](../examples/layered-service.iso.json).

```ts
import { renderToString } from '@hudsonkit/arc-iso'
import type { DiagramConfig } from '@hudsonkit/arc-iso'
// Load the example JSON as config, checked against DiagramConfig.
const svg = renderToString(config)
```

In the Arc source checkout, import `src/iso/vanilla.ts` and `src/iso/types.ts`.
Inspect the installed package exports before using the snippet. Save the SVG and
open it in a browser or rasterize it for inspection. `arc check`, `arc render`, and
MCP architecture validators do not validate this tiered format.

Each tier names a layer and sets its elevation. A node selects its tier by numeric
index and has x/y, width/depth/height, color, and label. `offset` on a tier separates
it in screen space after projection. Use matching footprints to preserve alignment.
Use `pillars` only when the relation between tiers is real and useful.

Type-check the configuration; check finite dimensions, valid tier indices, and
nodes within the intended floor. Then inspect the render for clipping, hidden
labels, occlusion, and confusing depth order. These are visual acceptance checks,
not guarantees provided by the architecture validator. The example intentionally
uses a few large components so their labels survive a README-sized image.

The tiered renderer and React player can differ in styling or interaction. Verify
the actual output route you deliver. Do not assume a style supported by one renderer
has identical output in another.
