/** Run with `bun scripts/hostTheme.browser.ts` while `bun dev` serves port 5188. */
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import puppeteer from 'puppeteer'
import { findChrome } from './renderImage'

const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true })
try {
  const page = await browser.newPage()
  const errors: string[] = []
  page.on('pageerror', error => errors.push(String(error)))
  await page.setViewport({ width: 1100, height: 1100 })
  await page.goto('http://localhost:5188/examples/host-theme.html', { waitUntil: 'networkidle0' })
  await page.waitForSelector('[data-arc-theme="inherit"] [data-arc-node]')
  const read = () => page.evaluate(() => {
    const roots = [...document.querySelectorAll('[data-arc-theme]')]
    return roots.map(root => {
      const node = root.querySelector('[data-arc-node]')!
      const style = getComputedStyle(node)
      return { background: getComputedStyle(root).backgroundColor, node: style.backgroundColor, border: style.borderTopColor, font: style.fontFamily, text: getComputedStyle(node.querySelector('[data-arc-node-title], span.font-medium') || node).color, transform: (root.firstElementChild?.nextElementSibling as HTMLElement)?.style.transform }
    })
  })
  const light = await read()
  assert.equal(light[0].background, 'rgb(250, 248, 242)')
  assert.equal(light[0].node, 'rgb(238, 238, 229)')
  assert.equal(light[1].node, light[0].node)
  assert.match(light[0].font, /Georgia/)
  // Hold an actual DOM reference to verify the CSS change does not remount nodes.
  await page.evaluate(() => { (window as any).originalNode = document.querySelector('[data-arc-node]') })
  await page.click('#host button')
  await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-arc-node]')!).backgroundColor === 'rgb(38, 56, 44)')
  const dark = await read()
  assert.equal(dark[0].background, 'rgb(23, 36, 29)')
  assert.equal(dark[0].node, 'rgb(38, 56, 44)')
  assert.equal(dark[1].node, dark[0].node)
  assert.equal(dark[0].text, 'rgb(240, 243, 233)')
  assert.deepEqual(dark[2], light[2], 'the adjacent warm preset must not change')
  assert.equal(await page.evaluate(() => (window as any).originalNode === document.querySelector('[data-arc-node]')), true)
  const svg = await page.$eval('#svg-export svg', root => ({
    background: getComputedStyle(root.querySelector('rect')!).fill,
    text: getComputedStyle(root.querySelector('text')!).fill,
  }))
  assert.equal(svg.background, dark[0].background)
  assert.equal(svg.text, 'rgb(166, 187, 255)') // connector label follows accent
  await page.hover('[data-arc-node]')
  assert.notEqual(await page.$eval('[data-arc-node]', node => getComputedStyle(node).boxShadow), 'none')
  mkdirSync('.cache/host-theme', { recursive: true })
  await page.mouse.move(0, 0)
  await page.screenshot({ path: '.cache/host-theme/desktop.png', fullPage: true })
  await page.setViewport({ width: 390, height: 844 })
  await page.screenshot({ path: '.cache/host-theme/mobile.png', fullPage: true })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
  assert.deepEqual(errors, [])
  console.log('Host theme browser checks passed: app, viewer, SVG, host toggle, preserved DOM, preset isolation, hover, mobile width.')
} finally {
  await browser.close()
}
