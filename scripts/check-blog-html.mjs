import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')
const base = (process.env.ARC_BASE || '/').replace(/\/?$/, '/')
const site = (process.env.SITE_URL || 'https://hudsonkit.com/arc').replace(/\/$/, '')
const escape = text => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
const posts = readdirSync(path.join(root, 'src/content/blog')).filter(file => file.endsWith('.meta.json')).map(file => JSON.parse(readFileSync(path.join(root, 'src/content/blog', file), 'utf8')))
assert.equal(posts.length, 4)
const pages = ['blog', ...posts.map(post => `blog/${post.slug}`), 'blog/native-mermaid-sequences']
const sitemap = readFileSync(path.join(dist, 'sitemap.xml'), 'utf8')
for (const route of pages) {
  const html = readFileSync(path.join(dist, route, 'index.html'), 'utf8')
  assert.equal((html.match(/<h1[ >]/g) || []).length, 1, `${route}: one readable heading`)
  assert.ok(html.includes(`<link rel="canonical" href="${site}/${route}/"`), `${route}: canonical`)
  assert.ok(html.includes(`property="og:url" content="${site}/${route}/"`), `${route}: Open Graph URL`)
  assert.ok(html.includes(`property="twitter:url" content="${site}/${route}/"`), `${route}: Twitter URL`)
  const schema = JSON.parse(html.match(/<script id="arc-blog-schema" type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])
  assert.equal(schema.url, `${site}/${route}/`)
  assert.equal(schema['@type'], route === 'blog' ? 'CollectionPage' : 'Article')
  assert.ok(sitemap.includes(`<loc>${site}/${route}/</loc>`), `${route}: sitemap`)
  assert.ok(!/library-file:|\/Users\/arach|grok-language-review|language-review-request/.test(html), `${route}: no private artifacts`)
  for (const [, asset] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (!asset.startsWith(base) || !/\.(?:css|js|png|gif|zip|md)$/.test(asset)) continue
    assert.ok(existsSync(path.join(dist, asset.slice(base.length))), `${route}: asset ${asset}`)
  }
}
for (const post of posts) {
  const md = readFileSync(path.join(root, 'src/content/blog', `${post.slug}.md`), 'utf8')
  const html = readFileSync(path.join(dist, 'blog', post.slug, 'index.html'), 'utf8')
  assert.ok(html.includes(`<title>${escape(post.title)} | Arc</title>`))
  assert.ok(html.includes(`name="description" content="${escape(post.description)}"`))
  for (const [, code] of md.matchAll(/```[^\n]*\n([\s\S]*?)\n```/g)) {
    assert.ok(html.includes(escape(code)), `${post.slug}: source code preserved in HTML`)
  }
  assert.equal(readFileSync(path.join(dist, 'blog', `${post.slug}.md`), 'utf8'), `# ${post.title}\n\n${md}`)
}
console.log(`Verified ${pages.length} static blog pages, metadata, sitemap, local assets, and every article code block for ${site} (${base}).`)
