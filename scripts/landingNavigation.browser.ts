/** Run against `bun dev`, or set ARC_TEST_URL to a production preview. */
import assert from 'node:assert/strict'
import puppeteer from 'puppeteer'
import { findChrome } from './renderImage'

const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true })
try {
  const page = await browser.newPage()
  const errors: string[] = []
  page.on('pageerror', error => errors.push(String(error)))
  page.on('console', message => {
    if (message.text().includes('Maximum update depth')) errors.push(message.text())
  })
  const base = process.env.ARC_TEST_URL || 'http://localhost:5188'
  await page.setViewport({ width: 1440, height: 1000 })
  await page.goto(base, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.tl-plate-mount [data-arc-node-title]')
  assert.equal(await page.$eval('.tl-root', el => el.getAttribute('data-mode')), 'light')
  for (const mode of ['light', 'dark']) {
    const contrast = await page.$eval('.tl-plate-mount', mount => {
      const rgb = (color: string) => color.match(/[\d.]+/g)!.slice(0, 3).map(Number)
      const luminance = (color: number[]) => color.map(v => {
        const c = v / 255
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
      }).reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0)
      const node = mount.querySelector('[data-arc-node]')!
      const bg = rgb(getComputedStyle(node).backgroundColor)
      return ['[data-arc-node-title]', '[data-arc-node-subtitle]'].map(selector => {
        const style = getComputedStyle(node.querySelector(selector)!)
        const opacity = Number(style.opacity)
        const foreground = rgb(style.color).map((c, i) => c * opacity + bg[i] * (1 - opacity))
        const a = luminance(foreground), b = luminance(bg)
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
      })
    })
    assert.ok(contrast.every(ratio => ratio >= 4.5), `Hero text contrast: ${contrast}`)
    if (mode === 'light') {
      await page.click('.tl-mode-toggle')
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.waitForSelector('.tl-root[data-mode="dark"] .tl-plate-mount [data-arc-node-title]')
    }
  }
  await page.click('.tl-mode-toggle')
  await page.waitForSelector('.tl-root[data-mode="light"]')
  await page.click('#tl-plate-tab-source')
  await page.waitForSelector('.tl-plate-source')
  const source = await page.$eval('.tl-plate-source', el => JSON.parse(el.textContent!))
  assert.equal(source.flows.length, 2)
  await page.click('#tl-plate-tab-render')
  await page.waitForSelector('.tl-plate-mount [data-arc-node]')
  const canvas = '.tl-diagram-mount [style*="scale("]'
  await page.waitForSelector(canvas)
  const initialTransform = await page.$eval(canvas, el => (el as HTMLElement).style.transform)
  // The landing example has no groups and uses non-interactive fit sizing.
  // Repeated observer setup used to starve React Router's navigation transition.
  await page.setViewport({ width: 390, height: 844 })
  await page.waitForFunction((selector, initial) =>
    (document.querySelector(selector) as HTMLElement)?.style.transform !== initial,
  {}, canvas, initialTransform)
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
  await page.click('a[href="/docs/mermaid-import"]')
  await page.waitForFunction(() => document.querySelector('.dw-main h1')?.textContent === 'Mermaid Imports')
  assert.ok(await page.evaluate(() => document.body.textContent?.includes('Bring source from Pele or Beautiful Mermaid')))
  assert.deepEqual(errors, [])
  console.log('Landing passed: light/dark contrast and persistence, source/render tabs, fit resize, mobile width, compatibility link, no render loop.')
} finally {
  await browser.close()
}
