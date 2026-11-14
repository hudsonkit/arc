---
name: arc-live-collaboration
description: Work through an editable Arc diagram with a person in an MCP Apps widget or Scout Canvas. Use when the person should inspect or change the same diagram while the agent continues from their edits.
---

# Arc live collaboration

Use one shared Arc document, not a sequence of rendered snapshots. Confirm that
the connected Arc MCP server exposes `show_diagram`, `update_diagram`, and
`read_diagram` before starting.

1. Build and validate a small `ArcDiagramData` document. Keep node and connector
   IDs stable.
2. Call `show_diagram` once. Retain its `documentId` and `rev`; the returned
   widget is the shared working surface.
3. For an agent change, call `update_diagram` with the complete next document and
   the last observed revision as `baseRev`. Do not call `show_diagram` again.
4. When asking the person to inspect or edit, stop changing the diagram. After
   they say they are done—or before reasoning from their changes—call
   `read_diagram`. Treat its document and revision as authoritative.
5. If `update_diagram` reports a revision conflict, read the current document,
   reconcile the person's edits with the intended change, and retry from the
   current revision. Never overwrite a conflict blindly.

The widget saves a person's edits through the same MCP update tool. Scout Canvas
may instead own a `.arc.json` file and deliver the same snapshots through its
embed bridge; the workflow and revision rule do not change. Widget state is only
for selection and draft UI. The Arc document belongs in the MCP document store
or the Canvas-owned file, and must also be saved as a normal artifact when the
session needs to outlive its host.
