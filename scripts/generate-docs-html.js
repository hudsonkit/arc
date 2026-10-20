/**
 * Post-build script to create docs/index.html with proper OG tags
 * Copies the built index.html and replaces meta tags for /docs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.join(__dirname, '..', 'dist')

// Canonical site URL for the build — hudsonkit.com/arc is the product home;
// SITE_URL lets a standalone deploy (e.g. arc.jdi.sh) keep its own identity.
const SITE_URL = (process.env.SITE_URL || 'https://hudsonkit.com/arc').replace(/\/$/, '')

// Read the built index.html
const indexPath = path.join(distDir, 'index.html')
let html = readFileSync(indexPath, 'utf-8')

// Retag the root page itself when SITE_URL points at another origin —
// index.html ships hudsonkit.com/arc URLs as the canonical default.
const swept = html.replaceAll('https://hudsonkit.com/arc', SITE_URL)
if (swept !== html) {
  writeFileSync(indexPath, swept)
  html = swept
  console.log(`✓ Retagged dist/index.html for ${SITE_URL}`)
}

// Replace OG meta tags for docs
const replacements = [
  // Title
  [/<title>.*?<\/title>/, '<title>Arc Documentation</title>'],
  [/<meta name="title" content=".*?"/, '<meta name="title" content="Arc Documentation"'],
  [/<meta property="og:title" content=".*?"/, '<meta property="og:title" content="Arc Documentation"'],
  [/<meta property="twitter:title" content=".*?"/, '<meta property="twitter:title" content="Arc Documentation"'],

  // Description
  [/<meta name="description" content=".*?"/, '<meta name="description" content="Everything you need to create beautiful architecture diagrams with Arc."'],
  [/<meta property="og:description" content=".*?"/, '<meta property="og:description" content="Everything you need to create beautiful architecture diagrams with Arc."'],
  [/<meta property="twitter:description" content=".*?"/, '<meta property="twitter:description" content="Everything you need to create beautiful architecture diagrams with Arc."'],

  // URL
  // URL
  [/<link rel="canonical" href=".*?"/, `<link rel="canonical" href="${SITE_URL}/docs"`],
  [/<meta property="og:url" content=".*?"/, `<meta property="og:url" content="${SITE_URL}/docs"`],
  [/<meta property="twitter:url" content=".*?"/, `<meta property="twitter:url" content="${SITE_URL}/docs"`],

  // Image
  [/<meta property="og:image" content=".*?"/, `<meta property="og:image" content="${SITE_URL}/og-docs.png"`],
  [/<meta property="twitter:image" content=".*?"/, `<meta property="twitter:image" content="${SITE_URL}/og-docs.png"`],
]

for (const [pattern, replacement] of replacements) {
  html = html.replace(pattern, replacement)
}

// Ensure docs directory exists
const docsDir = path.join(distDir, 'docs')
if (!existsSync(docsDir)) {
  mkdirSync(docsDir, { recursive: true })
}

// Write docs/index.html
writeFileSync(path.join(docsDir, 'index.html'), html)
console.log('✓ Generated dist/docs/index.html with docs OG tags')

// Generate docs/agents/index.html (LLM reference page)
const agentsDir = path.join(docsDir, 'agents')
if (!existsSync(agentsDir)) {
  mkdirSync(agentsDir, { recursive: true })
}

let agentsHtml = readFileSync(indexPath, 'utf-8')
const agentsReplacements = [
  [/<title>.*?<\/title>/, '<title>LLM & Agent Reference | Arc Docs</title>'],
  [/<meta name="title" content=".*?"/, '<meta name="title" content="LLM & Agent Reference | Arc Docs"'],
  [/<meta property="og:title" content=".*?"/, '<meta property="og:title" content="LLM & Agent Reference | Arc Docs"'],
  [/<meta property="twitter:title" content=".*?"/, '<meta property="twitter:title" content="LLM & Agent Reference | Arc Docs"'],
  [/<meta name="description" content=".*?"/, '<meta name="description" content="Agent-friendly documentation for AI-assisted diagram generation with Arc."'],
  [/<meta property="og:description" content=".*?"/, '<meta property="og:description" content="Agent-friendly documentation for AI-assisted diagram generation with Arc."'],
  [/<meta property="twitter:description" content=".*?"/, '<meta property="twitter:description" content="Agent-friendly documentation for AI-assisted diagram generation with Arc."'],
  [/<link rel="canonical" href=".*?"/, `<link rel="canonical" href="${SITE_URL}/docs/agents"`],
  [/<meta property="og:url" content=".*?"/, `<meta property="og:url" content="${SITE_URL}/docs/agents"`],
  [/<meta property="twitter:url" content=".*?"/, `<meta property="twitter:url" content="${SITE_URL}/docs/agents"`],
  [/<meta property="og:image" content=".*?"/, `<meta property="og:image" content="${SITE_URL}/og-docs-llm.png"`],
  [/<meta property="twitter:image" content=".*?"/, `<meta property="twitter:image" content="${SITE_URL}/og-docs-llm.png"`],
]

for (const [pattern, replacement] of agentsReplacements) {
  agentsHtml = agentsHtml.replace(pattern, replacement)
}

writeFileSync(path.join(agentsDir, 'index.html'), agentsHtml)
console.log('✓ Generated dist/docs/agents/index.html with agents OG tags')

// Software listicle page shares its data with src/components/SoftwareListPage.tsx
// via this JSON file — keep titles/FAQs in sync there, not here.
const softwareData = JSON.parse(
  readFileSync(path.join(__dirname, '..', 'src', 'content', 'diagramSoftware.json'), 'utf-8')
)
const softwareJsonLd = JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebPage',
      '@id': `${SITE_URL}/${softwareData.slug}`,
      name: softwareData.metaTitle,
      description: softwareData.metaDescription,
    },
    {
      '@type': 'ItemList',
      name: softwareData.title,
      itemListOrder: 'https://schema.org/ItemListUnordered',
      numberOfItems: softwareData.tools.length,
      itemListElement: softwareData.tools.map((tool, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        item: {
          '@type': 'SoftwareApplication',
          name: tool.name,
          url: tool.url,
          description: tool.blurb,
          applicationCategory: 'DeveloperApplication',
        },
      })),
    },
    {
      '@type': 'FAQPage',
      mainEntity: softwareData.faqs.map((faq) => ({
        '@type': 'Question',
        name: faq.q,
        acceptedAnswer: { '@type': 'Answer', text: faq.a },
      })),
    },
  ],
})

const exampleCatalog = JSON.parse(readFileSync(path.join(__dirname, '..', 'src/content/exampleCatalog.json'), 'utf-8'))
const examplePages = [
  { path: 'panel-cube', title: 'Panel cube | Arc', description: 'Rotate and unfold a field recorder with native Arc panel diagrams.', image: 'og-landing.png' },
  { path: 'exploded', title: 'Exploded views | Arc', description: 'Explore a mechanical keyboard and an AI stack as native Arc diagrams.', image: 'og-landing.png' },
  { path: 'examples/connection-pool', title: 'Connection pool | Arc', description: 'Adjust demand and explore borrowing, waiting, and connection reuse.', image: 'readme-connection-pool.png' },
  { path: 'examples', title: 'Diagram examples | Arc', description: 'Explore architecture, sequence, flowchart, and state diagrams with downloadable source.', image: 'og-landing.png' },
  ...exampleCatalog.map(example => ({ path: `examples/${example.id}`, title: `${example.title} | Arc examples`, description: example.description, image: 'og-landing.png' })),
]

const sharePages = [
  ...examplePages,
  {
    path: 'examples/connection-pool',
    title: 'How a connection pool works | Arc',
    description: 'Borrow, wait, reuse. Explore a connection pool with a live, deterministic model.',
    image: 'og-image.png',
  },
  {
    path: 'mcp',
    title: 'Arc MCP | Diagram tools for AI agents',
    description: 'Give AI agents tools to validate, lay out, diff, render, and hand off architecture diagrams.',
    image: 'og-mcp.png',
  },
  {
    path: softwareData.slug,
    title: softwareData.metaTitle,
    description: softwareData.metaDescription,
    image: 'og-software.png',
    extraHead:
      `<script type="application/ld+json">${softwareJsonLd}</script>`,
  },
  {
    path: 'skills',
    title: 'Arc Skills | Architecture diagram playbooks for agents',
    description: 'Reusable agent skills for creating, repairing, reviewing, and exporting architecture diagrams with Arc.',
    image: 'og-skills.png',
  },
  {
    path: 'docs/agent-mcp',
    title: 'MCP Server | Arc Docs',
    description: 'Reference for Arc MCP tools, resources, configuration, and rendering output.',
    image: 'og-docs-llm.png',
  },
  {
    path: 'docs/skills',
    title: 'Agent Skills | Arc Docs',
    description: 'Reference for reusable Arc diagram authoring, repair, and export skills.',
    image: 'og-docs-llm.png',
  },
  {
    path: 'docs/examples',
    title: 'Examples | Arc Docs',
    description: 'Real-world Arc diagram examples.',
    image: 'og-docs.png',
  },
  {
    path: 'docs/views',
    title: 'Guided Views | Arc Docs',
    description: 'Turn a diagram into an ordered walkthrough with a chapter rail and deep links.',
    image: 'og-docs.png',
  },
  {
    path: 'docs/focus-stories',
    title: 'Focus Stories | Arc Docs',
    description: 'Explain an architecture path when a reader explores a node.',
    image: 'og-docs.png',
  },
  {
    path: 'docs/group-layout',
    title: 'Group Layout | Arc Docs',
    description: 'Keep architecture nodes aligned inside explicit system boundaries.',
    image: 'og-docs.png',
  },
  {
    path: 'docs/diff',
    title: 'Diagram Diffs | Arc Docs',
    description: 'Diff two diagrams and render the change set — added, removed, moved, changed.',
    image: 'og-docs.png',
  },
  {
    path: 'docs/agentic-loop',
    title: 'The Agentic Loop | Arc Docs',
    description: 'Diagrams maintained by the same agents that change the code.',
    image: 'og-docs.png',
  },
  {
    path: 'docs/mermaid-import',
    title: 'Mermaid Import | Arc Docs',
    description: 'Project Mermaid flowcharts and state diagrams into positioned Arc data.',
    image: 'og-docs.png',
  },
]

for (const page of sharePages) {
  const pageDir = path.join(distDir, page.path)
  mkdirSync(pageDir, { recursive: true })

  let pageHtml = readFileSync(indexPath, 'utf-8')
  const pageUrl = `${SITE_URL}/${page.path}`
  const pageImage = `${SITE_URL}/${page.image}`
  const pageReplacements = [
    [/<title>.*?<\/title>/, `<title>${page.title}</title>`],
    [/<link rel="canonical" href=".*?"/, `<link rel="canonical" href="${pageUrl}"`],
    [/<meta name="title" content=".*?"/, `<meta name="title" content="${page.title}"`],
    [/<meta property="og:title" content=".*?"/, `<meta property="og:title" content="${page.title}"`],
    [/<meta property="twitter:title" content=".*?"/, `<meta property="twitter:title" content="${page.title}"`],
    [/<meta name="description" content=".*?"/, `<meta name="description" content="${page.description}"`],
    [/<meta property="og:description" content=".*?"/, `<meta property="og:description" content="${page.description}"`],
    [/<meta property="twitter:description" content=".*?"/, `<meta property="twitter:description" content="${page.description}"`],
    [/<meta property="og:url" content=".*?"/, `<meta property="og:url" content="${pageUrl}"`],
    [/<meta property="twitter:url" content=".*?"/, `<meta property="twitter:url" content="${pageUrl}"`],
    [/<meta property="og:image" content=".*?"/, `<meta property="og:image" content="${pageImage}"`],
    [/<meta property="twitter:image" content=".*?"/, `<meta property="twitter:image" content="${pageImage}"`],
  ]

  for (const [pattern, replacement] of pageReplacements) {
    pageHtml = pageHtml.replace(pattern, replacement)
  }

  if (page.extraHead) {
    pageHtml = pageHtml.replace('</head>', `  ${page.extraHead}\n</head>`)
  }

  writeFileSync(path.join(pageDir, 'index.html'), pageHtml)
  console.log(`✓ Generated dist/${page.path}/index.html with share-page OG tags`)
}

// robots.txt + sitemap.xml are generated here so the URLs follow SITE_URL.
const sitemapRoutes = [
  ['/', '1.0'],
  ...examplePages.map(page => ['/' + page.path, '0.7']),
  ['/' + softwareData.slug, '0.9'],
  ['/mcp', '0.9'],
  ['/skills', '0.9'],
  ['/docs', '0.8'],
  ['/docs/agents', '0.7'],
  ['/docs/examples', '0.6'],
  ['/docs/views', '0.6'],
  ['/docs/focus-stories', '0.6'],
  ['/docs/group-layout', '0.6'],
  ['/docs/diff', '0.6'],
  ['/docs/agentic-loop', '0.6'],
  ['/docs/mermaid-import', '0.6'],
  ['/docs/agent-mcp', '0.6'],
  ['/docs/skills', '0.6'],
  ['/editor', '0.5'],
  ['/showcase', '0.5'],
  ['/examples/connection-pool', '0.5'],
  ['/blog/native-mermaid-sequences', '0.4'],
  ['/iso-demo', '0.3'],
  ['/iso-examples', '0.3'],
  ['/inspiration', '0.3'],
]
const sitemapXml =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  sitemapRoutes
    .map(([route, priority]) => `  <url><loc>${SITE_URL}${route === '/' ? '/' : route}</loc><priority>${priority}</priority></url>`)
    .join('\n') +
  '\n</urlset>\n'
writeFileSync(path.join(distDir, 'sitemap.xml'), sitemapXml)
writeFileSync(
  path.join(distDir, 'robots.txt'),
  `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`
)
console.log(`✓ Generated dist/robots.txt + dist/sitemap.xml for ${SITE_URL}`)
