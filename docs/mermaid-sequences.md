---
title: Native Mermaid sequences
description: Render Mermaid sequence source as a typed, interactive Arc sequence.
---

Arc treats a sequence diagram as interaction over time. Mermaid text remains the
reviewable source. Arc parses that source into a typed sequence document, lays it
out, and renders it with Arc-owned SVG parts, themes, and player controls.

Mermaid.js is not required at runtime.

## Rendering pipeline

```
Mermaid sequenceDiagram source
  → parseMermaid()
  → ArcSequenceDocument
  → sequence layout and SVG parts
  → ArcMermaid or ArcMermaidPlayer
```

Sequence is a separate diagram family. It does not pass through
`ArcDiagramData`, because participants, lifelines, ordered messages, notes, and
fragments have different semantics from architecture nodes and connectors.

## React API

```tsx
import {
  ArcMermaidPlayer,
  classifyNoteAccent,
} from '@hudsonkit/arc-viewer'
import source from './interaction.sequence.mmd?raw'

export function InteractionModel() {
  return (
    <ArcMermaidPlayer
      source={source}
      mode="light"
      title="Interaction model"
      description="How a request moves through the system."
      sequence={{
        width: 1040,
        maxLabelWidth: 168,
        noteAccent: (event) => classifyNoteAccent(event.text),
      }}
    />
  )
}
```

Use `ArcMermaid` for rendering without player chrome. Use
`ArcMermaidPlayer` for zoom, fullscreen, keyboard navigation, and playback in
authored message order. Call `parseMermaid(source)` when you need the typed
document and diagnostics directly.

`classifyNoteAccent()` is an optional story helper used by the Scout example.
It maps known note language to presentation accents. Arc does not infer cost or
operational meaning from arbitrary prose.

## Supported sequence syntax

The native sequence parser currently handles:

- actors and participants
- solid, dashed, open, and filled message arrows
- notes placed over, left of, or right of participants
- `alt`, `else`, `opt`, and `loop` fragments
- parsed, limited treatment for `par`, `critical`, `break`, and `rect`
- light and dark Arc themes
- message playback and participant focus

Unsupported or malformed syntax produces diagnostics. Arc does not silently
turn an unknown sequence construct into a generic flowchart.

## Current boundaries

Activation markers on message arrows are recorded but activation bars are not
drawn. `activate`, `deactivate`, `autonumber`, `box`, `create`, and `destroy`
produce unsupported diagnostics. The player control named Fit currently resets
the sequence to 100%; measured fit-to-container remains future work.

Native flowchart and state renderers are separate future families.
