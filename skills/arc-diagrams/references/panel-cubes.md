# Panel cubes

A panel cube turns three aspects of one idea into a small explorable object.
The graphite shell opens along its face normals, with fine callouts that track
the front panels. Rear panels provide spatial context.

Start with [field-recorder.panel-cube.json](../examples/field-recorder.panel-cube.json).
Replace its three face IDs, labels, and descriptions together. Use this style for
conceptual product or process illustrations; the cube does not encode dimensions,
quantity, or a literal physical assembly.

## Author

The `PanelCubeDocument` contract has `kind: "panel-cube"`, `version: 1`, an `id`,
`title`, optional `description`, and three `faces`. Each face has a unique `id`,
one of `side: "top" | "left" | "right"`, a `label`, and an optional `description`.
Use each side once. Keep callout labels short; descriptions can carry more detail
in surrounding text.

```tsx
import { useState } from 'react'
import { ArcPanelCube, renderPanelCubeSvg } from '@hudsonkit/arc'
import type { PanelCubeDocument } from '@hudsonkit/arc'

const data: PanelCubeDocument = {
  kind: 'panel-cube',
  version: 1,
  id: 'recorder',
  title: 'Field recorder',
  faces: [
    { id: 'capture', side: 'top', label: 'Capture' },
    { id: 'storage', side: 'left', label: 'Storage' },
    { id: 'playback', side: 'right', label: 'Playback' },
  ],
}

function Illustration() {
  const [rotation, setRotation] = useState({ yaw: 0, pitch: 0 })

  return (
    <ArcPanelCube
      data={data}
      progress={1}
      rotation={rotation}
      onRotationChange={setRotation}
      rotationHandles
      style={{ width: '100%', height: 480 }}
    />
  )
}

const svg = renderPanelCubeSvg(data, {
  progress: 1,
  rotation: { yaw: 30, pitch: 15 },
  labels: true,
})
```

This API lives in `@hudsonkit/arc`. In the source checkout, import from
`src/panel-cube/index.ts`. Check the installed package exports first: a local
checkout can contain this capability before the published package does.
The architecture editor, `arc check`, `arc render`, and MCP graph tools do not
accept panel cube documents.

## Compose and interact

Use `progress` from 0 (assembled) to 1 (open). The viewport remains fixed across
the transition. The host controls timing; keep the opening brief and ease it to
a stop. Under `prefers-reduced-motion: reduce`, change directly to the target.

Make drag-to-rotate the primary interaction. `rotation` is a
`PanelCubeRotation` with `yaw` and `pitch` in degrees, defaulting to `{ yaw: 0,
pitch: 0 }`. Supply `onRotationChange` and store its next value to enable mouse,
pen, and touch dragging. Keyboard users can focus the object, use the arrow
keys to rotate, and press Home to reset. The component limits interactive pitch
to -75–75 degrees; yaw turns freely.

Set `rotationHandles` to add **Turn** and **Tilt** rings with draggable grips
around the object. This prop defaults to `false` and requires
`onRotationChange`. Turn changes only yaw; Tilt changes only pitch. Mouse, pen,
and touch can grab either ring. Keyboard users can focus a ring and use arrow
keys to adjust that axis or Home to reset it. Free dragging on the cube still
adjusts both axes.
The rings fade in on hover or keyboard focus and remain visible during a drag.
They fade out when the pointer leaves. Touch layouts keep them visible, and
reduced motion removes the fade. No tools toggle is needed.

Keep auto-spin optional and initially off. The example uses 12 degrees per
second, a visible **Stop spin** control, and **Reset view**. Use `onRotateStart`
to stop spinning when free dragging begins, a ring is grabbed, or a rotation key
is used. Do not start auto-spin under `prefers-reduced-motion: reduce`, and stop
it if that preference becomes active. Manual rotation remains available.

`activeFace` selects a face by ID. `onFaceChange` observes hover/focus, while
`onFaceSelect` handles activation. Provide a visible open/close control and text
buttons for the parts, so touch and keyboard users have the same explanation.
Start closed and change expansion only through **Open cube** and **Close cube**.
Hover, focus, rotation, and face selection preserve the chosen expansion state.
On narrow layouts, set `labels={false}` and place the named parts below the object.

The scene has a transparent background and a graphite material intended for a
light surface. Keep a comfortable margin around it. Callouts use system fonts
and a fixed size; avoid long phrases that collide with the object.

## Render and review

Save the result of `renderPanelCubeSvg` to an SVG. Open it in a browser, or
rasterize it with an available SVG tool for visual inspection. Static exports
capture the supplied state and contain no animation. Pass the current
`rotation`, `progress`, and `activeFace` to preserve the reader's view.
Interactive rings belong to the React controls and are excluded from static SVG.
`layoutPanelCube(data, progress, rotation?)` uses the same projection; authored
stills can use any finite yaw and pitch.

Inspect the closed, halfway, and open states at the destination size. Check that
the shell closes neatly, faces separate coherently, gradients and shadow survive
export, and leaders stop on the intended panel. Check a selected face as well as
the full view, then rotate through the sides and rear to inspect depth order and
callout placement. Leaders should take short, uncluttered paths to their panels
across views. Test Turn and Tilt independently: each ring must leave the other
axis unchanged during dragging, keyboard adjustment, and Home reset. For a mobile
interactive layout, verify touch dragging, readable external labels, and
activation without hover. Check arrow-key rotation, Home
reset, the stop-on-interaction behavior of auto-spin, and reduced motion. Export
a rotated view and compare it with the interactive scene.
