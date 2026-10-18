import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ArcDiagram from '../src/components/ArcDiagram'
import { ArcDiagram as Viewer } from '../packages/viewer/src/ArcDiagram'
import { ArcMermaid } from '../packages/viewer/src/mermaid'
import { renderDiagramSvg } from './renderImage'
import type { ArcDiagramData } from '../src/types/diagram'

const diagram: ArcDiagramData = {
  layout: { width: 500, height: 220 },
  nodes: { a: { x: 30, y: 80, size: 'm' }, b: { x: 300, y: 80, size: 'm' } },
  nodeData: { a: { icon: 'Monitor', name: 'Client', color: 'violet' }, b: { icon: 'Server', name: 'Service', color: 'emerald' } },
  connectors: [{ from: 'a', to: 'b', fromAnchor: 'right', toAnchor: 'left', style: 'api' }],
  connectorStyles: { api: { color: 'violet', strokeWidth: 2 } },
}

describe('host theme rendering', () => {
  test('both React renderers include host styles only when requested', () => {
    for (const Component of [ArcDiagram, Viewer]) {
      const host = renderToStaticMarkup(createElement(Component, { data: diagram, theme: 'inherit', mode: 'dark' }))
      expect(host).toContain('arc-inherit-dark')
      expect(host).toContain('var(--arc-diagram-accent, #93c5fd)')
      expect(host).not.toMatch(/var\([^"<>]+\)[0-9a-f]{2}/)
      const preset = renderToStaticMarkup(createElement(Component, { data: diagram, theme: 'warm' }))
      expect(preset).not.toContain('--arc-diagram-')
    }
  })

  test('CLI SVG accepts the host theme and retains light/dark fallbacks', () => {
    for (const mode of ['light', 'dark'] as const) {
      const { svg } = renderDiagramSvg(diagram, { theme: 'inherit', mode, includeGrid: true })
      expect(svg).toContain(`var(--arc-diagram-background, ${mode === 'dark' ? '#09090b' : '#ffffff'})`)
      expect(svg).toContain('fill="var(--arc-diagram-surface,')
      expect(svg).toContain('fill="var(--arc-diagram-foreground,')
      expect(svg).not.toMatch(/var\([^"<>]+\)[0-9a-f]{2}/)
    }
    expect(() => renderDiagramSvg(diagram, { theme: 'inherit', backgroundColor: 'red" onload="alert(1)' })).toThrow()
  })

  test('native sequence rendering uses the same semantic tokens', () => {
    const svg = renderToStaticMarkup(createElement(ArcMermaid, {
      source: 'sequenceDiagram\n participant A as Client\n participant B as API\n A->>B: Request',
      theme: 'inherit', mode: 'light',
    }))
    expect(svg).toContain('arc-host-sequence')
    expect(svg).toContain('var(--arc-diagram-foreground, #18181b)')
    expect(svg).toContain('var(--arc-diagram-line, #52525b)')
  })
})
