import { createElement, useMemo, type CSSProperties, type ReactNode } from 'react'
import { layoutExploded } from './layout'
import { createExplodedScene, type ExplodedSvgNode } from './scene'
import type { ExplodedDocument, ExplodedRenderOptions } from './types'

export interface ArcExplodedProps extends ExplodedRenderOptions {
  document: ExplodedDocument
  className?: string
  style?: CSSProperties
}
function renderNode(node: ExplodedSvgNode, key = 'root'): ReactNode {
  const props: Record<string, string | number> = { key }
  for (const [name, value] of Object.entries(node.attrs ?? {})) {
    props[name.startsWith('aria-') || name.startsWith('data-') ? name : name.replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = value
  }
  return createElement(node.tag, props, ...(node.children ?? []).map((child, i) => typeof child === 'string' ? child : renderNode(child, `${key}-${i}`)))
}

/** Controlled, SSR-safe native assembly viewer. Source defaults to fully exploded. */
export function ArcExploded({ document, progress = 1, mode = 'light', labels = true, guides = true, className, style }: ArcExplodedProps) {
  const layout = useMemo(() => layoutExploded(document, labels), [document, labels])
  const scene = useMemo(() => createExplodedScene(document, { progress, mode, labels, guides }, layout), [document, progress, mode, labels, guides, layout])
  return <div className={className} style={style}>{renderNode({ ...scene, attrs: { ...scene.attrs, width: '100%', height: '100%' } })}</div>
}
