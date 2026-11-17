# @hudsonkit/arc-viewer

Native React renderers for diagrams as code, including typed architecture
diagrams and interactive Mermaid sequences.

Bring Mermaid source from [Pele](https://pele.run/) or
[Beautiful Mermaid](https://github.com/lukilabs/beautiful-mermaid): import supported
flowchart and state syntax with `importMermaid()`, or play sequence diagrams with
`ArcMermaidPlayer`. Arc applies its own layout and themes; renderer-specific
styling and other Mermaid diagram families are outside this compatibility path.

For **PNG, SVG, GIF, and MP4** file exports from Arc architecture data, use the
CLI in [`@hudsonkit/arc`](https://www.npmjs.com/package/@hudsonkit/arc). GIF and MP4 capture
authored flow routes and require Chrome/Chromium plus ffmpeg. This viewer package
provides the React components; it does not include the export CLI.

## Installation

```bash
npm install @hudsonkit/arc-viewer
```

## Usage

```tsx
import { ArcDiagram } from '@hudsonkit/arc-viewer'
import type { ArcDiagramData } from '@hudsonkit/arc-viewer'

const diagram: ArcDiagramData = {
  id: 'MY.DIAGRAM.001',
  layout: { width: 600, height: 300 },
  nodes: {
    frontend: { x: 50, y: 100, size: 'm' },
    backend: { x: 250, y: 100, size: 'm' },
    database: { x: 450, y: 100, size: 'm' },
  },
  nodeData: {
    frontend: { icon: 'Monitor', name: 'Frontend', color: 'violet' },
    backend: { icon: 'Server', name: 'Backend', color: 'emerald' },
    database: { icon: 'Database', name: 'Database', color: 'blue' },
  },
  connectors: [
    { from: 'frontend', to: 'backend', fromAnchor: 'right', toAnchor: 'left', style: 'api' },
    { from: 'backend', to: 'database', fromAnchor: 'right', toAnchor: 'left', style: 'db' },
  ],
  connectorStyles: {
    api: { color: 'violet', strokeWidth: 2, label: 'REST' },
    db: { color: 'blue', strokeWidth: 2, label: 'SQL' },
  },
}

function App() {
  return (
    <ArcDiagram
      data={diagram}
      mode="light"
      theme="default"
      interactive={true}
    />
  )
}
```

## Mermaid Sequences

Arc parses canonical Mermaid source into a typed document and renders it with a
native player. The source remains reviewable while Arc owns the theme,
interaction, and playback controls.

```tsx
import { ArcMermaidPlayer } from '@hudsonkit/arc-viewer'

const source = `sequenceDiagram
  participant App
  participant API
  App->>API: Load architecture
  API-->>App: Typed diagram`

export function Sequence() {
  return <ArcMermaidPlayer source={source} mode="light" />
}
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `data` | `ArcDiagramData` | required | The diagram configuration |
| `mode` | `'light' \| 'dark'` | `'dark'` | Light or dark appearance |
| `theme` | `ThemeId` | `'default'` | Color palette (`default`, `warm`, `cool`, `mono`, `inherit`) |
| `interactive` | `boolean` | `true` | Enable zoom/pan controls |
| `className` | `string` | `''` | Additional CSS classes |
| `showArcToggle` | `boolean` | `true` | Show the source toggle button |
| `showAutoLayout` | `boolean` | `false` | Show the auto-layout button |
| `editable` | `boolean` | `false` | Drag nodes to reposition them |
| `editorUrl` | `string` | | Arc editor URL. With `editable`, shows an Edit button |
| `editorMeta` | `{ viewport?, theme?, mode? }` | | Settings passed to the editor |
| `hoverEffects` | `boolean \| HoverEffectsConfig` | `true` | All hover effects, none, or a chosen set |
| `onNodeHover` | `(nodeId: string \| null) => void` | | Called when a node is hovered or clicked, and with `null` on release |

## Themes

- **default** - Clean, neutral colors
- **warm** - Soft, editorial warmth
- **cool** - Crisp, modern blues
- **mono** - Elegant grayscale
- **inherit** - Colors from the host page, below

### Host theme

Use `<ArcDiagram data={diagram} theme="inherit" mode="light" />` to read
`--arc-diagram-*` CSS variables from the containing page. The same theme works
with the native sequence renderer. Map your background, foreground, muted text,
surface, border, line, accent, success, warning, and danger colors on an ancestor.
Use `--arc-diagram-font` and `--arc-diagram-font-mono` for label fonts.

Unset colors use the selected mode's defaults. Existing presets are unchanged.
See [the host theme contract](https://github.com/hudsonkit/arc/blob/main/docs/themes.md#inherit-from-the-host-page)
for the full mapping, example, and export behavior.

## Auto-layout

`createAutoLayout()` places the nodes for you when you have only node data and
connections. It returns a complete `ArcDiagramData`.

```tsx
import { ArcDiagram, createAutoLayout } from '@hudsonkit/arc-viewer'

const diagram = createAutoLayout({
  nodeData: {
    web: { icon: 'Monitor', name: 'Web', color: 'violet' },
    api: { icon: 'Server', name: 'API', color: 'emerald' },
    db: { icon: 'Database', name: 'Postgres', color: 'blue' },
  },
  connectors: [
    { from: 'web', to: 'api', style: 'http' },
    { from: 'api', to: 'db', style: 'sql' },
  ],
  connectorStyles: {
    http: { color: 'violet', strokeWidth: 2 },
    sql: { color: 'blue', strokeWidth: 2 },
  },
})

<ArcDiagram data={diagram} mode="light" />
```

`autoLayout(data, options)` re-places the nodes of an existing diagram. The
spacing options are `columnGap`, `nodeGap`, `rowGap` and `padding`. Pass them
as the second argument to `autoLayout`, or as `layout` to `createAutoLayout`.

## Requirements

- React 18+
- Tailwind CSS (for styling classes)

## Editor

Design a diagram visually in the studio at [hudsonkit.com/arc](https://hudsonkit.com/arc),
then export its JSON and pass it to `ArcDiagram`.

## Related packages

- [`@hudsonkit/arc`](https://www.npmjs.com/package/@hudsonkit/arc): the main
  package. Studio components, themes, auto-layout and the export CLI.
- [`@hudsonkit/arc-iso`](https://www.npmjs.com/package/@hudsonkit/arc-iso):
  isometric diagrams of stacked tiers, for React or plain SVG.
- [`@hudsonkit/arc-mcp`](https://www.npmjs.com/package/@hudsonkit/arc-mcp):
  an MCP server so agents can author and render Arc diagrams.

## License

MIT
