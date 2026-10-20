---
name: Arc exploded views
description: Implemented assembly geometry and showcase, scoped to the exploded feature.
colors:
  light-background: "#fafaf9"
  light-foreground: "#252b32"
  light-surface: "#e5e9ed"
  light-muted: "#b3bec8"
  light-dark: "#414e5b"
  light-accent: "#df6a35"
  dark-background: "#151b24"
  dark-foreground: "#e5eaf0"
  dark-surface: "#728399"
  dark-muted: "#526176"
  dark-dark: "#293647"
  dark-accent: "#f4844e"
rounded:
  workbench: "12px"
  segment: "5px"
---

# Design System: Arc exploded views

## Overview

Native Arc geometry shows how parts separate and fit together. Rounded slabs, opaque faces, neutral tones, and one orange focal part define this feature. The showcase retains Arc's compact controls and bordered workbench. This note covers `src/exploded/`, `ExplodedShowcase.tsx`, and `exploded.css` only.

## Colors

The scene palettes above assign `surface`, `muted`, `dark`, and `accent` tones to parts. Orange marks Model in the AI stack and Battery in the phone. The showcase uses its own CSS variables; its light control accent is darker than the scene accent. Light and dark modes use explicit palettes; the exploded renderer has no host-theme inheritance option.

## Typography

The showcase inherits `--font-sans` with a system fallback. Its heading scales from 25px to 36px; controls use 12–13px text. SVG labels use system sans at 14px and weight 600; descriptions use monospace at 11px. The separation readout uses tabular numerals.

## Layout

The page caps at 1240px with 40px desktop gutters. Desktop places the diagram beside a 278px inspector; at 900px, gutters and inspector narrow. At 640px and below, assembly controls move above the diagram, diagram labels disappear, and the separate parts legend follows in two columns. The mobile diagram is 480px tall. The SVG view box includes both assembled and exploded bounds, so separation does not change framing.

## Elevation & Depth

The fixed 2:1 dimetric projection maps `(x, y, z)` to `(x - y, (x + y) / 2 - z)`. Opaque faces, darker side shading, and thin edges establish depth without cast shadows. Housing interiors render behind their children; front walls render afterward. Dashed guides fade with separation. Horizontal leaders appear only at the fully exploded endpoint.

## Shapes

Parts use rectangular footprints with sampled circular corners that project to ellipses. Details are local slabs or flat marks on a part's top face. A housing is an open tray with a floor and walls. The renderer accepts this bounded geometry, not arbitrary SVG shapes or a movable camera.

## Components

- **Scene:** `createExplodedScene` supplies both `ArcExploded` and standalone SVG serialization. Existing graph and isometric diagram families remain separate.
- **Assembly:** progress runs from 0 (assembled) to 1 (exploded). Parts on one level separate together. Layout deterministically increases the gap to clear labels and leaders; unresolved same-level label conflicts produce an error.
- **Controls:** Assembled and Exploded animate over 650ms with quartic easing. The native range applies separation immediately. Reduced motion skips the animation. Selecting an example resets separation to 100%; Source disables assembly controls. Buttons expose pressed state and use a visible accent focus outline.
- **Examples and exports:** the AI stack has five conceptual layers; the phone has six parts, including a board and battery sharing a housing and separation level. Both are simplified illustrations. The showcase downloads fully exploded SVG in the selected appearance and the source JSON. The renderer API can export other progress values.

## Do's and Don'ts

- **Do** derive React rendering and SVG export from the same scene and preserve deterministic geometry.
- **Do** retain opaque faces, an orange focal part, readable labels, and the separate mobile legend.
- **Don't** represent these examples as product specifications or physical simulations.
- **Don't** apply this feature's projection, palettes, or control layout to existing Arc diagram families.
