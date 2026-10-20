/** Regenerate the README identity and its real Arc diagram: bun scripts/generate-readme-art.ts */
import { readFileSync, writeFileSync } from 'node:fs'
import puppeteer from 'puppeteer'
import sharp from 'sharp'
import { renderDiagramSvg } from './renderImage'
import { validateDiagram } from '../src/utils/diagramDiagnostics'
import type { ArcDiagramData } from '../src/types/diagram'

const mark = readFileSync(new URL('../public/arc-mark.svg', import.meta.url), 'utf8')
  .replace('<svg ', '<svg x="366" y="67" width="160" height="160" ')
  .replace(/<rect width="32"[^>]+\/>/, '')
  .replaceAll('#f3efe6', '#0d1726')
// Match the site's Space Grotesk and embed it so the SVG renders offline.
const font = readFileSync(new URL('./assets/space-grotesk/SpaceGrotesk-Medium.ttf', import.meta.url)).toString('base64')
const header = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="350" viewBox="0 0 1200 350" role="img" aria-labelledby="title desc">
  <title id="title">Arc — illustrations, made with agents.</title>
  <desc id="desc">Two hollow rounded rectangles form eyes above an upward-open smile beside the Arc wordmark. The right eye is orange.</desc>
  <style>
    @font-face {
      font-family: "Space Grotesk";
      font-weight: 500;
      src: url(data:font/ttf;base64,${font}) format("truetype");
    }
    text { font-family: "Space Grotesk", sans-serif; font-weight: 500; }
  </style>
  <rect width="1200" height="350" fill="#fbfaf8"/>
  ${mark}
  <text x="550" y="187" font-size="156" letter-spacing="-4" fill="#0d1726">Arc</text>
  <text x="600" y="281" text-anchor="middle" font-size="45" letter-spacing="-1" fill="#0d1726">Illustrations, made with agents.</text>
</svg>`.replace(/[ \t]+$/gm, '')
writeFileSync(new URL('../public/arc-readme-header.svg', import.meta.url), header)
const chromePath = process.env.ARC_CHROME || process.env.CHROME_PATH
const browser = await puppeteer.launch({
  headless: true,
  ...(chromePath ? { executablePath: chromePath } : { channel: 'chrome' }),
})
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1200, height: 350, deviceScaleFactor: 2 })
  await page.setContent(`<style>body{margin:0}svg{display:block}</style>${header}`)
  await page.evaluate(async () => { await document.fonts.ready })
  await page.screenshot({ path: new URL('../public/arc-readme-header.png', import.meta.url).pathname })
} finally {
  await browser.close()
}

const diagram: ArcDiagramData = JSON.parse(readFileSync(new URL('../skills/arc-diagrams/examples/request-path.arc.json', import.meta.url), 'utf8'))
const diagnostics = validateDiagram(diagram)
if (diagnostics.some(d => d.severity === 'error')) throw new Error(JSON.stringify(diagnostics))
const { svg } = renderDiagramSvg(diagram, { theme: 'workbench', mode: 'light', padding: 24 })
writeFileSync(new URL('../public/readme-request-path.svg', import.meta.url), svg)
await sharp(Buffer.from(svg), { density: 192 }).png().toFile(new URL('../public/readme-request-path.png', import.meta.url).pathname)
console.log('Rendered README header and request path from their editable sources.')
