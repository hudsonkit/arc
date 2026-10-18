# Export Formats

Export Arc architecture data as **PNG, SVG, GIF, or MP4**, embed it in a page,
or keep it as editable source.

| Output | Best for | Available through |
| --- | --- | --- |
| PNG | Still images in docs, chat, and social posts | Studio, CLI, MCP |
| SVG | Scalable drawings and animated flow routes | Studio, CLI, MCP, `generateSVG()` |
| GIF | Looping flow animations | CLI, MCP `render_animation` |
| MP4 | Flow videos for decks and demos | CLI, MCP `render_animation` |
| HTML / React | Standalone SVG pages, iframe embeds, React components | MCP `render_html` |
| ASCII / Unicode | Terminals and plain text | `renderAscii()`, `arc-ascii` |
| JSON / TypeScript | Editable, versionable source | Studio |

These file exports use `ArcDiagramData`. Native Mermaid sequence playback uses
`ArcMermaidPlayer` in React; the animation exporter captures architecture flow
routes, not the sequence player's timeline.

## Export with the CLI

Install `@arach/arc`, then render an Arc JSON file. The output extension selects
the format:

```bash
npx arc render diagram.json --out diagram.png
npx arc render diagram.json --out diagram.svg
npx arc render diagram.json --out diagram.gif --duration 4 --fps 12
npx arc render diagram.json --out diagram.mp4 --duration 4 --fps 30
```

PNG needs Chrome/Chromium. GIF and MP4 also need ffmpeg. Set `ARC_CHROME` and
`ARC_FFMPEG` if the executables are not discovered automatically.

## JSON

The raw, declarative diagram config (`layout`, `nodes`, `nodeData`, `connectors`,
`connectorStyles`). Diff it in code review, generate it programmatically, commit it
next to the system it describes.

## TypeScript

The same config as a typed `ArcDiagramData` object — drop it into a React app and
render with the component:

```tsx
import { ArcDiagram, type ArcDiagramData } from '@arach/arc'

const diagram: ArcDiagramData = { /* … */ }
<ArcDiagram data={diagram} theme="cool" mode="light" />
```

## SVG

Vector export — crisp at any size, ideal for docs, decks, and print. The static
`generateSVG()` path is deterministic and theme-aware; agents can call the same
export through MCP `render_svg` with `theme`/`mode` (`spacex`, `claude`, and
`codex` each have a sensible default mode). Branded themes include their grid
and frame by default; pass `includeGrid: false` to suppress the grid.

## PNG

Raster export for places that can't render SVG (READMEs, chat, social cards).
The editor and `/capture` screenshot endpoint produce PNGs, and MCP `render_png`
returns image content when a Chrome/Chromium executable is available (`ARC_CHROME`,
`CHROME_PATH`, `PUPPETEER_EXECUTABLE_PATH`, or a common install/PATH location).

## GIF and MP4

Render authored `flows` as repeatable animations. The CLI and MCP
`render_animation` sample deterministic frames in Chrome/Chromium and encode
them with ffmpeg. Set `duration` and `fps` to control the clip. GIF works well for
short loops; MP4 produces H.264 video for presentations and video workflows.

SVG can animate flow routes directly. PNG captures a still; use the CLI's
`--flow-time` option to choose the instant.

## HTML / embeds

MCP `render_html` emits paste-ready integration output: `format=component` for a
React `<ArcDiagram />` TSX component, `format=iframe` for a studio embed tag, and
`format=html` for a standalone SVG document.

## ASCII

A Unicode/ASCII box-drawing render via `renderAscii()` — for terminals, code
comments, and plain-text READMEs.

```ts
import { renderAscii } from '@arach/arc'

console.log(renderAscii(diagram))
```

All formats come from the **same** declarative source — design once, render anywhere.
