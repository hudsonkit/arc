/** Exercise all gallery sources, navigation, downloads, themes, and narrow layouts. */
import assert from 'node:assert/strict'
import puppeteer from 'puppeteer'
import { findChrome } from './renderImage'
import { examples } from '../src/content/examples'
import { mkdirSync } from 'node:fs'
import { resolveSiteVersion } from './site-version.js'

const release = await resolveSiteVersion()
const base = process.env.ARC_TEST_URL || 'http://localhost:5188'
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true })
try {
  const page = await browser.newPage()
  const errors: string[] = []
  page.on('pageerror', e => errors.push(String(e)))
  await page.setViewport({ width: 1440, height: 1000 })
  await page.goto(`${base}/examples`, { waitUntil: 'networkidle0' })
  await page.waitForSelector('.eg-stage svg')
  assert.equal(await page.$$eval('.eg-example', els => els.length), examples.length)
  assert.ok(await page.$eval('.eg-brand', (e, version) => e.textContent?.includes(version), release.version))
  for (const example of examples) {
    await page.click(`.eg-example[href="/examples/${example.id}"]`)
    await page.waitForFunction(title => document.querySelector('.eg-detail h2')?.textContent === title, {}, example.title)
    await page.waitForSelector('.eg-stage svg')
    assert.equal(await page.$eval('.eg-stage', e => e.querySelectorAll('[role="alert"]').length), 0, example.id)
    if (example.diagram) {
      const clipped = await page.$$eval('.eg-stage svg[viewBox]', svgs => svgs.flatMap(el => {
        const svg = el as SVGSVGElement
        if (svg.viewBox.baseVal.width < 100 || svg.hasAttribute('data-arc-flow-layer')) return []
        const b = svg.getBBox(), v = svg.viewBox.baseVal
        return b.x < v.x || b.y < v.y || b.x + b.width > v.width || b.y + b.height > v.height ? [{ bounds: [b.x, b.y, b.width, b.height], viewBox: [v.width, v.height] }] : []
      }))
      assert.deepEqual(clipped, [], `${example.id}: connectors outside the canvas`)
    }
    const downloaded = await page.$eval('.eg-detail-footer a[download]', e => decodeURIComponent((e as HTMLAnchorElement).href.split(',').slice(1).join(',')))
    if (example.diagram) assert.deepEqual(JSON.parse(downloaded), example.diagram)
    else assert.equal(downloaded, example.source)
  }
  await page.click('.eg-filters button:nth-child(3)')
  assert.equal(await page.$$eval('.eg-example', els => els.length), 4)
  await page.type('input[type="search"]', 'payment')
  assert.equal(await page.$$eval('.eg-example', els => els.length), 1)
  await page.click('.eg-example')
  await page.click('.eg-toolbar>button')
  assert.equal(await page.$eval('.eg-stage', e => e.getAttribute('data-mode')), 'dark')
  await page.click('.eg-toolbar>div button:nth-child(2)')
  assert.ok(await page.$eval('.eg-stage pre', e => e.textContent?.includes('sequenceDiagram')))
  // A direct deep link must also mount independently of gallery navigation.
  await page.goto(`${base}/examples/cache-aside`, { waitUntil: 'networkidle0' })
  await page.waitForSelector('.eg-stage svg')
  mkdirSync('.cache/formats', { recursive: true })
  await page.screenshot({ path: '.cache/formats/examples-desktop.png', fullPage: true })
  const priorTransform = await page.$eval('.eg-stage [style*="scale("]', e => (e as HTMLElement).style.transform)
  await page.setViewport({ width: 390, height: 844 })
  await page.waitForFunction(prior => (document.querySelector('.eg-stage [style*="scale("]') as HTMLElement)?.style.transform !== prior, {}, priorTransform)
  // Wait for the camera's CSS transition, then check the drawing itself fits.
  await page.waitForFunction(() => {
    const canvas = document.querySelector('.eg-stage [style*="scale("]')!
    const frame = document.querySelector('.eg-stage')!.getBoundingClientRect()
    const bounds = canvas.getBoundingClientRect()
    return canvas.getAnimations().length === 0 && bounds.left >= frame.left && bounds.right <= frame.right && bounds.top >= frame.top && bounds.bottom <= frame.bottom
  })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mobile overflow')
  await page.screenshot({ path: '.cache/formats/examples-mobile.png', fullPage: true })
  await page.click('.eg-detail-footer a[href^="/editor"]')
  await page.waitForFunction(() => location.pathname.startsWith('/editor/'))
  await page.waitForFunction(() => document.body.textContent?.includes('Application'))
  const session = await page.evaluate(() => JSON.parse(localStorage.getItem('arc-session-cache-aside') || '{}'))
  assert.deepEqual(session.diagram.flows, examples[0].diagram!.flows)
  assert.deepEqual(session.originalDiagram.flows, examples[0].diagram!.flows)
  assert.deepEqual(errors, [])
  console.log('Gallery: 16 previews and source downloads, filters, deep links, theme, mobile width, editor handoff passed.')
} finally { await browser.close() }
