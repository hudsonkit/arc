/** World units are shared by x, y and z. This family uses a fixed 2:1 dimetric projection. */
export interface ExplodedFootprint {
  x: number
  y: number
  width: number
  depth: number
  radius?: number
}

export type ExplodedTone = 'surface' | 'muted' | 'dark' | 'accent'

/** A named finish with an explicit color per appearance (`#rrggbb`). */
export interface ExplodedMaterial {
  light: string
  dark: string
}

/** A local solid or printed mark. No arbitrary SVG or executable markup. */
export interface ExplodedDetail extends ExplodedFootprint {
  height?: number
  /** Elevation above the mounting surface, for stacked details such as a stem on a switch. */
  z?: number
  /** Inset of the top face on every side; sculpted caps and housings become frustums. */
  taper?: number
  tone?: ExplodedTone
  /** References `ExplodedDocument.materials`; overrides `tone` for color. */
  material?: string
}

export interface ExplodedPart extends ExplodedFootprint {
  id: string
  label: string
  description?: string
  /** Nonnegative integer; parts on the same level separate together. */
  level: number
  /** Absolute world elevation of the bottom face when assembled. */
  assembledZ: number
  height: number
  tone?: ExplodedTone
  /** References `ExplodedDocument.materials`; overrides `tone` for color. */
  material?: string
  /**
   * `solid` (default) draws the footprint as a slab with details on its top face.
   * `none` makes the footprint an envelope for a set of loose components, such as
   * keycaps: only details render, mounted from the part's base, and they must fit
   * within `height`.
   */
  body?: 'solid' | 'none'
  /** Inset of a solid body's top face. */
  taper?: number
  /** A containing housing, not a relative coordinate system. */
  containerId?: string
  /** Open tray with a floor and walls. Children render before its front rim. */
  housing?: { wall: number; floor: number }
  details?: ExplodedDetail[]
}

export interface ExplodedDocument {
  kind: 'exploded'
  version: 1
  id: string
  title: string
  description?: string
  parts: ExplodedPart[]
  /** Named finishes referenced by parts and details. At most 16. */
  materials?: Record<string, ExplodedMaterial>
  /** Minimum air gap; layout can increase it to clear labels and leaders. */
  gap?: number
}

export interface ExplodedRenderOptions {
  /** 0 = assembled, 1 = exploded; all intermediate states are deterministic. */
  progress?: number
  mode?: 'light' | 'dark'
  labels?: boolean
  guides?: boolean
}

export interface ExplodedPoint { x: number; y: number }
export interface ExplodedBounds { x: number; y: number; width: number; height: number }
export interface ExplodedPlacedPart {
  part: ExplodedPart
  explodedZ: number
  anchor: ExplodedPoint
  bounds: ExplodedBounds
  /** Convex screen outline of the part at its exploded position; leaders must clear it. */
  silhouette: ExplodedPoint[]
}
export interface ExplodedLayout {
  parts: ExplodedPlacedPart[]
  gap: number
  labelX: number
  /** Stable union of assembled and exploded geometry, including labels. */
  bounds: ExplodedBounds
}
