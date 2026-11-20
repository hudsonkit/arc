import { afterAll, describe, expect, test } from 'bun:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ArcDiagramData } from '../../../src/types/diagram.ts'

const root = join(import.meta.dir, '../../..')
const diagram: ArcDiagramData = {
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

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['packages/mcp/src/server.ts'],
  cwd: root,
  env: {
    ...process.env,
    ARC_CHROME: 'none',
    CHROME_PATH: '',
    PUPPETEER_EXECUTABLE_PATH: '',
    PATH: '',
  },
  stderr: 'pipe',
})
const client = new Client({ name: 'arc-render-test', version: '0.0.0' }, { capabilities: {} })
const ready = client.connect(transport)

afterAll(async () => {
  await ready
  await client.close()
})

describe('arc-mcp render tools', () => {
  test('registers render_svg, render_png, render_animation, and render_html', async () => {
    await ready
    const { tools } = await client.listTools()
    expect(tools.map(tool => tool.name)).toEqual(expect.arrayContaining(['render_svg', 'render_png', 'render_animation', 'render_html']))
  })

  test('render_svg returns deterministic SVG text', async () => {
    await ready
    const result = await client.callTool({
      name: 'render_svg',
      arguments: { diagram, padding: 10, theme: 'codex' },
    })
    expect(result.isError).toBeUndefined()
    expect(result.content[0]?.type).toBe('text')
    const text = result.content[0]?.type === 'text' ? result.content[0].text : ''
    expect(text).toContain('<svg xmlns="http://www.w3.org/2000/svg" width="660" height="340"')
    expect(text).toContain('#0b0d10')
    expect(text).toContain('#34d399')
    expect(text).toContain('API')
  })

  test('render_svg takes a host style and paints literal colors', async () => {
    await ready
    const mode = { background: '#fbfaf7', foreground: '#1b1a17', muted: '#6b665c', surface: '#ffffff', border: '#d9d4c7', line: '#8a8475', accent: '#2f5bd3', success: '#1f9d6b', warning: '#b7791f', danger: '#c0392b' }
    const style = { id: 'linea', version: '1.0.0', modes: { light: { ...mode, colors: { blue: '#123abc' } }, dark: mode } }
    const result = await client.callTool({ name: 'render_svg', arguments: { diagram, style, mode: 'light' } })
    expect(result.isError).toBeUndefined()
    const text = result.content[0]?.type === 'text' ? result.content[0].text : ''
    expect(text).toContain('#123abc')
    expect(text).toContain('#1f9d6b')
    expect(text).not.toContain('var(')
  })

  test('render_html emits component, iframe, and standalone HTML outputs', async () => {
    await ready
    const component = await client.callTool({
      name: 'render_html',
      arguments: { diagram, format: 'component', componentName: 'ServiceMap', theme: 'claude' },
    })
    expect(component.isError).toBeUndefined()
    expect(component.content[0]?.type).toBe('text')
    const componentText = component.content[0]?.type === 'text' ? component.content[0].text : ''
    expect(componentText).toContain('export function ServiceMap()')
    expect(componentText).toContain('<ArcDiagram data={diagram} mode="light" theme="claude" />')

    const iframe = await client.callTool({
      name: 'render_html',
      arguments: { diagram, format: 'iframe', baseUrl: 'https://arc.example', sessionId: 'abc123' },
    })
    const iframeText = iframe.content[0]?.type === 'text' ? iframe.content[0].text : ''
    expect(iframeText).toContain('<iframe src="https://arc.example/editor/abc123#data=')

    const html = await client.callTool({
      name: 'render_html',
      arguments: { diagram, format: 'html', theme: 'spacex' },
    })
    const htmlText = html.content[0]?.type === 'text' ? html.content[0].text : ''
    expect(htmlText).toContain('<!doctype html>')
    expect(htmlText).toContain('background: #050608')
    expect(htmlText).toContain('#67e8f9')
    expect(htmlText).toContain('<svg xmlns="http://www.w3.org/2000/svg"')
  })

  test('render_png reports a coded error when Chrome is unavailable', async () => {
    await ready
    const result = await client.callTool({
      name: 'render_png',
      arguments: { diagram, scale: 1 },
    })
    expect(result.isError).toBe(true)
    const text = result.content[0]?.type === 'text' ? result.content[0].text : '{}'
    expect(JSON.parse(text)).toMatchObject({
      ok: false,
      error: { code: 'render/chrome-unavailable' },
    })
  })

  test('render_animation reports a coded error when Chrome is unavailable', async () => {
    await ready
    const output = join(mkdtempSync(join(tmpdir(), 'arc-mcp-animation-')), 'flow.gif')
    const result = await client.callTool({
      name: 'render_animation',
      arguments: { diagram, output, duration: 1, fps: 2 },
    })
    expect(result.isError).toBe(true)
    const text = result.content[0]?.type === 'text' ? result.content[0].text : '{}'
    expect(JSON.parse(text)).toMatchObject({
      ok: false,
      error: { code: 'render/chrome-unavailable' },
    })
  })
})
