import { DEFAULT_LAYOUT, DEFAULT_CONNECTOR_STYLES, DEFAULT_GRID } from '../../utils/constants'
import { generateNodeId } from '../../utils/diagramHelpers'
import { DEFAULT_ICON } from '../../utils/iconRegistry'
import { DEFAULT_TEMPLATE, getTemplate } from '../../utils/templates'

// Initial diagram state (empty canvas)
export const createInitialDiagram = () => ({
  layout: { ...DEFAULT_LAYOUT },
  grid: { ...DEFAULT_GRID },
  nodes: {},
  nodeData: {},
  connectors: [],
  connectorStyles: { ...DEFAULT_CONNECTOR_STYLES },
  groups: [], // Grouping shapes (rectangles, circles)
  images: [], // Dropped images (SVG, PNG, JPEG)
  exportZone: null, // { x, y, width, height } for partial export
})

// Initial editor state
export const initialState = {
  diagram: createInitialDiagram(),
  editor: {
    selectedNodeIds: [], // Array for multi-select support
    selectedConnectorIndex: null,
    selectedGroupId: null, // Selected group shape
    selectedImageId: null, // Selected image
    mode: 'select', // 'select' | 'addNode' | 'addConnector' | 'addGroup'
    pendingConnector: null, // { from, fromAnchor } when drawing connector
    pendingGroup: null, // { type, startX, startY } when drawing group
    isDragging: false,
    dragOffset: { x: 0, y: 0 },
    dragNodeOffsets: {}, // { nodeId: { x, y } } for multi-node drag
    template: DEFAULT_TEMPLATE, // Current style template
    zoom: 1, // Zoom level (0.5 to 2)
    viewMode: '2d', // '2d' | 'isometric'
    isoStyle: 'solid', // 'solid' | 'blueprint' | 'cyanotype' (isometric render style)
    themeId: 'workbench', // Arc diagram theme (workbench = quiet slate default)
    colorMode: 'dark', // 'light' | 'dark'
  },
  meta: {
    filename: null,
    isDirty: false,
    lastSaved: null,
    diagramMeta: {}, // Persisted theme/viewport/source metadata
  },
  history: {
    past: [],
    future: [],
  },
}

// Helper to save current state to history
function saveToHistory(state) {
  return {
    ...state,
    history: {
      past: [...state.history.past.slice(-49), state.diagram],
      future: [],
    },
    meta: { ...state.meta, isDirty: true },
  }
}

export function editorReducer(state, action) {
  switch (action.type) {
    // ============================================
    // NODE OPERATIONS
    // ============================================

    case 'node/add': {
      const { position, nodeData } = action
      const nodeId = generateNodeId()
      const stateWithHistory = saveToHistory(state)
      return {
        ...stateWithHistory,
        diagram: {
          ...stateWithHistory.diagram,
          nodes: {
            ...stateWithHistory.diagram.nodes,
            [nodeId]: { x: position.x, y: position.y, size: 'm' },
          },
          nodeData: {
            ...stateWithHistory.diagram.nodeData,
            [nodeId]: {
              icon: DEFAULT_ICON,
              name: 'New Node',
              subtitle: '',
              description: '',
              color: 'violet',
              ...nodeData,
            },
          },
        },
        editor: {
          ...stateWithHistory.editor,
          selectedNodeIds: [nodeId],
          selectedConnectorIndex: null,
          mode: 'select',
        },
      }
    }

    case 'node/duplicate': {
      const sourceId = action.nodeId
      const source = state.diagram.nodes[sourceId]
      const sourceData = state.diagram.nodeData[sourceId]
      if (!source || !sourceData) return state
      const nodeId = generateNodeId()
      const stateWithHistory = saveToHistory(state)
      return {
        ...stateWithHistory,
        diagram: {
          ...stateWithHistory.diagram,
          nodes: {
            ...stateWithHistory.diagram.nodes,
            [nodeId]: { ...source, x: source.x + 24, y: source.y + 24 },
          },
          nodeData: {
            ...stateWithHistory.diagram.nodeData,
            [nodeId]: { ...sourceData },
          },
        },
        editor: {
          ...stateWithHistory.editor,
          selectedNodeIds: [nodeId],
          selectedConnectorIndex: null,
          selectedGroupId: null,
          selectedImageId: null,
        },
      }
    }

    case 'node/remove': {
      const { nodeId } = action
      const stateWithHistory = saveToHistory(state)
      const { [nodeId]: _, ...remainingNodes } = stateWithHistory.diagram.nodes
      const { [nodeId]: __, ...remainingNodeData } = stateWithHistory.diagram.nodeData
      // Remove connectors that reference this node
      const remainingConnectors = stateWithHistory.diagram.connectors.filter(
        c => c.from !== nodeId && c.to !== nodeId
      )
      return {
        ...stateWithHistory,
        diagram: {
          ...stateWithHistory.diagram,
          nodes: remainingNodes,
          nodeData: remainingNodeData,
          connectors: remainingConnectors,
        },
        editor: {
          ...stateWithHistory.editor,
          selectedNodeIds: [],
          selectedConnectorIndex: null,
        },
      }
    }

    case 'node/move': {
      const { nodeId, x, y } = action
      return {
        ...state,
        diagram: {
          ...state.diagram,
          nodes: {
            ...state.diagram.nodes,
            [nodeId]: { ...state.diagram.nodes[nodeId], x, y },
          },
        },
        meta: { ...state.meta, isDirty: true },
      }
    }

    case 'nodes/move': {
      // Move multiple nodes at once
      const { moves } = action // [{ nodeId, x, y }, ...]
      const updatedNodes = { ...state.diagram.nodes }
      for (const { nodeId, x, y } of moves) {
        if (updatedNodes[nodeId]) {
          updatedNodes[nodeId] = { ...updatedNodes[nodeId], x, y }
        }
      }
      return {
        ...state,
        diagram: {
          ...state.diagram,
          nodes: updatedNodes,
        },
        meta: { ...state.meta, isDirty: true },
      }
    }

    case 'node/update': {
      const { nodeId, updates } = action
      const stateWithHistory = saveToHistory(state)
      // An update to `undefined` clears the field rather than recording it as
      // present-but-empty — "follow the theme" has to leave no trace in the
      // saved document, not a `"shape": undefined` that JSON quietly drops.
      const next = { ...stateWithHistory.diagram.nodeData[nodeId], ...updates }
      for (const key of Object.keys(updates)) {
        if (updates[key] === undefined) delete next[key]
      }
      return {
        ...stateWithHistory,
        diagram: {
          ...stateWithHistory.diagram,
          nodeData: {
            ...stateWithHistory.diagram.nodeData,
            [nodeId]: next,
          },
        },
      }
    }

    case 'node/resize': {
      const { nodeId, size, width, height } = action
      const stateWithHistory = saveToHistory(state)
      const currentNode = stateWithHistory.diagram.nodes[nodeId]

      // Build updated node - custom dimensions override preset size
      const updatedNode = { ...currentNode }
      if (size !== undefined) {
        updatedNode.size = size
        // Clear custom dimensions when selecting a preset
        delete updatedNode.width
        delete updatedNode.height
      }
      if (width !== undefined) updatedNode.width = width
      if (height !== undefined) updatedNode.height = height

      return {
        ...stateWithHistory,
        diagram: {
          ...stateWithHistory.diagram,
          nodes: {
            ...stateWithHistory.diagram.nodes,
            [nodeId]: updatedNode,
          },
        },
      }
    }

    case 'node/updatePosition': {
      // Update any properties on the node position object (z, isoHeight, isoDepth, etc.)
      const { nodeId, updates } = action
      const stateWithHistory = saveToHistory(state)
      const currentNode = stateWithHistory.diagram.nodes[nodeId]
      const next = { ...currentNode, ...updates }
      for (const key of Object.keys(updates)) {
        if (updates[key] === undefined) delete next[key]
      }

      return {
        ...stateWithHistory,
        diagram: {
          ...stateWithHistory.diagram,
          nodes: {
            ...stateWithHistory.diagram.nodes,
            [nodeId]: next,
          },
        },
      }
    }

    // ============================================
    // CONNECTOR OPERATIONS
    // ============================================

    case 'connector/add': {
      const { from, to, fromAnchor, toAnchor, style = 'http' } = action
      const stateWithHistory = saveToHistory(state)
      return {
        ...stateWithHistory,
        diagram: {
          ...stateWithHistory.diagram,
          connectors: [
            ...stateWithHistory.diagram.connectors,
            { from, to, fromAnchor, toAnchor, style },
          ],
        },
        editor: {
          ...stateWithHistory.editor,
          selectedNodeIds: [],
          selectedConnectorIndex: stateWithHistory.diagram.connectors.length,
          mode: 'select',
          pendingConnector: null,
        },
      }
    }

    case 'connector/remove': {
      const { index } = action
      const stateWithHistory = saveToHistory(state)
      return {
        ...stateWithHistory,
        diagram: {
          ...stateWithHistory.diagram,
          connectors: stateWithHistory.diagram.connectors.filter((_, i) => i !== index),
        },
        editor: {
          ...stateWithHistory.editor,
          selectedConnectorIndex: null,
        },
      }
    }

    case 'connector/update': {
      const { index, updates } = action
      const stateWithHistory = saveToHistory(state)
      return {
        ...stateWithHistory,
        diagram: {
          ...stateWithHistory.diagram,
          connectors: stateWithHistory.diagram.connectors.map((c, i) =>
            i === index ? { ...c, ...updates } : c
          ),
        },
      }
    }

    case 'connectorStyle/update': {
      const { styleName, updates } = action
      const stateWithHistory = saveToHistory(state)
      return {
        ...stateWithHistory,
        diagram: {
          ...stateWithHistory.diagram,
          connectorStyles: {
            ...stateWithHistory.diagram.connectorStyles,
            [styleName]: {
              ...stateWithHistory.diagram.connectorStyles[styleName],
              ...updates,
            },
          },
        },
      }
    }

    case 'connectorStyle/add': {
      const { styleName, style } = action
      const stateWithHistory = saveToHistory(state)
      return {
        ...stateWithHistory,
        diagram: {
          ...stateWithHistory.diagram,
          connectorStyles: {
            ...stateWithHistory.diagram.connectorStyles,
            [styleName]: style,
          },
        },
      }
    }

    case 'connectorStyle/delete': {
      const { styleName } = action
      const stateWithHistory = saveToHistory(state)
      const { [styleName]: _, ...remainingStyles } = stateWithHistory.diagram.connectorStyles
      return {
        ...stateWithHistory,
        diagram: {
          ...stateWithHistory.diagram,
          connectorStyles: remainingStyles,
        },
      }
    }

    // ============================================
    // GROUP OPERATIONS
    // ============================================

    case 'group/add': {
      const { group } = action
      const groupId = `group_${crypto.randomUUID().slice(0, 8)}`
      const stateWithHistory = saveToHistory(state)
      const existingGroups = stateWithHistory.diagram.groups || []
      return {
        ...stateWithHistory,
        diagram: {
          ...stateWithHistory.diagram,
          groups: [
            ...existingGroups,
            { id: groupId, ...group },
          ],
        },
        editor: {
          ...stateWithHistory.editor,
          selectedGroupId: groupId,
          selectedNodeIds: [],
          selectedConnectorIndex: null,
        },
      }
    }

    case 'group/update': {
      const { groupId, updates } = action
      const stateWithHistory = saveToHistory(state)
      const existingGroups = stateWithHistory.diagram.groups || []
      return {
        ...stateWithHistory,
        diagram: {
          ...stateWithHistory.diagram,
          groups: existingGroups.map(g =>
            g.id === groupId ? { ...g, ...updates } : g
          ),
        },
      }
    }

    case 'group/remove': {
      const { groupId } = action
      const stateWithHistory = saveToHistory(state)
      const existingGroups = stateWithHistory.diagram.groups || []
      return {
        ...stateWithHistory,
        diagram: {
          ...stateWithHistory.diagram,
          groups: existingGroups.filter(g => g.id !== groupId),
        },
        editor: {
          ...stateWithHistory.editor,
          selectedGroupId: null,
        },
      }
    }

    case 'select/group':
      return {
        ...state,
        editor: {
          ...state.editor,
          selectedGroupId: action.groupId,
          selectedNodeIds: [],
          selectedConnectorIndex: null,
          selectedImageId: null,
        },
      }

    // ============================================
    // IMAGE OPERATIONS
    // ============================================

    case 'image/add': {
      const { image } = action
      const imageId = `img_${crypto.randomUUID().slice(0, 8)}`
      const stateWithHistory = saveToHistory(state)
      const existingImages = stateWithHistory.diagram.images || []
      return {
        ...stateWithHistory,
        diagram: {
          ...stateWithHistory.diagram,
          images: [
            ...existingImages,
            { id: imageId, ...image },
          ],
        },
        editor: {
          ...stateWithHistory.editor,
          selectedImageId: imageId,
          selectedNodeIds: [],
          selectedConnectorIndex: null,
          selectedGroupId: null,
        },
      }
    }

    case 'image/update': {
      const { imageId, updates } = action
      const stateWithHistory = saveToHistory(state)
      const existingImages = stateWithHistory.diagram.images || []
      return {
        ...stateWithHistory,
        diagram: {
          ...stateWithHistory.diagram,
          images: existingImages.map(img =>
            img.id === imageId ? { ...img, ...updates } : img
          ),
        },
      }
    }

    case 'image/remove': {
      const { imageId } = action
      const stateWithHistory = saveToHistory(state)
      const existingImages = stateWithHistory.diagram.images || []
      return {
        ...stateWithHistory,
        diagram: {
          ...stateWithHistory.diagram,
          images: existingImages.filter(img => img.id !== imageId),
        },
        editor: {
          ...stateWithHistory.editor,
          selectedImageId: null,
        },
      }
    }

    case 'select/image':
      return {
        ...state,
        editor: {
          ...state.editor,
          selectedImageId: action.imageId,
          selectedNodeIds: [],
          selectedConnectorIndex: null,
          selectedGroupId: null,
        },
      }

    // ============================================
    // EXPORT ZONE
    // ============================================

    case 'exportZone/set': {
      const { zone } = action
      return {
        ...state,
        diagram: {
          ...state.diagram,
          exportZone: zone,
        },
        meta: { ...state.meta, isDirty: true },
      }
    }

    case 'exportZone/clear': {
      return {
        ...state,
        diagram: {
          ...state.diagram,
          exportZone: null,
        },
        meta: { ...state.meta, isDirty: true },
      }
    }

    // ============================================
    // SELECTION
    // ============================================

    case 'select/node': {
      const { nodeId, addToSelection } = action
      let newSelectedIds

      if (addToSelection) {
        // Shift+click: toggle node in selection
        if (state.editor.selectedNodeIds.includes(nodeId)) {
          newSelectedIds = state.editor.selectedNodeIds.filter(id => id !== nodeId)
        } else {
          newSelectedIds = [...state.editor.selectedNodeIds, nodeId]
        }
      } else {
        // Regular click: replace selection
        newSelectedIds = [nodeId]
      }

      return {
        ...state,
        editor: {
          ...state.editor,
          selectedNodeIds: newSelectedIds,
          selectedConnectorIndex: null,
          selectedGroupId: null,
          selectedImageId: null,
        },
      }
    }

    case 'select/nodes':
      return {
        ...state,
        editor: {
          ...state.editor,
          selectedNodeIds: action.nodeIds,
          selectedConnectorIndex: null,
          selectedGroupId: null,
          selectedImageId: null,
        },
      }

    case 'select/connector':
      return {
        ...state,
        editor: {
          ...state.editor,
          selectedNodeIds: [],
          selectedConnectorIndex: action.index,
          selectedGroupId: null,
          selectedImageId: null,
        },
      }

    case 'select/clear':
      return {
        ...state,
        editor: {
          ...state.editor,
          selectedNodeIds: [],
          selectedConnectorIndex: null,
          selectedGroupId: null,
          selectedImageId: null,
        },
      }

    // ============================================
    // EDITOR MODE
    // ============================================

    case 'mode/set':
      return {
        ...state,
        editor: {
          ...state.editor,
          mode: action.mode,
          pendingConnector: null,
          selectedNodeIds: [],
          selectedConnectorIndex: null,
        },
      }

    case 'pending/set':
      return {
        ...state,
        editor: {
          ...state.editor,
          pendingConnector: action.pendingConnector,
        },
      }

    case 'pending/clear':
      return {
        ...state,
        editor: {
          ...state.editor,
          pendingConnector: null,
        },
      }

    // ============================================
    // DRAG STATE
    // ============================================

    case 'drag/start': {
      const { offset, nodeOffsets, selectedIds } = action

      return {
        ...state,
        editor: {
          ...state.editor,
          isDragging: true,
          dragOffset: offset,
          dragNodeOffsets: nodeOffsets || {},
          selectedNodeIds: selectedIds || state.editor.selectedNodeIds,
          selectedConnectorIndex: null,
          selectedGroupId: null,
          selectedImageId: null,
        },
      }
    }

    case 'drag/end': {
      // Save to history when drag ends
      const stateWithHistory = saveToHistory(state)
      return {
        ...stateWithHistory,
        editor: {
          ...stateWithHistory.editor,
          isDragging: false,
          dragOffset: { x: 0, y: 0 },
          dragNodeOffsets: {},
        },
      }
    }

    // ============================================
    // FILE OPERATIONS
    // ============================================

    // Markup edits replace the drawing but stay ordinary edits: history is
    // preserved (so ⌘Z steps back through them), the open filename survives,
    // and editor-only fields the markup does not carry are kept.
    case 'diagram/replace': {
      const next = action.diagram || {}
      return {
        ...saveToHistory(state),
        diagram: {
          ...state.diagram,
          layout: next.layout ?? state.diagram.layout,
          nodes: next.nodes ?? {},
          nodeData: next.nodeData ?? {},
          connectors: next.connectors ?? [],
          connectorStyles: next.connectorStyles ?? state.diagram.connectorStyles,
          groups: next.groups ?? [],
          focusTargets: next.focusTargets,
          views: next.views,
        },
        editor: {
          ...state.editor,
          // A node that no longer exists cannot stay selected.
          selectedNodeIds: (state.editor.selectedNodeIds || []).filter(
            (id) => next.nodes && Object.prototype.hasOwnProperty.call(next.nodes, id),
          ),
          selectedConnectorIndex: null,
        },
      }
    }

    case 'diagram/load':
      return {
        ...state,
        diagram: action.diagram,
        meta: {
          filename: action.filename || null,
          isDirty: false,
          lastSaved: null,
          diagramMeta: action.diagramMeta || state.meta.diagramMeta || {},
        },
        history: { past: [], future: [] },
        editor: {
          ...state.editor,
          selectedNodeIds: [],
          selectedConnectorIndex: null,
          mode: 'select',
          pendingConnector: null,
          themeId: action.diagramMeta?.themeId ?? state.editor.themeId,
          colorMode: action.diagramMeta?.colorMode ?? state.editor.colorMode,
        },
      }

    case 'diagram/new':
      return {
        ...initialState,
        diagram: createInitialDiagram(),
        editor: {
          ...initialState.editor,
          themeId: null,
          colorMode: 'dark',
        },
        meta: {
          ...initialState.meta,
          diagramMeta: {},
        },
      }

    case 'diagram/saved':
      return {
        ...state,
        meta: {
          ...state.meta,
          filename: action.filename || state.meta.filename,
          isDirty: false,
          lastSaved: new Date().toISOString(),
        },
      }

    // ============================================
    // HISTORY (UNDO/REDO)
    // ============================================

    case 'undo': {
      if (state.history.past.length === 0) return state
      const previous = state.history.past[state.history.past.length - 1]
      const newPast = state.history.past.slice(0, -1)
      return {
        ...state,
        diagram: previous,
        history: {
          past: newPast,
          future: [state.diagram, ...state.history.future],
        },
        meta: { ...state.meta, isDirty: true },
      }
    }

    case 'redo': {
      if (state.history.future.length === 0) return state
      const next = state.history.future[0]
      const newFuture = state.history.future.slice(1)
      return {
        ...state,
        diagram: next,
        history: {
          past: [...state.history.past, state.diagram],
          future: newFuture,
        },
        meta: { ...state.meta, isDirty: true },
      }
    }

    // ============================================
    // LAYOUT
    // ============================================

    case 'layout/update': {
      const stateWithHistory = saveToHistory(state)
      return {
        ...stateWithHistory,
        diagram: {
          ...stateWithHistory.diagram,
          layout: { ...stateWithHistory.diagram.layout, ...action.updates },
        },
      }
    }

    case 'layout/expand': {
      // Lightweight layout expansion without history (for auto-expand during drag)
      //
      // Snapped to a 20px step: the viewport that drives this is measured from
      // getBoundingClientRect()/zoom, so the raw numbers are fractional. They
      // used to land in the saved document as `width: 944.7000122070312`, and
      // every pixel of drift wrote another one.
      const step = 20
      const grow = (n) => Math.ceil(n / step) * step
      const currentLayout = state.diagram.layout
      const newWidth = Math.max(currentLayout.width, grow(action.width || currentLayout.width))
      const newHeight = Math.max(currentLayout.height, grow(action.height || currentLayout.height))

      // Only update if actually expanding
      if (newWidth === currentLayout.width && newHeight === currentLayout.height) {
        return state
      }

      return {
        ...state,
        diagram: {
          ...state.diagram,
          layout: { ...currentLayout, width: newWidth, height: newHeight },
        },
        meta: { ...state.meta, isDirty: true },
      }
    }

    case 'grid/update': {
      return {
        ...state,
        diagram: {
          ...state.diagram,
          grid: { ...state.diagram.grid, ...action.updates },
        },
      }
    }

    // ============================================
    // TEMPLATE
    // ============================================

    case 'template/set': {
      const template = getTemplate(action.templateId)
      return {
        ...state,
        diagram: {
          ...state.diagram,
          grid: {
            ...state.diagram.grid,
            color: template.canvas.grid.color,
            size: template.canvas.grid.size,
            opacity: template.canvas.grid.opacity,
          },
        },
        editor: {
          ...state.editor,
          template: action.templateId,
        },
        meta: { ...state.meta, isDirty: true },
      }
    }

    case 'zoom/set':
      return {
        ...state,
        editor: {
          ...state.editor,
          zoom: Math.min(2, Math.max(0.25, action.zoom)),
        },
      }

    // ============================================
    // VIEW MODE
    // ============================================

    case 'viewMode/set':
      return {
        ...state,
        editor: {
          ...state.editor,
          viewMode: action.viewMode,
        },
        meta: {
          ...state.meta,
          diagramMeta: { ...state.meta.diagramMeta, viewMode: action.viewMode },
        },
      }

    case 'isoStyle/set':
      return {
        ...state,
        editor: {
          ...state.editor,
          isoStyle: action.isoStyle,
        },
        meta: {
          ...state.meta,
          isDirty: true,
          diagramMeta: { ...state.meta.diagramMeta, isoStyle: action.isoStyle },
        },
      }

    // ============================================
    // THEME & COLOR MODE
    // ============================================

    case 'theme/set':
      return {
        ...state,
        editor: {
          ...state.editor,
          themeId: action.themeId,
        },
        meta: {
          ...state.meta,
          isDirty: true,
          diagramMeta: { ...state.meta.diagramMeta, themeId: action.themeId },
        },
      }

    case 'colorMode/set':
      return {
        ...state,
        editor: {
          ...state.editor,
          colorMode: action.colorMode,
        },
        meta: {
          ...state.meta,
          diagramMeta: { ...state.meta.diagramMeta, colorMode: action.colorMode },
        },
      }

    case 'diagramMeta/set':
      return {
        ...state,
        meta: {
          ...state.meta,
          diagramMeta: { ...state.meta.diagramMeta, ...action.diagramMeta },
        },
      }

    default:
      return state
  }
}
