# Arc Skills

> Pre-built skills for AI coding assistants working with Arc

## Available Skills

### arc-diagrams

Create and refine Arc diagrams and structured illustrations for products,
processes, concepts, and software.

**Location**: `skills/arc-diagrams/SKILL.md`

**Trigger**: When a user asks for a diagram or illustration that explains a
structure, process, mechanism, or relationship with editable source.

**Capabilities**:
- Generate `ArcDiagramData` from natural language descriptions
- Add/remove/modify nodes and connectors
- Apply themes and styling
- Use `autoLayout` to avoid hand-positioning
- Convert between JSON and TypeScript formats
- Choose composition patterns for request paths, boundaries, comparisons, and layered cutaways
- Adapt bundled, editable examples in `skills/arc-diagrams/examples/`
- Render and visually review the result at its intended reading size
- Use the separate tiered isometric format when spatial layers explain the system
- Compose a graphite panel cube when three faces explain aspects of one idea

The skill includes focused authoring references and a bounded render-and-review
loop. Validation checks the source; visual inspection checks readability, routing,
occlusion, and export quality. Both are part of the handoff.

**Context to provide**:
```
Arc diagram format: JSON with layout, nodes, nodeData, connectors, connectorStyles
Canonical schema: src/types/diagram.ts
JSON Schema: schemas/arc-diagram.schema.json (generated, draft-07; closed objects reject invented fields)
Validation: validateDiagram(value) -> coded Diagnostic[] with supportedFixes; MCP validate_diagram -> {ok, diagnostics}
CLI: arc check file.json --json; arc diff base.json head.json; arc render file.json --out diagram.svg --json; arc bench benchmarks/; arc schema
Valid colors: violet, emerald, blue, amber, sky, zinc, rose, orange
Valid sizes: xs, s, m, l  (NOT large/normal/small)
Valid anchors: left, right, top, bottom, topLeft, topRight, bottomLeft, bottomRight
Icons: Lucide icon names as strings (Server, Database, Monitor, Cloud, etc.)
Example: src/components/diagrams/architecture.diagram.ts
```

---

### arc-editor-dev

Develop and debug the Arc editor codebase.

**Trigger**: When working on Arc editor source code

**Context to provide**:
```
Read CLAUDE.md first (repo root).

Arc Editor Structure:
- Routes: src/App.tsx
- Shell: src/apps/arc-editor/ (Hudson wrapper)
- Canvas: src/components/editor/ (DiagramCanvas, editorReducer.ts)
- State: EditorProvider.tsx + editorReducer.ts (useReducer)
- Schema: src/types/diagram.ts
- Validation: src/utils/diagramValidation.ts
- Icons: src/utils/iconRegistry.ts
- Sizes: src/utils/constants.ts (NODE_SIZES: xs/s/m/l)

Commands: bun run dev | bun run build | bun run lint | bun run typecheck
Stack: React 19, Vite 7, TailwindCSS 4, Hudson shell, Lucide icons

Reducer actions: docs/agent/editor-actions.agent.md
Visual verification: docs/agent/verification.agent.md
```

---

### arc-export

Export Arc diagrams to various formats.

**Trigger**: When user wants to export or integrate Arc diagrams

**Capabilities**:
- Export to TypeScript with proper types
- Generate React component code
- Render ASCII via `renderAscii()` or `bin/arc-ascii.mjs`
- Render MCP SVG/PNG via `render_svg` and `render_png` (PNG needs Chrome/Chromium or `ARC_CHROME`; `flowTime` samples flow animations)
- Render GIF/MP4 flow animations via `render_animation` (Chrome/Chromium plus ffmpeg)
- Emit React component, iframe embed, or standalone HTML via `render_html`
- Prepare diagrams for documentation sites

**Example output** (TypeScript):
```typescript
import type { ArcDiagramData } from '@hudsonkit/arc'

export const systemArchitecture: ArcDiagramData = {
  layout: { width: 700, height: 400 },
  nodes: { /* x, y, size: 'm' */ },
  nodeData: { /* name, kind: 'backend' — or explicit icon/color overrides */ },
  connectors: [ /* ... */ ],
  connectorStyles: { /* ... */ }
}
```

---

## Installing Skills

Install Arc's diagram skill with the open Skills CLI:

```bash
npx skills add hudsonkit/arc --skill arc-diagrams
```

The installer detects supported coding agents and places the skill in their
expected project directories.

### Manual setup

Point agents at:
- `CLAUDE.md` — full contributor context
- `docs/llm.txt` — dense briefing
- `skills/arc-diagrams/SKILL.md` — diagram generation

### Generic LLM

Copy `docs/llm.txt` or fetch `/llms.txt` from a running dev server.

---

## Prompt Templates

See `docs/prompts/`:
- `create-diagram.md` — generate from description
- `add-node.md` — modify existing diagram
- `export-diagram.md` — export workflows
- `debug-editor.md` — editor debugging
- `modify-styling.md` — themes and styling

---

## MCP

Available via the `arc-mcp` bin on `@hudsonkit/arc-mcp`. See `docs/agent/mcp.agent.md`.
