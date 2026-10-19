import { buildEditorHandoff } from './diagramHandoff.ts'
import { assertRenderTheme, renderDiagramSvg, RenderError, resolveRenderMode, type RenderSvgOptions } from './renderImage.ts'
import { THEMES, themeCanvas, type ThemeId } from '../src/utils/themes.ts'
import type { ArcDiagramData } from '../src/types/diagram.ts'

export type RenderHtmlFormat = 'component' | 'iframe' | 'html'

export interface RenderHtmlOptions extends RenderSvgOptions {
  format?: RenderHtmlFormat
  componentName?: string
  dataName?: string
  theme?: string
  mode?: 'light' | 'dark'
  interactive?: boolean
  baseUrl?: string
  sessionId?: string
  title?: string
  width?: number | string
  height?: number | string
}

export interface RenderedHtml {
  format: RenderHtmlFormat
  code: string
  mimeType: 'text/html' | 'text/tsx'
  url?: string
  theme?: ThemeId
  mode?: 'light' | 'dark'
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/
const CSS_LENGTH = /^\d+(?:\.\d+)?(?:px|%)?$/

function assertIdentifier(value: string | undefined, fallback: string, name: string): string {
  const resolved = value ?? fallback
  if (!IDENTIFIER.test(resolved)) {
    throw new RenderError('render/invalid-option', `${name} must be a valid identifier`, [`use letters, digits, _ or $; ${name} cannot start with a digit`])
  }
  return resolved
}

function assertCssLength(value: number | string | undefined, fallback: number, name: string): string {
  const resolved = value ?? fallback
  if (typeof resolved === 'number') {
    if (!Number.isFinite(resolved) || resolved <= 0) {
      throw new RenderError('render/invalid-option', `${name} must be positive`, [`pass a positive ${name}`])
    }
    return String(Math.round(resolved))
  }
  if (!CSS_LENGTH.test(resolved)) {
    throw new RenderError('render/invalid-option', `${name} must be a number of pixels or CSS percentage`, [`use values like 680, 680px, or 100% for ${name}`])
  }
  return resolved
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function componentSource(diagram: ArcDiagramData, options: RenderHtmlOptions): string {
  const componentName = assertIdentifier(options.componentName, 'ArcDiagramExample', 'componentName')
  const dataName = assertIdentifier(options.dataName, 'diagram', 'dataName')
  const theme = options.theme as ThemeId | undefined
  const mode = options.mode
  const props = [`data={${dataName}}`]
  if (mode) props.push(`mode="${mode}"`)
  if (theme) props.push(`theme="${theme}"`)
  if (options.interactive !== undefined) props.push(`interactive={${options.interactive}}`)

  return `import { ArcDiagram, type ArcDiagramData } from '@hudsonkit/arc'

const ${dataName}: ArcDiagramData = ${JSON.stringify(diagram, null, 2)}

export function ${componentName}() {
  return <ArcDiagram ${props.join(' ')} />
}
`
}

function iframeSource(diagram: ArcDiagramData, options: RenderHtmlOptions): { code: string; url: string } {
  const theme = options.theme as ThemeId | undefined
  const mode = options.mode
  const rendered = renderDiagramSvg(diagram, options)
  const width = assertCssLength(options.width, rendered.width, 'width')
  const height = assertCssLength(options.height, rendered.height, 'height')
  const title = options.title ?? diagram.id ?? 'Arc diagram'
  const handoff = buildEditorHandoff(diagram, {
    sessionId: options.sessionId,
    baseUrl: options.baseUrl,
    theme,
    mode,
  })
  const code = `<iframe src="${escapeHtml(handoff.editorUrl)}" title="${escapeHtml(title)}" width="${escapeHtml(width)}" height="${escapeHtml(height)}" loading="lazy" allow="clipboard-write" referrerpolicy="no-referrer"></iframe>`
  return { code, url: handoff.editorUrl }
}

function htmlSource(diagram: ArcDiagramData, options: RenderHtmlOptions): string {
  const rendered = renderDiagramSvg(diagram, options)
  const title = options.title ?? diagram.id ?? 'Arc diagram'
  const background = rendered.theme ? themeCanvas(rendered.theme, rendered.mode ?? 'light') : '#fafafa'
  const fontImport = rendered.theme ? THEMES[rendered.theme].brand?.fontImport : undefined
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>${fontImport ? `\n  <link rel="stylesheet" href="${escapeHtml(fontImport)}" />` : ''}
  <style>
    html, body { margin: 0; min-height: 100%; background: ${background}; }
    body { display: grid; place-items: center; padding: 24px; box-sizing: border-box; }
    svg { display: block; max-width: 100%; height: auto; }
  </style>
</head>
<body>
${rendered.svg}
</body>
</html>
`
}

export function renderDiagramHtml(diagram: ArcDiagramData, options: RenderHtmlOptions = {}): RenderedHtml {
  const format = options.format ?? 'html'
  const theme = assertRenderTheme(options.theme)
  const mode = resolveRenderMode(theme, options.mode)
  const resolvedOptions: RenderHtmlOptions = { ...options, theme, mode }
  if (format === 'component') {
    return { format, code: componentSource(diagram, resolvedOptions), mimeType: 'text/tsx', theme, mode }
  }
  if (format === 'iframe') {
    const iframe = iframeSource(diagram, resolvedOptions)
    return { format, code: iframe.code, mimeType: 'text/html', url: iframe.url, theme, mode }
  }
  if (format === 'html') {
    return { format, code: htmlSource(diagram, resolvedOptions), mimeType: 'text/html', theme, mode }
  }
  throw new RenderError('render/invalid-option', 'format must be component, iframe, or html', ['use format="component", "iframe", or "html"'])
}
