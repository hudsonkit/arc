import { describe, expect, test } from 'bun:test'
import { renderDiagramHtml } from './renderHtml.ts'
import type { ArcDiagramData } from '../src/types/diagram.ts'

const diagram: ArcDiagramData = {
  id: 'service-map',
  layout: { width: 640, height: 320 },
  nodes: {
    api: { x: 80, y: 120, size: 'm' },
    db: { x: 400, y: 120, size: 'm' },
  },
  nodeData: {
    api: { icon: 'Server', name: 'API', color: 'emerald' },
    db: { icon: 'Database', name: 'Postgres', color: 'blue' },
  },
  connectors: [
    { id: 'api-db', from: 'api', to: 'db', fromAnchor: 'right', toAnchor: 'left', style: 'sql' },
  ],
  connectorStyles: {
    sql: { color: 'blue', strokeWidth: 2, label: 'SQL' },
  },
}

describe('renderDiagramHtml', () => {
  test('component format emits a typed React component', () => {
    const rendered = renderDiagramHtml(diagram, {
      format: 'component',
      componentName: 'ServiceMap',
      dataName: 'serviceMap',
      theme: 'command',
      mode: 'dark',
      interactive: false,
    })
    expect(rendered.mimeType).toBe('text/tsx')
    expect(rendered.code).toContain("import { ArcDiagram, type ArcDiagramData } from '@hudsonkit/arc'")
    expect(rendered.code).toContain('const serviceMap: ArcDiagramData = {')
    expect(rendered.code).toContain('export function ServiceMap()')
    expect(rendered.code).toContain('<ArcDiagram data={serviceMap} mode="dark" theme="command" interactive={false} />')
  })

  test('iframe format emits an encoded Arc studio embed', () => {
    const rendered = renderDiagramHtml(diagram, {
      format: 'iframe',
      baseUrl: 'https://arc.example/',
      sessionId: 'abc123',
      theme: 'command',
      mode: 'dark',
      title: 'Service "map"',
      width: '100%',
      height: 360,
    })
    expect(rendered.mimeType).toBe('text/html')
    expect(rendered.url).toBeTruthy()
    expect(rendered.code).toContain('<iframe src="https://arc.example/editor/abc123#data=')
    expect(rendered.code).toContain('title="Service &quot;map&quot;"')
    expect(rendered.code).toContain('width="100%"')
    expect(rendered.code).toContain('height="360"')

    const encoded = rendered.url!.split('#data=')[1]
    const payload = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'))
    expect(payload._theme).toBe('command')
    expect(payload._mode).toBe('dark')
    expect(payload.nodes.api).toEqual(diagram.nodes.api)
  })

  test('component format uses the theme default mode when mode is omitted', () => {
    const rendered = renderDiagramHtml(diagram, { format: 'component', theme: 'claude' })
    expect(rendered.mode).toBe('light')
    expect(rendered.code).toContain('mode="light" theme="claude"')
  })

  test('html format emits a standalone themed SVG document', () => {
    const rendered = renderDiagramHtml(diagram, { format: 'html', title: 'Service <map>', theme: 'codex' })
    expect(rendered.mimeType).toBe('text/html')
    expect(rendered.mode).toBe('dark')
    expect(rendered.code).toContain('<!doctype html>')
    expect(rendered.code).toContain('<title>Service &lt;map&gt;</title>')
    expect(rendered.code).toContain('background: #0b0d10')
    expect(rendered.code).toContain('#34d399')
    expect(rendered.code).toContain('<svg xmlns="http://www.w3.org/2000/svg"')
    expect(rendered.code).toContain('API')
  })

  test('rejects invalid component identifiers', () => {
    expect(() => renderDiagramHtml(diagram, { format: 'component', componentName: '1-bad' })).toThrow(expect.objectContaining({ code: 'render/invalid-option' }))
  })
})
