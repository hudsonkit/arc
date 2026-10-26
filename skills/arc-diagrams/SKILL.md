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

## Work in a live architecture view

When the user wants to watch architecture develop while agents work, use the
Hudson Kit Arc live view. First inspect the connected MCP tool list and read
`arc://schema/diagram` for its schema. Require `open_live_diagram`,
`begin_live_diagram_work`, `update_live_diagram`, `finish_live_diagram_work`, and
`end_live_diagram` in that tool list; an installed
version number alone does not establish support. If these tools are unavailable,
explain that the connected MCP server needs a build with live support. Do not
present a static `editor_handoff` URL as a live connection.

1. Start with a small, valid architecture based on inspected evidence. Call
   `open_live_diagram({diagram, title})` with a clear title. The studio base comes
   from `ARC_EDITOR_URL`, or the tool's explicit `baseUrl` when needed.
2. Return or open the exact `liveUrl` from the tool. Keep that one URL throughout
   the work; it remains attached to the returned `sessionId`.
3. Before doing diagram work, call
   `begin_live_diagram_work({sessionId, summary, scope})` and retain its `workId`.
   Scope defaults to `{type: "canvas"}`. Use `{type: "nodes", nodeIds: ["api"]}`
   for existing boxes; use `{type: "region", x, y, width, height}` for the space
   where new boxes will appear. Describe the work you are about to do honestly.
4. At meaningful architecture milestones, call
   `update_live_diagram({sessionId, diagram, message})`. Supply the complete next
   document and a concise phase message, such as “Adding the job queue” or
   “Separating storage from the API”. Batch a coherent change into one revision.
   Keep existing node and connector IDs stable; changing an ID means replacing
   the object. Avoid repeatedly opening new views or adding artificial waits
   merely to create animation.
5. In your cleanup/finally path, call
   `finish_live_diagram_work({sessionId, workId, message})` when the declared work
   ends. This returns the view to idle for another work cycle. Only one work item
   may be active; do not overwrite it with a second begin. Updates renew its
   five-minute lease. Expiry or disconnect interrupts work and makes its ID
   invalid; begin a new item before resuming. Do not send artificial updates
   solely to prolong the activity indicator.
6. Validate and inspect the result. When the entire session is done, call
   `end_live_diagram({sessionId, message})` with a short completion note. Save the
   editable source as a normal artifact too: ordinary live views are in memory and
   completed sessions expire one hour after completion. Unfinished sessions stay
   available while their owning MCP connection is open, then expire one hour
   after it disconnects. Ordinary live sessions disappear when the relay process ends.

The viewer receives actual MCP client name/version and a generated connection
identifier. Do not infer a model, provider, conversation ID, or task-completion
state from a client name. The working/idle indicator describes explicitly
declared diagram work; opening or updating a diagram alone leaves it idle.
Finishing work leaves the session reusable; ending the session rejects edits.
Work summaries are 1–500 characters without controls. A node scope contains
1–200 unique existing IDs of at most 200 characters each. A region uses finite
coordinates within ±100000 and positive dimensions at most 100000.
The same MCP connection owns each session; another agent connection must open
its own view unless a future tool explicitly supports shared ownership.

For local stdio use, keep the MCP process alive and open the viewer on the same
computer. A hosted HTTPS studio can require browser permission to reach the
loopback relay. For an all-local setup, run `bun run dev` and use its local studio
base. For a remote relay, configure its reachable HTTPS origin and deployment
authentication; see [MCP setup](https://github.com/hudsonkit/arc/blob/main/packages/mcp/README.md).
Do not claim hosted-site or published-package support until the matching build
has actually been deployed or released.

## Run a saved architecture review (private preview)

Use a matching private preview server and Hudson Kit studio. Confirm the tools
`open_architecture_review`, `update_architecture_review`,
`resume_architecture_review`, and `revoke_architecture_review_share` are present.
The preview supports one lead author per review. The MCP endpoint requires the
deployment's bearer credential; viewer links are separate read capabilities.

1. Inspect the repository and record its revision. Open a review with
   `open_architecture_review({diagram,title,question,repository,agent})`.
   `repository` is `{name,url?,revision?}`. Give the user the returned `liveUrl`
   early. Keep its `sessionId` and author `resumeToken` private; a viewer link
   never grants author access.
2. Announce actual investigation with `begin_live_diagram_work` before reading
   or changing the relevant architecture. Use the existing work lifecycle and
   diagram update tools. Preserve node positions and stable IDs; the viewer
   frames the full architecture automatically.
3. Record source-backed findings with `update_architecture_review` as they
   become supported. Each finding has `{id,title,detail,severity,nodeIds?,sources}`;
   severity is `info`, `low`, `medium`, or `high`; sources are
   `{path,line?,revision?,url?}`. Use repository-relative paths and inspected
   line numbers. Record `summary`, `decisions`, and `openQuestions` separately.
   Provided arrays replace their previous values, so send the full intended
   list. Do not present hypotheses as verified findings.
4. Finish declared work, then end the entire review when its findings are ready.
   Reopen the same viewer link and verify its diagram, findings, and saved
   history. The review stores its baseline and each revision before publishing.
   Saved reviews do not have the ordinary live view's one-hour expiry.
5. After an author restart, call `resume_architecture_review` with the saved
   session ID and resume token. Supply `agent: {harness,name?}` again when the
   resumed author should have caller-declared harness and name labels; omitting
   it uses only the new MCP connection identity. A live owner cannot be displaced.
   Interrupted work requires a new begin call. Completed reviews remain read-only
   and keep their final author and history unchanged.

The studio's Save review action exports a portable JSON artifact without read
or author secrets. Source references are evidence supplied by the reviewing
agent, not independently verified by Arc. Revoking a share invalidates the old
viewer capability. Keep the server at a stable private address, or use the
supported private tunnel setup in `docs/private-preview.md`; do not expose an
unauthenticated MCP endpoint. A saved review is not a claim that the referenced
repository is unchanged or that the review has been accepted.

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
