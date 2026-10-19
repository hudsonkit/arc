# Arc — usage conventions

Arc renders **architecture diagrams** from data. Two components, both imported from `@hudsonkit/arc`
(available at runtime as `window.Arc.*`): `ArcDiagram` (2D flow) and `ArcDiagramIsometric` (3D stacked tiers).

## Setup — no provider needed
Both components are self-contained and **data-driven**. There is no context provider to wrap — just import
and pass a config object. For styling to apply, the host must load the design system's `styles.css`
(it pulls in the compiled Tailwind utilities + `@theme` tokens the components render with, plus the brand fonts).

```tsx
import { ArcDiagram } from '@hudsonkit/arc'

const data = {
  layout: { width: 860, height: 400 },
  nodes:    { editor: { x: 50, y: 50, size: 'l' }, model: { x: 340, y: 150, size: 'm' } },
  nodeData: {
    editor: { icon: 'Monitor', name: 'Arc Editor', subtitle: 'Canvas UI', color: 'violet' },
    model:  { icon: 'Layers',  name: 'Diagram Model', subtitle: 'JSON / TS', color: 'blue' },
  },
  connectors: [{ from: 'editor', to: 'model', fromAnchor: 'right', toAnchor: 'left', style: 'edge' }],
  connectorStyles: { edge: { color: 'violet', strokeWidth: 2, label: 'diagram' } },
}

<ArcDiagram data={data} mode="dark" theme="default" defaultZoom="fit" />
```

## The styling idiom — configure by DATA + props, not classes
You do **not** style Arc components with CSS classes. Appearance is controlled by:
- **Props:** `mode` = `"light" | "dark"`; `theme` = `"default" | "warm" | "cool" | "mono" | "engineering" | "workbench" | "tactical"`
  (the last three are opinionated design-language palettes — Engineering, Workbench, Tactical); plus
  `interactive`, `defaultZoom` (`number | "fit"`), `maxFitZoom`, `hoverEffects`.
- **Node colors** (`nodeData[*].color`) are logical names: `violet`, `emerald`, `blue`, `amber`, `zinc`, `sky`, `rose`, `orange`.
  The active `theme` remaps these to its palette — never pass hex to a node color.
- **Icons** (`nodeData[*].icon`) are lucide-react icon names as strings, e.g. `"Monitor"`, `"Server"`, `"Cloud"`.
- `ArcDiagramIsometric` takes `config` (`{ theme, tiers[], floorSize, nodes[] }`) + `options`
  (`{ animate, interactive }`) — set `animate: false` for static/SSR renders.

## Brand tokens (for your own layout glue around the diagrams)
When you build surrounding chrome, use Arc's brand tokens (defined at `:root` in `styles.css`):
`var(--arc-ink)` `var(--arc-ink-soft)` `var(--arc-muted)` `var(--arc-paper)` `var(--arc-card)`
`var(--arc-border)` and accents `var(--arc-accent)` (orange), `var(--arc-accent-2)` (teal),
`var(--arc-accent-3)` (blue), `var(--arc-accent-4)` (gold). Fonts: `var(--arc-font-display)` (Fraunces),
`var(--arc-font-body)` (Space Grotesk), `var(--arc-font-mono)` (JetBrains Mono).
Arc's visual language is **technical and low-radius** — prefer small corner radii and hairline borders.

## Where the truth lives
- `styles.css` (and the `_ds_bundle.css` it imports) — the tokens, fonts, and component styles.
- `components/general/ArcDiagram/` and `components/iso/ArcDiagramIsometric/` — each has a `.d.ts`
  (the full props contract) and a `.prompt.md` (usage notes). Read those before composing.
