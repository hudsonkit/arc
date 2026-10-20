/** The three semantic faces visible from the initial isometric camera. */
export type PanelCubeSide = 'top' | 'left' | 'right'

export interface PanelCubeFace {
  id: string
  side: PanelCubeSide
  label: string
  description?: string
}

/** A conceptual illustration: front plates open away from a quiet, closed rear shell. */
export interface PanelCubeDocument {
  kind: 'panel-cube'
  version: 1
  id: string
  title: string
  description?: string
  faces: PanelCubeFace[]
}

export interface PanelCubeRenderOptions {
  /** 0 is closed; 1 separates three front plates along their world-space normals. */
  progress?: number
  activeFace?: string | null
  labels?: boolean
  /** Orbit in degrees relative to the original camera, around its vertical/horizontal axes. */
  rotation?: PanelCubeRotation
}

export interface PanelCubeRotation { yaw: number; pitch: number }
export interface PanelCubePoint { x: number; y: number }
export interface PanelCubeVector { x: number; y: number; z: number }
export interface PanelCubePlate {
  face: PanelCubeFace
  back: boolean
  points: PanelCubePoint[]
  center: PanelCubePoint
  /** Actual translation in world space; useful when inspecting the illustration. */
  offset: PanelCubeVector
  /** Larger depth is nearer the camera; points are ordered around the physical plane. */
  depth: number
  vertexDepths: number[]
  /** Projected outward normal; positive facing means the exterior faces the camera. */
  normal: PanelCubePoint
  facing: number
  /** Outward-facing semantic plate with an unobstructed projected center. */
  exposed: boolean
}
