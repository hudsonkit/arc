import type { ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Github } from 'lucide-react'
import { allPosts, blogPath, renderMarkdown, type BlogPost } from './blogData'

function Shell({ base, children }: { base: string; children: ReactNode }) {
  return <div className="arc-note">
    <a className="arc-note__skip" href="#article">Skip to content</a>
    <header className="arc-note__nav">
      <a href={base} className="arc-note__brand" aria-label="Arc home"><span aria-hidden="true">A</span>Arc / notes</a>
      <nav aria-label="Blog navigation">
        <a href={blogPath(base)}>Blog</a>
        <a href={`${base}docs`}>Docs</a>
        <a href="https://github.com/hudsonkit/arc"><Github size={14} aria-hidden="true" /> GitHub</a>
      </nav>
    </header>
    <main id="article" className="arc-note__main">{children}</main>
  </div>
}

export function BlogIndex({ base }: { base: string }) {
  return <Shell base={base}>
    <div className="arc-note__index">
      <header className="arc-note__hero arc-note__index-hero">
        <h1>Diagrams that explain the work.</h1>
        <p>Guides and build notes for turning system diagrams into something you can follow, review, and share.</p>
      </header>
      <section className="arc-note__post-list" aria-label="Articles">
        {allPosts.map(post => <article key={post.slug} className="arc-note__post-row">
          <div>
            <h2><a href={blogPath(base, post.slug)}>{post.title}</a></h2>
            <p>{post.description}</p>
            <span className="arc-note__post-kind">{post.legacy ? 'Build note' : 'Guide with working examples'}</span>
          </div>
          <ArrowRight size={22} aria-hidden="true" />
        </article>)}
      </section>
      <p className="arc-note__index-footer">Looking for an API or command? <a href={`${base}docs`}>Open the Arc documentation.</a></p>
    </div>
  </Shell>
}

export function BlogArticle({ post, base }: { post: BlogPost; base: string }) {
  const related = allPosts.filter(item => item.slug !== post.slug).slice(0, 3)
  return <Shell base={base}>
    <article>
      <a className="arc-note__back" href={blogPath(base)}><ArrowLeft size={14} aria-hidden="true" /> All articles</a>
      <header className="arc-note__hero arc-note__article-hero">
        <h1>{post.title}</h1>
        <p>{post.description}</p>
      </header>
      <div className="arc-note__prose arc-note__lead" dangerouslySetInnerHTML={{ __html: renderMarkdown(post.markdown, base) }} />
      <aside className="arc-note__resources" aria-label="Article files">
        <h2>Work with the examples</h2>
        <p>Download the source and supporting files to follow the guide in your own project.</p>
        <div><a href={blogPath(base, 'examples/arc-article-examples.zip')} download>Download examples <ArrowRight size={15} aria-hidden="true" /></a>
        <a href={blogPath(base, `${post.slug}.md`)} download>Read as Markdown</a></div>
      </aside>
      <nav className="arc-note__related" aria-label="Related articles">
        <h2>Keep reading</h2>
        {related.map(item => <a key={item.slug} href={blogPath(base, item.slug)}>{item.title}<ArrowRight size={17} aria-hidden="true" /></a>)}
      </nav>
    </article>
  </Shell>
}

export function BlogNotFound({ base }: { base: string }) {
  return <Shell base={base}><div className="arc-note__hero"><h1>Article not found.</h1><p>This address does not match an Arc article.</p><a className="arc-note__next" href={blogPath(base)}>Browse the blog <ArrowRight size={20} aria-hidden="true" /></a></div></Shell>
}
