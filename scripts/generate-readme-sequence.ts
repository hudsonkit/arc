/**
 * Regenerate public/readme-sequence.png from fixtures/mermaid/scout-interaction.sequence.mmd:
 *
 *   bun scripts/generate-readme-sequence.ts
 *
 * Needs the dev server (`bun run dev`, http://localhost:5188, or ARC_DEV_URL).
 *
 * The frame is laid out at FRAME_WIDTH CSS px and captured at 2x. GitHub shows
 * README images at most ~880px wide, so a frame narrower than that is displayed
 * slightly *enlarged*: the sequence's 10px labels land at ~11px. The sequence is
 * laid out at exactly the width its frame gives it and opens at 100%, so nothing
 * is shrunk to fit — the old capture laid out 1040px and zoomed to 82%, which put
 * labels at ~6.5px once the README scaled it down.
 */
import puppeteer from 'puppeteer'

const DEV_URL = process.env.ARC_DEV_URL ?? 'http://localhost:5188'
const FRAME_WIDTH = 800
const PAGE_PADDING = 0
const SCALE = 2
const OUT = new URL('../public/readme-sequence.png', import.meta.url).pathname

const chromePath = process.env.ARC_CHROME || process.env.CHROME_PATH
const browser = await puppeteer.launch({
  headless: true,
  ...(chromePath ? { executablePath: chromePath } : { channel: 'chrome' }),
})

try {
  const page = await browser.newPage()
  await page.setViewport({ width: FRAME_WIDTH + PAGE_PADDING * 2, height: 1200, deviceScaleFactor: SCALE })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  // index.html brings the site's fonts and base CSS; the app it mounts is set aside.
  await page.goto(`${DEV_URL}/blank-readme-sequence`, { waitUntil: 'networkidle0' })
  await page.evaluate(async (padding) => {
    document.getElementById('root')?.remove()
    document.body.style.margin = '0'
    document.body.style.padding = `${padding}px`
    document.body.style.background = '#ffffff'
    const host = document.createElement('div')
    host.id = 'readme-sequence'
    document.body.append(host)
  }, PAGE_PADDING)

  // Player padding: showcase 14px each side, player border 1px, scroll pad 10px.
  const sequenceWidth = FRAME_WIDTH - 2 * (1 + 14 + 1 + 10)
  await page.evaluate(async (width) => {
    const harness = await import(/* @vite-ignore */ '/scripts/readme-sequence.harness.tsx')
    harness.mount(document.getElementById('readme-sequence')!, width)
    await document.fonts.ready
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  }, sequenceWidth)
  if (errors.length) throw new Error(errors.join('\n'))

  const showcase = await page.waitForSelector('.arc-sequence-showcase')
  if (!showcase) throw new Error('Sequence showcase did not render')

  // Fail rather than ship a capture that silently scrolls or shrinks the drawing.
  const fit = await page.evaluate(() => {
    const svg = document.querySelector<SVGSVGElement>('[data-arc-mermaid-family="sequence"] svg')!
    const box = svg.getBoundingClientRect()
    const scroller = svg.closest('[data-arc-mermaid-player]')!.lastElementChild as HTMLElement
    return {
      rendered: box.width,
      viewBox: svg.viewBox.baseVal.width,
      overflowX: scroller.scrollWidth - scroller.clientWidth,
    }
  })
  if (Math.abs(fit.rendered - fit.viewBox) > 1 || fit.overflowX > 1) {
    throw new Error(`Sequence is not at 1:1 in its frame: ${JSON.stringify(fit)}`)
  }

  await showcase.screenshot({ path: OUT, omitBackground: false })
  const { width, height } = (await showcase.boundingBox())!
  console.log(`Wrote ${OUT} (${Math.round(width * SCALE)}x${Math.round(height * SCALE)}, sequence ${fit.viewBox}px at 1:1)`)
} finally {
  await browser.close()
}
