---
title: Private architecture reviews
description: Run the Hudson Kit Arc studio and authenticated MCP on one private host
---

# Private architecture reviews

Run the built Hudson Kit Arc studio and MCP server on one loopback address. An
agent writes through authenticated MCP. Reviewers open a read-only capability
link in the studio. This setup supports one owning agent connection per review
and multiple viewers. It does not publish a public service.

## Build and start

Run these commands from the Arc repository with Bun installed. The HTTP bin
requires Bun; the existing `arc-mcp` stdio bin continues to use Node.

1. Build the studio for the root path and build both MCP bins:

   ```sh
   ARC_BASE=/ bun run build:site
   bun run build:mcp
   ```

2. Generate an agent credential in the shell that will start the server:

   ```sh
   export ARC_MCP_TOKEN="$(openssl rand -hex 32)"
   ```

   Keep this value in the agent's secret or environment configuration. Do not
   put it in a viewer link, checked-in configuration, or browser code.

3. Start the private preview:

   ```sh
   ARC_MCP_HOST=127.0.0.1 \
   ARC_MCP_PORT=5190 \
   ARC_MCP_PUBLIC_URL=http://127.0.0.1:5190 \
   ARC_EDITOR_URL=http://127.0.0.1:5190 \
   ARC_STUDIO_DIR="$PWD/dist" \
   ARC_REVIEW_DIR="$HOME/.arc/reviews" \
   bun packages/mcp/dist/arc-mcp-http.mjs
   ```

   The server prints its MCP endpoint and studio base. It does not print the
   bearer token. After a package containing the new bin is installed, the same
   environment can run `arc-mcp-http` directly.

4. Verify the running service from another shell:

   ```sh
   curl --fail http://127.0.0.1:5190/health
   curl -I http://127.0.0.1:5190/live
   curl -i http://127.0.0.1:5190/mcp
   ```

   Health returns `ok: true`. The studio route returns HTML. The MCP request
   without an agent credential returns `401` with a Bearer challenge.

`ARC_STUDIO_DIR` must point to the production `dist` directory. The server
rejects a source checkout or a build whose asset base does not match the studio
URL. It serves built scripts, styles, media, `version.json`, and known studio
routes. Source files, source maps, arbitrary JSON, dotfiles, and files outside
the build directory are unavailable.

## Connect the agent

Use a client that supports Streamable HTTP MCP. Configure its endpoint as
`http://127.0.0.1:5190/mcp` and its `Authorization` header as
`Bearer <the ARC_MCP_TOKEN value>`. Use the client's secret configuration for
the header. The server does not accept a token query parameter.

For example, the MCP TypeScript SDK accepts the credential in `requestInit`:

```ts
const transport = new StreamableHTTPClientTransport(
  new URL('http://127.0.0.1:5190/mcp'),
  { requestInit: { headers: { Authorization: `Bearer ${process.env.ARC_MCP_TOKEN}` } } },
)
await client.connect(transport)
```

The MCP session ID identifies an initialized connection. It does not replace
the bearer token. Every MCP request, including reconnects and session deletion,
requires the token when `ARC_MCP_TOKEN` is set.

Before sending work, inspect the connected tool list for the review tools.
Call `open_architecture_review` with a baseline diagram, title, and review
question. Add repository and revision metadata when available. Publish findings,
source references, decisions, and unanswered questions through
`update_architecture_review`. Use `end_live_diagram` when the review is complete.
The viewer's **Save review** action downloads the baseline, latest snapshot,
and revision history as a shareable artifact. The same artifact is available
from `GET /live/:id/review` with the viewer's read capability.

Keep the returned `resumeToken` private. After the owning connection disconnects
or the server restarts, `resume_architecture_review` can transfer an unfinished
review to a new authenticated MCP connection that presents that token. The
viewer capability cannot resume or write. Completed reviews remain read-only.
To revoke a shared viewer link, the owning connection can call
`revoke_architecture_review_share`. The call closes current viewers and returns
a replacement link. It does not replace the private resume token.

Use the returned viewer URL exactly, including its fragment. The fragment
contains the read capability used by the live event stream and review artifact.
The viewer needs that capability, not the agent credential. Anyone who receives
the complete viewer URL can read that review while its capability remains valid.

Declare work before publishing a result: call `begin_live_diagram_work`, publish
the validated diagram through `update_live_diagram`, and call
`finish_live_diagram_work` in the agent's cleanup path. This makes working dots
represent work in progress instead of continuing to animate after the result.
See [the MCP guide](agent/mcp.agent.md) for tool arguments and ownership rules.

## View from another machine

Keep the server bound to loopback. On the other machine, open an SSH tunnel to
the machine running Arc:

```sh
ssh -N -L 127.0.0.1:5190:127.0.0.1:5190 your-private-host
```

Open the complete viewer URL in that machine's browser. The local port and
hostname match the advertised origin, so the link and event stream use the
tunnel without rewriting the capability. An agent on the other machine can
use the same tunnel and MCP endpoint if its client has the bearer token.

If port `5190` is occupied on either machine, select one unused port and use it
in the server configuration and both sides of the tunnel. Create a new review
after changing the advertised origin. Do not change only the visible viewer
URL while leaving its fragment pointed at the previous stream address.

### Remote author with the credential kept on the Arc host

If the Arc host can SSH to the author's machine, use the JSONL bridge. The
author does not need reverse SSH access or a copy of `ARC_MCP_TOKEN`. The Arc
host needs Bun and Python 3. The author's machine needs Python 3 and an existing
trusted SSH login. This transport opens a private Unix socket, not a TCP port.

1. On the Arc host, start the bridge from the Arc repository. This example uses
   an existing `arts-mini` SSH alias and a credential already stored under
   `ARC_MCP_TOKEN` in the local `secret` CLI:

   ```sh
   ARC_MCP_URL=http://127.0.0.1:5190/mcp \
     secret run ARC_MCP_TOKEN -- bun scripts/review.bridge.ts --ssh arts-mini
   ```

   The bridge prints a `bridge-ready` JSON record with `connectCommand`. Keep
   the process running. It creates a unique remote `/tmp/arc-review-*` directory
   with mode `0700`, a socket with mode `0600`, and a Python connector with mode
   `0600`. It removes `ARC_MCP_TOKEN` from the SSH process environment. SSH agent,
   X11, and configured port forwarding are disabled for this connection.

2. On the author's machine, run the exact `connectCommand` from that record.
   The command has this form; the generated paths differ for each bridge:

   ```sh
   python3 -u '/tmp/arc-review-EXAMPLE/connect.py' connect '/tmp/arc-review-EXAMPLE/author.sock'
   ```

   Keep this one process open for the whole review. The socket accepts one
   connection and immediately removes its listening path. After the local MCP
   client initializes, the connector returns `{"type":"ready"}`.

   An agent exec tool must preserve stdin. Do not launch the connector with
   stdin disabled or `/dev/null`; it rejects that mode before consuming the
   socket. For a programmatic author, run the connector as a child with
   `subprocess.Popen([...], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
   text=True, bufsize=1)`. Read the ready record, then write and flush each
   command to that same child's stdin. Read each reply from its stdout. Keep
   the child alive through the entire review; do not start another connector
   for each tool call. Pipes also avoid terminal canonical-input limits on
   large diagram JSON. A Python driver supplied by a shell heredoc can use
   these explicit child pipes even though the driver's own stdin ends.

3. Send one JSON object per line through the connector's stdin. Read the reply
   before sending the next command. The bridge uses the same JSONL interface
   as `scripts/review.control.ts`, not the MCP JSON-RPC wire format:

   ```json
   {"id":"open","name":"open_architecture_review","arguments":{"diagram":{},"title":"Repository review","question":"Where are the architectural risks?","agent":{"harness":"Codex","name":"Reviewer"}}}
   ```

   Replace `diagram` with a validated Arc diagram. The reply has the same `id`
   and a `result` containing the tool output. Retain its `sessionId`, `liveUrl`,
   and private `resumeToken`. Use that session for the work, diagram, finding,
   and completion calls described in [the MCP guide](agent/mcp.agent.md).

4. After the final result, send `{"type":"quit"}` or close the connector's
   stdin. The client drains accepted commands, deletes its MCP session, and
   closes. The bridge removes its remote directory and socket. A disconnect
   also closes the author connection; it does not mark an unfinished review
   complete. Do not reconnect to the consumed socket. Start a new bridge and
   use `resume_architecture_review` for an unfinished review.

The bridge logs transport metadata only. Tool replies go directly to the
connector and can contain private review capabilities. Keep those replies in
the authorized author's session. The bridge limits each JSONL frame to 4 MiB,
allows one outstanding tool command, and applies backpressure with bounded
queues. It waits up to 15 minutes for a connection and runs for up to 2 hours.
A stalled command or output write ends after 2 minutes. If a reply is lost,
inspect the saved review before retrying a mutation; the bridge does not retry
commands automatically.

The local client sends an MCP ping each minute while it remains open. This
renews the HTTP author's one-hour inactivity lease. If the client cannot send
DELETE because the network or process fails, the server releases ownership
after that lease expires. A late session request returns `404`; initialize a
new client and resume the saved review. The saved viewer link and history stay
available. Other HTTP clients must send requests or periodic MCP pings to keep
an idle author connection alive.

## Configuration and recovery

| Variable | Behavior |
| --- | --- |
| `ARC_MCP_HOST` | Listen address; defaults to `127.0.0.1`. A nonloopback bind requires `ARC_MCP_TOKEN`. |
| `ARC_MCP_PORT` | Listen port; defaults to `5190`; accepts integers from 1 through 65535. |
| `ARC_MCP_PUBLIC_URL` | Advertised HTTP(S) origin, including the port. Requests with another Host are rejected. No path, query, credentials, or fragment. |
| `ARC_EDITOR_URL` | Studio base. With `ARC_STUDIO_DIR`, defaults to the public origin and must use that same origin. |
| `ARC_MCP_TOKEN` | Agent bearer credential. Optional on loopback, enforced on all MCP requests when set, and required outside loopback. |
| `ARC_STUDIO_DIR` | Absolute production build directory. Omit it to run only the MCP and live endpoints. |
| `ARC_REVIEW_DIR` | Persistent review storage directory; defaults to `~/.arc/reviews`. Set it outside the studio build. Ordinary live diagrams remain memory-only. |
| `ARC_MCP_ALLOWED_ORIGINS` | Optional comma-separated HTTP(S) origins for MCP browser clients. Wildcards, `null`, paths, queries, and fragments are rejected. |

The public and studio origins are allowed by default. Live event and review
endpoints independently validate the review's viewer origin and read capability.
A reverse proxy must preserve the configured Host. A proxy is not needed for
the loopback and SSH-tunnel setup.

For a studio mounted at `/arc/`, build with `ARC_BASE=/arc/` and set
`ARC_EDITOR_URL=http://127.0.0.1:5190/arc`. Keep `ARC_MCP_PUBLIC_URL` at the origin.
The MCP endpoint remains `/mcp`, and read endpoints remain `/live/:id/events`
and `/live/:id/review`. The studio page uses `/arc/live/:id`.

If the server reports a build-base mismatch, rebuild with the matching
`ARC_BASE`. If MCP returns `401`, check the client's bearer header. If a request
returns `403`, check its Host and Origin against the configured URLs. If an MCP
session returns `404`, initialize a new connection. A new connection does not
silently take ownership of another connection's active review.

Keep `ARC_REVIEW_DIR` on storage available to the server and preserve it across
restarts. Stopping the server ends its network streams and MCP connections.
Persisted review records and ordinary in-memory live sessions have different
lifetimes; use the review tools when the result must remain available after a
restart. This preview does not provide an account directory, public discovery,
concurrent writers, or a cloud deployment.
