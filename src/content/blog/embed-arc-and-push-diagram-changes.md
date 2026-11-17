Arc 0.15.0 is on npm. `@hudsonkit/arc`, `@hudsonkit/arc-viewer`, `@hudsonkit/arc-iso`, and `@hudsonkit/arc-mcp` publish together at 0.15.0. The release does two things for a host page: it keeps Arc's stylesheet inside the diagram, and it accepts a stream of small changes while that diagram stays mounted.

A host can refit the drawing when its container changes, and it can validate diagram JSON without loading React. An agent, a CLI, or the host's own server can send the changes as command envelopes. `@hudsonkit/arc-mcp@0.15.0` also includes the saved architecture review tools used by the live review on the Arc site.

## Install the 0.15.0 packages

The CLI needs Node.js 22 or later. In the project that renders the diagram:

```bash
npm install @hudsonkit/arc@0.15.0
```

Install `@hudsonkit/arc-mcp@0.15.0` where the agent runs. The editor application in this repository keeps its own version. The four published packages move together, so the embed, the viewer, the isometric renderer, and the MCP server come from the same release.

## Keep Arc's styles inside the diagram

Import `@hudsonkit/arc/arc.css` with the component. The built stylesheet scopes its rules with `:where(.arc-root)`. Every Arc component renders that class on its root. Design tokens, the CSS reset, and the utility classes apply inside the root. The `:where()` wrapper adds no specificity, so the cascade inside Arc stays as it was.

A few constructs stay global, because CSS cannot scope them. The `@property` registrations only declare typed custom properties and their initial values. The `spin`, `pulse`, and `bounce` keyframes, and the cascade layer names (`theme`, `base`, `components`, `utilities`, `properties`), stay global too. They do not restyle the host page.

A menu rendered in a portal on `document.body` sits outside the root. Add `ARC_ROOT_CLASS` to that portal's container. The [API reference](https://hudsonkit.com/arc/docs/diagram-format) shows the same pattern:

```tsx
import { ARC_ROOT_CLASS } from '@hudsonkit/arc'

<div className={ARC_ROOT_CLASS}>{/* portal target */}</div>
```

Inside a host page, Arc uses its own base font and line height on `.arc-root`. That matches the standalone page. Page height stays with the host. `arc.css` no longer sets `height: 100%` on `html`, `body`, or `#root`.

## Refit the drawing when the container changes

The diagram fits once, when it first has a size. When a panel opens or a pane is resized, pass a new `fitKey`. Arc fits again in place. It keeps the mounted viewer and the rest of its state.

```tsx
<ArcDiagram data={diagram} defaultZoom="fit" fitKey={`${width}x${height}`} />
```

The first value of `fitKey` does not refit, so a key that never changes costs nothing. With a guided view active, the refit frames that view. Otherwise it fits the whole drawing, capped by `maxFitZoom`. The refit leaves the active view alone and does not call `onViewChange`. `view`, `defaultViewId`, and `onViewChange` behave as before.

`fitMeasure` chooses the box Arc measures. `'screen'`, the default, uses `getBoundingClientRect()`, the on-screen size. `'layout'` uses `clientWidth` and `clientHeight`, the layout size without CSS transforms. Use `'layout'` when an ancestor is scaled, such as a zoomed canvas or a scaled preview. The on-screen size and the layout size differ there, and a screen measurement centers the drawing in the wrong place.

```tsx
<ArcDiagram data={diagram} defaultZoom="fit" fitKey={`${width}x${height}`} fitMeasure="layout" />
```

## Validate a diagram without loading React

`@hudsonkit/arc/validate` exports `validateDiagram`, `validateDiagramShape`, `isDiagramShape`, and the types `Diagnostic`, `DiagnosticSeverity`, `DiagnosticSubject`, and `Fix`. The entry imports no React, no CSS, and no DOM API. A server, a CLI, or a build step can call it. The main package entry exports the same validators. Use the subpath when the caller should not load the renderer.

```ts
import { validateDiagram, validateDiagramShape, isDiagramShape, type Diagnostic } from '@hudsonkit/arc/validate'

const shapeError = validateDiagramShape(json)   // null when the shape is valid, else a message
const diagnostics: Diagnostic[] = validateDiagram(json)
const errors = diagnostics.filter(diagnostic => diagnostic.severity === 'error')
```

A flow's `repeat` is a positive whole number or `"indefinite"`. Validation reports `semantic/invalid-flow-timing` for anything else. The renderer also receives unvalidated documents, so it still refuses to copy an arbitrary count into the SVG. A finite number, or a string that parses as one, becomes a whole count of at least one. Anything else, including `Infinity`, plays as `indefinite`. An omitted `repeat` plays as `indefinite` too.

## Send small changes into a mounted diagram

[Push diagram streams](https://hudsonkit.com/arc/docs/live-streams) are the path for an agent that edits in small steps while a host page shows each step. The host chooses the transport and sends the envelopes itself.

An envelope is `{ v: 1, stream, seq, base, ops }`. `seq` and `base` are nonnegative safe integers. A new stream starts at sequence 0. `applyOps` accepts an envelope only when `seq` is greater than the current sequence and greater than `base`. In an ordinary envelope, `base` equals the current sequence. `applyOps` applies the operations to a private copy. Each operation has to leave a valid diagram. If one fails, `applyOps` rejects the whole envelope, returns the previous state object unchanged, and lists the diagnostics as strings. When `base` does not match, the result also has `resync: true`.

An envelope with a single `reset` operation can repair a sequence gap. The reset replaces the diagram data. It does not remount the React viewer. `applyOps` rejects a stale sequence, including a stale reset. To start the sequence history over, use a new stream id.

This is the start of the example in the stream guide. The first envelope resets an empty diagram. The second adds an API and a database:

```json
{"v":1,"stream":"architecture","seq":1,"base":0,"ops":[{"op":"reset","diagram":{"layout":{"width":1000,"height":700},"nodes":{},"nodeData":{},"connectors":[],"connectorStyles":{}}}]}
{"v":1,"stream":"architecture","seq":2,"base":1,"ops":[{"op":"node.add","id":"api","data":{"name":"API","kind":"service"}},{"op":"node.add","id":"db","data":{"name":"Database","kind":"database"}}]}
```

The same guide lists the other operations: add, update, and remove for connectors, groups, views, and flows; `node.update` and `node.remove`; `style.set`; `layout.set`; `layout.auto`; and `focus`. Entity ids stay stable. An add rejects a duplicate id. An update or a remove rejects a missing entity. A new node without `at` takes the next grid slot. Add a connector style before the connectors that use it. Removing a node also removes its connectors, and the removal can fail while other references to that node remain. Remove those references in earlier operations in the same envelope.

`focus` is viewer state, not diagram data. It selects a temporary view and shows an accessible caption. An empty `focus` operation clears it, and the host's controlled view comes back.

Keep the source object stable across renders. Arc handles each envelope on its own animation frame, so a burst does not collapse into one React update. The mounted viewer and the current camera stay. Parts that enter or leave use Arc's live motion and diff overlays.

```tsx
import { ArcLiveDiagram, type ArcLiveSource } from '@hudsonkit/arc'
import '@hudsonkit/arc/arc.css'

const source: ArcLiveSource = {
  subscribe: listener => scoutEvents.subscribe('arc:architecture', listener),
  requestResync: () => scoutEvents.emit('arc:resync', { stream: 'architecture' }),
}

<ArcLiveDiagram stream="architecture" source={source}
  onResult={result => {
    if (result.diagnostics.length)
      scoutEvents.emit('arc:diagnostic', {
        seq: result.state.seq, diagnostics: result.diagnostics,
      })
  }}
/>
```

`scoutEvents` in that example is the host's bus. Connect `subscribe` and `requestResync` to the events you already emit.

`useArcLive(stream, source, onResult?)` returns the diagram, `seq`, focus, and delta when the host draws the view itself:

```tsx
const { diagram, seq, focus, delta } = useArcLive('architecture', source)
```

`applyOps(state, envelope)` is a pure function, so the host can run it on a server. `createArcLiveState(stream)` creates the initial state, at sequence 0. Validate each envelope with `applyOps` before broadcasting it. Send a current `reset` when a viewer joins or reconnects. Send each envelope as it arrived. The host owns authentication, persistence, backpressure, and stream retention.

The local player follows storage events and events in the same document. Editor previews go out at once over `BroadcastChannel`. The durable save still waits one second. The player has no refresh interval.

## Apply an envelope from the CLI

The reference relay listens on loopback. Start it in one shell. In another, send a whole envelope or an ops array. For an ops array, `arc apply` reads the current sequence, builds the envelope, and sends it.

```bash
npx arc live serve architecture --port 5190 --origin http://localhost:5188
npx arc apply architecture --ops commands.json --port 5190
```

`commands.json` can hold the ops from the second envelope above:

```json
[
  { "op": "node.add", "id": "api", "data": { "name": "API", "kind": "service" } },
  { "op": "node.add", "id": "db", "data": { "name": "Database", "kind": "database" } }
]
```

`cat commands.json | npx arc apply architecture --ops -` reads the same payload from stdin. Two writers can conflict. When the relay rejects a write, read the state and retry. Do not overwrite the other writer.

The relay holds one stream in memory:

| Route | Behavior |
| --- | --- |
| `GET /events` | SSE envelopes. The relay sends a reset when the connection opens. |
| `GET /socket` | WebSocket envelopes in both directions. An apply response contains `seq`, the diagnostics, and an optional `resync`. Send `{"type":"resync"}` for a reset. |
| `POST /apply` | The same envelope over HTTP. The response contains `seq`, the diagnostics, and an optional `resync`. An invalid envelope returns HTTP 409. |
| `GET /state` | The current state. |

The library exports `arcSSESource(url)`, `arcWebSocketSource(url, onDiagnostic?)`, and `arcApplyRPC(url, envelope)`. The SSE source reconnects through `EventSource`. A sequence gap makes it reconnect so it can receive a reset. The WebSocket source can request a resync. Its host owns the reconnect policy.

The relay refuses browser requests from other origins unless `--origin` names them. Each request is limited to 1 MiB. The relay keeps no durable replay log.

`@hudsonkit/arc-mcp@0.15.0` exposes that relay as three tools: `arc_live_serve({stream, port})`, `arc_live_apply({envelope})`, and `arc_live_read({})`. One MCP server process shares one relay. Those tools send small operations. The studio tools in the next section publish a whole diagram.

## Open a saved architecture review

Publishing a whole diagram into the Arc studio is a different call from a command envelope. `open_live_diagram({ diagram, title?, agent? })` opens an idle view and returns its URL. Call `begin_live_diagram_work` before the edit, `update_live_diagram` with each complete revision, and `finish_live_diagram_work` when that piece of work ends. Keep node ids stable so the canvas can follow each move. `end_live_diagram` marks the session complete.

Saved reviews keep a review after that process stops. Open one with a baseline diagram, a title, and the question the review will answer:

```ts
open_architecture_review({ diagram, title, question, repository, agent })
```

`repository` is `{ name, url?, revision? }`. `agent` is `{ harness, name? }`. Those labels are declared by the caller. They do not replace the MCP client's name, version, or connection id, and Arc does not treat them as a verified identity.

`update_architecture_review` records `summary`, `findings`, `decisions`, and `openQuestions`. Omitted fields stay as they were. A supplied array replaces the previous list. A finding is `{ id, title, detail, severity, nodeIds?, sources }`, with severity `info`, `low`, `medium`, or `high`. A source is `{ path, line?, revision?, url? }`. The studio shows those references beside the canvas. A path on a finding is the author's citation. Arc does not establish that the cited code does what the finding says.

The open call returns `sessionId`, a read-only viewer URL, and a private `resumeToken`. Keep the token private. After the owning connection drops, `resume_architecture_review({ sessionId, resumeToken, agent? })` continues the review on a new connection. A live owner stays in place. A completed review stays read-only. `revoke_architecture_review_share({ sessionId })` invalidates the old viewer link and returns a new one. It leaves the resume token alone.

Reviews are written to `ARC_REVIEW_DIR` before each revision is published. The default directory is `~/.arc/reviews`. Ordinary live views stay in memory. A completed live view expires one hour after completion, and stopping the MCP process discards unfinished in-memory sessions. A saved review remains available after a restart when that directory and the server address stay put.

Run the studio and the MCP server on a host you control. One agent connection owns a review. Viewers use the read-only link. The [MCP server guide](https://hudsonkit.com/arc/docs/agent-mcp) and the [package readme](https://github.com/hudsonkit/arc/blob/main/packages/mcp/README.md) list the arguments. [Host embedding](https://github.com/hudsonkit/arc/pull/47) and [push diagram streams](https://github.com/hudsonkit/arc/pull/49) are the changes behind the embed and the command stream.

## Run the relay on loopback

`arc live serve` is a loopback development reference. It holds one stream in memory, checks the caller's origin, and does not authenticate the caller. Use it while you build the host. For a shared stream, keep the authoritative state in the host, accept envelopes with `applyOps`, and broadcast only the envelopes the host accepted.

Saved reviews persist on the machine that runs MCP. Arc does not host that service.
