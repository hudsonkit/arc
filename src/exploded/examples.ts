import type { ExplodedDetail, ExplodedDocument } from './types'

const tiles = (columns: number, rows: number, tone: ExplodedDetail['tone'] = 'muted'): ExplodedDetail[] => Array.from({ length: columns * rows }, (_, i) => ({ x: 16 + (i % columns) * 34, y: 18 + Math.floor(i / columns) * 30, width: 24, depth: 20, radius: 3, height: 2, tone }))

/** Illustrative conceptual layers, not a claim about a specific AI product. */
export const aiStackExploded: ExplodedDocument = {
  kind: 'exploded', version: 1, id: 'ai-stack', title: 'The AI stack',
  description: 'From compute to conversation. Five conceptual layers of an AI application.',
  parts: [
    { id: 'compute', label: 'Compute', description: 'Accelerators · memory', level: 0, assembledZ: 0, x: 0, y: 0, width: 170, depth: 130, radius: 12, height: 14, tone: 'dark', details: tiles(4, 3) },
    { id: 'data', label: 'Data', description: 'Documents · embeddings', level: 1, assembledZ: 17, x: 0, y: 0, width: 170, depth: 130, radius: 12, height: 7, details: Array.from({ length: 4 }, (_, i) => ({ x: 16, y: 17 + i * 25, width: 138, depth: 14, radius: 3, tone: 'muted' })) },
    { id: 'model', label: 'Model', description: 'Inference · reasoning', level: 2, assembledZ: 25, x: 0, y: 0, width: 170, depth: 130, radius: 12, height: 9, tone: 'accent', details: [{ x: 53, y: 33, width: 64, depth: 64, radius: 9, height: 3, tone: 'dark' }] },
    { id: 'orchestration', label: 'Orchestration', description: 'Tools · retrieval · routing', level: 3, assembledZ: 38, x: 0, y: 0, width: 170, depth: 130, radius: 12, height: 7, details: tiles(4, 2) },
    { id: 'application', label: 'Application', description: 'Conversation · experience', level: 4, assembledZ: 48, x: 0, y: 0, width: 170, depth: 130, radius: 12, height: 5, details: [{ x: 16, y: 16, width: 138, depth: 98, radius: 7, tone: 'dark' }, { x: 26, y: 28, width: 90, depth: 12, radius: 4, tone: 'surface' }, { x: 55, y: 51, width: 86, depth: 12, radius: 4, tone: 'muted' }, { x: 26, y: 82, width: 115, depth: 18, radius: 5, tone: 'surface' }] },
  ],
}

/** Key pitch: one keyboard unit (1u), in world units of roughly a millimetre. */
const U = 19
/** Rows of [legend, width in u] from back to front: a compact 40% staggered layout. */
const KEY_ROWS: [string, number][][] = [
  [['Esc', 1.25], ...[...'QWERTYUIOP'].map((k): [string, number] => [k, 1]), ['Bksp', 1.25]],
  [['Tab', 1.5], ...[...'ASDFGHJKL'].map((k): [string, number] => [k, 1]), ['Enter', 2]],
  [['Shift', 2.25], ...[...'ZXCVBNM,.'].map((k): [string, number] => [k, 1]), ['Shift', 1.25]],
  [['Ctrl', 1.25], ['Alt', 1.25], ['Fn', 1.25], ['Space', 6.25], ['Fn', 1.25], ['Alt', 1.25]],
]
const KEYS = KEY_ROWS.flatMap((row, r) => {
  let at = 0
  return row.map(([legend, units]) => { const key = { legend, units, x: at * U, y: r * U, cx: (at + units / 2) * U, cy: (r + 0.5) * U }; at += units; return key })
})
/** Stabilizer offsets from a key's centre: 2u and wider keys get a pair. */
const stabs = (units: number) => units >= 6 ? [-50, 50] : units >= 2 ? [-11.9, 11.9] : []
/** Plate, board and both key layers share this origin: inside the case wall plus clearance. */
const GRID = 9, GRID_W = 12.5 * U, GRID_D = 4 * U

/** Illustrative compact mechanical keyboard. Proportions follow common 40% boards; not a specific product. */
export const keyboardExploded: ExplodedDocument = {
  kind: 'exploded', version: 1, id: 'mini-keyboard', title: 'Mini keyboard',
  description: 'A compact 40% mechanical keyboard. Keycaps, switches, plate and circuit board stack into one aluminum case.',
  materials: {
    case: { light: '#1f2b3b', dark: '#3d5373' },
    circuit: { light: '#1f7a65', dark: '#1c6a58' },
    copper: { light: '#d5ad5b', dark: '#b8944a' },
    steel: { light: '#a9b0b8', dark: '#7c8899' },
    housing: { light: '#3b4552', dark: '#5a677a' },
    cream: { light: '#f3eee3', dark: '#cfc8b8' },
    slate: { light: '#5d6d82', dark: '#7a8aa0' },
  },
  parts: [
    { id: 'case', label: 'Case', description: 'Anodized aluminum tray', level: 0, assembledZ: 0, x: 0, y: 0, width: GRID_W + GRID * 2, depth: GRID_D + GRID * 2, radius: 7, height: 12, material: 'case', housing: { wall: 6, floor: 3 } },
    { id: 'pcb', label: 'Circuit board', description: 'Controller · USB-C · switch pads', level: 1, assembledZ: 5, containerId: 'case', x: GRID - 1, y: GRID - 1, width: GRID_W + 2, depth: GRID_D + 2, radius: 2, height: 1.6, material: 'circuit', details: [
      ...KEYS.map(k => ({ x: k.cx - 1.2, y: k.cy - 1.2, width: 4.4, depth: 4.4, radius: 2.2, material: 'copper' })),
      { x: 5.75 * U, y: 1.5, width: 9, depth: 7, radius: 1, height: 3.2, material: 'steel' },
      { x: 9.6 * U, y: 1.15 * U, width: 8, depth: 8, radius: 0.6, height: 1, tone: 'dark' },
    ] },
    { id: 'plate', label: 'Plate', description: 'Aluminum · switch cutouts', level: 2, assembledZ: 10.5, containerId: 'case', x: GRID - 2, y: GRID - 2, width: GRID_W + 4, depth: GRID_D + 4, radius: 2, height: 1.5, material: 'steel', details: [
      ...KEYS.map(k => ({ x: k.cx - 5, y: k.cy - 5, width: 14, depth: 14, tone: 'dark' as const })),
      ...KEYS.flatMap(k => stabs(k.units).map(dx => ({ x: k.cx + dx - 1.25, y: k.cy - 3.5, width: 6.5, depth: 11, radius: 0.5, tone: 'dark' as const }))),
    ] },
    { id: 'switches', label: 'Switches', description: 'Linear · plate-mounted · 40', level: 3, assembledZ: 12, x: GRID, y: GRID, width: GRID_W, depth: GRID_D, height: 8.6, body: 'none', tone: 'accent', details: [
      ...KEYS.map(k => ({ x: k.cx - 7, y: k.cy - 7, width: 14, depth: 14, radius: 0.8, height: 5, taper: 1.2, material: 'housing' })),
      ...KEYS.map(k => ({ x: k.cx - 2, y: k.cy - 2, width: 4, depth: 4, radius: 0.5, z: 5, height: 3.6, tone: 'accent' as const })),
      ...KEYS.flatMap(k => stabs(k.units).map(dx => ({ x: k.cx + dx - 3.25, y: k.cy - 5.5, width: 6.5, depth: 11, radius: 0.6, height: 4, material: 'housing' }))),
    ] },
    { id: 'keycaps', label: 'Keycaps', description: 'PBT · sculpted · 40 keys', level: 4, assembledZ: 17.5, x: GRID, y: GRID, width: GRID_W, depth: GRID_D, height: 8.4, body: 'none', material: 'cream', details: [
      ...KEYS.map(k => ({ x: k.x + 0.6, y: k.y + 0.6, width: k.units * U - 1.2, depth: U - 1.2, radius: 1.6, height: 8, taper: 2.6, ...(k.legend === 'Esc' ? { tone: 'accent' as const } : { material: k.legend.length > 1 && k.legend !== 'Space' ? 'slate' : 'cream' }) })),
      ...KEYS.filter(k => k.legend === 'F' || k.legend === 'J').map(k => ({ x: k.cx - 2.5, y: k.cy + 3, width: 5, depth: 1, radius: 0.5, z: 8, height: 0.4, material: 'slate' })),
    ] },
  ],
}

/** Compatibility fixture, no longer shown in the showcase. Simplified phone assembly. Board and battery share a separation level and housing. */
export const phoneExploded: ExplodedDocument = {
  kind: 'exploded', version: 1, id: 'phone', title: 'Inside a phone',
  description: 'A simplified phone assembly. The logic board and battery sit side by side inside the housing.',
  parts: [
    { id: 'housing', label: 'Housing', description: 'Frame · protective shell', level: 0, assembledZ: 0, x: 0, y: 0, width: 110, depth: 220, radius: 17, height: 18, tone: 'muted', housing: { wall: 5, floor: 3 } },
    { id: 'board', label: 'Logic board', description: 'Processor · connectivity', level: 1, assembledZ: 4, containerId: 'housing', x: 10, y: 12, width: 90, depth: 64, radius: 7, height: 5, tone: 'dark', details: [{ x: 9, y: 9, width: 29, depth: 29, radius: 3, height: 3, tone: 'muted' }, { x: 48, y: 9, width: 32, depth: 17, radius: 3, height: 2, tone: 'surface' }, { x: 48, y: 34, width: 25, depth: 19, radius: 3, height: 2, tone: 'muted' }] },
    { id: 'battery', label: 'Battery', description: 'Rechargeable cell', level: 1, assembledZ: 4, containerId: 'housing', x: 12, y: 100, width: 86, depth: 105, radius: 8, height: 9, tone: 'accent', details: [{ x: 12, y: 16, width: 60, depth: 4, radius: 1, tone: 'dark' }, { x: 12, y: 28, width: 40, depth: 3, radius: 1, tone: 'dark' }] },
    { id: 'shield', label: 'Shield plate', description: 'Structural support', level: 2, assembledZ: 18, x: 2, y: 2, width: 106, depth: 216, radius: 15, height: 2, details: [{ x: 11, y: 12, width: 84, depth: 189, radius: 10, tone: 'muted' }] },
    { id: 'display', label: 'Display', description: 'OLED panel · touch sensor', level: 3, assembledZ: 20, x: 2, y: 2, width: 106, depth: 216, radius: 15, height: 3, tone: 'dark', details: [{ x: 5, y: 5, width: 96, depth: 206, radius: 11, tone: 'muted' }] },
    { id: 'glass', label: 'Cover glass', description: 'Optical surface', level: 4, assembledZ: 23, x: 0, y: 0, width: 110, depth: 220, radius: 17, height: 2, details: [{ x: 6, y: 6, width: 98, depth: 208, radius: 12, tone: 'dark' }, { x: 37, y: 13, width: 36, depth: 9, radius: 4, tone: 'muted' }] },
  ],
}
