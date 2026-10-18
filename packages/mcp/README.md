<div align="center">

<img src="https://raw.githubusercontent.com/hudsonkit/arc/main/public/arc-mark.svg" alt="Arc" width="52" height="52" />

# @arach/arc-mcp

### MCP server for architecture diagrams as code.

Gives AI agents the full Arc toolchain over the Model Context Protocol —
author, validate, lay out, render, and diff architecture diagrams from any
MCP client.

[![npm version](https://img.shields.io/npm/v/@arach/arc-mcp.svg?color=6d5efc&label=%40arach%2Farc-mcp)](https://www.npmjs.com/package/@arach/arc-mcp)
[![license](https://img.shields.io/npm/l/@arach/arc-mcp.svg?color=41b883)](https://github.com/hudsonkit/arc/blob/main/LICENSE)

</div>

## Run it

No install needed — the server runs over stdio:

```bash
npx -y @arach/arc-mcp
# or: bunx @arach/arc-mcp
```

## Client setup

**Claude Code:**

```bash
claude mcp add --scope project arc -- npx -y @arach/arc-mcp
```

**Devin:**

```bash
devin mcp add arc -- npx -y @arach/arc-mcp
```

**Any MCP client (JSON config):**

```json
{
  "mcpServers": {
    "arc": {
      "command": "npx",
      "args": ["-y", "@arach/arc-mcp"]
    }
  }
}
```

## Tools

| Tool | What it does |
|------|--------------|
| `validate_diagram` | Coded diagnostics for `ArcDiagramData` — consume by `code`, apply a `supportedFixes` entry, re-validate |
| `auto_layout` | Auto-layout a full diagram or minimal input (`nodeData` + `connectors` + `connectorStyles`) |
| `diff_diagram` | Structural `DiagramDelta` — feed to `<ArcDiagram data={head} delta={delta} />` for a diff render |
| `render_svg` | Deterministic SVG export — eleven themes, light/dark; authored flows animate via SMIL or sample at `flowTime` |
| `render_png` | PNG raster via a local Chrome/Chromium binary (`ARC_CHROME` to override, `ARC_CHROME=none` to disable), sampled at `flowTime` |
| `render_animation` | GIF/MP4 flow animation to an `output` path via Chrome frames + ffmpeg (`ARC_FFMPEG` to override) |
| `render_html` | React component snippet, iframe embed, or standalone HTML page |
| `render_ascii` | Unicode/ASCII box-art rendering for terminals and docs |
| `diagram_to_typescript` | Emit a typed `ArcDiagramData` TypeScript module |
| `editor_handoff` | Build URLs that open the diagram in the Arc studio |

## Resources

| URI | Content |
|-----|---------|
| `arc://schema/diagram` | Generated draft-07 JSON Schema for `ArcDiagramData` |
| `arc://skill/diagrams` | Arc diagram-generation skill for agents |
| `arc://docs/llm` | Dense LLM briefing |

## Self-hosting over HTTP

The published bin runs over stdio, which is all a local client needs. To serve
Arc to clients on other machines, run the Streamable HTTP server from a checkout
of the repo:

```bash
git clone https://github.com/hudsonkit/arc && cd arc
bun install
ARC_MCP_HOST=127.0.0.1 ARC_MCP_PORT=5190 bun run mcp:http
# MCP endpoint: http://127.0.0.1:5190/mcp · health: /health
```

| Variable | Default | Purpose |
|----------|---------|---------|
| `ARC_MCP_PORT` | `5190` | Port to listen on |
| `ARC_MCP_HOST` | `0.0.0.0` | Interface to bind; use `127.0.0.1` unless it sits behind your own auth |
| `ARC_EDITOR_URL` | `http://localhost:5188` | Studio base that `editor_handoff` links point to |

Arc doesn't run a public MCP endpoint. If you need a hosted one, open an issue
at [github.com/hudsonkit/arc](https://github.com/hudsonkit/arc/issues).

## Related packages

- [`@arach/arc`](https://www.npmjs.com/package/@arach/arc) — React renderer, visual studio, `arc` CLI, ASCII renderer
- [`@arach/arc-viewer`](https://www.npmjs.com/package/@arach/arc-viewer) — native Mermaid sequence diagrams + Mermaid import
- [`@arach/arc-iso`](https://www.npmjs.com/package/@arach/arc-iso) — isometric renderer for vanilla JS and the browser

Studio + docs: [arc.jdi.sh](https://arc.jdi.sh) · Source: [github.com/hudsonkit/arc](https://github.com/hudsonkit/arc)

## License

[MIT](https://github.com/hudsonkit/arc/blob/main/LICENSE)
