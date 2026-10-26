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
| `open_live_diagram` | `{diagram, title?, baseUrl?, agent?: {harness, name?}}` → `{ok, sessionId, liveUrl, streamUrl, revision, status, actor}`; starts idle |
| `begin_live_diagram_work` | `{sessionId, summary, scope?}` → `{ok, sessionId, workId, revision, status, work}`; declare work before doing it |
| `update_live_diagram` | `{sessionId, diagram, message?}` → `{ok, sessionId, revision, status}`; full validated replacement |
| `finish_live_diagram_work` | `{sessionId, workId, message?}` → `{ok, sessionId, workId, revision, status, work}`; completes work and leaves the view reusable |
| `end_live_diagram` | `{sessionId, message?}` → `{ok, sessionId, revision, status}`; keeps the final snapshot |

## Live architecture workflow

Inspect the connected tool list for all five live tools; a version label alone
does not establish support. Use `open_live_diagram` once and show its `liveUrl`.
Before doing diagram work, call `begin_live_diagram_work` with a short summary
and optional scope, then retain its `workId`. Publish meaningful revisions with
`update_live_diagram`, using stable node IDs and a short message describing the
change. In a cleanup/finally path, call `finish_live_diagram_work` with that ID
when the declared work ends. The view becomes idle and can accept another
begin/update/finish cycle. Use `end_live_diagram` only to finish the entire
session; it rejects later edits.

`scope` defaults to `{type: "canvas"}`. `{type: "nodes", nodeIds: ["api"]}`
targets 1–200 unique existing node IDs, each 1–200 characters. For new components,
declare the space they will occupy with `{type: "region", x, y, width, height}`.
All coordinates must be finite and within ±100000; dimensions must be positive
and at most 100000. The summary is trimmed, 1–500 characters, without control
characters. A session accepts only one active work item; a second begin call
does not replace it. Stale, expired, and already finished work IDs are rejected.

The live route is part of the Hudson Kit Arc studio: `<ARC_EDITOR_URL>/live/:id`.
The studio base defaults to `http://localhost:5188`; `baseUrl` overrides it per
view and preserves deployment prefixes such as `/arc`. The fragment's `stream`
parameter contains a read-only SSE capability URL. Treat the full URL as a
shareable read capability. The session ID by itself does not grant read access,
and another MCP connection cannot write to the session.

The SSE event name is `snapshot`. Every event is a complete `LiveDiagramSnapshot`
from `src/types/live.ts`, with an increasing `revision`, diagram, title,
`actor: {name, version?, id, harness?, displayName?}`, `status`, optional message,
optional `work`, and ISO `updatedAt`. Work contains `{id, summary, scope, status,
startedAt, finishedAt?}`. Work status is `working`, `complete`, or `interrupted`.
Active work has no `finishedAt`; complete and interrupted work have one.
Actor name and version come from the MCP initialize handshake; `id` is a
server-generated connection ID, not a harness conversation identifier.
An optional `agent: {harness, name?}` on `open_live_diagram` adds caller-declared
`actor.harness` and `actor.displayName` labels to that session only. These labels
are not verified and never replace the actual connection identity. Both are
trimmed, require 1–80 characters, and reject control characters. Omit them when
the caller has no explicit harness or agent name; do not infer a model or name
from a generic MCP client. The local interactive driver reads these labels from
`ARC_AGENT_HARNESS` and optional `ARC_AGENT_NAME`, with no defaults.
Reconnects receive the latest snapshot immediately. Invalid updates do not
advance the revision. Opening or editing without declared work leaves the
session idle. Updates during work retain its scope and renew a five-minute
lease; they do not start an eight-second activity pulse. Finish marks work
complete and leaves the session idle. Disconnect or lease expiry interrupts
active work, while `end_live_diagram` completes it and the whole session. A later
standalone edit clears old work metadata. These statuses describe declared
diagram work, not arbitrary harness turn boundaries or unobserved thinking.
If work outlasts its lease, declare a new work item before resuming; do not send
artificial updates just to keep the activity indicator running.

Stdio lazily starts a Node-compatible loopback relay on a free port. The viewer
must run on the same computer and the MCP process must stay alive. A hosted
studio may require the browser's local-network permission. HTTP mode shares a
relay across initialized MCP sessions while preserving ownership and identity.
Set `ARC_MCP_PUBLIC_URL` to the externally reachable relay origin and preserve
that Host through proxies; the HTTP server binds to `127.0.0.1` by default.
`ARC_MCP_ALLOWED_ORIGINS` adds permitted browser origins for MCP requests. Live
streams allow only the studio origin selected for that view. The HTTP server
enforces `ARC_MCP_TOKEN` on every MCP request when set and requires it when
binding outside loopback.

Ordinary live sessions are in memory. Unfinished diagrams remain available while their owning
MCP connection stays open; they expire one hour after that connection closes.
Completed diagrams expire one hour after completion. All sessions disappear on
server shutdown. At most 100 live diagrams are retained per relay. Diagrams are
limited to 2 MiB. Export a completed diagram from the studio for durable storage.

## Saved architecture reviews (private preview)

The matching preview MCP and Hudson Kit studio add durable reviews. See
[private preview setup](../private-preview.md) for private hosting and restart
verification. This is a checkout preview, not a claim about the deployed site.

- `open_architecture_review({diagram,title,question,repository?,agent?,baseUrl?})`
  saves the baseline and returns `sessionId`, viewer URLs, and an author
  `resumeToken`. Repository metadata is `{name,url?,revision?}`.
- `update_architecture_review({sessionId,summary?,findings?,decisions?,openQuestions?})`
  replaces only provided fields. Array fields replace their complete prior
  lists. Findings use `{id,title,detail,severity,nodeIds?,sources}` with severity
  `info|low|medium|high`; each source is `{path,line?,revision?,url?}`.
- `resume_architecture_review({sessionId,resumeToken,agent?,baseUrl?})` reclaims a saved
  review after author loss. Optional `agent: {harness,name?}` supplies caller-declared
  labels alongside the new connection's actual MCP identity. Omit it to show only
  that connection identity. It rejects a second live author. Completed reviews
  stay read-only and retain their final author and history unchanged.
- `revoke_architecture_review_share({sessionId})` rotates its viewer capability.

Use the existing begin/update/finish/end live tools for review work and diagrams.
Every acknowledged revision is saved before it is broadcast. Author loss or a
server restart interrupts active work; it never silently reports success.
Saved reviews retain their baseline, findings, source references, decisions,
questions, and revision history without the ephemeral live-session expiry.

`GET /live/:id/review?token=<viewer-capability>` returns
`{schemaVersion:1,baseline,snapshot,revisions}`. It contains no author secret or
viewer token and powers the studio's Save review download and saved history.
The same capability is required for SSE. The review directory is selected by
`ARC_REVIEW_DIR`; credentials and ownership records stay in private storage.
Keep both the review directory and configured server address stable to reopen
the same saved link after restart. An ephemeral stdio relay needs a resumed URL
when its port changes. Source claims are supplied by the author, not verified
by the transport.

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
