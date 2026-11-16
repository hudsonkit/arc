---
title: The agentic loop
description: The agents that change the code keep the diagrams current. Arc checks each diagram, and review shows each change as a diff.
order: 40
---

# The agentic loop

Classic declarative diagramming has a write path and no read-back path: a
human authors a DSL file, it renders, it commits, it rots. The failure was
never expressiveness — it is that nothing ever checks the picture against
the system.

The premise here is different: **agents are the ones building and changing
the codebase, so they are the ones who know when a diagram went stale.** The
diagram stops being an authored artifact and becomes a maintained index —
the agent that touches the code updates the picture in the same commit, the
same way it is already nudged to update docs.

Two layers, deliberately asymmetric:

- **In-loop nudge** (primary): while an agent works, the repo can answer
  "does this change affect a diagram?" cheaply. The agent updates the
  `*.arc.json` in the same commit it changes the code.
- **Drift net** (secondary): for edits that bypassed the loop — human
  commits, other tools — CI notices the diagram didn't move and asks.
  A comment, never a gate.

## A — An agent-compilable format

The diagram is typed JSON, not a bespoke DSL, because the author is a model:
JSON is what agents emit natively, and the format already carries a real
diagnostics channel rather than parser errors.

The write loop is compile-shaped:

```
edit *.arc.json → arc check → coded diagnostics + supportedFixes → fix → recheck
```

`validateDiagram` returns `Diagnostic[]` where each carries a `code` and a
list of applicable `Fix` entries (e.g. `semantic/unknown-kind` → `set-kind`),
so "check" is not lint output to parse — it is an instruction list. Over MCP
the same contract is `validate_diagram → { ok, diagnostics }`.

Semantic kinds lower the authoring surface further: `kind: "queue"` supplies
the node's icon and color from `NODE_KIND_DEFAULTS`, so an agent describes
*what the box is* and the theme decides what it looks like.

Already shipped: `arc check`, `validate_diagram` (MCP), `supportedFixes`,
`kind` defaults, `auto_layout` for position-free authoring, closed JSON
Schema (`arc schema`) that rejects invented fields.

## B — A verifiable index into the codebase

A node can cite the code it describes:

```json
{ "nodeData": { "auth": { "name": "Auth", "kind": "service",
  "source": { "path": "src/auth/session.ts", "line": 12, "endLine": 40,
              "commit": "a1b2c3" } } } }
```

`source` refs (`DiagramSource` in `src/types/diagram.ts`, resolved by
`utils/sourceRef.ts`) turn the diagram into a map with citations — into the
repo for humans, into context for the next agent. The `commit` pin means a
ref is a claim stamped against a known tree, so "is this still true?" is a
mechanical question: did that path survive, did the line range move, is the
claim older than the last change to that file.

Already shipped: `source` refs + `sourceUrl`/`sourceLabel`, `diffDiagram`
(structural `DiagramDelta`), `<ArcDiagram delta>` renders the delta as a
first-class view, `arc diff`, `diff_diagram` (MCP).

## The loop

```
agent edits code
  → nudge: "files you touched are claimed by services.arc.json"
  → agent updates the diagram in the same commit
  → arc check passes (diagnostics+fixes drive convergence)
  → PR shows arc diff delta rendered next to the code diff
  → drift net (CI) catches edits that bypassed the loop
```

Each stage exists except the nudge and the net.

## Gap list

| Missing piece | Shape | Why it is the atom |
|---|---|---|
| `watches` | glob list on the diagram or per-node | the minimal claim "this diagram describes these paths" — powers both the nudge and the net |
| `arc impacted <paths...>` | CLI/MCP: changed files → affected diagrams+nodes | the nudge as a query; one tool, three consumers (skill prompt, agent hook, CI) |
| mutation ops | `node/upsert`, `connector/upsert` via MCP or `arc apply --ops` | surgical edits without rewriting the file — less token, fewer corrupt writes |
| skill wiring | `skills/` rule: "before finishing, run `arc impacted` on your changed files" | installs the nudge into the agent session — the "like docs" part |
| `arc drift` | CI-side: watches ∩ PR files, diagram unmoved → sticky comment | the net; silent unless relevant, never blocking |
| `arc scan` | optional v2: `@arc` annotations in code → `source` refs | makes B self-populating; also repairs line-number rot |

`arc impacted` is the one to build first — everything else is a consumer of
that answer. A skill file can nudge agents with it today; `watches` formalizes
what it queries; `drift` reuses it verbatim in CI.

## What this does not do

- **No gates.** The net comments, the nudge prompts — neither blocks a merge.
- **No annotation requirement.** `arc scan` tags are additive; a diagram
  maintained by convention + watches works with zero markup in source.
- **Positions stay human/curator-owned.** Agent edits converge on `nodeData`,
  `connectors`, `source`; geometry changes go through `auto_layout` or are
  left alone — a regenerated layout never fights a tuned one.
