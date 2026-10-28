import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import NativeMermaidSequencesPost from './NativeMermaidSequencesPost'
import { BlogArticle, BlogIndex } from './BlogContent'
import { allPosts, blogDescription, blogTitle, blogSchema } from './blogData'

export function renderBlogPages(base: string, site: string) {
  return [
    { path: 'blog', title: blogTitle, description: blogDescription, html: renderToStaticMarkup(<BlogIndex base={base} />), post: null, schema: blogSchema(undefined, site) },
    ...allPosts.map(post => ({
      path: `blog/${post.slug}`,
      title: `${post.title} | Arc`,
      description: post.description,
      post,
      schema: blogSchema(post, site),
      html: renderToStaticMarkup(post.legacy
        ? <StaticRouter basename={base} location={`${base}blog/${post.slug}`}><NativeMermaidSequencesPost /></StaticRouter>
        : <BlogArticle post={post} base={base} />),
    })),
  ]
}
