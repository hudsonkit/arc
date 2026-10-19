# Arc → Talkie Docs Handoff

> **Legacy format.** This document describes the Talkie `ArchitectureDiagram.jsx` handoff
> vocabulary (`large`/`normal`/`small`, Lucide component refs). For new work, use
> **`ArcDiagramData`** from `src/types/diagram.ts` with sizes `xs`/`s`/`m`/`l` and
> icon string names. The Arc editor and `@hudsonkit/arc` player use the modern format.

When you've finalized a diagram design, export it in this format so it can be dropped into the Talkie docs.

## Output Format

Produce a **config object** that I can paste directly into `ArchitectureDiagram.jsx`. The config has four sections:

### 1. `nodes` — Box positions and sizes

```js
const nodes = {
  talkie:       { x: 25,  y: 15,  size: 'large' },
  talkieLive:   { x: 25,  y: 125, size: 'normal' },
  talkieEngine: { x: 25,  y: 220, size: 'normal' },
  // ... etc
}
```

**Size options:** `'large'` | `'normal'` | `'small'`

### 2. `connectors` — Lines between boxes

```js
const connectors = [
  { from: 'talkie', to: 'talkieLive', fromAnchor: 'bottom', toAnchor: 'top', style: 'xpc' },
  { from: 'talkie', to: 'iCloud', fromAnchor: 'bottomRight', toAnchor: 'left', style: 'cloudkit', curve: 'down' },
  // ... etc
]
```

**Anchor options:** `'top'` | `'bottom'` | `'left'` | `'right'` | `'bottomRight'` | `'bottomLeft'`

**Style options:** `'xpc'` | `'http'` | `'tailscale'` | `'cloudkit'` | `'audio'` | `'peer'`

**Optional:** `curve: 'down'` for bezier curves (used for CloudKit lines)

### 3. `connectorStyles` — Line appearance (if customizing)

```js
const connectorStyles = {
  xpc:       { color: 'emerald', strokeWidth: 2, label: 'XPC' },
  http:      { color: 'amber',   strokeWidth: 2, label: 'HTTP' },
  cloudkit:  { color: 'sky',     strokeWidth: 2, label: 'CloudKit', dashed: true },
  // ... etc
}
```

**Color options:** `'emerald'` | `'amber'` | `'zinc'` | `'sky'` | `'violet'` | `'blue'`

### 4. `nodeData` — Box content (if changing labels)

```js
const nodeData = {
  talkie: {
    icon: Monitor,  // from lucide-react
    name: 'Talkie',
    subtitle: 'Swift/SwiftUI',
    description: 'UI, Workflows, Data, Orchestration',
    color: 'violet',
  },
  // ... etc
}
```

---

## Example Handoff

When you're done designing, output something like:

```
## Diagram Config Update

Here are the updated values to paste into ArchitectureDiagram.jsx:

### nodes
[paste the nodes object]

### connectors
[paste the connectors array]

### connectorStyles (if changed)
[paste if you modified styles]

### nodeData (if changed)
[paste if you modified box content]
```

---

## What NOT to include

- Don't include the full component code
- Don't include helper functions (anchor, midPoint, etc.)
- Don't include the ProcessBox component
- Just the config objects that define the layout

The Talkie docs already have the rendering logic — I just need the data.
