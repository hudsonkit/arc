import { Marked, Renderer, type Tokens } from 'marked'

export interface BlogPost {
  title: string
  slug: string
  description: string
  date?: string
  markdown: string
  legacy?: boolean
}

const metadata = import.meta.glob('../../content/blog/*.meta.json', { eager: true, import: 'default' })
const markdown = import.meta.glob('../../content/blog/*.md', { eager: true, query: '?raw', import: 'default' })

export const posts: BlogPost[] = Object.entries(metadata).map(([path, value]) => {
  const post = value as Omit<BlogPost, 'markdown'>
  const body = markdown[path.replace('.meta.json', '.md')] as string
  if (!body || !post.slug || !post.title || !post.description) throw new Error(`Incomplete blog post: ${path}`)
  return { ...post, markdown: body }
}).sort((a, b) => a.slug.localeCompare(b.slug))

export const legacyPost: BlogPost = {
  title: 'Mermaid in, Arc out',
  slug: 'native-mermaid-sequences',
  description: 'Why Arc gives sequence diagrams a native semantic model, renderer, and player.',
  markdown: '',
  legacy: true,
}

export const allPosts = [...posts, legacyPost]
export const blogTitle = 'Arc blog | Diagram guides and build notes'
export const blogDescription = 'Build request walkthroughs, review diagram changes, explain sequences, and export diagrams with working Arc examples.'

export function blogSchema(post: BlogPost | undefined, site: string) {
  const url = `${site}/blog/${post ? `${post.slug}/` : ''}`
  return post ? {
    '@context': 'https://schema.org', '@type': 'Article', headline: post.title,
    description: post.description, url, mainEntityOfPage: url, image: `${site}/og-image.png`,
    author: { '@type': 'Person', name: 'Arach Tchoupani' },
    publisher: { '@type': 'Organization', name: 'Arc · Hudson Kit', url: site },
  } : {
    '@context': 'https://schema.org', '@type': 'CollectionPage', name: blogTitle,
    description: blogDescription, url,
    mainEntity: { '@type': 'ItemList', itemListElement: allPosts.map((item, index) => ({ '@type': 'ListItem', position: index + 1, name: item.title, url: `${site}/blog/${item.slug}/` })) },
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
}

export function blogPath(base: string, path = '') {
  const suffix = path && !/\.[a-z0-9]+$/i.test(path) ? '/' : ''
  return `${base.replace(/\/?$/, '/')}blog/${path}${suffix}`
}

export function renderMarkdown(source: string, base: string) {
  const ids = new Map<string, number>()
  const assetUrl = (href: string) => /^(assets|examples)\//.test(href) ? blogPath(base, href) : href
  const parser = new Marked({ gfm: true, breaks: false })
  parser.use({ renderer: {
    // Articles are repository-authored Markdown. Raw HTML is intentionally text.
    html({ text }: Tokens.HTML | Tokens.Tag) { return escapeHtml(text) },
    heading({ tokens, depth }: Tokens.Heading) {
      const label = this.parser.parseInline(tokens)
      const seed = label.replace(/<[^>]+>/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      const count = ids.get(seed) || 0
      ids.set(seed, count + 1)
      const id = count ? `${seed}-${count}` : seed
      return `<h${depth} id="${id}">${label}<a class="arc-note__anchor" href="#${id}" aria-label="Link to this section">#</a></h${depth}>\n`
    },
    link({ href, title, tokens }: Tokens.Link) {
      const label = this.parser.parseInline(tokens)
      if (/^(javascript|data|vbscript):/i.test(href)) return label
      return `<a href="${escapeHtml(assetUrl(href))}"${title ? ` title="${escapeHtml(title)}"` : ''}>${label}</a>`
    },
    image({ href, text, title }: Tokens.Image) {
      if (/^(javascript|data|vbscript):/i.test(href)) return escapeHtml(text)
      return `<img src="${escapeHtml(assetUrl(href))}" alt="${escapeHtml(text)}"${title ? ` title="${escapeHtml(title)}"` : ''} loading="lazy" decoding="async" />`
    },
    code({ text, lang }: Tokens.Code) {
      return `<pre tabindex="0" aria-label="${escapeHtml(lang || 'Code')} example"><code${lang ? ` class="language-${escapeHtml(lang.split(' ')[0])}"` : ''}>${escapeHtml(text)}\n</code></pre>\n`
    },
    table(token: Tokens.Table) {
      return `<div class="arc-note__table" tabindex="0" role="region" aria-label="Scrollable comparison table">${Renderer.prototype.table.call(this, token)}</div>`
    },
  } })
  return parser.parse(source) as string
}
