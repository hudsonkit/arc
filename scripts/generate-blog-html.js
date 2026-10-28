// Render the same article components used by React into deployable HTML.
// Crawlers and readers without JavaScript receive the complete article.
import { createServer } from 'vite'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')
const base = (process.env.ARC_BASE || '/').replace(/\/?$/, '/')
const site = (process.env.SITE_URL || 'https://hudsonkit.com/arc').replace(/\/$/, '')
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
const shell = readFileSync(path.join(dist, 'index.html'), 'utf8')
const manifest = JSON.parse(readFileSync(path.join(dist, '.vite/manifest.json'), 'utf8'))
const blogEntries = ['src/components/blog/BlogPage.tsx', 'src/components/blog/NativeMermaidSequencesPost.tsx']
const styles = new Set()
const visited = new Set()
const visit = key => {
  if (visited.has(key)) return
  visited.add(key)
  const chunk = manifest[key]
  if (!chunk) return
  for (const css of chunk.css || []) styles.add(css)
  for (const imported of chunk.imports || []) visit(imported)
}
for (const entry of blogEntries) visit(entry)

const server = await createServer({ configFile: path.join(root, 'vite.config.js'), server: { middlewareMode: true }, appType: 'custom', mode: 'development' })
try {
  const { renderBlogPages } = await server.ssrLoadModule('/src/components/blog/prerender.tsx')
  const pages = renderBlogPages(base, site)
  for (const page of pages) {
    const url = `${site}/${page.path}/`
    const image = `${site}/og-image.png`
    let html = shell
      .replace(/<title>.*?<\/title>/, () => `<title>${escape(page.title)}</title>`)
      .replace(/<link rel="canonical" href="[^"]*"/, () => `<link rel="canonical" href="${escape(url)}"`)
      .replace(/<meta name="title" content="[^"]*"/, () => `<meta name="title" content="${escape(page.title)}"`)
      .replace(/<meta name="description" content="[^"]*"/, () => `<meta name="description" content="${escape(page.description)}"`)
    for (const prefix of ['og', 'twitter']) {
      for (const [key, value] of Object.entries({ title: page.title, description: page.description, url, image })) {
        html = html.replace(new RegExp(`<meta property="${prefix}:${key}" content="[^"]*"`), () => `<meta property="${prefix}:${key}" content="${escape(value)}"`)
      }
    }
    html = html.replace(/<meta property="og:type" content="[^"]*"/, `<meta property="og:type" content="${page.post ? 'article' : 'website'}"`)
    const extraHead = [...styles].map(css => `<link rel="stylesheet" href="${base}${css}" />`).join('\n') +
      `\n<script id="arc-blog-schema" type="application/ld+json">${JSON.stringify(page.schema).replace(/</g, '\\u003c')}</script>`
    html = html.replace('</head>', `${extraHead}\n</head>`)
      .replace('<div id="root"></div>', () => `<div id="root">${page.html}</div>`)
    const output = path.join(dist, page.path)
    mkdirSync(output, { recursive: true })
    writeFileSync(path.join(output, 'index.html'), html)
    if (page.post && !page.post.legacy) {
      writeFileSync(path.join(dist, 'blog', `${page.post.slug}.md`), `# ${page.post.title}\n\n${page.post.markdown}`)
    }
    console.log(`✓ Rendered dist/${page.path}/index.html`)
  }
  // Keep the existing routes, adding the complete generated blog inventory.
  const sitemapPath = path.join(dist, 'sitemap.xml')
  let sitemap = readFileSync(sitemapPath, 'utf8')
  const added = pages.filter(page => !sitemap.includes(`<loc>${site}/${page.path}/</loc>`))
    .map(page => `  <url><loc>${escape(`${site}/${page.path}/`)}</loc><priority>0.6</priority></url>`).join('\n')
  sitemap = sitemap.replace('</urlset>', `${added}\n</urlset>`)
  writeFileSync(sitemapPath, sitemap)
} finally {
  await server.close()
}
