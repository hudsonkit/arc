# MCP Server — Agent Context

## Status: Shipped (`arc-mcp` bin on `@hudsonkit/arc-mcp`)

The MCP server ships as its own package, `@hudsonkit/arc-mcp` — split out of
`@hudsonkit/arc` so agent installs don't pull the studio/renderer bundle. Source
lives in `packages/mcp/` in the same repo.

## Run

```bash
# local dev (from repo)
bun run mcp

# published bin (after build:mcp)
arc-mcp
npx -y @hudsonkit/arc-mcp
```

Build the bundled bin: `bun run build:mcp` → `packages/mcp/dist/arc-mcp.mjs`

## Add to an MCP client

Claude Code, project scope:

```bash
claude mcp add --scope project arc -- npx -y @hudsonkit/arc-mcp
```

Devin CLI:

```bash
devin mcp add arc -- npx -y @hudsonkit/arc-mcp
```

## Cursor / Claude Desktop Config

```json
{
  "mcpServers": {
    "arc": {
      "command": "node",
      "args": ["/absolute/path/to/arc/packages/mcp/dist/arc-mcp.mjs"],
      "env": {
        "ARC_EDITOR_URL": "http://localhost:5188",
        "ARC_CHROME": "/path/to/chrome-or-chromium"
      }
    }
  }
}
```

From a global install (after publish):

```json
{
  "mcpServers": {
    "arc": {
      "command": "arc-mcp"
    }
  }
}
```

## Tools (authoring coverage)

| Tool | Description |
|------|-------------|
| `validate_diagram` | Validate JSON; returns `{ok, diagnostics[]}` with stable codes + repair fixes |
| `diff_diagram` | Structural diff `{ base, head }` → `DiagramDelta` |
| `auto_layout` | Sugiyama layout (full diagram or minimal input) |
| `render_ascii` | Unicode/ASCII box-drawing output |
| `render_svg` | Deterministic SVG markup from the export path; flow animations are SMIL unless `flowTime`/`animateFlows` sample a still |
| `render_png` | PNG image content via optional Chrome/Chromium rasterization, sampled at `flowTime` |
| `render_animation` | GIF or MP4 artifact for diagrams with `flows`; requires Chrome/Chromium plus ffmpeg |
| `render_html` | `component` TSX, `iframe` embed, or standalone `html` output |
| `diagram_to_typescript` | Emit a typed TS module |
| `editor_handoff` | Build `#data=` studio URL + session id; `view` adds a `playerUrl` deep-linked to a `views[]` chapter |

`render_png` returns MCP `image` content (`mimeType: image/png`, base64 `data`) plus text metadata (`width`, `height`, `scale`, `bytes`, `chrome`, `theme`, `mode`). `render_svg`, `render_png`, `render_animation`, and `render_html` accept Arc `theme`/`mode`; omit `mode` to use the theme's default (`claude` → light, `spacex`/`codex` → dark). Branded themes include their grid/frame by default; set `includeGrid: false` to suppress it. `render_html` returns paste-ready text: a React component for `format=component`, an iframe tag backed by the studio hash URL for `format=iframe`, or a standalone SVG HTML document for `format=html`.

`render_animation` is file-producing rather than image-producing: pass `output` as a path ending in `.gif` or `.mp4`, optionally `duration`, `fps`, `scale`, `theme`, `mode`, and `background`. It captures deterministic `flowTime` frames in one Chrome session and encodes through ffmpeg (`ARC_FFMPEG`/`FFMPEG_PATH` override lookup), returning JSON metadata with `output`, `bytes`, `frames`, `fps`, `duration`, `width`, and `height`.

## Resources

| URI | Content |
|-----|---------|
| `arc://schema/diagram` | Generated `schemas/arc-diagram.schema.json` |
| `arc://skill/diagrams` | `skills/arc-diagrams/SKILL.md` |
| `arc://docs/llm` | `docs/llm.txt` |

## PNG rasterization

`render_png` keeps `@hudsonkit/arc-mcp` dependency-free by reusing `generateSVG()` and
launching an installed Chrome/Chromium binary in headless screenshot mode. It
looks for `ARC_CHROME`, `CHROME_PATH`, `PUPPETEER_EXECUTABLE_PATH`, common OS
install paths, then `google-chrome`/`chromium` on `PATH`. If none is available,
the tool returns `render/chrome-unavailable` instead of a broken image. Set any
of the env vars to `none` (or `0`/`false`/`off`) to force unavailability —
useful for deterministic CI.

## Not in MCP (yet)

These stay CLI/studio/API paths for now:

| Capability | Where |
|------------|-------|
| Dev PNG capture | `/capture/:sessionId` (dev server) |
| Mermaid import | `@hudsonkit/arc-viewer` |
| Read-only embed | `@hudsonkit/arc-viewer` (`<ArcDiagram />`) |
| Isometric YAML | `@hudsonkit/arc-iso` |

v0 targets the **authoring loop**: validate → layout → preview → open in studio. `diff_diagram` covers the review loop: base vs head → render the delta.

## Implementation

- Source: `packages/mcp/src/server.ts`
- Bundle: `packages/mcp/build.mjs` → `packages/mcp/dist/arc-mcp.mjs` (`bun run build:mcp` from the repo root)
- MCP SDK + zod are devDependencies, bundled into the bin (zero runtime deps)
- The schema, skill markdown, and `llm.txt` resources are inlined as text imports at bundle time

## Programmatic API (from `@hudsonkit/arc`)

```typescript
import {
  validateDiagramShape,
  isDiagramShape,
  toTypeScriptSource,
  autoLayout,
  renderAscii,
} from '@hudsonkit/arc'
```
