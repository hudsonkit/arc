import { afterAll, describe, expect, test } from 'bun:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { join } from 'node:path'

const root = join(import.meta.dir, '../../..')
const diagram = {
  layout: { width: 420, height: 180 },
  nodes: { user: { x: 20, y: 50, size: 'm' }, api: { x: 240, y: 50, size: 'm' } },
  nodeData: { user: { name: 'Person' }, api: { name: 'API' } },
  connectors: [{ from: 'user', to: 'api', fromAnchor: 'right', toAnchor: 'left', style: 'request' }],
  connectorStyles: { request: { showArrow: true } },
}

const transport = new StdioClientTransport({ command: process.execPath, args: ['packages/mcp/src/server.ts'], cwd: root, stderr: 'pipe' })
const client = new Client({ name: 'arc-widget-test', version: '0.0.0' }, { capabilities: {} })
const ready = client.connect(transport)

afterAll(async () => { await ready; await client.close() })

describe('Arc collaborative diagram widget', () => {
  test('advertises the widget resource on show_diagram', async () => {
    await ready
    const { tools } = await client.listTools()
    const show = tools.find(tool => tool.name === 'show_diagram')
    expect(show?._meta?.ui).toEqual({ resourceUri: 'ui://arc/diagram-v1.html' })
    expect(show?._meta?.['openai/outputTemplate']).toBe('ui://arc/diagram-v1.html')

    const resource = await client.readResource({ uri: 'ui://arc/diagram-v1.html' })
    expect(resource.contents[0]?.mimeType).toBe('text/html;profile=mcp-app')
    expect(resource.contents[0]?.text).toContain("type: 'arc:ready'")
    expect(resource.contents[0]?.text).toContain("openai.callTool(name, args)")
  })

  test('round-trips a human edit and rejects a stale update', async () => {
    await ready
    const shown = await client.callTool({ name: 'show_diagram', arguments: { documentId: 'spike', diagram } })
    const initial = shown.structuredContent as { documentId: string; rev: number }
    expect(initial).toMatchObject({ documentId: 'spike', rev: 1 })

    const edited = structuredClone(diagram)
    edited.nodeData.api.name = 'Edited API'
    const updated = await client.callTool({ name: 'update_diagram', arguments: { documentId: 'spike', baseRev: 1, diagram: edited, actor: 'person' } })
    expect(updated.structuredContent).toMatchObject({ ok: true, rev: 2, updatedBy: 'person' })

    const stale = await client.callTool({ name: 'update_diagram', arguments: { documentId: 'spike', baseRev: 1, diagram } })
    expect(stale.structuredContent).toMatchObject({ ok: false, conflict: true, rev: 2 })

    const read = await client.callTool({ name: 'read_diagram', arguments: { documentId: 'spike' } })
    expect(read.structuredContent).toMatchObject({ rev: 2, diagram: { nodeData: { api: { name: 'Edited API' } } } })
  })
})
