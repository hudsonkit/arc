// Arc face · round 4 — plain face (F0, one ink) + one measuring/drafting instrument each,
// plus README-header lockups of the picks.
// Run: bun design/face-studies/round-4.ts [lockup ids…]   e.g. bun … I1 I3 I5
// Writes face-studies-4.svg and renders face-studies-4.svg.png through Chrome
// (the lockups need the embedded Space Grotesk, which Quick Look won't load).
import { readFileSync, writeFileSync } from 'node:fs'
import puppeteer from 'puppeteer'

const INK = '#3b2c1d', PAPER = '#ece3cc', MUTE = '#7a6650', RULE = '#d6c7a6', HEAD_INK = '#0d1726'
const here = (p: string) => new URL(p, import.meta.url).pathname
const picks = process.argv.slice(2).length ? process.argv.slice(2) : ['I1', 'I3', 'I5']

// F0: the face as picked. Spans x 3.5–28.5, y 7.5–20.5; the smile is the lower half of an
// ellipse centred (16, 13.5) with radii 9 × 7.
const face = `
<path d="M7 13.5A9 7 0 0 0 25 13.5" stroke-width="1.6"/>
<rect x="3.5" y="7.5" width="7" height="6" rx="1.5" stroke-width="1.4"/>
<rect x="21.5" y="7.5" width="7" height="6" rx="1.5" stroke-width="1.4"/>`

const CX = 16, CY = 13.5, RX = 9, RY = 7
const onArc = (deg: number) => { const t = deg * Math.PI / 180; return [CX + RX * Math.cos(t), CY + RY * Math.sin(t)] }
// Outward unit normal of the ellipse at that angle.
const normal = (deg: number) => {
  const t = deg * Math.PI / 180, nx = Math.cos(t) / RX, ny = Math.sin(t) / RY, l = Math.hypot(nx, ny)
  return [nx / l, ny / l]
}
const f = (n: number) => +n.toFixed(2)
// Text sits inside the stroked group, so it has to opt out of the stroke.
const label = (x: number, y: number, s: string, size = 2.4, anchor = 'middle') =>
  `<text x="${x}" y="${y}" font-family="Menlo, monospace" font-size="${size}" text-anchor="${anchor}" fill="${INK}" stroke="none">${s}</text>`

// Ticks along the smile: `out` > 0 draws outside the arc (a scale), < 0 inside (a protractor).
const arcTicks = (from: number, to: number, step: number, major: number, minorLen: number, majorLen: number, w: number, out: 1 | -1, gap = 1.05) => {
  let d = ''
  for (let a = from; a <= to + 1e-6; a += step) {
    const [x, y] = onArc(a), [nx, ny] = normal(a), len = Math.round(a) % major === 0 ? majorLen : minorLen
    const x0 = x + out * nx * gap, y0 = y + out * ny * gap
    d += `M${f(x0)} ${f(y0)}L${f(x0 + out * nx * len)} ${f(y0 + out * ny * len)}`
  }
  return `<path d="${d}" stroke-width="${w}"/>`
}

type V = [id: string, label: string, body: string]
const VS: V[] = [
  ['I1', 'Dimension line — the C7 underline, light, slash ends and a value',
    face + `<path d="M3.5 22.6V28.2M28.5 22.6V28.2" stroke-width="0.35"/>` +
    `<path d="M3.5 26.6H28.5" stroke-width="0.45"/><path d="M2.7 27.4L4.3 25.8M27.7 27.4L29.3 25.8" stroke-width="0.55"/>` +
    label(16, 25.4, '25.0')],
  ['I2', 'Scale — graduations along the outside of the smile',
    face + arcTicks(10, 170, 10, 30, 0.9, 1.7, 0.4, 1)],
  ['I3', 'Protractor — degree ticks inside the arc, a straight edge across',
    face + arcTicks(10, 170, 10, 30, 0.8, 1.5, 0.4, -1) + `<path d="M10.5 13.5H21.5" stroke-width="0.4"/>` +
    `<path d="M16 12.4V14.6" stroke-width="0.4"/>`],
  ['I4', 'Radius callout — centre mark, a radius to the smile, labelled R9',
    face + `<path d="M14.8 13.5H17.2M16 12.3V14.7" stroke-width="0.4"/>` +
    (() => { const [x, y] = onArc(55); const [nx, ny] = normal(55); return `<path d="M16 13.5L${f(x)} ${f(y)}" stroke-width="0.45"/><path d="M${f(x)} ${f(y)}L${f(x + nx * 3)} ${f(y + ny * 3)}H${f(x + nx * 3 + 2.6)}" stroke-width="0.4"/>` + label(f(x + nx * 3 + 0.3), f(y + ny * 3 - 0.6), 'R9', 2.4, 'start') })()],
  ['I5', 'Caliper — beam above, jaws closing on the outside of both eyes',
    face + `<path d="M2.4 4.2H29.6" stroke-width="0.6"/><path d="M2.4 4.2V10.6M29.6 4.2V10.6" stroke-width="0.6"/>` +
    `<path d="${Array.from({ length: 13 }, (_, i) => `M${f(4 + i * 2)} 4.2V${i % 5 === 0 ? 2.6 : 3.3}`).join('')}" stroke-width="0.3"/>`],
  ['I6', 'Scale bar — alternating blocks under the face, like a map',
    face + [0, 1, 2, 3].map(i => `<rect x="${8 + i * 4}" y="24.4" width="4" height="1.3" stroke-width="0.4" ${i % 2 ? '' : `fill="${INK}"`}/>`).join('') +
    label(8, 28.6, '0', 1.9) + label(24, 28.6, '4', 1.9)],
  ['I7', 'Vernier — a main scale and a sliding scale meeting under the smile',
    face + `<path d="M6 24.6H26" stroke-width="0.4"/>` +
    `<path d="${Array.from({ length: 11 }, (_, i) => `M${6 + i * 2} 24.6V${i % 5 === 0 ? 22.6 : 23.4}`).join('')}" stroke-width="0.35"/>` +
    `<path d="${Array.from({ length: 11 }, (_, i) => `M${f(7 + i * 1.8)} 24.6V${i % 5 === 0 ? 26.6 : 25.8}`).join('')}" stroke-width="0.35"/>`],
  ['I8', 'Spirit level — a vial under the face, bubble centred between the marks',
    face + `<rect x="9" y="23.2" width="14" height="3.4" rx="1.7" stroke-width="0.5"/>` +
    `<path d="M14 23.2V26.6M18 23.2V26.6" stroke-width="0.35"/><ellipse cx="16" cy="24.9" rx="1.4" ry="0.85" stroke-width="0.45"/>`],
  ['I9', 'Plumb line — a bob hanging true between the eyes',
    face + `<path d="M16 1V9.4" stroke-width="0.4"/><path d="M14.9 9.4H17.1L16 12.2Z" stroke-width="0.5" stroke-linejoin="round"/>`],
  ['I10', 'Dividers — a hinge above, points set on the two eyes',
    face + `<path d="M16 3L8.2 7.5M16 3L23.8 7.5" stroke-width="0.5"/><circle cx="16" cy="2.5" r="0.9" stroke-width="0.45"/>`],
]

const draw = (body: string, x: number, y: number, size: number, kk?: number, ink = INK) => {
  const k = kk ?? (size > 100 ? 0.45 : 1) // hairline at display size, full weight at icon sizes
  const b = body.replace(/stroke-width="([0-9.]+)"/g, (_m, w) => `stroke-width="${(+w * k).toFixed(2)}"`).replaceAll(INK, ink)
  return `<g transform="translate(${x} ${y}) scale(${size / 32})" fill="none" stroke="${ink}">${b}</g>`
}
const text = (x: number, y: number, s: string) =>
  `<text x="${x}" y="${y}" font-family="Helvetica, sans-serif" font-size="12.5" fill="${MUTE}">${s}</text>`
const mono = (x: number, y: number, s: string, size = 13, o = '') =>
  `<text x="${x}" y="${y}" font-family="Menlo, monospace" font-size="${size}" ${o.includes('fill=') ? '' : `fill="${INK}"`} ${o}>${s}</text>`

const COLS = 4, CW = 300, CH = 330, PAD = 24
const rows = Math.ceil(VS.length / COLS)
const LOCK_H = 350 * 0.5 + 16
const W = COLS * CW + PAD * 2
const LY = PAD + 56 + rows * CH + 10
const H = LY + 44 + picks.length * LOCK_H + PAD
let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<style>
  @font-face { font-family: "Space Grotesk"; font-weight: 500; src: url(data:font/ttf;base64,${readFileSync(here('../../scripts/assets/space-grotesk/SpaceGrotesk-Medium.ttf')).toString('base64')}) format("truetype"); }
  .sg { font-family: "Space Grotesk", sans-serif; font-weight: 500; }
</style>
<rect width="100%" height="100%" fill="${PAPER}"/>
${mono(PAD, PAD + 22, 'ARC FACE · ROUND 4 · PLAIN FACE + ONE MEASURING INSTRUMENT  (big · 32px · 16px)', 15, 'letter-spacing="1.2"')}`

VS.forEach(([id, lab, body], i) => {
  const cx = PAD + (i % COLS) * CW, cy = PAD + 56 + Math.floor(i / COLS) * CH
  s += `<rect x="${cx + 6}" y="${cy}" width="${CW - 12}" height="${CH - 14}" fill="none" stroke="${RULE}"/>`
  s += draw(body, cx + 30, cy + 4, 240)
  s += draw(body, cx + 30, cy + 236, 32) + draw(body, cx + 82, cy + 244, 16)
  s += mono(cx + 120, cy + 256, id, 13, 'font-weight="bold"')
  let line = '', ly = cy + 286
  for (const w of lab.split(' ')) {
    if ((line + ' ' + w).length > 38) { s += text(cx + 18, ly, line.trim()); ly += 16; line = '' }
    line += ' ' + w
  }
  s += text(cx + 18, ly, line.trim())
})

// Lockups in the README header layout (scripts/generate-readme-art.ts), at half size.
s += mono(PAD + 6, LY + 24, `LOCKUPS · README HEADER LAYOUT AT 50% · ${picks.join(' · ')}`, 12, `fill="${MUTE}" letter-spacing="1"`)
picks.forEach((id, i) => {
  const v = VS.find(x => x[0] === id)
  if (!v) throw new Error(`unknown study ${id}`)
  const y = LY + 40 + i * LOCK_H, x = PAD + 6 + (W - PAD * 2 - 12 - 600) / 2
  s += `<g transform="translate(${x} ${y}) scale(0.5)">
    <rect width="1200" height="350" fill="#fbfaf8"/>
    ${draw(v[2], 366, 67, 160, 1, HEAD_INK)}
    <text class="sg" x="550" y="187" font-size="156" letter-spacing="-4" fill="${HEAD_INK}">Arc</text>
    <text class="sg" x="600" y="281" text-anchor="middle" font-size="45" letter-spacing="-1" fill="${HEAD_INK}">Ideas into drawings.</text>
  </g>`
  s += mono(x - 40, y + 24, id, 12, 'font-weight="bold"')
})
s += '</svg>'

writeFileSync(here('./face-studies-4.svg'), s)
const chromePath = process.env.ARC_CHROME || process.env.CHROME_PATH
const browser = await puppeteer.launch({ headless: true, ...(chromePath ? { executablePath: chromePath } : { channel: 'chrome' }) })
try {
  const page = await browser.newPage()
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1.5 })
  await page.setContent(`<style>body{margin:0}svg{display:block}</style>${s}`)
  await page.evaluate(async () => { await document.fonts.ready })
  await page.screenshot({ path: here('./face-studies-4.svg.png') })
} finally {
  await browser.close()
}
console.log(`Wrote design/face-studies/face-studies-4.svg(.png) with lockups ${picks.join(', ')}`)
