import { useEffect } from 'react'
import { SITE_URL } from '../utils/site'

interface MetaProps {
  title?: string
  description?: string
  image?: string
  url?: string
  type?: 'website' | 'article'
  noindex?: boolean
  structuredData?: object
}

const BASE_URL = SITE_URL

export function useMeta({ title, description, image, url, type = 'website', noindex = false, structuredData }: MetaProps) {
  const schema = structuredData ? JSON.stringify(structuredData).replace(/</g, '\\u003c') : null
  useEffect(() => {
    // Store original values to restore on unmount
    const originalTitle = document.title
    const titleEl = document.querySelector('meta[name="title"]') as HTMLMetaElement
    const originalMetaTitle = titleEl?.content
    const getMetaContent = (property: string) => {
      const el = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement
      return el?.content
    }

    const originals = {
      'og:title': getMetaContent('og:title'),
      'og:description': getMetaContent('og:description'),
      'og:image': getMetaContent('og:image'),
      'og:url': getMetaContent('og:url'),
      'og:type': getMetaContent('og:type'),
      'twitter:title': getMetaContent('twitter:title'),
      'twitter:description': getMetaContent('twitter:description'),
      'twitter:image': getMetaContent('twitter:image'),
      'twitter:url': getMetaContent('twitter:url'),
    }
    const descriptionEl = document.querySelector('meta[name="description"]') as HTMLMetaElement
    const originalDescription = descriptionEl?.content
    const canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement
    const originalCanonical = canonical?.getAttribute('href')
    const robots = document.querySelector('meta[name="robots"]') as HTMLMetaElement
    const originalRobots = robots?.content
    // A prerendered article can be followed by a client-side docs navigation.
    // Its schema must leave with the page, just like its title and canonical.
    document.getElementById('arc-blog-schema')?.remove()
    if (schema) {
      const script = document.createElement('script')
      script.id = 'arc-blog-schema'
      script.type = 'application/ld+json'
      script.textContent = schema
      document.head.appendChild(script)
    }

    // Update meta tags
    const setMeta = (property: string, content: string) => {
      let el = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement
      if (!el) {
        el = document.createElement('meta')
        el.setAttribute('property', property)
        document.head.appendChild(el)
      }
      el.content = content
    }

    if (title) {
      document.title = title
      if (titleEl) titleEl.content = title
      setMeta('og:title', title)
      setMeta('twitter:title', title)
    }
    setMeta('og:type', type)

    if (description) {
      setMeta('og:description', description)
      setMeta('twitter:description', description)
      // Also update the regular description meta
      const descEl = document.querySelector('meta[name="description"]') as HTMLMetaElement
      if (descEl) descEl.content = description
    }

    if (image) {
      const fullImageUrl = image.startsWith('http') ? image : `${BASE_URL}${image}`
      setMeta('og:image', fullImageUrl)
      setMeta('twitter:image', fullImageUrl)
    }

    if (url) {
      const fullUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`
      setMeta('og:url', fullUrl)
      setMeta('twitter:url', fullUrl)
      let canonicalEl = canonical
      if (!canonicalEl) {
        canonicalEl = document.createElement('link')
        canonicalEl.rel = 'canonical'
        document.head.appendChild(canonicalEl)
      }
      canonicalEl.href = fullUrl
    }
    if (noindex) {
      const robotsEl = robots || document.createElement('meta')
      robotsEl.name = 'robots'
      robotsEl.content = 'noindex, follow'
      if (!robots) document.head.appendChild(robotsEl)
    }

    // Cleanup: restore original values; drop tags this render created
    return () => {
      document.title = originalTitle
      if (titleEl && originalMetaTitle !== undefined) titleEl.content = originalMetaTitle
      document.getElementById('arc-blog-schema')?.remove()
      if (descriptionEl && originalDescription !== undefined) descriptionEl.content = originalDescription
      const currentCanonical = document.querySelector('link[rel="canonical"]')
      if (originalCanonical !== undefined && originalCanonical !== null) currentCanonical?.setAttribute('href', originalCanonical)
      else currentCanonical?.remove()
      const currentRobots = document.querySelector('meta[name="robots"]')
      if (originalRobots !== undefined) currentRobots?.setAttribute('content', originalRobots)
      else if (noindex) currentRobots?.remove()
      Object.entries(originals).forEach(([property, content]) => {
        const el = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement
        if (!el) return
        if (content) el.content = content
        else el.remove()
      })
    }
  }, [title, description, image, url, type, noindex, schema])
}
