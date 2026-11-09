/**
 * Regenerate the README's Mermaid still: the cache-miss sequence, not the
 * examples library around it.
 *
 *   bun scripts/generate-readme-mermaid-poster.ts
 *
 * Needs the dev server (http://localhost:5188, or ARC_DEV_URL).
 */
import puppeteer from 'puppeteer'
import sharp from 'sharp'

const DEV_URL = process.env.ARC_DEV_URL ?? 'http://localhost:5188'
const FRAME_WIDTH = 880
const SCALE = 2
const OUT = new URL('../public/arc-mermaid-demo-poster.jpg', import.meta.url).pathname

const chromePath = process.env.ARC_CHROME || process.env.CHROME_PATH
const browser = await puppeteer.launch({
  headless: true,
  ...(chromePath ? { executablePath: chromePath } : { channel: 'chrome' }),
})

try {
  const page = await browser.newPage()
  await page.setViewport({ width: FRAME_WIDTH, height: 900, deviceScaleFactor: SCALE })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto(`${DEV_URL}/blank-mermaid-poster`, { waitUntil: 'networkidle0' })
  await page.evaluate(() => {
    document.getElementById('root')?.remove()
    const style = document.createElement('style')
    style.textContent = `
      html, body { margin: 0; background: #f4f1ea; }
      [data-arc-mermaid-player] {
        border: 0 !important;
        border-radius: 0 !important;
        background: transparent !important;
        box-shadow: none !important;
      }
      [data-arc-mermaid-player] > div { background: transparent !important; padding: 28px 32px 36px !important; }
    `
    document.head.append(style)
    const host = document.createElement('div')
    host.id = 'readme-mermaid'
    document.body.append(host)
  })

  // Player padding is 32px a side once the capture stylesheet lands.
  const sequenceWidth = FRAME_WIDTH - 64
  await page.evaluate(async (width) => {
    const harness = await import(/* @vite-ignore */ '/scripts/readme-mermaid-poster.harness.tsx')
    harness.mount(document.getElementById('readme-mermaid')!, width)
    await document.fonts.ready
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  }, sequenceWidth)
  if (errors.length) throw new Error(errors.join('\n'))

  const player = await page.waitForSelector('[data-arc-mermaid-player]')
  if (!player) throw new Error('Sequence player did not render')
  const png = await player.screenshot({ type: 'png', omitBackground: false }) as Uint8Array
  await sharp(png).jpeg({ quality: 90, mozjpeg: true }).toFile(OUT)
  const box = await player.boundingBox()
  console.log(`Wrote ${OUT} (${Math.round((box?.width ?? 0) * SCALE)}x${Math.round((box?.height ?? 0) * SCALE)})`)
} finally {
  await browser.close()
}
