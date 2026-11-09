// README header lockup with H4 at several line weights, stacked for comparison.
// Run: bun design/face-studies/h4-thinner-compare.ts
// Geometry and layout match scripts/generate-readme-art.ts; only stroke weights vary.
import { readFileSync } from 'node:fs'
import puppeteer from 'puppeteer'

const font = readFileSync(new URL('../../scripts/assets/space-grotesk/SpaceGrotesk-Medium.ttf', import.meta.url)).toString('base64')
const INK = '#0d1726'

type Row = { id: string; label: string; smile: number; boxes: number; ticks: number }
const rows: Row[] = [
  { id: 'A', label: 'current H4', smile: 1.6, boxes: 1.4, ticks: 0.55 },
  { id: 'B1', label: 'ticks thinner', smile: 1.6, boxes: 1.4, ticks: 0.4 },
  { id: 'B2', label: 'ticks thinner still', smile: 1.6, boxes: 1.4, ticks: 0.3 },
  { id: 'C1', label: 'whole mark thinner', smile: 1.3, boxes: 1.15, ticks: 0.45 },
  { id: 'C2', label: 'whole mark, one step lighter', smile: 1.05, boxes: 0.95, ticks: 0.35 },
]

const mark = (r: Row) => `<svg x="366" y="67" width="160" height="160" viewBox="0 0 32 32" fill="none">
  <path d="M1.25 6.5V4.5H3.25M28.75 23.5H30.75V21.5" stroke="${INK}" stroke-width="${r.ticks}" stroke-linecap="square"/>
  <path d="M7 13.5A9 7 0 0 0 25 13.5" stroke="${INK}" stroke-width="${r.smile}"/>
  <rect x="3.5" y="7.5" width="7" height="6" rx="1.5" stroke="${INK}" stroke-width="${r.boxes}"/>
  <circle cx="8.4" cy="9.9" r="1" fill="${INK}"/>
  <rect x="21.5" y="7.5" width="7" height="6" rx="1.5" stroke="${INK}" stroke-width="${r.boxes}"/>
  <circle cx="26.4" cy="9.9" r="1" fill="${INK}"/>
</svg>`

const ROW_H = 350, W = 1200
const H = rows.length * ROW_H
const body = rows.map((r, i) => `<g transform="translate(0 ${i * ROW_H})">
  <rect width="${W}" height="${ROW_H}" fill="#fbfaf8"/>
  ${i ? `<line x1="0" y1="0.5" x2="${W}" y2="0.5" stroke="#d9d4ca"/>` : ''}
  <text x="28" y="40" font-family="Menlo, monospace" font-size="17" fill="#3b2c1d" style="font-family:Menlo,monospace;font-weight:700">${r.id}</text>
  <text x="70" y="40" font-family="Menlo, monospace" font-size="15" fill="#7a6650" style="font-family:Menlo,monospace;font-weight:400">${r.label} · smile ${r.smile} · boxes ${r.boxes} · ticks ${r.ticks}</text>
  ${mark(r)}
  <text x="550" y="187" font-size="156" letter-spacing="-4" fill="${INK}">Arc</text>
  <text x="600" y="281" text-anchor="middle" font-size="45" letter-spacing="-1" fill="${INK}">Ideas into drawings.</text>
</g>`).join('\n')

const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <style>
    @font-face { font-family: "Space Grotesk"; font-weight: 500; src: url(data:font/ttf;base64,${font}) format("truetype"); }
    text { font-family: "Space Grotesk", sans-serif; font-weight: 500; }
  </style>
  ${body}
</svg>`

const chromePath = process.env.ARC_CHROME || process.env.CHROME_PATH
const browser = await puppeteer.launch({ headless: true, ...(chromePath ? { executablePath: chromePath } : { channel: 'chrome' }) })
try {
  const page = await browser.newPage()
  // Same device scale as the README header render, so weights read as they will there.
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 2 })
  await page.setContent(`<style>body{margin:0}svg{display:block}</style>${sheet}`)
  await page.evaluate(async () => { await document.fonts.ready })
  await page.screenshot({ path: new URL('./h4-thinner-compare.png', import.meta.url).pathname })
} finally {
  await browser.close()
}
console.log('Wrote design/face-studies/h4-thinner-compare.png')
