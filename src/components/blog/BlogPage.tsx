import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useMeta } from '../../hooks/useMeta'
import { BlogArticle, BlogIndex, BlogNotFound } from './BlogContent'
import { posts, blogTitle, blogDescription, blogSchema } from './blogData'
import { SITE_URL } from '../../utils/site'
import '../../blog.css'

export default function BlogPage() {
  const { slug } = useParams<{ slug?: string }>()
  const post = posts.find(item => item.slug === slug)
  const missing = !!slug && !post
  useMeta({
    title: post ? `${post.title} | Arc` : missing ? 'Article not found | Arc' : blogTitle,
    description: post?.description || (missing ? 'This address does not match an Arc article.' : blogDescription),
    url: post ? `/blog/${post.slug}/` : '/blog/',
    image: '/og-image.png',
    type: post ? 'article' : 'website',
    noindex: missing,
    structuredData: missing ? undefined : blogSchema(post, SITE_URL),
  })
  useEffect(() => { document.documentElement.classList.remove('dark') }, [])
  const base = import.meta.env.BASE_URL
  return post ? <BlogArticle post={post} base={base} /> : missing ? <BlogNotFound base={base} /> : <BlogIndex base={base} />
}
