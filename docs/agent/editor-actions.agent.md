# Editor Actions — Agent Context

All editor state changes go through `editorReducer` in
`src/components/editor/editorReducer.ts`. Dispatch via `EditorProvider` context or
the `actions` helpers on `useEditor()`.

History (`undo`/`redo`) is pushed by `saveToHistory()` on diagram mutations.
Cap: 50 past states.

## Node Operations

| Action | Payload | Effect |
|--------|---------|--------|
| `node/add` | `{ position, nodeData? }` | New node at position, default size `m` |
| `node/remove` | `{ nodeId }` | Remove node + its nodeData, prune connectors |
| `node/move` | `{ nodeId, position }` | Move one node |
| `nodes/move` | `{ deltas: Record<id, {x,y}> }` | Multi-node drag |
| `node/update` | `{ nodeId, updates }` | Merge into nodeData; `undefined` value removes key |
| `node/resize` | `{ nodeId, size }` | Set size (`xs`/`s`/`m`/`l`) |
| `node/updatePosition` | `{ nodeId, x, y, width?, height? }` | Position + optional custom dimensions |

## Connector Operations

| Action | Payload | Effect |
|--------|---------|--------|
| `connector/add` | `{ connector }` | Add edge |
| `connector/remove` | `{ index }` | Remove by array index |
| `connector/update` | `{ index, updates }` | Merge connector fields |
| `connectorStyle/update` | `{ style, updates }` | Merge style definition |
| `connectorStyle/add` | `{ style, definition }` | New named style |
| `connectorStyle/delete` | `{ style }` | Remove style key |

## Groups & Images

| Action | Payload | Effect |
|--------|---------|--------|
| `group/add` | `{ group }` | Add frame shape |
| `group/update` | `{ groupId, updates }` | Update group |
| `group/remove` | `{ groupId }` | Remove group |
| `image/add` | `{ image }` | Add background image |
| `image/update` | `{ imageId, updates }` | Update image |
| `image/remove` | `{ imageId }` | Remove image |
| `exportZone/set` | `{ zone }` | Partial export region |
| `exportZone/clear` | — | Clear export zone |

## Selection

| Action | Payload | Effect |
|--------|---------|--------|
| `select/node` | `{ nodeId, additive? }` | Select node (shift = additive) |
| `select/nodes` | `{ nodeIds }` | Replace selection |
| `select/connector` | `{ index }` | Select connector |
| `select/group` | `{ groupId }` | Select group |
| `select/image` | `{ imageId }` | Select image |
| `select/clear` | — | Clear all selection |

## Mode & Interaction

| Action | Payload | Effect |
|--------|---------|--------|
| `mode/set` | `{ mode }` | `select` \| `addNode` \| `addConnector` \| `addGroup` \| `pan` |
| `pending/set` | `{ pending }` | In-progress connector anchor |
| `pending/clear` | — | Cancel pending connector |
| `drag/start` | `{ nodeId, offset, nodeOffsets? }` | Begin drag |
| `drag/end` | — | End drag |

## Diagram Lifecycle

| Action | Payload | Effect |
|--------|---------|--------|
| `diagram/replace` | `{ diagram }` | Replace diagram, **push history**, keep filename/meta |
| `diagram/load` | `{ diagram, filename? }` | Replace diagram, **clear history**, set filename |
| `diagram/new` | — | Empty canvas |
| `diagram/saved` | — | Clear dirty flag, set lastSaved |
| `undo` | — | Pop history |
| `redo` | — | Restore future |

**Markup pane** dispatches `diagram/replace` (debounced). File → Open uses `diagram/load`.

## Layout & View

| Action | Payload | Effect |
|--------|---------|--------|
| `layout/update` | `{ layout }` | Canvas dimensions |
| `layout/expand` | `{ bounds }` | Grow canvas to fit content |
| `grid/update` | `{ grid }` | Grid settings |
| `template/set` | `{ template }` | Structural template preset |
| `zoom/set` | `{ zoom }` | Editor zoom level |
| `viewMode/set` | `{ viewMode }` | `2d` \| `isometric` |
| `isoStyle/set` | `{ isoStyle }` | `solid` \| `blueprint` \| `cyanotype` |
| `theme/set` | `{ themeId }` | Diagram theme |
| `colorMode/set` | `{ colorMode }` | `light` \| `dark` |
| `diagramMeta/set` | `{ diagramMeta }` | Persisted `_meta` fields |

## Programmatic Editing (outside React)

Prefer editing the JSON and calling `diagram/replace` or saving a file.
For generation without the editor:

```typescript
import { autoLayout } from '@hudsonkit/arc'
import { validateDiagramShape } from './src/utils/diagramValidation' // repo only
```
