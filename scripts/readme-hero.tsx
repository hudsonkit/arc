/**
 * README hero — the Arc wordmark set on a technical isometric plate
 *
 * The drawing, paper, frame, component index and title block are all Arc's
 * own isometric renderer (`style: 'blueprint'` or `'cyanotype'`); only the
 * wordmark is composed onto the sheet, in the plate's own ink.
 *
 * Run:  bun scripts/readme-hero.tsx            (blueprint)
 *       HERO_STYLE=cyanotype bun scripts/readme-hero.tsx
 * Out:  public/arc-readme-hero.png
 */
import { readFileSync } from 'fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import puppeteer from 'puppeteer'
import ArcDiagram from '../src/iso/ArcDiagram'
import type { DiagramConfig, DiagramNode } from '../src/iso/types'
import { getIsoStyle } from '../src/utils/isoStyles'

const STYLE = (process.env.HERO_STYLE ?? 'blueprint') as 'blueprint' | 'cyanotype'
const OUT = process.env.HERO_OUT ?? 'public/arc-readme-hero.png'
const W = 1200, H = 640

// ── Scene: one system, exploded into three layers ──────────────────────────
// Every box carries a name — an unlabeled box still draws its callout stub.
// Colors only pick the hatch signature on a monochrome plate.
const S = 0.76
const b = (tier: number, label: string, x: number, y: number, w: number, d: number, h: number, color: string): DiagramNode =>
  ({ tier, label, color, x: x * S, y: y * S, width: w * S, depth: d * S, height: h * S })

const nodes: DiagramNode[] = [
  // Data
  b(0, 'Postgres', 30, 120, 74, 64, 40, 'blue'),
  b(0, 'Replica', 30, 30, 60, 52, 26, 'blue'),
  b(0, 'Queue', 130, 150, 120, 30, 14, 'amber'),
  b(0, 'Cache', 140, 30, 44, 44, 20, 'amber'),
  b(0, 'Blobs', 220, 40, 54, 54, 30, 'sky'),
  // Services
  b(1, 'Gateway', 24, 30, 36, 150, 14, 'zinc'),
  b(1, 'Auth', 90, 36, 40, 40, 30, 'violet'),
  b(1, 'Billing', 252, 12, 40, 40, 34, 'rose'),
  b(1, 'Search', 190, 40, 44, 44, 24, 'sky'),
  b(1, 'Workers', 196, 130, 70, 44, 18, 'emerald'),
  // Interface
  b(2, 'Web', 50, 130, 50, 44, 28, 'cyan'),
  b(2, 'Mobile', 136, 90, 40, 40, 22, 'cyan'),
  b(2, 'Agent', 210, 40, 46, 46, 34, 'violet'),
]

const config: DiagramConfig = {
  id: 'ARC.HERO.001',
  title: 'Arc · system plate',
  theme: 'light',
  style: STYLE,
  canvas: { width: W, height: H },
  origin: { x: 800, y: 585 },
  floorSize: { width: 300 * S, depth: 210 * S },
  tiers: [
    { name: 'Data', elevation: 0 },
    { name: 'Services', elevation: 165 },
    { name: 'Interface', elevation: 330 },
  ],
  nodes,
}

let svg = renderToStaticMarkup(createElement(ArcDiagram, { config, options: { animate: false, interactive: false } }))

// ── Wordmark, in the plate's ink ───────────────────────────────────────────
// HERO_FONT names a Google Fonts family (default: the Space Grotesk face the
// old header embeds). Wordmark and tagline are fitted to a fixed width in the
// browser, since display faces differ wildly in set width.
const FONT = process.env.HERO_FONT ?? 'Barlow Condensed'
const WEIGHT = process.env.HERO_WEIGHT ?? '400'
const TAGLINE = process.env.HERO_TAGLINE ?? 'Illustrations, precisely drawn.'
const SUB = process.env.HERO_SUB ?? ''
const CASE = process.env.HERO_CASE ?? 'upper' // 'upper' for caps-only faces
const TRACK = process.env.HERO_TRACK ?? '0.10' // letter-spacing, in em
const GRID = process.env.HERO_GRID ?? '0.3' // graph-paper opacity (the plate's own default is 0.6)
// One drafting ornament, in hairline ink: ticks | dimension | frame | rules |
// crosshair | label | leader | construction | cell | foot | none
const DETAIL = process.env.HERO_DETAIL ?? 'ticks,corner-label' // comma-separated
const style = getIsoStyle(STYLE)
const ink = style.ink.text
const header = readFileSync('public/arc-readme-header.svg', 'utf8')
// Scope the face to the wordmark so the plate keeps its mono captions.
const face = FONT
  ? `<style>.wm{font-family:'${FONT}';font-weight:${WEIGHT}}</style>`
  : header.match(/<style>[\s\S]*?<\/style>/)![0].replace(/\btext \{/, '.wm {')
const fontLink = FONT
  ? `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(FONT)}:wght@${WEIGHT}&display=block">`
  : ''
const tx = (t: string) => (CASE === 'upper' ? t.toUpperCase() : t)
const X = 84, Y = 330
const wordmark = `${face}
<svg id="mark" x="${X}" y="${Y - 92}" width="88" height="88" viewBox="3 6 26 17" fill="none">
  <path d="M7 13.5A9 7 0 0 0 25 13.5" stroke="${ink}" stroke-width="1.4" vector-effect="non-scaling-stroke"/>
  <rect x="3.5" y="7.5" width="7" height="6" rx="1.5" stroke="${ink}" stroke-width="1.2" vector-effect="non-scaling-stroke"/>
  <rect x="21.5" y="7.5" width="7" height="6" rx="1.5" stroke="${ink}" stroke-width="1.2" vector-effect="non-scaling-stroke"/>
</svg>
<g id="detail" fill="none" stroke="${ink}" stroke-width="0.7"></g>
<text id="wm-title" class="wm" letter-spacing="${TRACK}em" x="${X + 120}" y="${Y - 10}" font-size="100" fill="${ink}">${tx('Arc')}</text>
<text id="wm-tag" class="wm" letter-spacing="${CASE === 'upper' ? Math.max(Number(TRACK), 0.06) : 0}em" x="${X}" y="${Y + 56}" font-size="30" fill="${ink}">${tx(TAGLINE)}</text>
${SUB ? `<text x="${X}" y="${Y + 96}" font-family='${style.font}' font-size="11" letter-spacing="0.14em" fill="${style.ink.muted}">${SUB}</text>` : ''}`
svg = svg.replace(/<\/svg>\s*<\/div>\s*$/, `${wordmark}</svg></div>`)

// Chrome rasterizes it: the wordmark needs a real web font.
const chromePath = process.env.ARC_CHROME || process.env.CHROME_PATH
const browser = await puppeteer.launch({ headless: true, ...(chromePath ? { executablePath: chromePath } : { channel: 'chrome' }) })
try {
  const page = await browser.newPage()
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 2 })
  await page.setContent(`<!doctype html>${fontLink}<style>body{margin:0}div,svg{display:block}rect[fill*="-grid-"]{opacity:${GRID}}</style>${svg}`, { waitUntil: 'load', timeout: 60000 })
  await page.evaluate(async (x: number, detail: string, mono: string, sheetH: number) => {
    await document.fonts.ready
    // Fit: title no wider than 300 or taller than 96 cap; tagline no wider than 470.
    const fit = (el: SVGTextElement, maxW: number, maxSize: number) => {
      let size = maxSize
      el.setAttribute('font-size', String(size))
      const w = el.getBBox().width
      if (w > maxW) { size = (size * maxW) / w; el.setAttribute('font-size', String(size)) }
      return el.getBBox()
    }
    const title = document.getElementById('wm-title') as unknown as SVGTextElement
    const tag = document.getElementById('wm-tag') as unknown as SVGTextElement
    const mark = document.getElementById('mark') as unknown as SVGSVGElement
    fit(title, 270, 96)
    fit(tag, 420, 26)
    // Mark: as tall as the title's cap height, sitting on its baseline.
    const probe = title.getBBox()
    const baseline = Number(title.getAttribute('y'))
    const cap = (baseline - probe.y) * 0.72
    const mh = cap * 0.5, mw = mh * (26 / 17)
    mark.setAttribute('width', String(mw)); mark.setAttribute('height', String(mh))
    mark.setAttribute('x', String(x)); mark.setAttribute('y', String(baseline - cap / 2 - mh / 2))
    title.setAttribute('x', String(x + mw + cap * 0.3))

    // Drafting ornament, placed from the laid-out boxes.
    const kinds = detail.split(',').map((k) => k.trim())
    const g = document.getElementById('detail')!
    const t = title.getBBox(), a = tag.getBBox()
    const tb = baseline, ag = Number(tag.getAttribute('y'))
    // getBBox includes the letter-spacing after the last glyph; trim it so rules end on the letter.
    const trail = parseFloat(title.getAttribute('letter-spacing') || '0') * parseFloat(title.getAttribute('font-size') || '0')
    const tl = t.x, tr = t.x + t.width - trail
    const L = (x1: number, y1: number, x2: number, y2: number, extra = '') =>
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${extra}/>`
    const label = (lx: number, ly: number, s: string, size = 7) =>
      `<text x="${lx}" y="${ly}" font-family='${mono}' font-size="${size}" letter-spacing="0.1em" fill="currentColor" stroke="none">${s}</text>`
    g.setAttribute('color', g.getAttribute('stroke')!)
    let d = ''
    for (const detail of kinds) {
    if (detail === 'ticks') {
      const y = tb + 9
      d += L(tl, y, tr, y) + L(tl, y - 4, tl, y + 4) + L(tr, y - 4, tr, y + 4)
    } else if (detail === 'dimension') {
      const y = tb + 13
      d += L(tl, tb + 4, tl, y + 4) + L(tr, tb + 4, tr, y + 4) + L(tl, y, tr, y)
        + L(tl - 3, y + 3, tl + 3, y - 3) + L(tr - 3, y + 3, tr + 3, y - 3)
        + label((tl + tr) / 2 - 14, y - 3, `${Math.round(t.width)}.0`)
    } else if (detail === 'frame') {
      const p = 12, g6 = 9, x0 = tl - p, x1 = tr + p, y0 = t.y + 4, y1 = tb + p
      d += L(x0 + g6, y0, x1 - g6, y0) + L(x0 + g6, y1, x1 - g6, y1) + L(x0, y0 + g6, x0, y1 - g6) + L(x1, y0 + g6, x1, y1 - g6)
    } else if (detail === 'rules') {
      d += L(tl, tb + 9, tr, tb + 9) + L(tl, tb + 13, tr - 12, tb + 13)
    } else if (detail === 'crosshair') {
      const cx = tl - 8, cy = tb + 8
      d += L(cx - 12, cy, cx - 2, cy) + L(cx + 2, cy, cx + 12, cy) + L(cx, cy - 12, cx, cy - 2) + L(cx, cy + 2, cx, cy + 12)
    } else if (detail === 'label') {
      const mx = Number(mark.getAttribute('x')), my = Number(mark.getAttribute('y')) + Number(mark.getAttribute('height'))
      d += `<rect x="${mx}" y="${my + 8}" width="34" height="13"/>` + label(mx + 5, my + 17.5, 'A–01')
    } else if (detail === 'leader') {
      const y = ag - a.height * 0.3, x0 = a.x + a.width + 10
      d += L(x0, y, x0 + 34, y) + `<circle cx="${x0 + 38}" cy="${y}" r="4"/>`
    } else if (detail === 'construction') {
      const mx = Number(mark.getAttribute('x')), my = Number(mark.getAttribute('y'))
      const mwid = Number(mark.getAttribute('width')), mhi = Number(mark.getAttribute('height'))
      d += `<circle cx="${mx + mwid / 2}" cy="${my + mhi * 0.3}" r="${mwid * 0.42}" stroke-dasharray="2 3" stroke-width="0.6"/>`
        + L(mx - 4, my + mhi * 0.3, mx + mwid + 4, my + mhi * 0.3, 'stroke-width="0.4"')
    } else if (detail === 'cell') {
      const s = 16, x0 = a.x + a.width + 12, y0 = ag - s + 2
      d += `<rect x="${x0}" y="${y0}" width="${s}" height="${s}"/>` + L(x0, y0 + s / 3, x0 + s, y0 + s / 3) + label(x0 + 3.5, y0 + s / 3 - 1, '01', 5)
    } else if (detail === 'foot') {
      const x0 = a.x - 12
      tag.setAttribute('x', String(Number(tag.getAttribute('x')) + 6))
      d += L(x0 + 6, a.y - 2, x0 + 6, ag + 4) + L(x0 + 6, ag + 4, x0 + 12, ag + 4)
    }
    else if (detail === 'corner-label') {
      // Part number in the sheet's free bottom-left corner, on the title block's baseline.
      const w = 46, h = 17, x0 = 34.5, y0 = sheetH - 52
      d += `<rect x="${x0}" y="${y0}" width="${w}" height="${h}"/>` + label(x0 + 8, y0 + 11.5, 'A–01', 8)
    }
    }
    g.innerHTML = d
  }, X, DETAIL, style.font, H)
  await page.screenshot({ path: OUT })
} finally {
  await browser.close()
}
console.log(`${STYLE} → ${OUT}`)
