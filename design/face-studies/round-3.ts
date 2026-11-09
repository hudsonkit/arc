// Arc face · round 3 — F2 (glance) + registration ticks, plus a C7 lockup preview.
// Run: bun design/face-studies/round-3.ts design/face-studies/face-studies-3.svg design/face-studies/c7-wordmark.png
import { readFileSync } from 'node:fs'
const INK = '#3b2c1d', PAPER = '#ece3cc', MUTE = '#7a6650', RULE = '#d6c7a6'
const [out, wordmarkPath] = process.argv.slice(2)
const wordmark = readFileSync(wordmarkPath).toString('base64')

type Ticks = { box: [number, number, number, number]; len: number; w: number; corners: 'four' | 'diag' }
type Pupil = { dx: number; dy: number; r: number } // offset from each eye's centre (7,10.5)/(25,10.5)

const face = (p: Pupil) => `
<path d="M7 13.5A9 7 0 0 0 25 13.5" stroke-width="1.6"/>
<rect x="3.5" y="7.5" width="7" height="6" rx="1.5" stroke-width="1.4"/>
<rect x="21.5" y="7.5" width="7" height="6" rx="1.5" stroke-width="1.4"/>
<circle cx="${7 + p.dx}" cy="${10.5 + p.dy}" r="${p.r}" fill="${INK}" stroke="none"/>
<circle cx="${25 + p.dx}" cy="${10.5 + p.dy}" r="${p.r}" fill="${INK}" stroke="none"/>`

const ticks = (t: Ticks) => {
  const [x0, y0, x1, y1] = t.box, L = t.len
  const tl = `M${x0} ${y0 + L}V${y0}H${x0 + L}`
  const tr = `M${x1 - L} ${y0}H${x1}V${y0 + L}`
  const bl = `M${x0} ${y1 - L}V${y1}H${x0 + L}`
  const br = `M${x1 - L} ${y1}H${x1}V${y1 - L}`
  const d = t.corners === 'four' ? [tl, tr, bl, br] : [tl, br]
  return `<path d="${d.join('')}" stroke-width="${t.w}" stroke-linecap="square"/>`
}

const F2: Pupil = { dx: 1.4, dy: -0.6, r: 1 }
// Face spans x 3.5–28.5, y 7.5–20.5 (centre y 14); boxes are centred on it.
const F7: Ticks = { box: [1, 4, 31, 24], len: 2.5, w: 0.8, corners: 'four' }
const tight = (len: number, w: number, corners: Ticks['corners'] = 'four'): Ticks => ({ box: [2, 6, 30, 22], len, w, corners })
const mid = (len: number, w: number, corners: Ticks['corners'] = 'four'): Ticks => ({ box: [1.25, 4.5, 30.75, 23.5], len, w, corners })
const roomy = (len: number, w: number, corners: Ticks['corners'] = 'four'): Ticks => ({ box: [0.5, 2.5, 31.5, 25.5], len, w, corners })

type V = { id: string; label: string; pupil: Pupil; ticks: Ticks }
const VS: V[] = [
  { id: 'H1', label: 'Reference — F2 pupils + F7 ticks as drawn (0.8 wt, 2.5 long)', pupil: F2, ticks: F7 },
  { id: 'H2', label: 'Thin + short, tight — ticks hug the face', pupil: F2, ticks: tight(1.6, 0.5) },
  { id: 'H3', label: 'Thin + short, roomy — more air, reads as a frame', pupil: F2, ticks: roomy(1.6, 0.5) },
  { id: 'H4', label: 'Two corners (TL + BR), thin, mid distance', pupil: F2, ticks: mid(2, 0.55, 'diag') },
  { id: 'H5', label: 'Two corners, roomy and longer arms', pupil: F2, ticks: roomy(2.6, 0.5, 'diag') },
  { id: 'H6', label: 'Hairline + very short, tight — the quietest frame', pupil: F2, ticks: tight(1.1, 0.4) },
  { id: 'H7', label: 'Smaller pupils tucked further into the corner + H2 ticks', pupil: { dx: 1.7, dy: -0.9, r: 0.75 }, ticks: tight(1.6, 0.5) },
  { id: 'H8', label: 'Larger pupils, gentler glance + H4 two-corner ticks', pupil: { dx: 1.1, dy: -0.4, r: 1.25 }, ticks: mid(2, 0.55, 'diag') },
]

// Display sizes draw hairline; icon sizes keep full weight so they survive rasterising.
const draw = (body: string, x: number, y: number, size: number, kk?: number) => {
  const k = kk ?? (size > 100 ? 0.45 : 1)
  const b = body.replace(/stroke-width="([0-9.]+)"/g, (_m, w) => `stroke-width="${(+w * k).toFixed(2)}"`)
  return `<g transform="translate(${x} ${y}) scale(${size / 32})" fill="none" stroke="${INK}">${b}</g>`
}
const text = (x: number, y: number, s: string, o = '') =>
  `<text x="${x}" y="${y}" font-family="Helvetica, sans-serif" font-size="12.5" fill="${MUTE}" ${o}>${s}</text>`
const mono = (x: number, y: number, s: string, size = 13, o = '') =>
  `<text x="${x}" y="${y}" font-family="Menlo, monospace" font-size="${size}" ${o.includes('fill=') ? '' : `fill="${INK}"`} ${o}>${s}</text>`

const COLS = 4, CW = 300, CH = 340, PAD = 24
const W = COLS * CW + PAD * 2, H = W
let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="100%" height="100%" fill="${PAPER}"/>
${mono(PAD, PAD + 22, 'ARC FACE · ROUND 3 · F2 GLANCE + REGISTRATION TICKS  (big · 32px · 16px · 16px without ticks)', 15, 'letter-spacing="1.2"')}`

VS.forEach((v, i) => {
  const cx = PAD + (i % COLS) * CW, cy = PAD + 56 + Math.floor(i / COLS) * CH
  const withTicks = face(v.pupil) + ticks(v.ticks), bare = face(v.pupil)
  s += `<rect x="${cx + 6}" y="${cy}" width="${CW - 12}" height="${CH - 14}" fill="none" stroke="${RULE}"/>`
  s += draw(withTicks, cx + 30, cy + 6, 240)
  s += draw(withTicks, cx + 24, cy + 232, 32) + draw(withTicks, cx + 72, cy + 240, 16) + draw(bare, cx + 106, cy + 240, 16)
  s += mono(cx + 150, cy + 252, v.id, 13, 'font-weight="bold"')
  s += `<text x="${cx + 72}" y="${cy + 270}" font-family="Menlo, monospace" font-size="8" fill="${MUTE}">ticks</text>`
  s += `<text x="${cx + 102}" y="${cy + 270}" font-family="Menlo, monospace" font-size="8" fill="${MUTE}">none</text>`
  let line = '', ly = cy + 292
  for (const w of v.label.split(' ')) {
    if ((line + ' ' + w).length > 40) { s += text(cx + 18, ly, line.trim()); ly += 16; line = '' }
    line += ' ' + w
  }
  s += text(cx + 18, ly, line.trim())
})

// Lockup preview: the C7 "Survey Lettering" wordmark (Oswald 300 + dimension underline),
// lifted from Codex's render with the grid knocked out. Wordmark not confirmed (C7 vs A7).
const LY = PAD + 56 + 2 * CH + 10
s += `<rect x="${PAD + 6}" y="${LY}" width="${W - PAD * 2 - 12}" height="${H - LY - PAD}" fill="none" stroke="${RULE}"/>`
s += mono(PAD + 22, LY + 26, 'LOCKUP PREVIEW · C7 SURVEY LETTERING (wordmark not confirmed — C7 vs A7)', 12, `fill="${MUTE}" letter-spacing="1"`)
const lockup = (v: V, x: number, y: number) => {
  // Face sized so its eyes sit at the wordmark's mid-cap, as on the board.
  const size = 150
  return draw(face(v.pupil) + ticks(v.ticks), x, y, size, 0.75) +
    `<image x="${x + size + 14}" y="${y + 2}" width="${400 * 0.72}" height="${215 * 0.72}" href="data:image/png;base64,${wordmark}"/>` +
    mono(x, y + size + 22, v.id, 12, 'font-weight="bold"')
}
s += lockup(VS[1], PAD + 40, LY + 50)
s += lockup(VS[3], PAD + 40 + (W - PAD * 2) / 2, LY + 50)
s += '</svg>'
await Bun.write(out, s)
