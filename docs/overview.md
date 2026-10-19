---
title: Overview
description: Arc is a visual diagram editor for creating architecture diagrams that are readable, versionable, and ready for docs.
order: 1
---

## What is Arc?

Arc is a visual editor and rendering toolkit for software diagrams. Author diagrams on a canvas or in code, embed interactive views, and export PNG, SVG, GIF, or MP4. The editable source is TypeScript or JSON that you can keep in version control and review in pull requests.

A diagram in Figma can drift as the system changes. Arc stores the diagram as TypeScript or JSON in your repository, so you can review and update it in the same pull request as the code it describes.

## Key Concepts

Arc is built around a few core ideas that make diagrams maintainable and portable.

### Declarative Format

Diagrams are data structures. Nodes, connectors, and styles are all defined in a typed schema. This means you can generate diagrams programmatically, diff them in git, and validate them with TypeScript.

### Templates

Structural presets that define box shapes, line styles, and layout behaviors. Templates control the visual language of your diagrams: rounded vs sharp corners, solid vs dashed lines, horizontal vs vertical layouts.

### Themes

Color palettes that can be applied to any template. Switch between light and dark modes, or match your brand colors, without changing the diagram structure. Use a built-in preset or inherit semantic color tokens from your host app. See [Themes](/docs/themes) for the available palettes and tokens.

## Why Arc?

Architecture diagrams typically live in design tools, disconnected from the code they describe. Arc keeps diagrams as declarative configs that:

- **Version with your code** - Diffs show exactly what changed
- **Render anywhere** - Use the lightweight player or export to SVG/PNG
- **Stay consistent** - Templates enforce color palettes and sizing rules

## Packages

Arc publishes four npm packages:

| Package | Description |
|---------|-------------|
| `@hudsonkit/arc` | Full editor + renderer |
| `@hudsonkit/arc-viewer` | Lightweight diagram viewer |
| `@hudsonkit/arc-iso` | Isometric diagram renderer |
| `@hudsonkit/arc-mcp` | Diagram tools for AI agents |

## Next Steps

- **[Quickstart](/docs/quickstart)** - Get up and running in 5 minutes
- **[Diagram Format](/docs/diagram-format)** - Learn the data structure
- **[Examples](/docs/examples)** - Real-world diagram examples
- **[Themes](/docs/themes)** - Customize colors and styles
