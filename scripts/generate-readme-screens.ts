/**
 * Regenerate the README's diagram renders and studio capture from their sources:
 *
 *   bun scripts/generate-readme-screens.ts            # all five
 *   bun scripts/generate-readme-screens.ts studio     # just the ones named
 *
 * Targets: architecture, engineering, workbench, tactical, studio.
 *
 * - public/readme-architecture.png — static render (renderDiagramSvg + Chrome)
 *   of docsDiagrams.overview in the light Engineering theme.
 * - public/theme-{engineering,workbench,tactical}.png — the player at
 *   /player/<session>, dark, the Arc self-portrait diagram, all one size.
 * - public/studio.png — the editor at /editor with the same diagram loaded
 *   through the #data= handoff, on the default chrome (graphite) and theme
 *   (workbench).
 *
 * The UI captures need the dev server: ARC_EDITOR_URL, default
 * http://localhost:5188. Everything is captured at 2x.
 */
import { writeFileSync } from 'node:fs'
import puppeteer, { type Page } from 'puppeteer'
import { renderDiagramPng } from './renderImage'
import { editorBaseUrl, encodeHashData } from './diagramHandoff'
import { validateDiagram } from '../src/utils/diagramDiagnostics'
import { docsDiagrams } from '../src/components/docs/docsDiagrams'
import architecture from '../src/components/diagrams/architecture.diagram'
import type { ArcDiagramData } from '../src/types/diagram'

const SCALE = 2
const out = (name: string) => new URL(`../public/${name}`, import.meta.url).pathname
const origin = editorBaseUrl()

const THEMES = ['engineering', 'workbench', 'tactical'] as const
// One frame for every theme plate, so the three README tiles line up.
const THEME_PAGE = { width: 1120, height: 500 }
const THEME_VIEWPORT = { width: 1024, height: 404 }
// Short enough that the drawing fills the README column, wide enough for the inspector.
const STUDIO_PAGE = { width: 1440, height: 680 }

const requested = new Set(process.argv.slice(2))
const wants = (name: string) => requested.size === 0 || requested.has(name)

function assertClean(name: string, diagram: ArcDiagramData) {
  const errors = validateDiagram(diagram).filter(d => d.severity === 'error')
  if (errors.length) throw new Error(`${name}: ${JSON.stringify(errors, null, 2)}`)
}

async function renderArchitecture() {
  const diagram = docsDiagrams.overview
  assertClean('docsDiagrams.overview', diagram)
  const { png, width, height } = await renderDiagramPng(diagram, { theme: 'engineering', mode: 'light', padding: 28, scale: SCALE })
  writeFileSync(out('readme-architecture.png'), png)
  console.log(`readme-architecture.png  ${width * SCALE}x${height * SCALE}`)
}

async function settle(page: Page, selector: string) {
  await page.waitForSelector(selector, { timeout: 20_000 })
  await page.evaluate(async () => { await document.fonts.ready })
  // Fit-to-view and the node entrance transitions run on the next frames.
  await new Promise(resolve => setTimeout(resolve, 1200))
}

async function reportWrapping(page: Page, label: string) {
  // A node's header row is one line by design; flag any that still wrap or clip.
  const wrapped = await page.evaluate(() => {
    const hits: string[] = []
    for (const el of document.querySelectorAll<HTMLElement>('[data-arc-node-title], [data-arc-node-subtitle]')) {
      const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 14
      if (el.scrollWidth > el.clientWidth + 1 || el.getBoundingClientRect().height > lineHeight * 1.5) hits.push(el.textContent ?? '')
    }
    return hits
  })
  if (wrapped.length) console.warn(`  ${label}: header text does not fit: ${wrapped.join(', ')}`)
}

async function renderThemes(page: Page) {
  const sessionId = 'readme-arc-architecture'
  await page.setViewport({ ...THEME_PAGE, deviceScaleFactor: SCALE })
  await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' })
  await page.evaluate((id, diagram) => {
    localStorage.setItem(`arc-session-${id}`, JSON.stringify({
      diagram, originalDiagram: diagram, themeId: null, colorMode: 'dark', diagramMeta: {}, updatedAt: Date.now(),
    }))
  }, sessionId, architecture)
  for (const theme of THEMES.filter(wants)) {
    const query = new URLSearchParams({ theme, mode: 'dark', chrome: 'false', viewport: `${THEME_VIEWPORT.width}x${THEME_VIEWPORT.height}` })
    await page.goto(`${origin}/player/${sessionId}?${query}`, { waitUntil: 'load' })
    await settle(page, '[data-arc-node]')
    await reportWrapping(page, theme)
    await page.screenshot({ path: out(`theme-${theme}.png`) })
    console.log(`theme-${theme}.png  ${THEME_PAGE.width * SCALE}x${THEME_PAGE.height * SCALE}`)
  }
}

async function frameStudio(page: Page) {
  // The default fit stops at 110%, which leaves the architecture drawing
  // floating in an empty canvas. Step in until it owns the frame, then
  // select the hub. Selection listens for a real pointer press.
  const fillOf = () => {
    const canvas = document.querySelector('.arc-editor-canvas')
    const nodes = [...document.querySelectorAll('[data-arc-node]')]
    if (!canvas || nodes.length === 0) return 1
    const box = canvas.getBoundingClientRect()
    const union = nodes.reduce((acc, el) => {
      const rect = el.getBoundingClientRect()
      return {
        left: Math.min(acc.left, rect.left),
        top: Math.min(acc.top, rect.top),
        right: Math.max(acc.right, rect.right),
        bottom: Math.max(acc.bottom, rect.bottom),
      }
    }, { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity })
    return Math.max((union.right - union.left) / box.width, (union.bottom - union.top) / box.height)
  }
  for (let i = 0; i < 8; i++) {
    if (await page.evaluate(fillOf) > 0.68) break
    const zoomIn = await page.$('[title="Zoom in"]')
    if (!zoomIn) break
    await zoomIn.click()
    await new Promise(resolve => setTimeout(resolve, 120))
  }
  const point = await page.evaluate(() => {
    const title = [...document.querySelectorAll('[data-arc-node-title]')].find(el => el.textContent?.trim() === 'Diagram Model')
    const rect = title?.closest('[data-arc-node]')?.getBoundingClientRect()
    return rect ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } : null
  })
  if (!point) throw new Error('Diagram Model node was not on the canvas')
  const fill = await page.evaluate(fillOf)
  console.log(`  studio drawing fills ${Math.round(fill * 100)}% of the canvas`)
  await page.mouse.click(point.x, point.y)
  await new Promise(resolve => setTimeout(resolve, 300))
}

async function renderStudio(page: Page) {
  await page.setViewport({ ...STUDIO_PAGE, deviceScaleFactor: SCALE })
  // Fresh profile: no stored skin, density or markup toggle, so the shell
  // comes up on its defaults. The theme is passed explicitly because a
  // handoff without one opens untinted.
  // The stock architecture drawing paints two blues and a gray, which collapse
  // on the dark canvas. Spread the five nodes across hues for the studio shot.
  const studio = structuredClone(architecture)
  studio.nodeData.editor.color = 'violet'
  studio.nodeData.templates.color = 'amber'
  studio.nodeData.model.color = 'sky'
  studio.nodeData.docs.color = 'rose'
  studio.nodeData.exporters.color = 'emerald'
  studio.connectorStyles.diagram.color = 'violet'
  studio.connectorStyles.themes.color = 'amber'
  studio.connectorStyles.publish.color = 'rose'
  studio.connectorStyles.export.color = 'emerald'
  const payload = { ...studio, _theme: 'workbench', _mode: 'light' }
  // The shell follows Hudson's theme, and a dark system preference would
  // paint the chrome dark and then overwrite the diagram mode. Pin both.
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }])
  await page.goto(`${origin}/editor?theme=light#data=${encodeHashData(payload)}`, { waitUntil: 'load' })
  // The hash handoff renders, then redirects to /editor/:id. Wait that out
  // before measuring, or the click lands on a document that is already gone.
  await page.waitForFunction(() => /^\/editor\/.+/.test(location.pathname), { timeout: 20_000 })
  await settle(page, '[data-arc-node]')
  await frameStudio(page)
  await reportWrapping(page, 'studio')
  await page.screenshot({ path: out('studio.png') })
  console.log(`studio.png  ${STUDIO_PAGE.width * SCALE}x${STUDIO_PAGE.height * SCALE}`)
}

assertClean('architecture.diagram', architecture)
if (wants('architecture')) await renderArchitecture()

const ui = THEMES.some(wants) || wants('studio')
if (ui) {
  const chromePath = process.env.ARC_CHROME || process.env.CHROME_PATH
  const browser = await puppeteer.launch({
    headless: true,
    ...(chromePath ? { executablePath: chromePath } : { channel: 'chrome' }),
  })
  try {
    const page = await browser.newPage()
    if (THEMES.some(wants)) await renderThemes(page)
    if (wants('studio')) {
      // A clean context, so nothing the player pages stored leaks into the shell.
      const context = await browser.createBrowserContext()
      await renderStudio(await context.newPage())
      await context.close()
    }
  } finally {
    await browser.close()
  }
}
