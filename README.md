<p align="center">
  <img src="https://raw.githubusercontent.com/hudsonkit/arc/main/public/arc-readme-header.png" alt="Arc — illustrations, made with agents. Two hollow rounded rectangular eyes and an upward-open smile sit beside the wordmark." width="800" />
</p>

**Arc is a declarative diagram toolkit for creating, presenting, and refining
visual explanations with AI agents.** Define an architecture, workflow, or
illustration in JSON or TypeScript. Turn that source into an interactive
walkthrough, an embedded viewer, or a finished figure for your docs.

Author the source yourself, work in the visual studio, or give an agent the
Arc skill and MCP tools. The diagram stays editable, typed, and ready to
version alongside your code. The live review preview builds on that same
format: watch an agent develop the explanation while you review the changes.

Supported Mermaid source can also become an Arc diagram or a playable sequence.

[Get started](#get-started) · [Live review preview](#review-the-diagram-as-your-agent-works) · [Examples](https://hudsonkit.com/arc/examples/) · [Documentation](https://github.com/hudsonkit/arc/blob/main/docs/overview.md) · [Open the studio](https://hudsonkit.com/arc/editor)

[![npm version](https://img.shields.io/npm/v/@hudsonkit/arc.svg?color=2e5fa5&label=%40hudsonkit%2Farc)](https://www.npmjs.com/package/@hudsonkit/arc)
[![license](https://img.shields.io/npm/l/@hudsonkit/arc.svg?color=41b883)](https://github.com/hudsonkit/arc/blob/main/LICENSE)
[![types](https://img.shields.io/npm/types/@hudsonkit/arc.svg?color=3b82f6)](https://github.com/hudsonkit/arc/blob/main/src/types/diagram.ts)

[![An illustrative request path: Client calls API, API writes to Storage, and a separate Queue sends background work to a Worker.](https://raw.githubusercontent.com/hudsonkit/arc/main/public/readme-request-path.png)](https://raw.githubusercontent.com/hudsonkit/arc/main/public/readme-request-path.png)

*A request path with a separate lane for background work. Rendered from
[editable Arc data](https://github.com/hudsonkit/arc/blob/main/skills/arc-diagrams/examples/request-path.arc.json).*

- **Explain the structure.** Use components, connections, groups, and spatial
  layers to show how a system fits together.
- **Explain the behavior.** Add guided chapters, animate a request, or step
  through a Mermaid sequence one message at a time.
- **Use the result.** Embed a React viewer, edit in the studio, or export an image
  or flow animation. Keep the source for the next change.

## Review the diagram as your agent works

**Private preview.** Bring the diagram into a live architecture review in the
Hudson Kit studio. An agent adds and moves nodes through MCP while you watch
the canvas update. A marked work region shows where the agent is working.
Nodes and connections transition smoothly as the view fits the changing diagram.

[![Watch a live Arc review: real MCP calls add and move nodes, with an active work region and a light canvas.](https://hudsonkit.com/arc/arc-live-review-poster.jpg)](https://hudsonkit.com/arc/#live-review)

[Watch the 22-second demo](https://hudsonkit.com/arc/#live-review) · [Open the 60 fps video](https://hudsonkit.com/arc/arc-live-review.mp4)

- **See work in progress.** Presence shows the agent's harness and name when provided.
  Activity appears over the declared work region and settles when work ends.
- **Review together.** One agent writes to a review; multiple people can follow
  it through a private, read-only viewer link.
- **Return to the review.** Saved architecture reviews retain the baseline,
  revisions, findings, and decisions. Reopen them on the same private host.
- **Keep the source.** Live changes use the same declarative Arc data as the
  renderers. Refine the definition, present it, and produce your final output.

The video shows the private preview, which is not yet included in the published
MCP package. The setup below covers the released diagram tools.

## Bring your source. Choose your output.

| Start with | What Arc supports |
| --- | --- |
| **Arc JSON / TypeScript** | Architecture diagrams, guided views, animated flow routes, and isometric views. |
| **Mermaid flowcharts and state diagrams** | Import into editable Arc architecture data with `importMermaid()` from `@hudsonkit/arc-viewer`. |
| **Mermaid sequence diagrams** | Native rendering and step-by-step playback with `ArcMermaidPlayer` from `@hudsonkit/arc-viewer`. |
| **Mermaid source used with Pele or Beautiful Mermaid** | Reuse the supported flowchart, state, and sequence syntax through those same Arc APIs. |

[Pele](https://pele.run/) and [Beautiful Mermaid](https://github.com/lukilabs/beautiful-mermaid)
are Mermaid renderers. Bring the original Mermaid text to Arc; Arc applies its
own layout, themes, and interactions. Their rendered SVGs, theme settings, and
full diagram catalogs are not imported. Check the
[import coverage](https://github.com/hudsonkit/arc/blob/main/docs/mermaid-import.md) and [sequence guide](https://github.com/hudsonkit/arc/blob/main/docs/mermaid-sequences.md)
for supported syntax and diagnostics.

| Output | Use it for |
| --- | --- |
| **PNG** | Still images for documents, chat, and social posts. |
| **SVG** | Scalable vector drawings, including animated flow routes. |
| **GIF** | Looping flow animations for READMEs and demos. |
| **MP4** | Flow videos for presentations and announcements. |
| **React / HTML** | Interactive components, iframe embeds, or a standalone SVG page. |
| **ASCII / Unicode** | Diagrams in terminals and plain text. |
| **JSON / TypeScript** | Editable source to version, review, and reuse. |

The file exports above use Arc architecture data. GIF and MP4 render authored
flow routes through the CLI or MCP; they require Chrome/Chromium and ffmpeg.
Native Mermaid sequence playback is available through the React viewer.
[Choose an export and see the commands →](https://github.com/hudsonkit/arc/blob/main/docs/exports.md)

## Turn the map into a walkthrough

Start with services, databases, queues, and the connections between them. Arc
provides semantic node kinds, icons, groups, relationship styles, and automatic
layout to give the system a clear structure. Then make that structure explorable.

![An Arc architecture diagram in the light Engineering theme](https://raw.githubusercontent.com/hudsonkit/arc/main/public/readme-architecture.png)

- **Focus on the path that matters.** Hover or select a component to reveal its
  relationships. Author a focus story with a caption and steps to explain a
  whole request path, boundary, or workflow.
- **Guide the reader through chapters.** Named views frame the relevant region
  and highlight its nodes and connections. Readers can step through the story
  or leave it to explore on their own.
- **Put requests in motion.** Send packets along multi-step routes, pause at a
  service, follow the return path, and show trails. Set timing and repeats, or
  control the exact instant with `flowTime`.

Pan, zoom, fit, minimaps, and legends keep the system navigable. Chapters,
focus stories, and animated routes are authored data that can be edited and
reviewed alongside the drawing.

[Guided views](https://github.com/hudsonkit/arc/blob/main/docs/views.md) · [Focus stories](https://github.com/hudsonkit/arc/blob/main/docs/focus-stories.md) · [Flow API](https://github.com/hudsonkit/arc/blob/main/docs/api.md) · [Source for the image](#example-output)

## Play the conversation

Arc's **native Mermaid sequence player** makes an exchange something you can
follow one message at a time. Actors, lifelines, self-calls, notes, branches,
and loops retain their place in the story. Play the sequence, step backward or
forward, focus a participant, or open it fullscreen.

![Arc's native sequence player showing the route from a Scout message to a direct reply or delegated work](https://raw.githubusercontent.com/hudsonkit/arc/main/public/readme-sequence.png)

Mermaid text stays the source. Arc owns the typed sequence model, layout,
SVG rendering, and playback. You can customize theme tokens and replace
individual visual parts to fit your application. Mermaid.js is not required
at runtime.

Existing Mermaid flowcharts and state diagrams have a separate import path
into Arc's architecture format.

[Native sequence guide](https://github.com/hudsonkit/arc/blob/main/docs/mermaid-sequences.md) · [Supported Mermaid imports](https://github.com/hudsonkit/arc/blob/main/docs/mermaid-import.md)

## Give the system depth

Use isometric views to make layers, boundaries, and hierarchy visible. Project
an architecture into spatial blocks, or compose a tiered scene with elevated
floors, staggered layers, translucent components, and pillars. Hover a layer
to lift it out of the stack; use node and layer callbacks to connect the view
to your application.

[![An example agent fleet with readable callouts for its agent, project, and runtime layers](https://raw.githubusercontent.com/hudsonkit/arc/main/public/agent-fleet.png)](https://raw.githubusercontent.com/hudsonkit/arc/main/public/agent-fleet.png)

Choose shaded solids, hatched blueprint linework, cyanotype plates, or a
retro-print material with mineral inks and deterministic stipple. The tiered
renderer has React and static SVG APIs, including a vanilla JavaScript embed.

[Isometric types and options](https://github.com/hudsonkit/arc/blob/main/src/iso/types.ts) · [Example fleet composition](https://github.com/hudsonkit/arc/blob/main/scripts/agent-fleet-iso.ts)

## Let readers operate the explanation

Turn up demand in the [connection-pool explainer](https://hudsonkit.com/arc/examples/connection-pool/).
All four database connections fill, and requests start waiting. Step through a
handoff to see which request gets the next connection. Stop arrivals and watch
the queue drain.

[![The connection-pool explainer with four busy connections, waiting requests, and demand controls](https://raw.githubusercontent.com/hudsonkit/arc/main/public/readme-connection-pool.png)](https://hudsonkit.com/arc/examples/connection-pool/)

The queue, leases, counts, and handoffs come from the same deterministic model.
This working example combines a custom mechanism view with an Arc diagram
projection. It shows how to build an explanation that responds to the reader's
actions and makes cause and effect visible.

[Operate the pool](https://hudsonkit.com/arc/examples/connection-pool/) · [Read the model](https://github.com/hudsonkit/arc/blob/main/src/components/explainers/connectionPoolModel.ts) · [See the Arc projection](https://github.com/hudsonkit/arc/blob/main/src/components/explainers/connectionPoolDiagram.ts)

## Create on the canvas. Refine in code.

The studio puts the drawing and its source side by side. Drag components into
place, connect their anchors, shape groups, and refine the result in the
inspector. Edit the JSON and the canvas updates. Move a node and the source
updates with it.

![The Arc Studio with its canvas and diagram properties](https://raw.githubusercontent.com/hudsonkit/arc/main/public/studio.png)

Multi-selection, keyboard shortcuts, undo/redo, templates, image layers,
custom dimensions, connector routing, and export crops give you control over
the finished composition. Switch between 2D and isometric editing. Save to a
file, restore a local browser session, or copy a typed module into your app.

The editor's React components, context, and hooks are available for embedding.
The player showcase lets you tune a viewer's appearance and controls, then
copy the matching JSX.

Open the studio from [Arc](https://hudsonkit.com/arc/), or [run it locally](#development).

## Give the drawing a visual identity

Eleven themes shape typography, node silhouettes, grids, frames, decoration,
and title blocks as well as color. Choose an engineering plate, a quiet
workbench, a tactical map, or a mission console. Every theme has light and
dark modes; individual nodes and relationships can carry their own styling.

<details>
<summary>See the same architecture in three visual languages</summary>

![Engineering: graph grid, drawing-sheet border, and title block](https://raw.githubusercontent.com/hudsonkit/arc/main/public/theme-engineering.png)

![Workbench: dot grid, hairline frame, and soft corners](https://raw.githubusercontent.com/hudsonkit/arc/main/public/theme-workbench.png)

![Tactical: crosshair grid, corner brackets, and hard edges](https://raw.githubusercontent.com/hudsonkit/arc/main/public/theme-tactical.png)

</details>

The themes are `default`, `warm`, `cool`, `mono`, `engineering`, `workbench`,
`tactical`, `command`, `spacex`, `claude`, and `codex`. Studio shell skins and
interface density are configurable independently of the diagram.

[Theme guide](https://github.com/hudsonkit/arc/blob/main/docs/themes.md)

## Build with agents. Review with people.

Arc gives agents a concrete authoring loop: write the document, arrange it,
check it, render it, and revise it. Typed data and a closed JSON Schema define
the format. Coded diagnostics identify problems such as dangling connections,
overlaps, and invalid routes, with suggested fixes an agent can act on.

Together, the CLI and MCP server provide validation, automatic layout, rendering, diffs,
and a handoff into the visual studio. A person can inspect the result and
refine the drawing directly.

The `arc-diagrams` skill adds composition patterns for request paths, boundaries,
comparisons, and layered illustrations, with editable examples and a render-and-review
loop that checks the result at its intended reading size.

```sh
npx skills add hudsonkit/arc --skill arc-diagrams
```

Attach repository paths, line ranges, and commits to the nodes they describe.
Review structural changes on the diagram itself: highlight additions, ghost
removed elements, and show where components moved.

```tsx
import { ArcDiagram, diffDiagram } from '@hudsonkit/arc'

<ArcDiagram data={head} delta={diffDiagram(base, head)} />
```

That gives a code review both the changed source and a visual explanation of
the changed structure.

[Structural diffs](https://github.com/hudsonkit/arc/blob/main/docs/diff.md) · [Agent guide](https://github.com/hudsonkit/arc/blob/main/docs/agent/quickstart.agent.md) · [Authoring benchmarks](https://github.com/hudsonkit/arc/blob/main/benchmarks/README.md)

## Take the explanation where it belongs

| Destination | What you can use |
| --- | --- |
| Your product or documentation | Interactive React diagrams, sequence players, and editor components. |
| A design review | Guided views, source references, and structural diff overlays. |
| A page, document, or deck | SVG, PNG, or standalone HTML with the rendered drawing. |
| A demo or announcement | Animated SVG, GIF, or MP4 from authored flow routes. |
| A terminal or Markdown file | ASCII and Unicode diagrams. |
| An agent's workspace | CLI, MCP, schema, authoring skill, and machine-readable diagnostics. |

Flow timing is deterministic. Display an exact instant, export it as a still,
or render a repeatable sequence of frames. The studio also copies source and
creates URLs carrying diagram data; browser session links reopen work stored
in that browser.

[Export guide](https://github.com/hudsonkit/arc/blob/main/docs/exports.md)

## Get started

**Try the experience:** open [Arc](https://hudsonkit.com/arc/) or
[operate the connection pool](https://hudsonkit.com/arc/examples/connection-pool/).

**Build with React:** install the main package in a React 18 or 19 project.

```bash
npm install @hudsonkit/arc
```

Import the stylesheet once and give the diagram a container with a height.
This complete example renders a request traveling from an app through an API
to a database:

```tsx
import { ArcDiagram, type ArcDiagramData } from '@hudsonkit/arc'
import '@hudsonkit/arc/arc.css'

const diagram: ArcDiagramData = {
  layout: { width: 640, height: 240 },
  nodes: {
    app: { x: 40, y: 80, size: 'm' },
    api: { x: 250, y: 80, size: 'm' },
    db:  { x: 460, y: 80, size: 'm' },
  },
  nodeData: {
    app: { name: 'Web app', kind: 'frontend' },
    api: { name: 'API', kind: 'service' },
    db:  { name: 'Database', kind: 'database' },
  },
  connectors: [
    { id: 'request', from: 'app', to: 'api', fromAnchor: 'right', toAnchor: 'left', style: 'data' },
    { id: 'query', from: 'api', to: 'db', fromAnchor: 'right', toAnchor: 'left', style: 'data' },
  ],
  connectorStyles: {
    data: { color: 'blue', strokeWidth: 2 },
  },
  flows: [
    { id: 'load', legs: [{ id: 'request' }, { id: 'query' }], duration: 2, marker: 'packet' },
  ],
}

export function Architecture() {
  return (
    <div style={{ height: 360 }}>
      <ArcDiagram data={diagram} theme="engineering" mode="dark" defaultZoom="fit" />
    </div>
  )
}
```

Arc bundles its other runtime code and CSS. No Tailwind configuration is
required. Use `flowTime={1.25}` to inspect a specific instant, or add `views`
and `showViews` to turn the diagram into a guided walkthrough.

### Start with a Mermaid sequence

Install `@hudsonkit/arc-viewer` for the native sequence player:

```bash
npm install @hudsonkit/arc-viewer
```

```tsx
import { ArcMermaidPlayer } from '@hudsonkit/arc-viewer'

const source = `sequenceDiagram
  participant App
  participant API
  App->>API: Load architecture
  API-->>App: Typed diagram`

export function RequestStory() {
  return <ArcMermaidPlayer source={source} mode="light" />
}
```

### Connect an agent

Add the MCP server to a client that supports stdio:

```json
{
  "mcpServers": {
    "arc": {
      "command": "npx",
      "args": ["-y", "@hudsonkit/arc-mcp"]
    }
  }
}
```

The published MCP server provides validation, structural diff, automatic
layout, ASCII/SVG/PNG/animation/HTML rendering, TypeScript generation, and editor
handoff. It also serves the schema, authoring skill, and LLM guide as resources.
Use `bun run mcp` to run the server from a source checkout. The live review
workflow shown above is a separate private preview.

[MCP setup and tool reference](https://github.com/hudsonkit/arc/blob/main/packages/mcp/README.md)

### Use the terminal

The CLI requires Node.js 22 or newer. Run these commands in a project with
`@hudsonkit/arc` installed:

```bash
npx arc check diagram.json --json --strict
npx arc diff base.json head.json --summary
npx arc render diagram.json --out diagram.svg
npx arc render diagram.json --out flow.mp4 --duration 4 --fps 12
npx arc schema
npx arc-ascii diagram.json --charset ascii --max-width 80
```

`arc check` reports format, semantic, and composition problems. `--strict` also
fails on warnings. Render receipts include source and output hashes.
CLI PNG rendering needs Chrome or Chromium; GIF and MP4 also need ffmpeg.
Use `ARC_CHROME` and `ARC_FFMPEG` to select executables.

## Choose your package

| Package | What it provides |
| --- | --- |
| [`@hudsonkit/arc`](https://www.npmjs.com/package/@hudsonkit/arc) | Main React renderer and editor components, themes, layout, validation, structural diffs, flow helpers, ASCII rendering, and the `arc` CLI. |
| [`@hudsonkit/arc-viewer`](https://www.npmjs.com/package/@hudsonkit/arc-viewer) | Lightweight architecture viewer, native Mermaid sequence renderer/player, and Mermaid import. |
| [`@hudsonkit/arc-iso`](https://www.npmjs.com/package/@hudsonkit/arc-iso) | Tiered isometric rendering with React and vanilla JavaScript/static SVG APIs. |
| [`@hudsonkit/arc-mcp`](https://www.npmjs.com/package/@hudsonkit/arc-mcp) | Diagram tools and resources for MCP clients. |

Architecture uses `ArcDiagramData`; native sequences use `ArcSequenceDocument`;
tiered isometric scenes use `DiagramConfig`. Each model preserves the structure
its renderer needs. Animated flow markers, guided camera framing, and visual
delta overlays currently render in 2D. The [sequence guide](https://github.com/hudsonkit/arc/blob/main/docs/mermaid-sequences.md)
and [import guide](https://github.com/hudsonkit/arc/blob/main/docs/mermaid-import.md) document supported Mermaid syntax.

## Explore the API

| Area | Reference |
| --- | --- |
| Nodes, relationships, groups, player controls, and flow timing | [Component and CLI API](https://github.com/hudsonkit/arc/blob/main/docs/api.md) |
| Ordered walkthroughs and node-triggered explanations | [Views](https://github.com/hudsonkit/arc/blob/main/docs/views.md) · [Focus stories](https://github.com/hudsonkit/arc/blob/main/docs/focus-stories.md) |
| Automatic placement and group layout | [Group layout](https://github.com/hudsonkit/arc/blob/main/docs/group-layout.md) |
| Native sequence playback and Mermaid migration | [Sequences](https://github.com/hudsonkit/arc/blob/main/docs/mermaid-sequences.md) · [Import](https://github.com/hudsonkit/arc/blob/main/docs/mermaid-import.md) |
| Tiered scenes, materials, and spatial interaction | [Isometric API](https://github.com/hudsonkit/arc/blob/main/src/iso/types.ts) |
| Visual identity and output formats | [Themes](https://github.com/hudsonkit/arc/blob/main/docs/themes.md) · [Exports](https://github.com/hudsonkit/arc/blob/main/docs/exports.md) |
| Source references, diagnostics, and change review | [Schema](https://github.com/hudsonkit/arc/blob/main/schemas/arc-diagram.schema.json) · [Diffs](https://github.com/hudsonkit/arc/blob/main/docs/diff.md) |
| Agent authoring and verification | [MCP](https://github.com/hudsonkit/arc/blob/main/packages/mcp/README.md) · [Benchmarks](https://github.com/hudsonkit/arc/blob/main/benchmarks/README.md) |

## Where we're going

We want the agents changing a system to maintain its visual explanation in the
same workflow. Arc already provides the format, source references, validation,
rendering, and structural review. Automatic impact discovery and drift
notifications are the next part of that loop.

[The agent workflow and roadmap](https://github.com/hudsonkit/arc/blob/main/docs/agentic-loop.md)

## Example output

The source of the microservices diagram in the walkthrough section:

<details>
<summary>View the full typed diagram</summary>

```typescript
const diagram: ArcDiagramData = {
  layout: { width: 850, height: 340 },
  nodes: {
    client:  { x: 40,  y: 130, size: 'm' },
    gateway: { x: 220, y: 130, size: 'l' },
    auth:    { x: 460, y: 40,  size: 'm' },
    api:     { x: 460, y: 140, size: 'm' },
    cache:   { x: 460, y: 240, size: 's' },
    db:      { x: 680, y: 140, size: 'm' },
  },
  nodeData: {
    client:  { icon: 'Monitor',  name: 'Client',      subtitle: 'React App', color: 'violet' },
    gateway: { icon: 'Server',   name: 'API Gateway', subtitle: 'Express', description: 'Load balanced', color: 'emerald' },
    auth:    { icon: 'Shield',   name: 'Auth',        subtitle: 'JWT', color: 'amber' },
    api:     { icon: 'Code',     name: 'API',         subtitle: 'REST', color: 'blue' },
    cache:   { icon: 'Zap',      name: 'Cache',       color: 'sky' },
    db:      { icon: 'Database', name: 'PostgreSQL',  subtitle: 'Primary', color: 'blue' },
  },
  connectors: [
    { from: 'client',  to: 'gateway', fromAnchor: 'right',       toAnchor: 'left', style: 'https' },
    { from: 'gateway', to: 'auth',    fromAnchor: 'right',       toAnchor: 'left', style: 'internal' },
    { from: 'gateway', to: 'api',     fromAnchor: 'right',       toAnchor: 'left', style: 'internal' },
    { from: 'gateway', to: 'cache',   fromAnchor: 'bottomRight', toAnchor: 'left', style: 'cache' },
    { from: 'api',     to: 'db',      fromAnchor: 'right',       toAnchor: 'left', style: 'sql' },
  ],
  connectorStyles: {
    https:    { color: 'violet',  strokeWidth: 2, label: 'HTTPS' },
    internal: { color: 'emerald', strokeWidth: 2 },
    cache:    { color: 'sky',     strokeWidth: 1, dashed: true },
    sql:      { color: 'blue',    strokeWidth: 2, label: 'SQL' },
  },
}
```

</details>

## Development

The repository uses Bun, React, TypeScript, and Vite.

```bash
git clone https://github.com/hudsonkit/arc
cd arc
bun install
bun dev
```

Open [localhost:5188/editor](http://localhost:5188/editor) for the studio.
The local site also includes `/examples` (16 live diagrams with source), `/showcase`, `/iso-examples`, and
`/examples/connection-pool` for exploring the players and examples.

```bash
bun run typecheck
bun test scripts
bun run visual       # compare the SVG fixtures
bun run build:site   # build the library, site, and documentation pages
```

The site resolves the latest published `@hudsonkit/arc` version from npm during
Vite startup and build. `dist/version.json` records the resolved release. For a
reproducible or offline build, set `ARC_SITE_VERSION` to a verified release,
for example `ARC_SITE_VERSION=0.12.1 bun run build:site`. A failed registry
lookup stops generation instead of displaying the older checkout version.

See the [visual regression guide](https://github.com/hudsonkit/arc/blob/main/visual/README.md) for fixture updates and
optional PNG comparisons.

## License

[MIT](https://github.com/hudsonkit/arc/blob/main/LICENSE)
