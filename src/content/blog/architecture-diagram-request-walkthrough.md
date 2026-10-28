A useful architecture walkthrough follows one piece of work through the system. Start with the question the reader needs to answer, select the components involved, and divide the path into named chapters. In Arc, those chapters live in a `views` array alongside the diagram's editable source.

Consider a developer trying to understand what happens when an API accepts work. A map containing a client, API, database, queue, and worker gives them the inventory. They still need to know which relationships belong to storing the request and which belong to background processing. Two views can explain that distinction without maintaining two copies of the architecture.

## Give the walkthrough one job

The example below is illustrative. It shows an API writing to storage and placing work on a queue. A worker consumes that work. It does not specify transaction boundaries, retry behavior, or when the API returns a response.

A caption claiming that the request is durably accepted would need evidence about the write, enqueue operation, and response. The arrows alone cannot establish it. If those details matter to your reader, inspect the implementation and add a separate explanation of that behavior.

For this walkthrough, the question is narrower: **which components participate in storing a request, and which participate in background processing?**

## Keep the two paths visible

Place the client, API, and storage on the upper row. Put the queue and worker below the API. Both paths include the API; the lower row keeps background work separate from the storage path.

![Request and background-work paths](assets/request-walkthrough.png)

Illustrative request path. Solid lines show the storage path; dashed lines show background work. The diagram does not specify response timing or delivery guarantees.

Save this complete example as `request-walkthrough.arc.json`:

```json
{
  "layout": { "width": 900, "height": 430 },
  "nodes": {
    "client": { "x": 40, "y": 60, "size": "m" },
    "api": { "x": 350, "y": 60, "size": "m" },
    "store": { "x": 660, "y": 60, "size": "m" },
    "queue": { "x": 350, "y": 290, "size": "m" },
    "worker": { "x": 660, "y": 290, "size": "m" }
  },
  "nodeData": {
    "client": { "name": "Client", "kind": "frontend" },
    "api": {
      "name": "API", "kind": "backend",
      "description": "Write and enqueue"
    },
    "store": { "name": "Storage", "kind": "database" },
    "queue": { "name": "Queue", "kind": "queue" },
    "worker": { "name": "Worker", "kind": "service" }
  },
  "connectors": [
    { "id": "request", "from": "client", "to": "api", "fromAnchor": "right", "toAnchor": "left", "style": "request" },
    { "id": "write", "from": "api", "to": "store", "fromAnchor": "right", "toAnchor": "left", "style": "request" },
    { "id": "enqueue", "from": "api", "to": "queue", "fromAnchor": "bottom", "toAnchor": "top", "style": "background" },
    { "id": "consume", "from": "queue", "to": "worker", "fromAnchor": "right", "toAnchor": "left", "style": "background" }
  ],
  "connectorStyles": {
    "request": { "color": "blue", "strokeWidth": 2 },
    "background": { "color": "zinc", "strokeWidth": 1.5, "dashed": true }
  },
  "views": [
    {
      "id": "request",
      "title": "Store the request",
      "nodes": ["client", "api", "store"],
      "connectors": [{ "id": "request" }, { "id": "write" }],
      "caption": "The client calls the API, which writes to storage."
    },
    {
      "id": "background",
      "title": "Process background work",
      "nodes": ["api", "queue", "worker"],
      "connectors": [{ "id": "enqueue" }, { "id": "consume" }],
      "caption": "The API enqueues a job for a worker to process."
    }
  ]
}
```

Each node's `kind` supplies its default icon and color. The connector styles distinguish the two paths through both color and line pattern. The layout carries the same distinction, so the explanation remains readable without color.

## Check the source before presenting it

With Node.js 22 or later available, install Arc in your project:

```bash
npm install @hudsonkit/arc@0.14.0
```

Validate the saved file:

```bash
npx arc check request-walkthrough.arc.json
```

For this example, the expected result is `ok — no diagnostics`. If a view refers to a missing node or connector, correct that reference and run the check again. Validation catches document problems; reviewing the implementation is still necessary when the diagram describes a real system.

## Present the chapters in React

In a React application with JSON imports enabled, place the JSON file beside this component:

```tsx
import { ArcDiagram, type ArcDiagramData } from '@hudsonkit/arc'
import '@hudsonkit/arc/arc.css'
import data from './request-walkthrough.arc.json'

export function RequestWalkthrough() {
  return (
    <ArcDiagram
      data={data as ArcDiagramData}
      theme="engineering"
      mode="light"
      showViews
      defaultViewId="request"
    />
  )
}
```

`showViews` adds the chapter controls. `defaultViewId` starts the reader on the request chapter. Each view selects its own nodes and connectors, and Arc frames the selected region. The array order determines the reading order.

Keep view IDs stable when revising the text. An ID such as `background` can remain useful even if its title changes. Give connectors IDs too, especially when several relationships run between the same pair of components. A reference to `enqueue` is more precise than a guess based on its position in the array.

## Check what the reader can explain

Step through both chapters at the width where the diagram will appear. Confirm that the labels remain readable, that each caption describes the highlighted path, and that the background view still shows its connection to the API.

Ask a colleague to explain the two paths without reading the JSON. If they infer response timing or delivery guarantees that the diagram does not establish, revise the caption or add the missing behavior explicitly. When message order becomes the main question, a [sequence diagram](https://hudsonkit.com/arc/docs/mermaid-sequences) can carry that detail more directly.

Open the [Arc editor](https://hudsonkit.com/arc/editor), load this JSON, and replace the illustrative components with one source-verified path. Keep [guided views](https://hudsonkit.com/arc/docs/views) when readers should step through chapters; use [focus stories](https://hudsonkit.com/arc/docs/focus-stories) when they should select a component to explore a path.
