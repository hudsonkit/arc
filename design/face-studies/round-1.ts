// Arc face · round 1 — 12 small additions to the two-box face, one ink.
// Run: bun design/face-studies/round-1.ts design/face-studies/face-variations.svg
const INK = '#3b2c1d', PAPER = '#ece3cc', MUTE = '#7a6650'
const out = process.argv[2]
const base = (o: { right?: string; arcExtra?: string } = {}) => `
<path d="M7 13.5A9 7 0 0 0 25 13.5" stroke-width="1.6" ${o.arcExtra ?? ''}/>
<rect x="3.5" y="7.5" width="7" height="6" rx="1.5" stroke-width="1.4"/>
${o.right ?? '<rect x="21.5" y="7.5" width="7" height="6" rx="1.5" stroke-width="1.4"/>'}`
const dot = (x: number, y: number, r = 1) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${INK}" stroke="none"/>`
const hatch = (x0: number) => {
  let s = ''
  for (let i = -6; i < 10; i += 1.6) s += `<line x1="${x0 + i}" y1="13.5" x2="${x0 + i + 6 * 0.577}" y2="7.5" stroke-width="0.5"/>`
  return s
}
const V: [string, string, string][] = [
  ['F0', 'As picked', base()],
  ['F1', 'Pupils', base() + dot(7, 10.5) + dot(25, 10.5)],
  ['F2', 'Glance — pupils look up-right, the way a connector reads', base() + dot(8.4, 9.9) + dot(26.4, 9.9)],
  ['F3', 'Anchor dots where the curve meets each box', base() + dot(7, 13.5, 1.15) + dot(25, 13.5, 1.15)],
  ['F4', 'Arrowhead — the smile is a directed connector', base() + `<path d="M23.2 16.6 L25 14.3 L26.8 16.6" stroke-width="1.3" stroke-linejoin="miter"/>`],
  ['F5', 'Wink — right box closed to a lid', base({ right: '<line x1="21.5" y1="13.5" x2="28.5" y2="13.5" stroke-width="1.4" stroke-linecap="round"/><path d="M22 11.2 Q25 9.6 28 11.2" stroke-width="1.1"/>' })],
  ['F6', 'Dimension line — echoes the wordmark underline', base() + `<line x1="3.5" y1="23.5" x2="3.5" y2="27.5" stroke-width="0.6"/><line x1="28.5" y1="23.5" x2="28.5" y2="27.5" stroke-width="0.6"/><line x1="3.5" y1="25.5" x2="28.5" y2="25.5" stroke-width="0.8"/><line x1="2.5" y1="26.5" x2="4.5" y2="24.5" stroke-width="0.8"/><line x1="27.5" y1="26.5" x2="29.5" y2="24.5" stroke-width="0.8"/>`],
  ['F7', 'Registration ticks — the engineering node decor', base() + `<path d="M1 5.5V3h2.5M31 5.5V3h-2.5M1 20.5V23h2.5M31 20.5V23h-2.5" stroke-width="0.8"/>`],
  ['F8', 'Hatched eyes — the blueprint plate material', base() + `<clipPath id="L"><rect x="3.5" y="7.5" width="7" height="6" rx="1.5"/></clipPath><clipPath id="R"><rect x="21.5" y="7.5" width="7" height="6" rx="1.5"/></clipPath><g clip-path="url(#L)">${hatch(3.5)}</g><g clip-path="url(#R)">${hatch(21.5)}</g>`],
  ['F9', 'Isometric eyes — boxes given depth', base() + `<path d="M5 7.5 L6.6 5.9 H11.6 Q12.1 5.9 12.1 6.4 V10.8 L10.5 12.4" stroke-width="0.9" stroke-linejoin="round"/><path d="M23 7.5 L24.6 5.9 H29.6 Q30.1 5.9 30.1 6.4 V10.8 L28.5 12.4" stroke-width="0.9" stroke-linejoin="round"/>`],
  ['F10', 'Construction circle — dashed, drafting compass', base() + `<circle cx="16" cy="13.5" r="14" stroke-width="0.6" stroke-dasharray="1.4 1.2"/>${dot(16, 13.5, 0.5)}`],
  ['F11', 'Flow — dashed smile with a pulse (animatable)', base({ arcExtra: 'stroke-dasharray="2 1.4"' }) + dot(16, 20.5, 1.25)],
]
const COLS = 4, CW = 300, CH = 330, PAD = 24
const rows = Math.ceil(V.length / COLS)
const W = COLS * CW + PAD * 2, H = Math.max(W, rows * CH + PAD * 2 + 60)
let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="100%" height="100%" fill="${PAPER}"/>
<text x="${PAD}" y="${PAD + 22}" font-family="Menlo, monospace" font-size="15" letter-spacing="1.5" fill="${INK}">ARC FACE · ONE INK · 12 SMALL ADDITIONS  (big · 32px · 16px)</text>`
V.forEach(([id, label, body], i) => {
  const cx = PAD + (i % COLS) * CW, cy = PAD + 60 + Math.floor(i / COLS) * CH
  const g = (x: number, y: number, size: number) => {
    const k = size > 100 ? 0.45 : 1 // hairline at display size, full weight at icon sizes
    const b = body.replace(/stroke-width="([0-9.]+)"/g, (_m, w) => `stroke-width="${(+w * k).toFixed(2)}"`)
    return `<g transform="translate(${x} ${y}) scale(${size / 32})" fill="none" stroke="${INK}">${b}</g>`
  }
  s += `<rect x="${cx + 6}" y="${cy}" width="${CW - 12}" height="${CH - 16}" fill="none" stroke="#d6c7a6"/>`
  s += g(cx + 30, cy + 10, 240)
  s += g(cx + 30, cy + 236, 32) + g(cx + 82, cy + 244, 16)
  s += `<text x="${cx + 120}" y="${cy + 252}" font-family="Menlo, monospace" font-size="13" font-weight="bold" fill="${INK}">${id}</text>`
  const words = label.split(' '); let line = '', ly = cy + 282
  for (const w of words) { if ((line + ' ' + w).length > 36) { s += `<text x="${cx + 18}" y="${ly}" font-family="Helvetica, sans-serif" font-size="12.5" fill="${MUTE}">${line.trim()}</text>`; ly += 16; line = '' } line += ' ' + w }
  s += `<text x="${cx + 18}" y="${ly}" font-family="Helvetica, sans-serif" font-size="12.5" fill="${MUTE}">${line.trim()}</text>`
})
s += '</svg>'
await Bun.write(out, s)
