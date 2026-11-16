---
title: Push diagram streams
description: Send small changes to a diagram and watch it update in place.
section: Guides
order: 39
---

# Push diagram streams

Arc 0.15.0 can draw a diagram from a stream of small changes. A host sends
envelopes. Each envelope carries one or more operations, and Arc applies them in
order. The host chooses the transport, so Scout does not need an Arc server.

Arc has two live features:

- Use **push diagram streams** (this document) when an agent edits a diagram in
  small steps and a host page shows each step.
- Use the **live architecture** tools in the MCP server (`open_live_diagram`
  and the related tools) when an agent publishes whole diagram revisions to a
  view in the Arc studio.

## Wire contract

An envelope is `{ v: 1, stream, seq, base, ops }`. `ops` is the list of
operations.

- `seq` and `base` are nonnegative safe integers.
- New stream state starts at sequence 0.
- `applyOps` accepts an envelope only when its `seq` is greater than both the
  current sequence and its `base`.
- In an ordinary envelope, `base` must equal the current sequence.
- An envelope with a single `reset` operation can repair a sequence gap.
- `applyOps` rejects stale sequences, including stale resets.
- To restart the sequence history, use a new stream ID.

`applyOps` applies the operations to a private copy of the diagram. Each
operation must leave a valid diagram. If one operation fails, `applyOps`
rejects the whole envelope. It returns the previous state object unchanged and
lists the diagnostics as strings. If `base` does not match, the result also has
`resync: true`. To repair the stream, send an envelope with a single `reset`
operation that holds the latest authoritative diagram and sequence. A reset
replaces the diagram data. It does not remount the React viewer.

| Operation | Fields |
| --- | --- |
| `reset` | `diagram: ArcDiagramData` |
| `node.add` | `id`, `data: NodeData`, `at?: NodePosition` |
| `node.update` | `id`, `data?: Partial<NodeData>`, `at?: Partial<NodePosition>` |
| `node.remove` | `id`. Also removes the node's connectors. |
| `connector.add`, `group.add`, `view.add`, `flow.add` | `id`, `data`: the matching Arc entity |
| `connector.update`, `group.update`, `view.update`, `flow.update` | `id`, `data`: a partial entity |
| `connector.remove`, `group.remove`, `view.remove`, `flow.remove` | `id` |
| `style.set` | `id`, `data: ConnectorStyle` |
| `layout.set` | `data: Partial<DiagramLayout>` |
| `layout.auto` | No fields. Uses Arc's auto-layout. |
| `focus` | `nodes?`, `connectors?: FocusConnectorRef[]`, `caption?` |

Entity IDs are stable.

- An `add` operation rejects a duplicate ID.
- An `update` or `remove` operation rejects a missing entity.
- A new node without `at` takes the next deterministic grid slot.
- A node update without `at` keeps the node's position.
- Style data must pass Arc's validator, including `color` and `strokeWidth`.
  Add a style before the connectors that use it.
- Removing a node can fail if other references to it would become invalid.
  Remove those references in earlier operations.
- Focus is viewer state, not diagram data. To clear it, send an empty `focus`
  operation.

This example sends five envelopes to new stream state:

```json
{"v":1,"stream":"architecture","seq":1,"base":0,"ops":[{"op":"reset","diagram":{"layout":{"width":1000,"height":700},"nodes":{},"nodeData":{},"connectors":[],"connectorStyles":{}}}]}
{"v":1,"stream":"architecture","seq":2,"base":1,"ops":[{"op":"node.add","id":"api","data":{"name":"API","kind":"service"}},{"op":"node.add","id":"db","data":{"name":"Database","kind":"database"}}]}
{"v":1,"stream":"architecture","seq":3,"base":2,"ops":[{"op":"node.add","id":"cache","data":{"name":"Cache","kind":"cache"}}]}
{"v":1,"stream":"architecture","seq":4,"base":3,"ops":[{"op":"node.remove","id":"cache"}]}
{"v":1,"stream":"architecture","seq":5,"base":4,"ops":[{"op":"focus","nodes":["api","db"],"caption":"Writes land here"}]}
```

## React embed

Keep the source object stable across renders. Arc processes each envelope on
its own animation frame, so a burst of envelopes does not collapse into one
React batch. Arc keeps its mounted viewer and the current camera. Parts that
enter or leave use Arc's live motion and diff overlays. A `focus` operation
selects a temporary view and shows an accessible caption. When focus clears,
the host's controlled view comes back.

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

- `useArcLive(stream, source, onResult?)` returns the diagram, `seq`, focus and
  delta.
- `applyOps(state, envelope)` is a pure function, so it can run on the host's
  server.
- `createArcLiveState(stream)` creates the initial state.

The host should:

- validate each envelope once, with `applyOps`, before it broadcasts the
  envelope;
- send a current `reset` to each viewer when the viewer joins or reconnects;
- send each envelope as it is, without merging envelopes.

The host owns authentication, persistence, backpressure and stream retention.

## Reference transports and agent entry points

```sh
arc live serve architecture --port 5190 --origin http://localhost:5188
arc apply architecture --ops commands.json --port 5190
cat commands.json | arc apply architecture --ops -
```

`arc apply` takes a whole envelope or an `ops` array. For an `ops` array, the
CLI reads the current sequence, builds the envelope and sends it. Two writers
can conflict. If the relay rejects a write, read the state again and retry. Do
not overwrite the other writer.

The reference relay holds one stream in memory and listens only on loopback:

- `GET /events`: SSE envelopes. The relay sends a reset when each connection
  opens.
- `GET /socket`: WebSocket envelopes in both directions. An apply response
  contains `seq`, the diagnostics and an optional `resync`. Send
  `{"type":"resync"}` to get a reset.
- `POST /apply`: RPC with the same envelope. The response contains `seq`, the
  diagnostics and an optional `resync`. An invalid envelope returns HTTP 409.
- `GET /state`: the current state.

The library exports `arcSSESource(url)`, `arcWebSocketSource(url,
onDiagnostic?)` and `arcApplyRPC(url, envelope)`.

- The SSE source reconnects through `EventSource`. A sequence gap makes it
  reconnect for a reset.
- The WebSocket source can request a resync. Its host owns the reconnect
  policy.

The relay refuses browser requests from other origins unless `--origin` allows
them. It is a development reference, not an authenticated hosted service. It
limits each request to 1 MiB and keeps no durable replay log.

The MCP server has three stream tools: `arc_live_serve({stream, port})`,
`arc_live_apply({envelope})` and `arc_live_read({})`. They share one relay for
each MCP server instance. The live architecture tools (`open_live_diagram` and
the related tools) are separate and did not change.

The local player listens for storage events and same-document events. Editor
previews also go out at once over `BroadcastChannel`. The durable save still
waits one second. The player has no refresh interval.

## Scout integration

1. Upgrade Scout's web app to Arc 0.15.0. If npm does not have 0.15.0 yet,
   build Arc from `main`.
2. Replace the Canvas file-read timer with a stable `ArcLiveSource` that
   Scout's runtime events feed.
3. Keep the authoritative stream state in Scout. Apply agent envelopes with
   `applyOps`.
4. Broadcast only accepted envelopes. Return the diagnostics to the agent.
5. When a Canvas viewer subscribes or requests a resync, send a current
   `reset`.
6. Send `focus` operations through the same stream.
7. If Scout still needs a `.arc.json` file, save the final diagram to it. The
   file is not the live channel.
