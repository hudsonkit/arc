Review an architecture diagram in two passes: check what changed in the document, then check whether the code supports the new picture. Arc's structural diff helps with the first pass. Stable node and connector IDs let it distinguish additions, removals, movement, and changed fields. The second pass still needs a person or agent to inspect the implementation.

A queue added to a diagram can mean a substantial change to how work moves through a system. Moving that queue to the left can mean nothing more than making room for a label. A useful review makes those changes easy to tell apart.

## Compare one proposed change

This illustrative example starts with a client calling an API that writes to storage. The proposed version adds a queue and a worker. The API's description changes to mention background work. The existing components stay in place.

![Adding a queue and worker](assets/diagram-review-comparison.png)

Illustrative before-and-after comparison: two nodes and two connectors are added, the API description changes, and existing nodes keep their positions. This image compares the drawings; the React example below adds the delta overlay.

Use Node.js 22 or later. Save the following script as `build-review.mjs` in a working directory for the example. It writes `before.arc.json` and `after.arc.json` in that directory:

```js
import { writeFileSync } from 'node:fs'

const before = {
  layout: { width: 900, height: 430 },
  nodes: {
    client: { x: 40, y: 60, size: 'm' },
    api: { x: 350, y: 60, size: 'm' },
    store: { x: 660, y: 60, size: 'm' },
  },
  nodeData: {
    client: { name: 'Client', kind: 'frontend' },
    api: {
      name: 'API', kind: 'backend',
      description: 'Write request',
    },
    store: { name: 'Storage', kind: 'database' },
  },
  connectors: [
    { id: 'request', from: 'client', to: 'api', fromAnchor: 'right', toAnchor: 'left', style: 'request' },
    { id: 'write', from: 'api', to: 'store', fromAnchor: 'right', toAnchor: 'left', style: 'request' },
  ],
  connectorStyles: {
    request: { color: 'blue', strokeWidth: 2 },
  },
}

const after = structuredClone(before)
after.nodes.queue = { x: 350, y: 290, size: 'm' }
after.nodes.worker = { x: 660, y: 290, size: 'm' }
after.nodeData.api.description =
  'Write and enqueue'
after.nodeData.queue = { name: 'Queue', kind: 'queue' }
after.nodeData.worker = { name: 'Worker', kind: 'service' }
after.connectors.push(
  { id: 'enqueue', from: 'api', to: 'queue', fromAnchor: 'bottom', toAnchor: 'top', style: 'background' },
  { id: 'consume', from: 'queue', to: 'worker', fromAnchor: 'right', toAnchor: 'left', style: 'background' },
)
after.connectorStyles.background = {
  color: 'zinc', strokeWidth: 1.5, dashed: true,
}

for (const [name, diagram] of Object.entries({ before, after })) {
  writeFileSync(`${name}.arc.json`, JSON.stringify(diagram, null, 2) + '\n')
}
```

Run the script, then install Arc:

```bash
node build-review.mjs
npm install @hudsonkit/arc@0.14.0
```

The example makes no claim about response timing, atomic writes, retries, or delivery guarantees. Those are questions for the implementation review.

## Validate both versions

Run the checks before comparing the documents:

```bash
npx arc check before.arc.json
npx arc check after.arc.json
```

Both should return `ok — no diagnostics`. If a check reports a missing node or another error, repair the document and run it again. A malformed diagram should not become the basis for discussing an architectural change.

Print the summary:

```bash
npx arc diff before.arc.json after.arc.json --summary
```

The result is:

```text
nodes: +2 -0 moved:0 changed:1
connectors: +2 -0 changed:0
connectorStyles: +1 -0 changed:0
groups: +0 -0 changed:0
layout: unchanged
```

Two nodes and two connectors were added. One existing node changed because the API's description changed. No node moved. That gives the reviewer a compact account of the edit before they inspect the full drawing.

Without `--summary`, the command returns a JSON delta with the affected IDs and fields:

```bash
npx arc diff before.arc.json after.arc.json
```

## Put the change beside the drawing

In a React application with JSON imports enabled, this component overlays the delta on the proposed diagram:

```tsx
import {
  ArcDiagram, diffDiagram, type ArcDiagramData,
} from '@hudsonkit/arc'
import '@hudsonkit/arc/arc.css'
import before from './before.arc.json'
import after from './after.arc.json'

export function DiagramReview() {
  const base = before as ArcDiagramData
  const head = after as ArcDiagramData
  return (
    <ArcDiagram
      data={head}
      delta={diffDiagram(base, head)}
      theme="engineering"
      mode="light"
    />
  )
}
```

This delta marks the added nodes and connectors and the changed API description. Other deltas can show removed elements as ghosts and trace moved nodes from their old positions. The overlay currently works in the 2D view. See the [diagram diff reference](https://hudsonkit.com/arc/docs/diff) for the matching rules and rendering behavior.

Preserve IDs for components that remain the same. Renaming the visible label is different from replacing its ID. Give parallel connectors distinct IDs too; endpoint-only matching can be ambiguous when multiple edges connect the same nodes.

## Review the claim behind each new edge

For a real pull request, identify the base revision and proposed revision before exporting their diagram files. Use the same comparison base as the code review. Otherwise, an unrelated change on another branch can appear to belong to the proposal.

Then inspect the implementation behind the additions. In this example, find where the API enqueues work and where the worker consumes it. Check what happens if enqueueing fails. Determine whether the worker can receive the same job twice, and which code deals with that possibility. Add those details to the explanation when they affect the decision being reviewed.

Arc node data can carry a `source` reference with a repository-relative path, line range, and commit. Use references to record inspected evidence. A path attached to a node is an author's citation; Arc does not establish that the cited function performs the behavior described.

For the pull request, include the editable source, the rendered change, and a short note separating the proposed behavior from open questions.

Start with the example pair, run the two checks and the diff, then adapt the procedure to one diagram in your repository. The [Arc MCP tools](https://hudsonkit.com/arc/mcp) expose validation and structural diffs to agents working through the same review.
