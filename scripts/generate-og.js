import puppeteer from 'puppeteer'
import { execFileSync } from 'child_process'
import { fileURLToPath } from 'url'
import path from 'path'
import { mkdirSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import os from 'os'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const publicDir = path.join(__dirname, '..', 'public')

if (!existsSync(publicDir)) {
  mkdirSync(publicDir, { recursive: true })
}

// Technical landing brand — Space Grotesk + JetBrains Mono, cool paper,
// engineering blue, blueprint grid. Shared by every OG card so GitHub, Slack,
// and docs previews match https://arc.jdi.sh.
const MARK = readFileSync(path.join(publicDir, 'arc-mark.svg'), 'utf8')
// The same glyph without its dark tile, inked for a light card.
const MARK_LIGHT = MARK
  .replace(/<rect width="32" height="32"[^>]*\/>\s*/, '')
  .replace(/#f3efe6/g, '#101518')
  .replace('<svg ', '<svg class="mark-light" ')
  .replace('<svg ', '<svg width="32" height="32" aria-hidden="true" ')

const FONTS = `
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet">
`

const BASE_CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; }
  body {
    font-family: 'Space Grotesk', 'Segoe UI', system-ui, sans-serif;
    background: #fbfcfd;
    color: #101518;
    position: relative;
    overflow: hidden;
  }
  .grid {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(46, 95, 165, 0.055) 1px, transparent 1px),
      linear-gradient(90deg, rgba(46, 95, 165, 0.055) 1px, transparent 1px);
    background-size: 46px 46px;
  }
  .shell {
    position: relative;
    z-index: 1;
    display: grid;
    gap: 48px;
    align-items: center;
    height: 100%;
    padding: 52px 64px 48px;
  }
  .shell.split { grid-template-columns: 1.08fr 0.92fr; }
  .shell.solo { grid-template-columns: 1fr; }
  .shell.wide { grid-template-columns: 0.88fr 1.12fr; gap: 40px; padding-right: 48px; }
  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 22px;
  }
  .brand svg { display: block; }
  .kit {
    align-self: stretch;
    display: flex;
    align-items: center;
    margin-left: 6px;
    padding-left: 18px;
    border-left: 1px solid rgba(16, 21, 24, 0.14);
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #6b757a;
    line-height: 1;
  }
  .kit b { font-weight: 600; color: #101518; margin-left: 0.5em; }
  .diagram { padding: 22px 18px 18px; background: #fff; }
  .diagram svg { display: block; width: 100%; height: auto; }
  .card-foot {
    display: flex;
    justify-content: space-between;
    padding: 10px 14px;
    border-top: 1px solid rgba(16, 21, 24, 0.10);
    background: #fbfcfd;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10.5px;
    letter-spacing: 0.02em;
    color: #6b757a;
  }
  .card-foot b { font-weight: 500; color: #2e5fa5; }
  .diagram.shot { padding: 0; background: #f6f7f9; }
  .diagram.shot img { display: block; width: 100%; height: auto; }
  .url {
    display: flex;
    align-items: center;
    gap: 10px;
    border-top: 1px solid rgba(16, 21, 24, 0.10);
    padding-top: 16px;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 17px;
    font-weight: 500;
    letter-spacing: 0.01em;
    color: #2e5fa5;
  }
  .url::before { content: '→'; color: #8a9298; font-weight: 400; }
  .brand.single { gap: 10px; }
  .brand .mark-light { width: 38px; height: 38px; }
  .brand.single .name { font-size: 26px; }
  .brand.single .kit { align-self: center; height: 20px; margin-left: 10px; }
  .name { font-weight: 700; font-size: 22px; letter-spacing: -0.02em; }
  .repo {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 22px;
    font-weight: 500;
    letter-spacing: 0.01em;
    color: #2e5fa5;
    margin-bottom: 22px;
  }
  .eyebrow {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 13px;
    letter-spacing: 0.14em;
    color: #2e5fa5;
    margin-bottom: 14px;
  }
  h1 {
    text-wrap: balance;
    font-weight: 700;
    font-size: 52px;
    line-height: 1.04;
    letter-spacing: -0.025em;
    margin: 0 0 18px;
  }
  h1.compact { font-size: 46px; }
  .lead {
    font-size: 18px;
    line-height: 1.5;
    color: #3a4248;
    max-width: 22em;
    margin: 0 0 28px;
  }
  .spec {
    display: flex;
    flex-wrap: wrap;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 11px;
    letter-spacing: 0.08em;
    color: #8a9298;
    border-top: 1px solid rgba(16, 21, 24, 0.10);
    padding-top: 14px;
  }
  .spec span { padding: 0 14px; border-left: 1px solid rgba(16, 21, 24, 0.12); }
  .spec span:first-child { padding-left: 0; border-left: none; }
  .card {
    border: 1px solid rgba(16, 21, 24, 0.12);
    border-radius: 6px;
    background: #fff;
    overflow: hidden;
    box-shadow: 0 1px 0 rgba(16, 21, 24, 0.04), 0 18px 40px -28px rgba(16, 21, 24, 0.30);
  }
  .card-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 11px 14px;
    border-bottom: 1px solid rgba(16, 21, 24, 0.10);
    background: #fbfcfd;
  }
  .dots { display: flex; gap: 6px; }
  .dots i { width: 9px; height: 9px; border-radius: 50%; background: rgba(16, 21, 24, 0.14); display: block; }
  .dots i:last-child { background: #2e5fa5; }
  .card-name {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 11px;
    color: #8a9298;
    letter-spacing: 0.04em;
  }
  pre {
    margin: 0;
    padding: 20px 18px;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 13.5px;
    line-height: 1.7;
    color: #3a4248;
  }
  .c { color: #8a9298; }
  .k { color: #2e5fa5; }
  .s { color: #1f7a65; }
  .doc-list { padding: 6px 0; }
  .doc-row {
    display: grid;
    grid-template-columns: 64px 1fr;
    gap: 14px;
    align-items: baseline;
    padding: 14px 18px;
    border-top: 1px solid rgba(16, 21, 24, 0.08);
  }
  .doc-row:first-child { border-top: none; }
  .doc-n {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 11px;
    letter-spacing: 0.08em;
    color: #2e5fa5;
  }
  .doc-h { font-weight: 600; font-size: 15px; }
  .canvas {
    height: 320px;
    display: grid;
    grid-template-columns: 1fr 36px 1fr 36px 1fr;
    grid-template-rows: 1fr auto 36px auto 1fr;
    align-items: center;
    justify-items: stretch;
    padding: 8px 20px;
    background:
      linear-gradient(rgba(46, 95, 165, 0.06) 1px, transparent 1px),
      linear-gradient(90deg, rgba(46, 95, 165, 0.06) 1px, transparent 1px);
    background-size: 24px 24px;
    background-color: #fff;
  }
  .node {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    background: #fff;
    border: 1px solid rgba(16, 21, 24, 0.16);
    box-shadow: 0 1px 0 rgba(16, 21, 24, 0.04);
  }
  .node .swatch { width: 8px; height: 8px; flex: none; }
  .node .label { font-size: 13px; font-weight: 600; letter-spacing: -0.01em; }
  .node .sub {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 9px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #8a9298;
  }
  .n-editor { grid-column: 1; grid-row: 2; }
  .n-model { grid-column: 3; grid-row: 2; }
  .n-docs { grid-column: 5; grid-row: 2; }
  .n-export { grid-column: 3; grid-row: 4; }
  .sw-editor { background: #2e5fa5; }
  .sw-model { background: #5b4db0; }
  .sw-docs { background: #3a7ca5; }
  .sw-export { background: #1f7a65; }
  .h-wire {
    height: 2px;
    width: 100%;
    background: repeating-linear-gradient(90deg, #2e5fa5 0 5px, transparent 5px 9px);
    opacity: 0.55;
  }
  .w-1 { grid-column: 2; grid-row: 2; }
  .w-2 { grid-column: 4; grid-row: 2; }
  .v-wire {
    justify-self: center;
    width: 2px;
    height: 100%;
    background: repeating-linear-gradient(#1f7a65 0 5px, transparent 5px 9px);
    opacity: 0.55;
  }
  .w-3 { grid-column: 3; grid-row: 3; }
  .ruler {
    position: absolute;
    left: 0; right: 0; bottom: 0;
    height: 18px;
    border-top: 1px solid rgba(16, 21, 24, 0.10);
    background-image: repeating-linear-gradient(90deg, rgba(16, 21, 24, 0.18) 0 1px, transparent 1px 46px);
    background-size: 46px 9px;
    background-repeat: repeat-x;
  }
`

function specBar(items) {
  return items.map((item) => `<span>${item}</span>`).join('')
}

function plate({ eyebrow, title, lead, spec, right, compactTitle = false, wide = false, kit = false, repo = 'github.com/hudsonkit/arc', url }) {
  const split = Boolean(right)
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  ${FONTS}
  <style>${BASE_CSS}</style>
</head>
<body>
  <div class="grid"></div>
  <div class="shell ${split ? (wide ? 'wide' : 'split') : 'solo'}">
    <div>
      <div class="brand single">
        ${MARK_LIGHT}
        <span class="name">Arc</span>
        ${kit ? '<span class="kit">Part of<b>HudsonKit</b></span>' : ''}
      </div>
      ${url ? '' : `<div class="repo">${repo}</div>`}
      ${eyebrow ? `<div class="eyebrow">${eyebrow}</div>` : ''}
      <h1${compactTitle ? ' class="compact"' : ''}>${title}</h1>
      <p class="lead">${lead}</p>
      ${url ? `<div class="url">${url}</div>` : `<div class="spec">${specBar(spec)}</div>`}
    </div>
    ${right ? `<div>${right}</div>` : ''}
  </div>
  <div class="ruler"></div>
</body>
</html>`
}

const docsIndexCard = `
  <div class="card">
    <div class="card-bar">
      <div class="dots"><i></i><i></i><i></i></div>
      <span class="card-name">docs.index</span>
    </div>
    <div class="doc-list">
      <div class="doc-row"><span class="doc-n">DOC.01</span><span class="doc-h">Introduction to Arc</span></div>
      <div class="doc-row"><span class="doc-n">DOC.02</span><span class="doc-h">Get up and running</span></div>
      <div class="doc-row"><span class="doc-n">DOC.03</span><span class="doc-h">Data structure reference</span></div>
      <div class="doc-row"><span class="doc-n">DOC.04</span><span class="doc-h">Color palettes</span></div>
    </div>
  </div>
`

const mcpCard = `
  <div class="card">
    <div class="card-bar">
      <div class="dots"><i></i><i></i><i></i></div>
      <span class="card-name">arc-mcp · tool result</span>
    </div>
    <pre><span class="c">request</span>  map the payment system

<span class="k">01</span> validate_diagram  <span class="s">valid</span>
<span class="k">02</span> auto_layout       <span class="s">12 nodes placed</span>
<span class="k">03</span> render_svg        <span class="s">artifact ready</span>
<span class="k">04</span> editor_handoff    <span class="s">studio link</span>

<span class="c">→ typed · deterministic · reviewable</span></pre>
  </div>
`

const skillsCard = `
  <div class="card">
    <div class="card-bar">
      <div class="dots"><i></i><i></i><i></i></div>
      <span class="card-name">arc-diagrams · skill loop</span>
    </div>
    <div class="doc-list">
      <div class="doc-row"><span class="doc-n">CREATE</span><span class="doc-h">Turn a system brief into a diagram</span></div>
      <div class="doc-row"><span class="doc-n">REPAIR</span><span class="doc-h">Fix schema and composition issues</span></div>
      <div class="doc-row"><span class="doc-n">REVIEW</span><span class="doc-h">Explain structural changes clearly</span></div>
      <div class="doc-row"><span class="doc-n">EXPORT</span><span class="doc-h">Ship code, images, or embeds</span></div>
    </div>
  </div>
`

const softwareCard = `
  <div class="card">
    <div class="card-bar">
      <div class="dots"><i></i><i></i><i></i></div>
      <span class="card-name">the-field-guide.html</span>
    </div>
    <div class="doc-list">
      <div class="doc-row"><span class="doc-n">AGENTS</span><span class="doc-h">Arc — typed contract, MCP-native</span></div>
      <div class="doc-row"><span class="doc-n">AS CODE</span><span class="doc-h">Mermaid · D2 · PlantUML · Graphviz</span></div>
      <div class="doc-row"><span class="doc-n">C4</span><span class="doc-h">Structurizr · likec4 · IcePanel</span></div>
      <div class="doc-row"><span class="doc-n">CANVAS</span><span class="doc-h">diagrams.net · Excalidraw · Lucidchart</span></div>
    </div>
  </div>
`

const editorCard = `
  <div class="card">
    <div class="card-bar">
      <div class="dots"><i></i><i></i><i></i></div>
      <span class="card-name">canvas.arc</span>
    </div>
    <div class="canvas">
      <div class="node n-editor">
        <span class="swatch sw-editor"></span>
        <span>
          <span class="label">Editor</span>
          <div class="sub">Canvas UI</div>
        </span>
      </div>
      <div class="h-wire w-1"></div>
      <div class="node n-model">
        <span class="swatch sw-model"></span>
        <span>
          <span class="label">Model</span>
          <div class="sub">JSON / TS</div>
        </span>
      </div>
      <div class="h-wire w-2"></div>
      <div class="node n-docs">
        <span class="swatch sw-docs"></span>
        <span>
          <span class="label">Docs</span>
          <div class="sub">Embed</div>
        </span>
      </div>
      <div class="v-wire w-3"></div>
      <div class="node n-export">
        <span class="swatch sw-export"></span>
        <span>
          <span class="label">Export</span>
          <div class="sub">SVG / PNG</div>
        </span>
      </div>
    </div>
  </div>
`

// The main card shows a real diagram, drawn by Arc's own renderer from
// og-diagram.json — not a mock-up of one.
function renderDiagramSvg(file) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'arc-og-'))
  const out = path.join(dir, 'diagram.svg')
  try {
    execFileSync(process.execPath, [
      path.join(__dirname, '..', 'bin', 'arc.mjs'), 'render', file,
      '--out', out, '--format', 'svg', '--theme', 'cool', '--mode', 'light',
      '--padding', '0', '--background', 'none',
    ], { stdio: ['ignore', 'ignore', 'inherit'] })
    return readFileSync(out, 'utf8').replace(/<\?xml[^>]*>\s*/, '')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const OG_DIAGRAM = path.join(__dirname, 'og-diagram.json')

function diagramCard(shot) {
  const body = shot
    ? `<div class="diagram shot"><img src="data:image/png;base64,${shot.toString('base64')}" alt=""></div>`
    : `<div class="diagram">${renderDiagramSvg(OG_DIAGRAM)}</div>`
  return `
  <div class="card">
    <div class="card-bar">
      <div class="dots"><i></i><i></i><i></i></div>
      <span class="card-name">request-path.arc.json</span>
    </div>
    ${body}
    <div class="card-foot"><span><b>$</b> arc render request-path.arc.json</span><span>6 nodes · 5 edges</span></div>
  </div>
`
}

// The card's picture is Arc's own player (icons, node chrome, theme), captured
// from the dev server and cropped to the drawing. Without the server it falls
// back to the static `arc render` SVG, which draws no icons.
async function capturePlayer(browser, { theme = 'workbench', width = 860, height = 380 } = {}) {
  const origin = (process.env.ARC_EDITOR_URL || 'http://localhost:5188').replace(/\/+$/, '')
  const diagram = JSON.parse(readFileSync(OG_DIAGRAM, 'utf8'))
  const page = await browser.newPage()
  try {
    await page.setViewport({ width, height, deviceScaleFactor: 3 })
    await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded', timeout: 5000 })
    await page.evaluate((d) => localStorage.setItem('arc-session-og-request-path', JSON.stringify({
      diagram: d, originalDiagram: d, themeId: null, colorMode: 'light', diagramMeta: {}, updatedAt: Date.now(),
    })), diagram)
    const query = new URLSearchParams({ theme, mode: 'light', chrome: 'false', viewport: `${width}x${height}` })
    await page.goto(`${origin}/player/og-request-path?${query}`, { waitUntil: 'load' })
    await page.waitForSelector('[data-arc-node]', { timeout: 20_000 })
    await page.evaluate(async () => { await document.fonts.ready })
    await new Promise((resolve) => setTimeout(resolve, 1300))
    const box = await page.evaluate(() => {
      const rects = [...document.querySelectorAll('[data-arc-node]')].map((el) => el.getBoundingClientRect())
      return {
        x: Math.min(...rects.map((r) => r.left)), y: Math.min(...rects.map((r) => r.top)),
        r: Math.max(...rects.map((r) => r.right)), b: Math.max(...rects.map((r) => r.bottom)),
      }
    })
    const pad = 28
    return await page.screenshot({
      type: 'png',
      clip: { x: box.x - pad, y: box.y - pad, width: box.r - box.x + 2 * pad, height: box.b - box.y + 2 * pad },
    })
  } catch (err) {
    console.warn(`! player capture unavailable (${err.message}); using arc render`)
    return null
  } finally {
    await page.close()
  }
}

const mainOGHtml = (shot) => plate({
  title: 'Diagrams that live where your system does.',
  lead: 'Typed, diffable config. Visual editor. The picture ships with the code.',
  right: diagramCard(shot),
  compactTitle: true,
  wide: true,
  kit: true,
  url: 'hudsonkit.com/arc',
})

const docsOGHtml = plate({
  eyebrow: '// DOCUMENTATION',
  title: 'Arc Documentation',
  lead: 'Everything you need to create declarative architecture diagrams.',
  spec: ['QUICKSTART', 'FORMAT', 'THEMES', 'AGENTS'],
  right: docsIndexCard,
})

const editorOGHtml = plate({
  eyebrow: '// EDITOR',
  title: 'Open the editor.',
  lead: 'A real canvas for nodes, connections, groups, and images. Export the same config you version in git.',
  spec: ['CANVAS', 'ISOMETRIC', 'JSON / TS'],
  right: editorCard,
})

const mcpOGHtml = plate({
  eyebrow: '// AGENT TOOLING · MCP',
  title: 'Give your agent a diagram engine.',
  lead: 'Validate, lay out, diff, render, and hand architecture diagrams into the visual studio.',
  spec: ['VALIDATE', 'LAYOUT', 'RENDER', 'HANDOFF'],
  right: mcpCard,
})

const skillsOGHtml = plate({
  eyebrow: '// AGENT TOOLING · SKILLS',
  title: 'Let your agents make amazing diagrams.',
  lead: 'Reusable instructions for architecture diagrams that stay typed, readable, and reviewable.',
  spec: ['CREATE', 'REPAIR', 'REVIEW', 'EXPORT'],
  right: skillsCard,
  compactTitle: true,
})

const softwareOGHtml = plate({
  eyebrow: '// FIELD GUIDE · DIAGRAM SOFTWARE',
  title: 'Best architecture diagram software.',
  lead: 'Diagrams-as-code, C4 workspaces, canvases, and the agent-native category — compared.',
  spec: ['14 TOOLS', '4 CATEGORIES', 'AGENT-READY RATED'],
  right: softwareCard,
  compactTitle: true,
})

function docPageHtml(code, title, description) {
  return plate({
    eyebrow: `// DOCS · ${code}`,
    title,
    lead: description,
    spec: ['ARC', 'DOCS', code],
    compactTitle: true,
  })
}

async function generateOGImage(browser, html, filename, { width = 1200, height = 630 } = {}) {
  const page = await browser.newPage()
  await page.setViewport({ width, height, deviceScaleFactor: 2 })
  await page.setContent(html, { waitUntil: 'networkidle0' })
  await page.evaluate(() => document.fonts.ready)
  await new Promise((resolve) => setTimeout(resolve, 400))

  const outputPath = path.join(process.env.OG_OUT_DIR ?? publicDir, filename)
  await page.screenshot({
    path: outputPath,
    type: 'png',
    clip: { x: 0, y: 0, width, height },
  })
  await page.close()
  console.log(`✓ Generated ${filename}`)
}

async function main() {
  console.log('Generating Arc OG images with Puppeteer...\n')

  const chromePath = process.env.ARC_CHROME || process.env.CHROME_PATH
  const browser = await puppeteer.launch({
    headless: true,
    ...(chromePath ? { executablePath: chromePath } : { channel: 'chrome' }),
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })

  const main = mainOGHtml(await capturePlayer(browser))
  await generateOGImage(browser, main, 'og-image.png')
  await generateOGImage(browser, main, 'og-landing.png')
  await generateOGImage(browser, main, 'github-social.png', { width: 1280, height: 640 })

  await generateOGImage(browser, editorOGHtml, 'og-editor.png')
  await generateOGImage(browser, docsOGHtml, 'og-docs.png')
  await generateOGImage(browser, mcpOGHtml, 'og-mcp.png')
  await generateOGImage(browser, skillsOGHtml, 'og-skills.png')
  await generateOGImage(browser, softwareOGHtml, 'og-software.png')

  await generateOGImage(
    browser,
    docPageHtml('QUICKSTART', 'Quickstart Guide', 'Get started with Arc in minutes. Create your first diagram and export it.'),
    'og-docs-quickstart.png'
  )
  await generateOGImage(
    browser,
    docPageHtml('FORMAT', 'Diagram Format', 'Complete reference for Arc diagram JSON schema, nodes, and connectors.'),
    'og-docs-format.png'
  )
  await generateOGImage(
    browser,
    docPageHtml('LLM', 'LLM & Agent Reference', 'Agent-friendly documentation for AI-assisted diagram generation.'),
    'og-docs-llm.png'
  )
  await generateOGImage(
    browser,
    docPageHtml('OVERVIEW', 'Overview', 'Arc is a visual diagram editor for architecture diagrams that are readable and versionable.'),
    'og-docs-overview.png'
  )
  await generateOGImage(
    browser,
    docPageHtml('THEMES', 'Themes', 'Color palettes and background treatments that adapt to light and dark modes.'),
    'og-docs-themes.png'
  )

  await browser.close()

  // GitHub social preview wants 1280×640, not the 2× capture.
  const social = path.join(process.env.OG_OUT_DIR ?? publicDir, 'github-social.png')
  if (process.platform === 'darwin') {
    execFileSync('sips', ['-z', '640', '1280', social])
  } else {
    execFileSync('convert', [social, '-resize', '1280x640!', social])
  }
  console.log('✓ Downsampled github-social.png to 1280×640')

  console.log('\nDone!')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
