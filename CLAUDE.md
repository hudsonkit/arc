# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

**Arc** is a visual diagram editor for creating architecture diagrams. It provides a drag-and-drop interface for designing system architectures that can be exported to Talkie landing pages.

## Tech Stack

- **React 19** - UI framework
- **Vite 7** - Build tool and dev server
- **TailwindCSS 4** - Utility-first styling
- **Lucide React** - SVG icon library
- **TypeScript** - Full type support

## Build Commands

```bash
bun run dev      # Start dev server with HMR
bun run build    # Production build to dist/
bun run preview  # Preview production build
bun run lint     # Run ESLint
```

`lint` covers `.ts`/`.tsx` (via `typescript-eslint`) and ignores build output —
it used to match only `**/*.{js,jsx}`, so it linted `dist-iso/` and `ds-bundle/`
and reported 500+ "errors" in minified vendor code while never looking at the
source. Rules that are advisory rather than correctness
(`react-refresh/only-export-components`, `react-hooks/set-state-in-effect`,
`static-components`, `refs`) are **warnings**, so a real error in a run still
stands out; the reasoning for each is in `eslint.config.js`.

## Architecture

### Project Structure

```
src/
├── main.jsx                        # React DOM entry point
├── App.jsx                         # Root with theme toggle
├── index.css                       # Tailwind imports
├── components/
│   ├── ArchitectureDiagram.jsx     # Legacy static renderer (kept for reference)
│   ├── editor/
│   │   ├── DiagramEditor.jsx       # Main editor layout
│   │   ├── EditorProvider.jsx      # Context + state management
│   │   ├── editorReducer.js        # useReducer logic
│   │   ├── Toolbar.jsx             # File/mode/history controls
│   │   ├── DiagramCanvas.jsx       # Interactive canvas with drag-and-drop
│   │   ├── EditableNode.jsx        # Draggable node component
│   │   ├── ConnectorLayer.jsx      # SVG connectors
│   │   ├── AnchorPoints.jsx        # Connection point indicators
│   │   └── PropertiesPanel.jsx     # Right sidebar for editing
│   ├── properties/
│   │   ├── NodeProperties.jsx      # Node editing form
│   │   ├── ConnectorProperties.jsx # Connector editing form
│   │   ├── IconPicker.jsx          # Icon selection grid
│   │   └── ColorPicker.jsx         # Color swatches
│   └── dialogs/
│       └── ExportDialog.jsx        # Export preview + copy
├── utils/
│   ├── constants.js                # Colors, sizes, anchors
│   ├── diagramHelpers.js           # Position/path calculations
│   ├── iconRegistry.js             # Icon name ↔ component mapping
│   └── fileOperations.js           # Save/load/export functions
└── hooks/
    └── useKeyboardShortcuts.js     # Keyboard handler
```

### State Management

Uses `useReducer` + Context for diagram state:

```javascript
{
  diagram: { layout, nodes, nodeData, connectors, connectorStyles, groups, images },
  editor: { selectedNodeIds, selectedConnectorIndex, mode, pendingConnector, isDragging, themeId, colorMode },
  meta: { filename, isDirty, lastSaved, diagramMeta },
  history: { past, future }
}
```

### Theme System

Eleven themes (`default`, `warm`, `cool`, `mono`, plus the branded `engineering`, `workbench`, `tactical`, `command`, `spacex`, `claude`, `codex`) defined in `src/utils/themes.ts`. Each has light/dark palettes that remap logical colors (violet, emerald, etc.) to different Tailwind classes and hex stroke values, and an optional `brand` spec (fonts, node shape, grid, frame, title block).

- `useResolvedTheme()` hook returns the current theme palette
- `EditableNode` and `ConnectorLayer` resolve colors through the theme palette
- Theme ID and color mode are persisted in editor state and saved with diagrams

### Node Shapes and Decoration

`nodeShape` used to collapse into a border-radius — `chamfer` was literally 2px
of rounding — so every theme's nodes looked alike. Silhouettes are now real,
drawn in `src/utils/nodeShape.ts` and applied by `Node` in `components/ArcDiagram.tsx`
(the editor delegates to the same component whenever a theme is active).

| `nodeShape` | Silhouette |
|-------------|-----------|
| `rounded` | default 12px radius |
| `square` | 0px |
| `pill` | fully rounded ends |
| `chamfer` | all four corners cut — clip-path, not rounding |
| `notch` | one cut at the top-right, like a keyed card |

| `nodeDecor` | Ornament |
|-------------|----------|
| `none` | — |
| `bar-left` / `bar-top` | 2px accent bar on that edge (what `accentBar` used to mean; it still works) |
| `ticks` | registration marks in all four corners |
| `rule` | hairline under the header row |
| `dot` | status dot, top-right |
| `stripe` | hatched flag, bottom-right (kept clear of a notch) |

Current assignment: engineering `square` + `ticks`, workbench `rule`,
tactical `notch` + `stripe`, command `chamfer` + `dot`, mono `square` + `rule`,
warm `bar-left`, cool `dot`, spacex `chamfer` + `ticks`, claude `bar-left`,
codex `rule`, default plain.

**Per-node override.** Shape is normally the theme's business — it is part of
what makes `engineering` look unlike `command` — but one box sometimes needs to
read differently from its neighbours, so `nodeData.shape` overrides it:

```json
{ "nodeData": { "queue": { "name": "Queue", "shape": "pill" } } }
```

The inspector offers it as five silhouettes (`ShapePicker`), with the theme's
own shape marked as inherited rather than leaving the row blank, and a "Follow
the theme" link once a node has been overridden. Clearing it *deletes* the key —
`node/update` treats an update to `undefined` as a removal, so an override
leaves no trace in the saved document.

An override has to carry its radius with it (`radiusForShape`): a `pill` that
kept a square theme's `0px` radius would still come out square.

Three things to know before adding a cut shape:

- A clipped element clips its **border** and its **box-shadow** too. Cut shapes
  draw their edge as an SVG `<path>` overlay (`shapeOutlinePath`) and get their
  hover glow from a `drop-shadow` filter, which follows the clip.
- The clip polygon uses **px**, not %, so the cut stays at 45° at any height.
- Cut shells take the nominal `NODE_SIZES` height, since the SVG outline needs
  real dimensions — which also aligns the drawn box with the geometry connector
  anchors already assume.

### Semantic Node Kinds

`nodeData` accepts an optional `kind` (`frontend`, `backend`, `service`,
`database`, `cache`, `queue`, `storage`, `gateway`, `security`, `user`,
`external`, `observability` — `src/utils/nodeKinds.ts`). A kind supplies the
node's default `icon` and `color` from `NODE_KIND_DEFAULTS`, so generated
diagrams describe *what a box is* instead of picking an icon and palette entry
by hand. Explicit `icon`/`color` remain the override — the resolution order is
`resolveNodeColor`/`resolveNodeIcon`: authored field → kind default →
`zinc`/`Box`.

Every consumption site resolves through those helpers — never read
`data.color`/`data.icon` raw. `validateDiagram` only requires `icon`+`color`
when `kind` is absent or unknown, and reports `semantic/unknown-kind` with a
`set-kind` fix; a misspelled kind does not waive the `icon`/`color`
requirement.

### Chrome Scale

Application chrome — the editor shell, the showcase, dialogs — is sized from one
set of tokens in `src/ui-scale.css`, driven by two CSS variables:

| Dial | Drives |
|------|--------|
| `--arc-ui-scale` | control heights, padding, gaps, icons, swatches, rules |
| `--arc-type-scale` | the type ramp (`--arc-text-lg/ui/sm/xs/2xs`) |

Both default to `1`, which **is** the compact baseline: 24px controls, 11px base
type, 13px icons. `editor-shell.css` consumes the ramps (`--arc-space-1…6`,
`--arc-ctl-h`, `--arc-ctl-pad-x/y`, `--arc-icon`, `--arc-swatch`) rather than
hardcoding px, so nothing needs touching to rescale.

Icon sizes come from CSS, not component props — the rules at the bottom of
`editor-shell.css` size every `svg` inside a chrome button from `--arc-icon`.
Lucide `size=` props still set the SVG's own geometry; CSS decides what renders.

**Configuring it.** The settings popover on the left rail (see below) offers
Micro / Compact / Default / Roomy plus free sliders, 75%–135%. State lives in
`src/utils/uiScale.ts` (a module store, persisted to `localStorage` under
`arc-ui-scale`) and is read via `useUiScale()`. Anything can override a subtree
directly:

```tsx
<div style={{ '--arc-ui-scale': 0.9, '--arc-type-scale': 0.95 }}>…</div>
```

**Fonts.** `--arc-font-ui` is Inter (chosen for legibility at 8–11px) and
`--arc-font-code` is JetBrains Mono, with `--arc-font-features` enabling tabular
figures. The editor's `--arc-font-body` / `--arc-font-mono` alias these.

Diagram content is deliberately outside this system: the player's own chrome
(zoom controls, legend, title block) keeps fixed sizes so an embedded or
exported diagram doesn't change with a viewer's UI density.

### Editor Canvas Surface

`DiagramCanvas` takes `surface`: `'theme'` (default) paints the diagram theme's
container, which is right for embeds where the frame is part of the artifact;
`'chrome'` paints `--arc-canvas` instead. The editor passes `'chrome'`, so the
infinite workspace follows the shell skin rather than fighting it — the diagram
theme still colors the nodes and connectors.

### Canvas Overlays

Four things float over the drawing, and they all have to share one edge:

| Overlay | Home |
|---------|------|
| mode badge / pending-connector badge | top-left |
| minimap (`.arc-canvas-minimap`) | bottom-left |
| floating toolbar (`.arc-editor-toolbar-dock`) | bottom-centre, draggable |
| zoom + view mode (`.arc-canvas-dock`) | bottom-right |

Both control clusters live in **one** dock rather than each hard-coding an
offset from the corner. The view toggle used to sit at a literal `right-44`,
which is a collision waiting for a density change — every cluster's width
follows `--arc-ui-scale`. All three bottom clusters now share `--arc-space-5`
as their offset, so they sit on one baseline at any scale.

The overlays respond to the **drawing area**, not the window — the markup pane
can take two thirds of it. Under 680px the minimap hides and the dock moves to
the free top-right corner; the toolbar alone is ~390px, and all three at the
bottom of a split view simply overlap. The toolbar clamps itself back inside on
drag and on window resize (arrow keys nudge the grip, double-click recentres) —
dragged past an edge there was no way to get it back.

**Do not make `.arc-canvas-frame` a CSS container to do this.** It is measured
in JS instead (a `ResizeObserver` on the transform container sets `.is-narrow`),
because `container-type` makes the element a containment root and the browser
then misses paint invalidation inside it when a chrome token changes on an
ancestor: switching light/dark or changing skin left the canvas and its controls
painted in the old theme until a view change or a reload forced a repaint. The
observer is worth having on its own — `containerSize` used to follow only
`window.resize`, so opening the markup pane left the minimap viewport and every
fit calculation working from a stale width.

The minimap is styled from the chrome tokens like everything else in the shell.
It used to be raw `bg-white dark:bg-zinc-900`, which put a cold white box on the
paper skin.

An empty canvas (no nodes, groups or images) draws a hint instead of nothing —
File → New used to leave a blank grid with no sign that a node was one keystroke
away.

### Chrome Themes

The *skin* of the shell — nav, rail, inspector, canvas backdrop, accents, glow —
independent of the diagram theme, which colors the drawing.

| Skin | Look |
|------|------|
| `console` | Signal blue with soft glow (the base; no CSS block of its own) |
| `graphite` | Neutral, no chroma, minimal glow — **the default** |
| `amber` | Warm terminal |
| `viridian` | Phosphor green |
| `paper` | Drafting table, warm neutral |
| `spacex` | Mission console, telemetry cyan |
| `claude` | Warm parchment and clay |
| `codex` | Graphite console, mint signal |

A new visitor gets `graphite` (`DEFAULT_CHROME_THEME`), paired with the
`workbench` diagram theme (`DEFAULT_THEME`, which new editor sessions start
from) — console blue and the `command` HUD were a loud first impression. The
editor fits its first view at no more than 110%; it used to fit up to 200%,
which blew a small diagram's 1px borders up into heavy outlines.

Each skin lives in `src/chrome-themes.css` as a set of token overrides keyed by
`data-arc-chrome` on `<html>`; `src/utils/chromeThemes.ts` is the registry and
store (persisted under `arc-chrome-theme`), read via `useChromeTheme()`.

Two cascade rules matter when adding a skin:

- The per-mode selectors must mirror the base ones exactly and add the chrome
  attribute — `[data-arc-chrome="x"] .arc-editor-root [data-hudson-template="hudson"][data-hudson-theme="dark"]`
  — otherwise they tie with `editor-shell.css` and lose on source order.
- The base light block re-declares the accent tokens, so **every skin's light
  block must restate** `--arc-acc`, `--arc-acc-hover`, `--arc-acc-soft`,
  `--arc-glow`, `--arc-edge`. Surfaces and ink only need the mode-less block.

### Settings Rail

`components/chrome/SettingsRail.tsx` is a thin column (`--arc-rail-w`) rendered
as the first child of each app's Content slot — `.arc-shell-row` holds the rail,
any panes, and `.arc-shell-main`.

- **Top:** surface navigation — Editor and Player, as `NavLink`s that mark the
  active surface.
- **Middle:** whatever the app passes as `children` (the editor adds markup and
  a viewer link to its session; the showcase adds markup).
- **Bottom:** `SettingsPanel.tsx` — chrome skin, light/dark/auto (Hudson's
  `useTheme`), and the density dials.

### Markup Pane

`components/chrome/MarkupPanel.tsx` splits the surface: source on the left,
rendering on the right, toggled from the rail's braces button. The editor
remembers the toggle in `localStorage` (`arc-editor-markup`).

CodeMirror's own surface colors are bound to the chrome tokens with
`!important` — Hudson picks a light or dark editor theme from the shell's
resolved theme, but injects it into `<head>` at runtime, so it lands after
`editor-shell.css` and wins on a specificity tie. Overriding background, gutter,
caret, selection and active-line keeps the editor sitting on the pane's own
skinned surface under every chrome theme; syntax token colors stay Hudson's.

The pane is resizable by dragging its right edge (double-click the handle to
reset); the width persists under `arc-markup-width`, clamped to 280px and 68% of
the viewport so the drawing always keeps a third of the surface.

The editor itself is Hudson's `CodeEditor` from `hudsonkit/controls` — CodeMirror
6, which brings syntax highlighting and the gutter. Its CodeMirror packages are
*optional peers* of hudsonkit and must all be installed or the component renders
a "requires the optional CodeMirror peer dependencies" placeholder: it
dynamically imports `state`, `view`, `language`, `commands` **and** all four
`lang-*` grammars (`javascript`, `json`, `css`, `html`, `markdown`), so a missing
grammar fails the whole load. It is lazily imported so CodeMirror only ships to
consumers who open the pane (the ESM build splits it out; the UMD build can't).

Two formats, deliberately different in kind:

| Format | Behaviour |
|--------|-----------|
| `.json` | the document — editable, applied back to the canvas |
| `.ts` | a generated module for pasting into a repo — read-only |

Edits are debounced 400ms, parsed, shape-checked (`validateDiagramShape`) and
dispatched as `diagram/replace`. That action deliberately differs from
`diagram/load`: it pushes history (so ⌘Z steps back through markup edits), keeps
the open filename and `diagramMeta`, and prunes selection to nodes that still
exist. Parse and validation failures surface in the pane footer and leave the
diagram untouched.

Two loops have to be broken for a live two-way pane to behave:

- **CodeMirror re-emits the document** whenever `code` changes from outside — a
  node dragged on the canvas, File → New. `handleChange` ignores a change equal
  to the current `rendered`; treating it as an edit applied the document back to
  itself, so every canvas move pushed a history entry and set the dirty flag.
- **Our own apply comes back round** as new `data`, and the effect that follows
  the diagram would replace the text under the cursor with the reformatted
  version mid-keystroke. The panel remembers the source its apply should
  produce (`echo`) and keeps the draft when that is what arrives; anything else
  is a canvas edit and wins.

Note for anything else that floats over the canvas: `.arc-editor-canvas > *`
forces `position: relative`, and unlayered CSS beats a Tailwind utility on a
specificity tie, so an `absolute` child silently drops into normal flow (this is
what stretched the floating toolbar into a full-width bar). Opt out with
`data-arc-float`.

It is deliberately *not* Hudson's LeftPanel slot: that panel comes with a header
and a resizable default width, and forcing it down to a rail meant fighting the
shell's own layout.

### Isometric Render Styles

The isometric view has its own render styles, defined in `src/utils/isoStyles.ts`:

| Style | Look |
|-------|------|
| `solid` | Shaded, rounded 3D boxes (the original isometric look) |
| `blueprint` | 1980s engineering plate — sepia ink on parchment |
| `cyanotype` | Same line art, white ink on blueprint blue |

The technical styles (`blueprint`, `cyanotype`) are drawn by shared,
model-agnostic pieces in `src/components/technical/` so both renderers — the
editor canvas and the packaged `@hudsonkit/arc-iso` renderer — draw the same plate:

| Piece | Draws |
|-------|-------|
| `TechnicalDefs` | Hatch patterns per face axis, paper gradient, grain, chevron arrowheads |
| `TechnicalBackdrop` | Paper filling the whole surface; its graph grid is pinned to the panned/zoomed drawing |
| `TechnicalPlate` | Frame, registration ticks, component index, title block (canvas space) |
| `TechnicalNode` | `TechnicalBox` (hatched faces + edges + tag) and `TechnicalCallout` |

Geometry lives in `src/utils/isoWire.ts` (`isoWireBox`, plate margins), which
carries no diagram model; `src/utils/isoBlueprint.ts` adapts it to the editor's
node/connector model.

- Faces are washed then hatched; a node's **color maps to a hatch signature**
  (`MATERIAL_KEYS`) rather than a hue, since the plate is monochrome
- Hatch lines follow the three isometric face axes (−30° / +30° / vertical)
- Visible edges are solid, the three occluded edges are dashed
- Both renderers draw every box first, then every callout, so a nearer
  component never covers a neighbour's label
- Connectors become straight dotted runs with open chevron arrowheads
- `DETAIL_SCALE` in `isoStyles.ts` is one dial for all annotation sizing

**Choosing a style.** The canvas controls offer three *destinations*, each one
click from either of the others:

| Button | Goes to |
|--------|---------|
| layers | 2D |
| box | isometric, `solid` |
| ruler | isometric, technical plate — clicking again swaps the ink |

The ruler used to be a style cycler that only worked once you were already in
the isometric view, so reaching a plate from 2D took two clicks through a button
whose label gave no hint of that. `TECHNICAL_STYLE_ORDER` / `nextTechnicalStyle`
are the cycle *within* that destination; `nextIsoStyle` (all three) is still
exported for callers that want the old behaviour.

Declaratively:

```json
{ "_meta": { "viewMode": "isometric", "isoStyle": "blueprint" } }
```

`_meta.viewMode` and `_meta.isoStyle` round-trip through save/open, sessions,
and the `#data=` handoff, so a diagram file opens straight into the plate.
Embeds can also pass `defaultViewMode` / `defaultIsoStyle` in `EmbedConfig`
(a diagram's own `_meta` wins).

For the packaged isometric renderer, the YAML markup carries it as a top-level
key, parsed by `parseYamlConfig` into `DiagramConfig.style`:

```yaml
title: Data Platform
theme: light
style: blueprint
```

### Editor Modes

- **select** - Default mode. Click to select, drag to move nodes
- **addNode** - Click on canvas to place a new node
- **addConnector** - Click source anchor → click target anchor to connect

## Using the Editor

### Toolbar
- **New/Open/Save** - File operations (uses File System Access API)
- **Export** - Generate handoff format for Talkie
- **Select/+Node/+Line** - Mode selection
- **Undo/Redo** - History navigation
- **Delete** - Remove selected item

### Opening Files

`loadDiagram()` returns `null` for a cancelled dialog and otherwise either
`{ diagram, filename }` or `{ error }`, so a caller can never mistake a failure
for an empty diagram — the old shape returned `{ error }` on bad JSON and the
editor destructured `result.diagram` off it and threw. Every candidate is run
through **`validateDiagramShape`** (`src/utils/diagramValidation.ts`), shared
with the markup pane: the canvas reads `layout.width` and iterates `nodes`
without guarding, so opening any unrelated `.json` used to take the whole view
down. Both fallback paths matter too — the `<input type=file>` path resolves on
`cancel`, or the promise (and the caller awaiting it) hangs for the life of the
page.

Outcomes land in the **status bar**: `ArcEditorSession.say(message, tone)` sets
a transient notice that `useArcEditorStatus` shows ahead of the node count
(errors linger 8s, successes 3s). File operations used to fail silently, which
left the editor looking as though the click had not registered.

### Canvas
- **Drag nodes** to reposition
- **Click node** to select and edit properties
- **Click connector** to select and edit properties

### Properties Panel
- Edit name, subtitle, description
- Change icon (from Lucide set)
- Change color theme
- Change size (large/normal/small)
- Edit connector anchors and styles

### Keyboard Shortcuts
- `Delete/Backspace` - Delete selected
- `Escape` - Clear selection / cancel mode
- `Cmd+Z` - Undo
- `Cmd+Shift+Z` - Redo
- `Cmd+S` - Save
- `Cmd+N` - New diagram

`useKeyboardShortcuts` stands down inside anything the user is typing in —
`isTextEntry()` checks `isContentEditable`, the input tags, and
`.cm-editor` / `[role="textbox"]` ancestry. A tag-name check alone was not
enough: CodeMirror's editable surface is a contenteditable `<div>`, so the
single-key mode shortcuts (`v` `h` `n` `c`) were swallowing those letters in the
markup pane — `preventDefault` stops the insertion — and Delete was removing the
selected node instead of a character. Two exceptions survive in a text field:
`⌘S` still saves (otherwise the browser's "save page" dialog takes it), and
Escape blurs, so a second press reaches the canvas.

### Zoom Controls
- **Scroll wheel** - Pan the canvas
- **Cmd/Ctrl + scroll** - Zoom in/out (focal point zoom)
- **Click percentage** - Type a custom zoom level
- **Double-click percentage** - Reset to initial zoom
- **+/- buttons** - Step through zoom levels (5% increments)
- **Fit button** - Auto-fit diagram to viewport

## Zoom Configuration

The `DiagramCanvas` component accepts a `zoomConfig` prop for customizing zoom behavior:

```typescript
interface ZoomConfig {
  defaultZoom?: number | 'fit'  // Initial zoom level, or 'fit' to auto-calculate
  zoomLevels?: number[]         // Custom zoom level steps (overrides zoomStep)
  zoomStep?: number             // Zoom increment per step (default: 0.05 = 5%)
}
```

### Usage Examples

```tsx
// Auto-fit to container (capped at 100%)
<DiagramCanvas zoomConfig={{ defaultZoom: 'fit' }} />

// Custom starting zoom
<DiagramCanvas zoomConfig={{ defaultZoom: 0.7 }} />

// 10% increments instead of 5%
<DiagramCanvas zoomConfig={{ zoomStep: 0.10 }} />

// Explicit zoom levels
<DiagramCanvas zoomConfig={{ zoomLevels: [0.5, 0.75, 1, 1.5, 2] }} />
```

### Zoom Defaults
- **Range:** 25% to 200%
- **Step:** 5% increments
- **Initial:** 100% (or calculated if `defaultZoom: 'fit'`)

## Node Hover Interactivity

Nodes respond to hover and click with visual feedback — enabled by default:

- **Hovered node** lifts up 2px with a colored glow shadow
- **Other nodes** dim to 45% opacity
- **Connected connectors** get a thicker stroke and bolder labels
- **Unconnected connectors** dim to 25% opacity
- **Click-to-lock** — click a node to lock the highlight state (works on touch devices), click again or click background to release
- All transitions animate at 200ms ease-out

### `hoverEffects` Prop

```tsx
// All effects (default)
<ArcDiagram data={diagram} hoverEffects={true} />

// No hover effects
<ArcDiagram data={diagram} hoverEffects={false} />

// Granular control
<ArcDiagram data={diagram} hoverEffects={{
  dim: true,            // dim unrelated nodes/connectors (default: true)
  dimOpacity: 0.45,     // 0–1 for dimmed nodes, connectors get ~56% of this (default: 0.45)
  lift: true,           // translateY(-2px) on hover (default: true)
  glow: true,           // colored shadow on hover (default: true)
  highlightEdges: true, // thicken connected edges (default: true)
}} />

// Highlight without dimming (good for dense diagrams)
<ArcDiagram data={diagram} hoverEffects={{ dim: false }} />

// Subtle dim, no lift
<ArcDiagram data={diagram} hoverEffects={{ dimOpacity: 0.7, lift: false }} />
```

### `onNodeHover` Callback

```tsx
<ArcDiagram
  data={diagram}
  onNodeHover={(nodeId) => {
    // nodeId is the hovered/clicked node's key, or null on release
    console.log('Active:', nodeId)
  }}
/>
```

### `maxFitZoom` Prop

When using `defaultZoom="fit"`, caps the calculated zoom level:

```tsx
// Fit to container but never exceed 85%
<ArcDiagram data={diagram} defaultZoom="fit" maxFitZoom={0.85} />
```

## Diagram Config Format

Diagrams are stored as JSON:

```json
{
  "layout": { "width": 700, "height": 340 },
  "nodes": { "nodeId": { "x": 25, "y": 15, "size": "large" } },
  "nodeData": { "nodeId": { "icon": "Monitor", "name": "...", "color": "violet" } },
  "connectors": [{ "from": "a", "to": "b", "fromAnchor": "right", "toAnchor": "left", "style": "http" }],
  "connectorStyles": { "http": { "color": "amber", "strokeWidth": 2, "label": "HTTP" } }
}
```

## Routes

| Route | Purpose |
|-------|---------|
| `/` | Landing page |
| `/editor` | New diagram (generates session ID) |
| `/editor/:sessionId` | Edit diagram with auto-save to localStorage |
| `/player/*` | Read-only rendering with full theme fidelity |
| `/showcase` | Live harness for the player — every prop as a control |
| `/capture/:sessionId` | PNG screenshot endpoint (Puppeteer middleware) |
| `/docs` | Documentation |
| `*` | Not found — an unrouted URL used to render a blank page |

`/player/*` and the catch-all share one dead-end screen (`Dead` in `App.tsx`):
a sentence saying what happened plus somewhere to go next. A player session
lives only in the browser that made it, so "not found" there usually means
"wrong browser", and the copy says so.

### Player showcase (`/showcase`)

A Hudson app, like the editor — same `AppShell`, nav, inspector rail and status
bar. It lives in `src/apps/arc-showcase/`:

| File | Role |
|------|------|
| `ShowcaseContext.tsx` | all control state, URL sync, generated snippet |
| `ShowcaseContent.tsx` | Content slot — the stage plus the docked JSX |
| `ShowcaseInspector.tsx` | Inspector slot — the control rail |
| `ShowcaseChrome.tsx` | nav center + nav actions |
| `createShowcaseApp.tsx` | the `HudsonApp` (slots, status, layout mode) |
| `documents.ts` | three sample diagrams |

The rail is built from the editor's own inspector primitives
(`components/editor/inspector-ui.tsx`), so it inherits the design system and the
chrome scale. Controls: document, template (theme) + mode, stage dimensions,
starting zoom and fit cap, chrome (legend, minimap, source toggle, focus story,
auto-layout, label + corner, frame), and the hover knobs.

The whole configuration mirrors into the query string, so a setup is shareable
as a link (`/showcase?doc=platform&theme=workbench&mode=light&map=1`) — only
non-default values are written.

### Legend

`showLegend` draws a key in the diagram's bottom-left: one row per connector
style actually used (in first-use order, with the style's color, width, and
dash) plus one row per labelled group. It stacks above the minimap when both
are on. Off by default.

A dense diagram in a short frame can want more rows than there is room for, so
the key is capped at `calc(100% - bottom - 8px)` and scrolls. Losing the last
rows to the frame's `overflow: hidden` reads as a rendering fault; a scrollbar
reads as "there is more".

### Guided views

`data.views` is an ordered list of `DiagramView` chapters — `{ id, title, node?,
mode?, nodes?, connectors?, caption?, steps? }` — that turns a diagram into a
walkthrough. `showViews` draws a rail at the bottom center (the free lane: zoom
is bottom-right, minimap/legend/label bottom-left) with prev/next, `i / N`, and
an exit.

- Resolution goes through `resolveViewFocus`, which reuses the focus-story
  machinery: an anchor `node` inherits that node's `focusTargets` story, and
  declaring `nodes`/`connectors`/`mode` on the view overrides it. A view with
  no `node` highlights exactly its declared set.
- While a view is active the camera frames the resolved highlight set (2D only —
  iso owns its own pan), and the caption/steps render through `FocusStory`.
- Clicking a node exits the chapter and locks that node's own focus — the reader
  always keeps the wheel.
- Deep links: `/player/<session>?view=<id>`; `view` + `onViewChange` make the
  chapter id controllable so hosts can keep it in their URL. `editor_handoff`
  (MCP) takes a `view` arg and returns the matching `playerUrl`.
- Views are document data: they ride `toExportFormat`, hash handoffs,
  `diagram/replace`, `arc check`, and the generated schema like everything else.

## Session Persistence

Diagrams are auto-saved to `localStorage` keyed by session ID (`arc-session-{id}`). Utilities in `src/utils/sessionStorage.ts`.

The write is debounced 1s, so it has to be **flushed** on the way out —
`ArcEditorSession` keeps the writer in a ref and calls it from the mount
effect's cleanup and from `pagehide`. Without that, clicking through to the
player within a second of an edit dropped it. (The flush lives in a
dependency-free effect on purpose: putting it in the debounce effect's own
cleanup would fire on every keystroke and defeat the debounce.)

Each write also records the session under `arc-last-session`, which is what the
rail's Editor button resolves to. Bare `/editor` mints a *new* session, so
without this, clicking Editor — from the showcase, or from the editor itself,
where the link was active — quietly abandoned the open diagram. The editor
passes its own `editorTo`; other surfaces fall back to the remembered one.

**Edit button flow:** Embedded `ArcDiagram` → click Edit → `#data=<base64>` hash → editor parses, saves to localStorage, redirects to `/editor/{id}`.

**Diagram file format:** When saving to file, `_meta` is included:
```json
{
  "layout": { ... },
  "nodes": { ... },
  "_meta": { "themeId": "cool", "colorMode": "light", "viewport": { "width": 800, "height": 400 } }
}
```

## Screenshot API (Dev Only)

The `/capture/:sessionId` endpoint (Vite middleware in `plugins/captureMiddleware.js`) returns a PNG:

```bash
# Capture with hash data
curl "http://localhost:5188/capture/my-diagram?hash=<base64>" > out.png

# Capture existing session
curl "http://localhost:5188/capture/my-diagram" > out.png

# Custom size
curl "http://localhost:5188/capture/my-diagram?width=1200&height=600" > out.png
```

There is also `scripts/preview.mjs` for CLI-based iteration.

## Handoff to Talkie Docs

Arc diagrams are consumed by the Talkie landing pages at `~/dev/TALKIE`.

**Export workflow:**
1. Click "Export" in toolbar
2. Copy the generated config
3. Paste into Talkie's ArchitectureDiagram.jsx

See `handoff.md` for the full export format spec.

## Development Notes

- Icons are stored as strings and resolved via `iconRegistry.ts`
- Drag uses native pointer events with pointer capture
- SVG layer is `pointer-events-none` except for connectors
- History is capped at 50 states for undo/redo
- Theme colors flow through `useResolvedTheme()` → `EditableNode` / `ConnectorLayer`
- Capture middleware keeps a Puppeteer browser alive for 60s between requests
