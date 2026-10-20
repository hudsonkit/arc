/** Browser regression for early rAF timestamps and the assembly controls. */
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import puppeteer from 'puppeteer'

const output = process.env.ARC_CAPTURE_DIR || '/tmp/arc-exploded'
mkdirSync(output, { recursive: true })
const browser = await puppeteer.launch({ headless: true, channel: 'chrome' })
const page = await browser.newPage()
const errors: string[] = []
page.on('pageerror', error => errors.push(String(error)))
page.on('console', message => {
  if (message.text().startsWith('ARC_FRAME ')) console.log(message.text())
})
try {
  await page.setViewport({ width: 1440, height: 1000 })
  await page.goto(process.env.ARC_PREVIEW_URL || 'http://127.0.0.1:5188/exploded', { waitUntil: 'networkidle0' })
  await page.waitForSelector('.ex-diagram svg')
  assert.match(await page.$eval('.ex-stage', node => node.getAttribute('aria-label') || ''), /keyboard/i)
  // A browser frame timestamp can precede the event handler's performance.now().
  // Force that legal ordering once, and record the value passed to the callback.
  await page.evaluate(() => {
    const original = window.requestAnimationFrame.bind(window)
    window.requestAnimationFrame = callback => {
      window.requestAnimationFrame = original
      const timestamp = performance.now() - 20
      console.log('ARC_FRAME ' + JSON.stringify({ phase: 'scheduled', timestamp, now: performance.now() }))
      return original(() => callback(timestamp))
    }
  })
  await page.click('.ex-desktop-controls button:first-child')
  await page.waitForFunction(() => document.querySelector('#separation')?.getAttribute('value') === '0', { timeout: 5000 })
  assert.deepEqual(errors, [])
  console.log('PASS early frame remains within the valid progress range')
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
  await page.click('.ex-desktop-controls button:nth-child(2)')
  await page.waitForFunction(() => document.querySelector('#separation')?.getAttribute('value') === '100')
  await page.click('.ex-theme')
  assert.equal(await page.$eval('.ex-page', node => node.getAttribute('data-mode')), 'dark')
  await page.screenshot({ path: `${output}/keyboard-dark.png`, fullPage: true })
  await page.click('.ex-toolbar button:nth-child(2)')
  assert.match(await page.$eval('.ex-stage', node => node.getAttribute('aria-label') || ''), /AI stack/)
  await page.setViewport({ width: 390, height: 844 })
  await page.waitForFunction(() => !document.querySelector('.ex-diagram [data-layer="labels"]'))
  await page.click('.ex-mobile-controls button:first-child')
  assert.equal(await page.$eval('#separation-mobile', node => (node as HTMLInputElement).value), '0')
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  await page.screenshot({ path: `${output}/ai-mobile.png`, fullPage: true })
  assert.deepEqual(errors, [])
  writeFileSync(`${output}/browser-results.json`, JSON.stringify({ errors, checks: ['early frame', 'assembly controls', 'reduced motion', 'dark appearance', 'example switch', 'mobile layout'] }, null, 2))
  console.log('PASS assembly controls, reduced motion, appearance, examples and mobile layout')
} catch (error) {
  console.error(JSON.stringify({ errors, failure: String(error) }))
  throw error
} finally { await browser.close() }
