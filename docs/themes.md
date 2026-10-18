# Color Themes

Themes remap Arc's eight **logical node colors** to a coordinated palette. You set
`theme` and `mode` on the diagram. The node `color` values never change, so one
diagram renders in every theme.

```tsx
<ArcDiagram data={diagram} theme="cool" mode="light" />
```

## Logical colors

Every node uses one of eight logical colors. The active theme decides how each renders:

| Color | Typical meaning |
|-------|-----------------|
| `violet` | Primary / app surface |
| `emerald` | Data / success |
| `blue` | Services |
| `amber` | Warnings |
| `sky` | External / cloud |
| `zinc` | Neutral / infra |
| `rose` | Errors / alerts |
| `orange` | Accents / highlights |

Use 2–3 colors per diagram for cohesion, applied semantically (e.g. `emerald` for
data, `amber` for warnings) or aesthetically.

## Built-in themes

Each theme ships **light and dark** modes:

| Theme | Character |
|-------|-----------|
| `default` | Balanced, brand-neutral |
| `warm` | Amber / rose |
| `cool` | Blue / teal |
| `mono` | Grayscale, maximum restraint |
| `engineering` | Systematic enterprise blue on a graph grid |
| `workbench` | Dark slate with intent colors |
| `tactical` | Near-black with signature amber |
| `command` | HUD console, cyan glass, crosshair grid (Arc editor default) |

## Applying a theme

```tsx
// Same data, two looks
<ArcDiagram data={diagram} theme="default" mode="light" />
<ArcDiagram data={diagram} theme="tactical" mode="dark" />
```

In the editor, the theme and color mode are saved with the diagram and travel with
every export, so the rendered output matches what you designed.

## Inherit from the host page

Set `theme="inherit"` to style a diagram with semantic CSS custom properties.
This works in `@arach/arc`, `@arach/arc-viewer`, and the viewer's native sequence
renderer. Existing presets keep their own palettes.

```tsx
<div className="product-diagram">
  <ArcDiagram data={diagram} theme="inherit" mode="light" />
</div>
```

Map the host's design tokens on any ancestor of the diagram:

```css
.product-diagram {
  --arc-diagram-background: var(--page-background);
  --arc-diagram-foreground: var(--text-primary);
  --arc-diagram-muted: var(--text-secondary);
  --arc-diagram-surface: var(--panel-background);
  --arc-diagram-border: var(--panel-border);
  --arc-diagram-line: var(--text-secondary);
  --arc-diagram-accent: var(--brand-color);
  --arc-diagram-success: var(--success-color);
  --arc-diagram-warning: var(--warning-color);
  --arc-diagram-danger: var(--error-color);
  --arc-diagram-font: var(--font-body);
  --arc-diagram-font-mono: var(--font-code);
}
```

| Token suffix | Purpose |
|---|---|
| `background` | Diagram canvas |
| `foreground` | Primary labels |
| `muted` | Secondary labels |
| `surface` | Node and sequence-note fills |
| `border` | Node outlines and grid |
| `line` | Neutral connectors |
| `accent` | Violet, blue, and sky categories |
| `success` | Emerald category |
| `warning` | Amber and orange categories |
| `danger` | Rose category |
| `font` | Main label font; inherits the host font when omitted |
| `font-mono` | Monospace labels |

Unset colors use neutral light or dark defaults selected by `mode`. The host
controls its own light/dark switch by updating these variables. Color changes
apply through CSS without resetting zoom, pan, or selection. Keep text contrast
appropriate for the supplied surfaces.

Fonts inherit, but Arc's authored node dimensions remain fixed. If a new font
needs more space, adjust the diagram layout. Changing a font does not measure or
resize the nodes automatically.

SVG exports with `theme: 'inherit'` retain variable references and mode-specific
fallbacks. Inline SVG can inherit the page tokens. Standalone SVG and PNG exports
use the fallbacks because they do not have the host page's CSS. Isometric
materials and editor controls keep their separate styling contracts.

For a working example, run `bun dev` and open
`http://localhost:5188/examples/host-theme.html`.
