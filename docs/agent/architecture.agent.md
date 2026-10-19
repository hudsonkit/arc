# Architecture - Agent Context

## Project Structure

```
src/
├── main.tsx                        # React entry
├── App.tsx                         # Routes: /, /editor, /player, /showcase, /docs
├── apps/
│   ├── arc-editor/                 # Hudson shell — canonical editor UX
│   │   ├── createArcApp.tsx        # HudsonApp factory
│   │   ├── ArcEditorContent.tsx    # Content slot (markup pane + canvas)
│   │   └── ArcEditorInspector.tsx  # Right rail
│   └── arc-showcase/               # Player harness (/showcase)
├── components/
│   ├── ArcDiagram.tsx              # 2D player (exported as @hudsonkit/arc)
│   ├── editor/
│   │   ├── DiagramEditor.tsx       # Editor layout (canvas host)
│   │   ├── DiagramCanvas.tsx       # Pan/zoom, 2D + isometric modes
│   │   ├── EditorProvider.tsx      # Context + action helpers
│   │   ├── editorReducer.ts        # All state transitions
│   │   ├── EditableNode.tsx        # Draggable nodes
│   │   ├── ConnectorLayer.tsx      # SVG connectors
│   │   ├── FloatingToolbar.tsx     # Bottom toolbar dock
│   │   └── MiniMap.tsx, ZoomControls.tsx, ...
│   ├── chrome/                     # Shell: SettingsRail, MarkupPanel, SettingsPanel
│   ├── properties/                 # Inspector forms (Node, Connector, Group, ...)
│   └── diagrams/*.diagram.ts       # Canonical examples
├── types/
│   ├── diagram.ts                  # Public ArcDiagramData schema
│   └── editor.ts                   # Editor-only types (EmbedConfig, ViewMode, ...)
├── utils/                          # themes, constants, validation, export, autoLayout
└── iso/                            # Isometric renderer

packages/
├── viewer/                         # @hudsonkit/arc-viewer
└── iso/                            # @hudsonkit/arc-iso
```

## Editor Entry Flow

```
/editor/:sessionId
  → App.tsx mounts Hudson with createArcEditorApp()
    → ArcEditorProvider (session, status, file ops)
      → ArcEditorContent
        → DiagramEditor (EditorProvider + DiagramCanvas)
```

**Hudson** (`hudsonkit`) provides the app shell: nav, status bar, inspector slot,
commands. Canvas logic stays in `src/components/editor/`. Chrome tokens live in
`src/editor-shell.css` + `src/chrome-themes.css`.

## State Shape

```typescript
{
  diagram: {
    layout, grid,
    nodes, nodeData, connectors, connectorStyles,
    groups, images, exportZone,
  },
  editor: {
    selectedNodeIds: string[],
    selectedConnectorIndex, selectedGroupId, selectedImageId,
    mode: 'select' | 'addNode' | 'addConnector' | 'addGroup' | 'pan',
    pendingConnector, pendingGroup,
    isDragging, dragOffset, dragNodeOffsets,
    template, zoom,
    viewMode: '2d' | 'isometric',
    isoStyle: 'solid' | 'blueprint' | 'cyanotype',
    themeId, colorMode,
  },
  meta: { filename, isDirty, lastSaved, diagramMeta },
  history: { past, future }   // max 50
}
```

## Data Flow

```
User Action → dispatch({ type, ... }) → editorReducer → new state → Context → re-render
```

Reducer action reference: `docs/agent/editor-actions.agent.md`

## Key Files to Modify

| Task | File(s) |
|------|---------|
| Add icon | `src/utils/iconRegistry.ts` |
| Node sizes | `src/utils/constants.ts` → `NODE_SIZES` |
| Diagram schema | `src/types/diagram.ts` |
| Validate external JSON | `src/utils/diagramValidation.ts` |
| Drag behavior | `src/components/editor/EditableNode.tsx` |
| Connector paths | `src/components/editor/ConnectorLayer.tsx` |
| Toolbar / modes | `src/components/editor/FloatingToolbar.tsx` |
| Shell chrome | `src/apps/arc-editor/`, `src/components/chrome/` |
| File save/open | `src/utils/fileOperations.ts` |
| Markup pane | `src/components/chrome/MarkupPanel.tsx` |
| Themes | `src/utils/themes.ts` |
| Chrome skins | `src/utils/chromeThemes.ts`, `src/chrome-themes.css` |

## Editor Modes

| Mode | Behavior |
|------|----------|
| `select` | Click to select, drag to move |
| `addNode` | Click canvas to place node (default size `m`) |
| `addConnector` | Click source anchor, then target anchor |
| `addGroup` | Draw a group frame |
| `pan` | Pan the canvas |

## Commands

```bash
bun run dev       # Dev server with HMR (port 5188)
bun run build     # Production build
bun run lint      # ESLint
bun run typecheck # tsc --noEmit
```

Read `CLAUDE.md` before changing canvas overlays, markup pane sync, or chrome tokens.
