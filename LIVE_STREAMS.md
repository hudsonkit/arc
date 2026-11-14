# Push diagram streams

Arc accepts small, atomic diagram commands through a transport-neutral source.
Scout does not need an Arc server. This additive API needs a 0.15.0 release;
this branch does not change the package version or publish a package.

## Wire contract

An envelope is `{ v: 1, stream, seq, base, ops }`.
Sequences are nonnegative safe integers. A new receiver starts at sequence 0.
Each accepted envelope must have a sequence greater than both the current
sequence and its base. Ordinary commands require base to equal the receiver's
sequence. A single reset operation can repair a sequence gap. Stale sequences
are rejected, including stale resets. Use a new stream ID when restarting a
sequence history.

All operations apply to a private copy. Each operation must leave a valid diagram.
If any operation fails, the entire envelope is rejected. Diagnostics are strings;
the previous state object is returned unchanged. A base mismatch also returns
`resync: true`. Send a single reset with the latest authoritative diagram and
sequence to repair it. Reset replaces data, not the mounted React viewer.

| Operation | Fields |
| --- | --- |
| reset | diagram: ArcDiagramData |
| node.add | id, data: NodeData, at?: NodePosition |
| node.update | id, data?: Partial<NodeData>, at?: Partial<NodePosition> |
| node.remove | id; also removes incident connectors |
| connector.add, group.add, view.add, flow.add | id, data: corresponding Arc entity |
| connector.update, group.update, view.update, flow.update | id, data: partial entity |
| connector.remove, group.remove, view.remove, flow.remove | id |
| style.set | id, data: ConnectorStyle |
| layout.set | data: Partial<DiagramLayout> |
| layout.auto | no fields; uses Arc's auto-layout |
| focus | nodes?, connectors?: FocusConnectorRef[], caption? |

Entity IDs are stable. Add rejects duplicates; update and remove reject missing
entities. Without at, new nodes occupy deterministic grid slots. Node updates
without at retain their positions. Style data must satisfy Arc's validator,
including color and strokeWidth. Add the style before its connectors.
Deleting a node can fail if other authored references would become invalid;
remove those references in earlier operations. Focus is viewer state, not
document data. Clear it with an empty focus operation.

Five-line example, starting with a fresh receiver:

```jsonl
{"v":1,"stream":"architecture","seq":1,"base":0,"ops":[{"op":"reset","diagram":{"layout":{"width":1000,"height":700},"nodes":{},"nodeData":{},"connectors":[],"connectorStyles":{}}}]}
{"v":1,"stream":"architecture","seq":2,"base":1,"ops":[{"op":"node.add","id":"api","data":{"name":"API","kind":"service"}},{"op":"node.add","id":"db","data":{"name":"Database","kind":"database"}}]}
{"v":1,"stream":"architecture","seq":3,"base":2,"ops":[{"op":"node.add","id":"cache","data":{"name":"Cache","kind":"cache"}}]}
{"v":1,"stream":"architecture","seq":4,"base":3,"ops":[{"op":"node.remove","id":"cache"}]}
{"v":1,"stream":"architecture","seq":5,"base":4,"ops":[{"op":"focus","nodes":["api","db"],"caption":"Writes land here"}]}
```

## React embed

Keep the source object stable. Each envelope is processed on a separate animation
frame so bursts do not collapse into a single React batch. Arc retains its
mounted viewer and existing camera state. Entering and leaving parts use Arc's
live motion and diff overlays. Focus temporarily selects a synthetic view and
shows an accessible caption. A host's controlled view resumes when focus clears.

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

`useArcLive(stream, source, onResult?)` exposes diagram, seq, focus and delta.
`applyOps(state, envelope)` is pure and can run on the host server.
Initialize state with `createArcLiveState(stream)`.
Hosts should validate once authoritatively before broadcasting. Subscribers
should receive a current reset when joining or reconnecting. Do not coalesce
command envelopes. Hosts own authentication, persistence, backpressure and
stream retention.

## Reference transports and agent entry points

```sh
arc live serve architecture --port 5190 --origin http://localhost:5188
arc apply architecture --ops commands.json --port 5190
cat commands.json | arc apply architecture --ops -
```

The apply input can be a whole envelope or an ops array. For an ops array the
CLI reads the current sequence, constructs an envelope, and submits it.
Concurrent writers can conflict; a rejected writer must reread and retry
deliberately, not overwrite another writer.

The reference relay is single-stream, in-memory and loopback-only:
- GET /events: SSE envelopes; sends a reset immediately on each connection.
- GET /socket: WebSocket envelopes in both directions. Apply responses contain
  seq, diagnostics and optional resync. Send `{"type":"resync"}` for a reset.
- POST /apply: RPC with the same envelope. Returns seq, diagnostics and optional
  resync; invalid envelopes return HTTP 409.
- GET /state: current state.

Use `arcSSESource(url)`, `arcWebSocketSource(url, onDiagnostic?)` and
`arcApplyRPC(url, envelope)` from the library. SSE reconnects through EventSource;
a sequence gap reconnects for a reset. The WebSocket source supports explicit
resync; its host owns reconnect policy. The relay refuses foreign browser origins
unless explicitly allowed. This is a development reference, not an authenticated
hosted service. Requests are limited to 1 MiB; there is no durable replay log.

MCP tools: `arc_live_serve({stream, port})`,
`arc_live_apply({envelope})`, and `arc_live_read({})`.
They share one command relay per MCP server instance. Existing whole-document
live-review tools remain separate and unchanged.

The local player subscribes to storage events and same-document events.
Editor previews also use BroadcastChannel immediately, independently of the
one-second debounced durable save. There is no player refresh interval.

## Scout integration

1. Upgrade from Arc 0.14.0 to the eventual 0.15.0 release, or build this branch
   locally for integration.
2. Replace Canvas's file-read timer with a stable ArcLiveSource backed by Scout's
   runtime events.
3. Keep authoritative stream state in Scout. Apply agent envelopes with applyOps.
   Broadcast only accepted envelopes and return diagnostics to the agent.
4. Send a current reset when a Canvas viewer subscribes or requests resync.
5. Feed focus commands through the same stream. Persist the final diagram if
   a .arc.json artifact is still needed. The file is not the live event channel.

No terse text parser is included. JSON is the canonical agent interface.
