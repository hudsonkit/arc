import type { PanelCubeDocument, PanelCubePoint, PanelCubePlate, PanelCubeRenderOptions, PanelCubeRotation, PanelCubeSide, PanelCubeVector } from './types'

export const PANEL_CUBE_VIEWBOX = { x: 0, y: 0, width: 800, height: 500 } as const
/** Fixed through opening and a full orbit, including the complete ambient shadow. */
export const PANEL_CUBE_COMPACT_VIEWBOX = { x: 160, y: 120, width: 480, height: 380 } as const
const EDGE = 145, SEPARATION = 18, INSET = 2.2
const CENTER = { x: 400, y: 290 }
const SIDES: PanelCubeSide[] = ['top', 'left', 'right']

function fail(message: string): never { throw new Error(`Invalid panel cube: ${message}`) }
function text(value: unknown, name: string, maximum: number, optional = false) {
  if (optional && value === undefined) return
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) fail(`${name} must be a nonempty string of at most ${maximum} characters`)
}

export function validatePanelCubeDocument(value: unknown): asserts value is PanelCubeDocument {
  const doc = value as PanelCubeDocument
  if (!doc || doc.kind !== 'panel-cube' || doc.version !== 1) fail('expected kind "panel-cube" and version 1')
  text(doc.id, 'id', 80); text(doc.title, 'title', 120); text(doc.description, 'description', 500, true)
  if (!Array.isArray(doc.faces) || doc.faces.length !== 3) fail('faces must contain exactly top, left and right')
  const ids = new Set<string>(), sides = new Set<string>()
  for (const face of doc.faces) {
    if (!face || typeof face !== 'object') fail('each face must be an object')
    text(face.id, 'face.id', 80); text(face.label, 'face.label', 36); text(face.description, 'face.description', 100, true)
    if (ids.has(face.id)) fail(`duplicate face id "${face.id}"`)
    if (!SIDES.includes(face.side) || sides.has(face.side)) fail('face sides must be unique top, left and right')
    ids.add(face.id); sides.add(face.side)
  }
}

export function validatePanelCubeOptions(doc: PanelCubeDocument, options: PanelCubeRenderOptions) {
  const progress = options.progress ?? 1
  if (!Number.isFinite(progress) || progress < 0 || progress > 1) fail('progress must be between 0 and 1')
  if (options.activeFace != null && !doc.faces.some(face => face.id === options.activeFace)) fail('activeFace must reference a face id')
  if (options.labels !== undefined && typeof options.labels !== 'boolean') fail('labels must be boolean')
  validateRotation(options.rotation)
}

function validateRotation(rotation?: PanelCubeRotation) {
  if (rotation !== undefined && (!rotation || !Number.isFinite(rotation.yaw) || !Number.isFinite(rotation.pitch))) fail('rotation must contain finite yaw and pitch degrees')
}
/** Equal-length orthogonal camera axes preserve the accepted isometric view at zero. */
function cameraVector({ x, y, z }: PanelCubeVector, rotation?: PanelCubeRotation) {
  const yaw = ((rotation?.yaw ?? 0) % 360) * Math.PI / 180, pitch = ((rotation?.pitch ?? 0) % 360) * Math.PI / 180
  const horizontal = -x + (y + z) / 2, vertical = Math.sqrt(3) * (y - z) / 2, depth = -(x + y + z) / Math.sqrt(2)
  const turnedX = horizontal * Math.cos(yaw) + depth * Math.sin(yaw)
  const turnedDepth = -horizontal * Math.sin(yaw) + depth * Math.cos(yaw)
  return { x: turnedX, y: vertical * Math.cos(pitch) - turnedDepth * Math.sin(pitch), depth: vertical * Math.sin(pitch) + turnedDepth * Math.cos(pitch) }
}
function cameraPoint(point: PanelCubeVector, rotation?: PanelCubeRotation) {
  const transformed = cameraVector({ x: point.x - EDGE / 2, y: point.y - EDGE / 2, z: point.z - EDGE / 2 }, rotation)
  return { x: CENTER.x + transformed.x, y: CENTER.y + transformed.y, depth: transformed.depth }
}
/** True orthographic 3D orbit about the cube center, not a 2D SVG rotation. */
export function projectPanelCube(point: PanelCubeVector, rotation?: PanelCubeRotation): PanelCubePoint {
  validateRotation(rotation)
  const { x, y } = cameraPoint(point, rotation)
  return { x, y }
}

/** Interpolated plane depth at a screen point; null when the plane does not cover it. */
export function panelDepthAt(plate: PanelCubePlate, point: PanelCubePoint): number | null {
  for (const triangle of [[0, 1, 2], [0, 2, 3]]) {
    const [a, b, c] = triangle.map(index => plate.points[index])
    const divisor = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y)
    if (Math.abs(divisor) < 1e-8) continue
    const wa = ((b.y - c.y) * (point.x - c.x) + (c.x - b.x) * (point.y - c.y)) / divisor
    const wb = ((c.y - a.y) * (point.x - c.x) + (a.x - c.x) * (point.y - c.y)) / divisor
    const wc = 1 - wa - wb
    if (Math.min(wa, wb, wc) >= -1e-7) return wa * plate.vertexDepths[triangle[0]] + wb * plate.vertexDepths[triangle[1]] + wc * plate.vertexDepths[triangle[2]]
  }
  return null
}

/** Three front plates open along their normals; three rear plates keep the shell closed. */
export function layoutPanelCube(doc: PanelCubeDocument, progress = 1, rotation?: PanelCubeRotation): PanelCubePlate[] {
  validatePanelCubeDocument(doc); validatePanelCubeOptions(doc, { progress, rotation })
  const distance = SEPARATION * progress
  const plates: PanelCubePlate[] = [true, false].flatMap(back => SIDES.map(side => {
    // The concealed full-size plates close the shell behind the front reveal seams.
    const low = back ? 0 : INSET, high = back ? EDGE : EDGE - INSET
    const face = doc.faces.find(candidate => candidate.side === side)!
    const axis = side === 'top' ? 'y' : side === 'left' ? 'z' : 'x'
    const offset: PanelCubeVector = { x: 0, y: 0, z: 0 }
    offset[axis] = back || distance === 0 ? 0 : -distance
    const plane = (back ? EDGE : 0) + offset[axis]
    const corners = [[low, low], [high, low], [high, high], [low, high]]
    const projected = corners.map(([a, b]) => cameraPoint(
      side === 'top' ? { x: a, y: plane, z: b }
        : side === 'left' ? { x: a, y: b, z: plane }
          : { x: plane, y: a, z: b },
      rotation,
    ))
    const points = projected.map(({ x, y }) => ({ x, y }))
    const center = points.reduce((sum, point) => ({ x: sum.x + point.x / 4, y: sum.y + point.y / 4 }), { x: 0, y: 0 })
    const outward: PanelCubeVector = { x: 0, y: 0, z: 0 }
    outward[axis] = back ? 1 : -1
    const normal = cameraVector(outward, rotation)
    return { face, back, points, center, offset, depth: projected.reduce((sum, point) => sum + point.depth / 4, 0), vertexDepths: projected.map(point => point.depth), normal: { x: normal.x, y: normal.y }, facing: normal.depth / Math.sqrt(1.5), exposed: false }
  }))
  for (const plate of plates) {
    plate.exposed = !plate.back && plate.facing > 0.06 && !plates.some(other => {
      if (other === plate) return false
      const depth = panelDepthAt(other, plate.center)
      return depth !== null && depth > plate.depth + 0.1
    })
  }
  return plates.sort((a, b) => a.depth - b.depth)
}

const decimal = (number: number) => String(Math.round(number * 1000) / 1000)
const at = (point: PanelCubePoint) => `${decimal(point.x)},${decimal(point.y)}`
/** Screen-space quadratic corners avoid sharp seams without distorting the planes. */
export function roundedPanelPath(points: PanelCubePoint[], radius = 3): string {
  const corners = points.map((point, index) => {
    const before = points[(index + points.length - 1) % points.length], after = points[(index + 1) % points.length]
    const toward = (other: PanelCubePoint) => {
      const length = Math.hypot(other.x - point.x, other.y - point.y)
      const fraction = length < 1e-9 ? 0 : Math.min(0.45, radius / length)
      return { x: point.x + (other.x - point.x) * fraction, y: point.y + (other.y - point.y) * fraction }
    }
    return { point, entry: toward(before), exit: toward(after) }
  })
  return `M${at(corners[0].entry)} ` + corners.map(({ point, entry, exit }, index) => `${index ? `L${at(entry)} ` : ''}Q${at(point)} ${at(exit)}`).join(' ') + ' Z'
}
