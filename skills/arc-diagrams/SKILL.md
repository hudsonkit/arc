---
name: arc-diagrams
description: Create and refine Arc diagrams and structured illustrations for products, processes, concepts, and software. Compose architecture maps, request paths, layered cutaways, panel cubes, comparisons, and visual explanations with editable source and a render-and-review loop.
---

# Arc diagrams and illustrations

Make the reader understand a product, process, system, or relationship. Deliver an
editable source and a rendered visual whose labels survive the intended display
size. Arc can carry a technical illustration beyond a boxes-and-arrows inventory;
choose the representation from the explanation.

## Establish the explanation

Infer the audience, destination, and one question the image must answer from the
request. Ask only when a missing fact would change the result. For example:
“Where does a request wait when all connections are busy?” is a useful brief.
“Show everything in the backend” needs a selected path or several views.

For a real system, inspect its code or supplied evidence before drawing ownership,
direction, timing, or trust boundaries. Label hypothetical examples as illustrative.
Keep measurements and scale honest; do not invent throughput, latency, or capacity.

## Select the representation

- **Architecture, boundaries, request paths, comparisons:** Arc architecture
  JSON (`ArcDiagramData`). Read [diagram authoring](references/diagram-authoring.md).
- **Layers, physical containment, spatial hierarchy:** tiered isometric
  `DiagramConfig`. Read [spatial illustrations](references/spatial-illustrations.md).
  This is a separate format; do not send it to `arc check` or `arc render`.
- **A concept revealed through three faces:** a graphite panel cube with outward
  separation and fine callouts. Read [panel cubes](references/panel-cubes.md).
  Use `ArcPanelCube` or `renderPanelCubeSvg`; this family has its own renderer.
- **Ordered exchanges:** the native Mermaid sequence player when the reader
  needs message order. Check the installed viewer API and supported syntax.
- **Cause and effect:** a small deterministic state model plus an Arc projection.
  Counts, highlights, and motion must derive from the same model. A static figure
  can show selected states without building an application.

Read [composition patterns](references/composition-patterns.md) when choosing a
layout or improving an illustration. It maps each pattern to a working example.
Use custom SVG/HTML framing for titles, captions, leaders, and insets when useful;
keep the technical drawing and its source editable. Photographs and freeform
pictorial art need another medium; do not force them into Arc nodes.

## Compose deliberately

Use one dominant reading direction and one focal relationship. Place secondary
systems on a quieter lane. Group by ownership or function, not arbitrary proximity.
Use the same color for the same role across panels; combine color with labels,
stroke patterns, or shapes. Depth must encode a layer or containment relationship.

Aim for at most 12 nodes in a flat view. Split larger stories into regions or
chapters. Use automatic layout for dense graphs; hand placement is appropriate
when spatial arrangement carries meaning. Arc's standard node sizes are
`xs` 80×36, `s` 110×48, `m` 160×75, `l` 220×90. Compute pitch from the actual node
width plus a clear connector channel, typically 60–100px. Long labels need more
room or a subtitle, not smaller type.

Give referenced connectors stable IDs. Use `views` for chapters and `flows` for
message travel. Inspect the installed schema before adding fields. Arc architecture
JSON and tiered isometric JSON have different shapes and rendering entry points.

## Render and review

A valid document is not evidence of a good illustration. Complete this loop:

1. **Validate the source.** For architecture JSON, run `arc check figure.arc.json`
   or MCP `validate_diagram`. Resolve errors first; explain intentional warnings.
   In the source checkout, use `bun scripts/arc-cli.ts` in place of `arc`.
2. **Render the artifact.** For example:
   ```sh
   arc render figure.arc.json --out figure.svg --theme engineering --mode light
   arc render figure.arc.json --out figure.png --theme engineering --mode light --scale 2
   ```
   MCP equivalents are `render_svg` and `render_png`. PNG uses Chrome/Chromium;
   `ARC_CHROME` selects it. For tiered isometric or panel cube output use the
   corresponding SVG renderer described in the references.
3. **Open the render.** Inspect the actual PNG or browser-rendered SVG, at its
   intended display width and a reduced width. For a README, check roughly
   720px and 360px. Inspect the intended light/dark surfaces where relevant.
   Source inspection, successful rendering, and ASCII previews do not establish
   visual quality. If visual inspection is unavailable, report that limitation.
4. **Review together:**
   - Can a reader identify the subject and main path without the prose?
   - Are labels legible, unclipped, and clearly attached to their objects?
   - Are crossings, tangencies, overlaps, and accidental visual groupings absent?
   - Do arrows, boundaries, layers, and comparison states tell the truth?
   - Is emphasis reserved for the mechanism being explained?
   - Does the export preserve the crop, fonts, contrast, and whitespace?
5. **Repair causes.** Shorten labels, widen lanes, split panels, or change the
   composition. Do not shrink the whole figure to hide a crowded layout. Make
   one batched correction pass, render again, and confirm it. Stop after that
   confirmation unless a concrete unresolved defect or user feedback requires
   further work; name any remaining limitation.

For authored animation, inspect start, a meaningful transition, and end at fixed
`flowTime` values. Use motion to explain order or causality; provide a readable
still when the destination cannot play it. GIF/MP4 need Chrome and ffmpeg.
For a panel cube, inspect `progress` at 0, 0.5, and 1; confirm that the faces stay
attached to their callouts. Test hover, keyboard activation, touch controls, and
reduced motion when delivering an interactive view.

## Deliver

Return the rendered artifact, its editable source, and a short caption explaining
what the reader should notice. Include alt text for embedded images. State what
was validated and visually inspected; do not call an unviewed render approved.
Use the requested destination and format. A new illustration does not authorize
publishing a site or releasing a package.

The installed folder includes references and examples. If reading only the MCP
`arc://skill/diagrams` resource, relative files may not be exposed: retrieve them
from the matching package's `skills/arc-diagrams/` folder or the repository's
[skill directory](https://github.com/hudsonkit/arc/tree/main/skills/arc-diagrams),
and check version compatibility before using a newer API.
