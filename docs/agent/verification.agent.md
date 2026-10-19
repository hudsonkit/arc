# Visual Verification — Agent Context

Agents can validate diagram JSON without a browser. Use these steps when a change
needs visual confirmation.

## Headless Checks (no dev server)

```typescript
import { validateDiagramShape } from 'src/utils/diagramValidation'
import { renderAscii, autoLayout } from '@hudsonkit/arc'

const err = validateDiagramShape(diagram)
if (err) throw new Error(err)

const ascii = renderAscii(diagram)          // quick layout sanity check
const laidOut = autoLayout({ ... })         // positioning without hand coords
```

CLI:

```bash
bunx tsx bin/arc-ascii.mjs diagram.json
bun run typecheck
bun run lint
```

## Dev Server

```bash
bun install
bun run dev    # http://localhost:5188
```

| URL | Purpose |
|-----|---------|
| `/editor` | New session (mints ID, auto-saves to localStorage) |
| `/editor/:sessionId` | Resume a session |
| `/showcase?doc=platform` | Player harness with all props as controls |
| `/player/:sessionId` | Read-only render |
| `/docs` | Human + agent documentation |

Showcase query params are shareable: `?doc=platform&theme=workbench&mode=light`

## Session Persistence

Diagrams auto-save to `localStorage` under `arc-session-{id}` (debounced 1s).
Last session remembered at `arc-last-session`.

To seed a session programmatically (browser console):

```javascript
localStorage.setItem('arc-session-my-test', JSON.stringify({
  diagram: { /* ArcDiagramData */ },
  savedAt: new Date().toISOString(),
}))
// → open /editor/my-test
```

## Dev PNG Capture

Vite middleware at `/capture/:sessionId` (requires `bun run dev`):

```bash
# Existing session
curl "http://localhost:5188/capture/my-test" > out.png

# Inline diagram via hash (base64 JSON)
curl "http://localhost:5188/capture/preview?hash=$(base64 -i diagram.json)" > out.png

# Custom viewport
curl "http://localhost:5188/capture/my-test?width=1200&height=600" > out.png
```

Also: `scripts/preview.mjs` for CLI iteration.

## Suggested Agent Test Plan

1. `validateDiagramShape` passes
2. `bun run typecheck` + `bun run lint` clean (if code changed)
3. Open `/showcase?doc=...` or `/editor/:id` — confirm layout
4. Optional: capture PNG for regression comparison

## Markup Pane Loop

The editor's braces panel edits JSON live. Parse errors show in the footer;
valid edits dispatch `diagram/replace` (undoable). Use this to test JSON changes
without writing files.
