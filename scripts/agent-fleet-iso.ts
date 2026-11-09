/**
 * Agent Fleet — Isometric
 *
 * Turns a captured Scout agent roster into an Arc isometric diagram:
 *   Tier 0  RUNTIME   — the Scout hub everything routes through
 *   Tier 1  PROJECTS  — one plot per repo, agents stack above it
 *   Tier 2  AGENTS    — every running session, colored by harness
 *
 * Run:  bun scripts/agent-fleet-iso.ts
 * Out:  /tmp/agent-fleet.svg  +  public/agent-fleet.png
 */
import { renderToString } from '../src/iso/vanilla'
import type { DiagramConfig, DiagramNode } from '../src/iso/types'
import { writeFileSync } from 'fs'
import { MATTE_COLORS, MATTE_INK } from '../src/iso/materials'
import { isoToScreen } from '../src/utils/isometric'
import sharp from 'sharp'

// ── Example roster (captured from Scout agents_search) ─────────────────────────
// harness → color. Codex is most of the fleet, so it wears the softest hue and
// the two minorities carry the loud ones: claude = tomato · pi/grok = yellow.
const HARNESS_COLOR: Record<string, string> = { claude: 'fleet-claude', codex: 'fleet-codex', pi: 'fleet-pi' }

// ── Palette ────────────────────────────────────────────────────────────────
// One base hue per role; faces are mixed toward white, lit from the top left
// (top lightest, left face next, right face is the base itself).
type Palette = { paper: string; codex: string; claude: string; pi: string; project: string; runtime: string }
const PALETTES: Record<string, Palette> = {
  cobalt: { paper: '#f4f6fa', codex: '#9db0c6', claude: '#f2684a', pi: '#3a66f0', project: '#dfe6f0', runtime: '#1f3a68' },
  tide: { paper: '#f3f7f7', codex: '#5fb3ab', claude: '#ff8a3d', pi: '#7b5cff', project: '#d5ebe8', runtime: '#134e4a' },
  poster: { paper: '#f6f6f4', codex: '#8fc2fa', claude: '#ff5a36', pi: '#ffcf3a', project: '#e6e9ee', runtime: '#1e293b' },
  orchid: { paper: '#f6f5fb', codex: '#b1abee', claude: '#ff6b8f', pi: '#2fc79a', project: '#e7e5f7', runtime: '#2e2a7a' },
}
const PALETTE = PALETTES[process.env.FLEET_PALETTE ?? 'poster']
const mix = (hex: string, t: number) => {
  const n = parseInt(hex.slice(1), 16)
  const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(t < 0 ? v * (1 + t) : v + (255 - v) * t))
  return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('')
}
const ramp = (hex: string) => ({ top: mix(hex, 0.62), side: mix(hex, 0.32), front: hex })
Object.assign(MATTE_COLORS, {
  'fleet-codex': ramp(PALETTE.codex), 'fleet-claude': ramp(PALETTE.claude), 'fleet-pi': ramp(PALETTE.pi),
  'fleet-project': { top: '#ffffff', side: mix(PALETTE.project, 0.4), front: PALETTE.project },
  'fleet-runtime': { top: mix(PALETTE.runtime, 0.8), side: mix(PALETTE.runtime, 0.55), front: mix(PALETTE.runtime, 0.35) },
})
const HARNESS_HEIGHT: Record<string, number> = { claude: 30, codex: 24, pi: 20 }

type Agent = { label: string; harness: 'claude' | 'codex' | 'pi' }
type Project = { key: string; label: string; cell: { x: number; y: number; w: number; d: number }; cols: number; agents: Agent[] }

const PROJECTS: Project[] = [
  {
    key: 'openscout', label: 'OPENSCOUT', cell: { x: 20, y: 30, w: 165, d: 285 }, cols: 3,
    agents: [
      { label: 'OSCOUT', harness: 'codex' }, { label: 'OS-185', harness: 'codex' }, { label: 'OS-GROK', harness: 'pi' },
      { label: 'GROK', harness: 'pi' }, { label: 'CARD-2', harness: 'codex' }, { label: 'CARD-3a', harness: 'codex' },
      { label: 'CARD-3b', harness: 'codex' }, { label: 'CARD-C', harness: 'codex' }, { label: 'CARD-F', harness: 'codex' },
      { label: 'CARD-G', harness: 'codex' }, { label: 'CARD-P', harness: 'codex' },
    ],
  },
  {
    key: 'hudson', label: 'HUDSON', cell: { x: 205, y: 30, w: 120, d: 115 }, cols: 2,
    agents: [
      { label: 'HUDSON', harness: 'codex' }, { label: 'HUD-LITE', harness: 'pi' },
      { label: 'HUD-NONE', harness: 'pi' }, { label: 'HUD-CARD', harness: 'codex' },
    ],
  },
  {
    key: 'arc', label: 'ARC', cell: { x: 345, y: 30, w: 120, d: 115 }, cols: 2,
    agents: [ { label: 'ARC', harness: 'claude' }, { label: 'ARC-DOCS', harness: 'codex' } ],
  },
  { key: 'pomo', label: 'POMO', cell: { x: 205, y: 165, w: 115, d: 75 }, cols: 2,
    agents: [ { label: 'POMO', harness: 'codex' }, { label: 'LANDING', harness: 'codex' } ] },
  { key: 'atelier', label: 'ATELIER', cell: { x: 340, y: 165, w: 70, d: 75 }, cols: 1,
    agents: [ { label: 'ATELIER', harness: 'codex' } ] },
  { key: 'scope', label: 'SCOPE', cell: { x: 205, y: 255, w: 70, d: 60 }, cols: 1,
    agents: [ { label: 'SCOPE', harness: 'codex' } ] },
  { key: 'lattices', label: 'LATTICES', cell: { x: 290, y: 255, w: 70, d: 60 }, cols: 1,
    agents: [ { label: 'LATTICE', harness: 'claude' } ] },
  { key: 'hl', label: 'HL', cell: { x: 430, y: 255, w: 60, d: 60 }, cols: 1,
    agents: [ { label: 'HL', harness: 'codex' } ] },
]

const SCENE_SCALE = 0.78
const FLOOR = { width: 500 * SCENE_SCALE, depth: 345 * SCENE_SCALE }
const T_PROJECTS = 1, T_AGENTS = 2

// ── Build nodes ─────────────────────────────────────────────────────────────
const nodes: DiagramNode[] = []

// Tier 0 — the runtime is a raised slate foundation. Layer captions are drawn
// beside the stack so they remain readable and cannot be occluded.

let agentCount = 0
for (const p of PROJECTS) {
  // Tier 1 — project plot
  nodes.push({ tier: T_PROJECTS, x: p.cell.x, y: p.cell.y, width: p.cell.w, depth: p.cell.d, height: 10, color: 'fleet-project', label: p.label, opacity: 0.92 })

  // Tier 2 — agents laid out in a mini-grid directly above the plot
  const n = p.agents.length
  const rows = Math.ceil(n / p.cols)
  const ip = 6
  const cw = (p.cell.w - 2 * ip) / p.cols
  const cd = (p.cell.d - 2 * ip) / rows
  const bw = Math.min(cw * 0.56, 30)
  const bd = Math.min(cd * 0.56, 30)
  p.agents.forEach((a, i) => {
    const col = i % p.cols, row = Math.floor(i / p.cols)
    nodes.push({
      tier: T_AGENTS,
      x: p.cell.x + ip + col * cw + (cw - bw) / 2,
      y: p.cell.y + ip + row * cd + (cd - bd) / 2,
      width: bw, depth: bd, height: HARNESS_HEIGHT[a.harness], color: HARNESS_COLOR[a.harness], label: a.label,
    })
    agentCount++
  })
}

// Keep the full roster geometry, but let readable layer annotations explain
// this overview. Individual session names are too small at README width.
const overviewNodes = nodes.map(node => ({
  ...node,
  x: node.x * SCENE_SCALE, y: node.y * SCENE_SCALE,
  width: node.width * SCENE_SCALE, depth: node.depth * SCENE_SCALE,
  height: node.height * SCENE_SCALE, label: '',
}))

const config: DiagramConfig = {
  id: 'ARC.FLEET.001',
  title: 'Agent Fleet',
  theme: 'light',
  // Flat inks and hairline edges; the shaded material reads as glossy plastic.
  material: 'matte',
  canvas: { width: 1120, height: 760 },
  origin: { x: 660, y: 708 },
  cornerRadius: 0,
  floorSize: FLOOR,
  tiers: [
    { name: '', elevation: 0, floorColor: '#ffffff', floorOpacity: 1, borderColor: MATTE_INK },
    { name: '', elevation: 148, floorColor: '#ffffff', floorOpacity: 0.55, borderColor: MATTE_INK },
    // Agents stand on their project plots: the tier sits at the plots' top face
    // and draws no floor of its own, so each session reads as part of its repo.
    { name: '', elevation: 148 + 10 * SCENE_SCALE, floorOpacity: 0, borderColor: 'transparent' },
  ],
  nodes: [
    // A shallow solid platform gives the runtime a visible edge and depth.
    { tier: 0, x: 12, y: 12, width: FLOOR.width - 24, depth: FLOOR.depth - 24,
      height: 20, color: 'fleet-runtime', label: '' },
    ...overviewNodes,
  ],
}

// ── Render + inject title & legend ──────────────────────────────────────────
let svg = renderToString(config)

// Annotations stay in screen space, so they remain readable at article width.
// Each layer is named once, in a column to the left, by a straight horizontal
// leader ending in a dot on the part itself — no legend to decode.
const FONT = 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
const MONO = '"JetBrains Mono", "SF Mono", ui-monospace, monospace'
const SECONDARY = '#5a6577'
const LEADER = 'rgba(30,41,59,0.4)'
const toCanvas = (x: number, y: number, z: number) => {
  const p = isoToScreen(x, y, z)
  return { x: config.origin.x + p.screenX, y: config.origin.y + p.screenY }
}

// Agents: the top-most Claude session — the nearest focal cube to the column,
// so the leader stays short and runs over open paper.
const agentTier = config.tiers[T_AGENTS].elevation + 5
const agentDot = overviewNodes.filter(n => n.tier === T_AGENTS && n.color === HARNESS_COLOR.claude)
  .map(n => toCanvas(n.x, n.y + n.depth, agentTier + n.height / 2))
  .reduce((a, b) => (b.y < a.y ? b : a))
// Projects: the plate's left corner. Runtime: the slab's left edge, mid-thickness.
const plateDot = toCanvas(0, FLOOR.depth, config.tiers[T_PROJECTS].elevation)
const slab = config.nodes[0]
const slabDot = toCanvas(slab.x, slab.y + slab.depth, 5 + slab.height / 2)

const count = (h: Agent['harness']) => PROJECTS.reduce((n, p) => n + p.agents.filter(a => a.harness === h).length, 0)
const key = [
  { c: PALETTE.codex, t: `Codex ${count('codex')}` },
  { c: PALETTE.claude, t: `Claude ${count('claude')}` },
  { c: PALETTE.pi, t: `Grok/Pi ${count('pi')}` },
]

let overlay = `<g font-family="${FONT}">`
overlay += `<text x="40" y="54" fill="${MATTE_INK}" font-size="28" font-weight="600">Agent fleet</text>`
overlay += `<text x="40" y="84" fill="${SECONDARY}" font-size="13" font-family='${MONO}' letter-spacing="0.06em">${agentCount} SESSIONS · ${PROJECTS.length} PROJECTS · ONE RUNTIME</text>`

const COLUMN_END = 300
const annotations = [
  { dot: agentDot, title: 'Agents', detail: 'one cube per live session' },
  { dot: plateDot, title: 'Projects', detail: `${PROJECTS.length} repo workspaces` },
  { dot: slabDot, title: 'Runtime', detail: 'shared message bus' },
]
for (const { dot, title, detail } of annotations) {
  overlay += `<line x1="${COLUMN_END}" y1="${dot.y}" x2="${dot.x - 6}" y2="${dot.y}" stroke="${LEADER}" stroke-width="0.8"/>`
  overlay += `<circle cx="${dot.x}" cy="${dot.y}" r="2.2" fill="${MATTE_INK}"/>`
  overlay += `<text x="40" y="${dot.y + 7}" fill="${MATTE_INK}" font-size="20" font-weight="600">${title}</text>`
  overlay += `<text x="40" y="${dot.y + 30}" fill="${SECONDARY}" font-size="12" font-family='${MONO}' letter-spacing="0.06em">${detail.toUpperCase()}</text>`
}
// The harness key sits under the layer it explains, drawn as the cubes are:
// face colour inside a 1px ink edge.
key.forEach((item, i) => {
  const x = 40 + i * 96, y = agentDot.y + 48
  overlay += `<rect x="${x + 0.5}" y="${y + 0.5}" width="11" height="11" rx="1.5" fill="${item.c}" stroke="${MATTE_INK}" stroke-width="1"/>`
  overlay += `<text x="${x + 18}" y="${y + 10.5}" fill="${MATTE_INK}" font-size="12" font-family='${MONO}'>${item.t}</text>`
})
overlay += '</g>'
svg = svg.replace('</svg>', `${overlay}</svg>`).replaceAll('#f6f7f9', PALETTE.paper)

const OUT = process.env.FLEET_OUT ?? 'public/agent-fleet.png'
writeFileSync('/tmp/agent-fleet.svg', svg)
// Flatten explicitly so the raster background remains correct in every host.
await sharp(Buffer.from(svg), { density: 144 })
  .flatten({ background: PALETTE.paper }).png().toFile(OUT)
console.log(`rendered ${agentCount} agents across ${PROJECTS.length} projects → ${OUT}`)
