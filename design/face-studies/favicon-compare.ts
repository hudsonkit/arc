// Render public/arc-mark.svg at 16px and 32px, with and without the registration ticks,
// the way Chrome rasterises a favicon, then lay them out side by side.
// Run: bun design/face-studies/favicon-compare.ts
import { readFileSync } from 'node:fs'
import puppeteer from 'puppeteer'
import sharp from 'sharp'

const here = (p: string) => new URL(p, import.meta.url).pathname
const withTicks = readFileSync(here('../../public/arc-mark.svg'), 'utf8')
const noTicks = withTicks.replace(/\s*<path d="M1\.25 6\.5[^>]*\/>/, '')
if (noTicks === withTicks) throw new Error('tick path not found in arc-mark.svg')

const uri = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
const chromePath = process.env.ARC_CHROME || process.env.CHROME_PATH
const browser = await puppeteer.launch({ headless: true, ...(chromePath ? { executablePath: chromePath } : { channel: 'chrome' }) })

// Rasterise one icon at true pixel size (DPR 1), as a tab strip would.
const raster = async (svg: string, size: number) => {
  const page = await browser.newPage()
  await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 })
  await page.setContent(`<style>html,body{margin:0;background:transparent}img{display:block}</style><img src="${uri(svg)}" width="${size}" height="${size}">`)
  await page.evaluate(async () => { await document.querySelector('img')!.decode() })
  const png = await page.screenshot({ omitBackground: true, type: 'png' })
  await page.close()
  return Buffer.from(png)
}

const ZOOM = 8, GAP = 48, PAD = 40, LABEL = 70
const cells: { title: string; png: Buffer; size: number }[] = []
for (const size of [16, 32]) {
  cells.push({ title: `${size}px · ticks (H4, current)`, png: await raster(withTicks, size), size })
  cells.push({ title: `${size}px · no ticks`, png: await raster(noTicks, size), size })
}
await browser.close()

// Each cell: the icon blown up 8× with nearest-neighbour (to read pixels), plus actual size beside it.
const cellW = 32 * ZOOM + 24 + 32, cellH = 32 * ZOOM
const W = PAD * 2 + cells.length * cellW + (cells.length - 1) * GAP
const H = PAD * 2 + LABEL + cellH + 30
const layers: sharp.OverlayOptions[] = []
let svgText = ''
for (const [i, c] of cells.entries()) {
  const x = PAD + i * (cellW + GAP), y = PAD + LABEL
  const big = await sharp(c.png).resize(c.size * ZOOM, c.size * ZOOM, { kernel: 'nearest' }).png().toBuffer()
  layers.push({ input: big, left: x, top: y + (cellH - c.size * ZOOM) })
  layers.push({ input: c.png, left: x + 32 * ZOOM + 24, top: y + cellH - c.size })
  svgText += `<text x="${x}" y="${PAD + 30}" font-family="Menlo, monospace" font-size="18" fill="#3b2c1d">${c.title}</text>`
  svgText += `<text x="${x + 32 * ZOOM + 24}" y="${y + cellH + 24}" font-family="Menlo, monospace" font-size="11" fill="#7a6650">1×</text>`
}
svgText += `<text x="${PAD}" y="${H - 14}" font-family="Menlo, monospace" font-size="13" fill="#7a6650">Rendered by Chrome at device scale 1, enlarged ${ZOOM}× nearest-neighbour; the small copy beside each is actual size.</text>`
const bg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#ece3cc"/>${svgText}</svg>`
await sharp(Buffer.from(bg)).composite(layers).png().toFile(here('./favicon-ticks-compare.png'))
console.log('Wrote design/face-studies/favicon-ticks-compare.png')
