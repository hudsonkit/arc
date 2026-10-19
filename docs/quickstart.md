---
title: Quickstart
description: Create your first Arc diagram in under 5 minutes.
order: 2
---

## Installation

Install the Arc package from npm. `react`, `react-dom`, and `lucide-react` are peer dependencies; everything else installs with the package.

```bash
# Install the Arc player
npm install @hudsonkit/arc

# Or use the visual editor
npx @hudsonkit/arc-editor
```

## Create a Diagram

Create a new file for your diagram configuration:

```typescript
// src/diagrams/my-system.diagram.ts
import type { ArcDiagramData } from '@hudsonkit/arc'

const diagram: ArcDiagramData = {
  id: 'MY.SYSTEM.001',
  layout: { width: 600, height: 300 },

  nodes: {
    frontend: { x: 50,  y: 100, size: 'm' },
    backend:  { x: 250, y: 100, size: 'm' },
    database: { x: 450, y: 100, size: 'm' },
  },

  nodeData: {
    frontend: { icon: 'Monitor',  name: 'Frontend', color: 'violet' },
    backend:  { icon: 'Server',   name: 'Backend',  color: 'emerald' },
    database: { icon: 'Database', name: 'Database', color: 'blue' },
  },

  connectors: [
    { from: 'frontend', to: 'backend',  fromAnchor: 'right', toAnchor: 'left', style: 'api' },
    { from: 'backend',  to: 'database', fromAnchor: 'right', toAnchor: 'left', style: 'db' },
  ],

  connectorStyles: {
    api: { color: 'violet', strokeWidth: 2, label: 'REST' },
    db:  { color: 'blue',   strokeWidth: 2, label: 'SQL' },
  },
}

export default diagram
```

## Render the Diagram

Import and render your diagram using the ArcDiagram component:

```tsx
// src/pages/ArchitecturePage.tsx
import { ArcDiagram } from '@hudsonkit/arc'
import mySystemDiagram from '../diagrams/my-system.diagram'

function ArchitecturePage() {
  return (
    <div className="p-8">
      <h1>System Architecture</h1>
      <ArcDiagram
        data={mySystemDiagram}
        mode="light"
        theme="default"
      />
    </div>
  )
}
```

## Customize Appearance

Switch between themes and modes to match your design:

```tsx
// Light mode with warm editorial theme
<ArcDiagram data={diagram} mode="light" theme="warm" />

// Dark mode with cool technical theme
<ArcDiagram data={diagram} mode="dark" theme="cool" />

// Grayscale for print
<ArcDiagram data={diagram} mode="light" theme="mono" />
```

You can also disable interactivity (zoom/pan) for static displays:

```tsx
<ArcDiagram data={diagram} interactive={false} />
```

## Next Steps

Now that you have a basic diagram, explore the full format and styling options:

- **[Diagram Format](/docs/diagram-format)** - Full reference for nodes, connectors, and styles
- **[Themes](/docs/themes)** - Color palettes and visual treatments
- **[Try the Editor](/editor)** - Visual editor with real-time preview
