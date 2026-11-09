// Arc face · round 2 — 12 more small additions, one ink.
// Run: bun design/face-studies/round-2.ts design/face-studies/face-studies-2.svg
const INK = '#3b2c1d', PAPER = '#ece3cc', MUTE = '#7a6650'
const out = process.argv[2]
const base = () => `
<path d="M7 13.5A9 7 0 0 0 25 13.5" stroke-width="1.6"/>
<rect x="3.5" y="7.5" width="7" height="6" rx="1.5" stroke-width="1.4"/>
<rect x="21.5" y="7.5" width="7" height="6" rx="1.5" stroke-width="1.4"/>`
const dot = (x: number, y: number, r = 1) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${INK}" stroke="none"/>`
const arc = '<path d="M7 13.5A9 7 0 0 0 25 13.5" stroke-width="1.6"/>'
const notchRect = (x: number) => `<path d="M${x + 1.5} 7.5H${x + 5} L${x + 7} 9.5V12A1.5 1.5 0 0 1 ${x + 5.5} 13.5H${x + 1.5}A1.5 1.5 0 0 1 ${x} 12V9A1.5 1.5 0 0 1 ${x + 1.5} 7.5Z" stroke-width="1.4"/>`
const chamfer = (x: number) => `<path d="M${x + 1.5} 7.5H${x + 5.5}L${x + 7} 9V12L${x + 5.5} 13.5H${x + 1.5}L${x} 12V9Z" stroke-width="1.4"/>`
const V: [string, string, string][] = [
  ['G1', 'F2 + F3 — glance and anchor dots together', base() + dot(8.4, 9.9) + dot(26.4, 9.9) + dot(7, 13.5, 1.15) + dot(25, 13.5, 1.15)],
  ['G2', 'Eyes on each other — pupils turned inward, the two nodes connected', base() + dot(8.6, 10.6) + dot(23.4, 10.6)],
  ['G3', 'Cheeks — three hairline hatch strokes outside each eye', base() + [0, 1.3, 2.6].map(d => `<line x1="${0.4 + d}" y1="18" x2="${1.6 + d}" y2="16" stroke-width="0.6"/><line x1="${28.4 + d}" y1="18" x2="${29.6 + d}" y2="16" stroke-width="0.6"/>`).join('')],
  ['G4', 'Label tick — a small mark at the bottom of the smile', base() + `<line x1="16" y1="19" x2="16" y2="22.5" stroke-width="0.9"/>`],
  ['G5', 'Connector label — a tiny pill riding the smile', base() + `<rect x="13" y="18.9" width="6" height="3.2" rx="1.6" fill="${PAPER}" stroke-width="1"/>`],
  ['G6', 'Brows — short ruler ticks above each eye', base() + `<line x1="4.5" y1="5.2" x2="9.5" y2="5.2" stroke-width="0.9"/><line x1="22.5" y1="4.6" x2="27.5" y2="5.4" stroke-width="0.9"/>`],
  ['G7', 'Notched eyes — the tactical node shape', arc + notchRect(3.5) + notchRect(21.5)],
  ['G8', 'Chamfered eyes — the command node shape', arc + chamfer(3.5) + chamfer(21.5)],
  ['G9', 'Callout — leader to a hollow circle (echoes board C5)', base() + `<path d="M21.6 19 L26.5 23.5 H28.5" stroke-width="0.7"/><circle cx="30" cy="23.5" r="1.4" stroke-width="0.8"/>`],
  ['G10', 'Centre mark — the compass point the smile was drawn from', base() + `<line x1="14.2" y1="13.5" x2="17.8" y2="13.5" stroke-width="0.6"/><line x1="16" y1="11.7" x2="16" y2="15.3" stroke-width="0.6"/>`],
  ['G11', 'Echo line — a hairline parallel under the smile', base() + `<path d="M5.4 15 A10.6 8.4 0 0 0 26.6 15" stroke-width="0.6"/>`],
  ['G12', 'Lockup — glance, anchors and the dimension underline', base() + dot(8.4, 9.9) + dot(26.4, 9.9) + dot(7, 13.5, 1.15) + dot(25, 13.5, 1.15) + `<line x1="3.5" y1="23.5" x2="3.5" y2="27.5" stroke-width="0.6"/><line x1="28.5" y1="23.5" x2="28.5" y2="27.5" stroke-width="0.6"/><line x1="3.5" y1="25.5" x2="28.5" y2="25.5" stroke-width="0.8"/><line x1="2.5" y1="26.5" x2="4.5" y2="24.5" stroke-width="0.8"/><line x1="27.5" y1="26.5" x2="29.5" y2="24.5" stroke-width="0.8"/>`],
]
const COLS = 4, CW = 300, CH = 330, PAD = 24
const rows = Math.ceil(V.length / COLS)
const W = COLS * CW + PAD * 2, H = Math.max(W, rows * CH + PAD * 2 + 60)
let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="100%" height="100%" fill="${PAPER}"/>
<text x="${PAD}" y="${PAD + 22}" font-family="Menlo, monospace" font-size="15" letter-spacing="1.5" fill="${INK}">ARC FACE · ONE INK · ROUND 2 · 12 MORE ADDITIONS  (big · 32px · 16px)</text>`
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
