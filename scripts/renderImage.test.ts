import { describe, expect, test } from 'bun:test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { findChrome, renderDiagramPng, renderDiagramSvg, RenderError } from './renderImage.ts'
import type { ArcDiagramData } from '../src/types/diagram.ts'

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

const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('fake-png'),
])

describe('renderDiagramSvg', () => {
  test('exports connection labels with style fallback and explicit suppression', () => {
    const renderLabel = (label: string | undefined, theme?: string) => renderDiagramSvg({
      ...diagram,
      connectors: [{ ...diagram.connectors[0], label }],
    }, { theme }).svg
    expect(renderLabel(undefined)).toContain('>SQL</text>')
    expect(renderLabel('write & persist')).toContain('>write &amp; persist</text>')
    expect(renderLabel('write & persist')).not.toContain('>SQL</text>')
    expect(renderLabel('')).not.toContain('>SQL</text>')
    expect(renderLabel('write', 'engineering')).toContain('>WRITE</text>')
  })

  test('returns deterministic SVG with export dimensions', () => {
    const first = renderDiagramSvg(diagram, { padding: 10 })
    const second = renderDiagramSvg(diagram, { padding: 10 })
    expect(first).toEqual(second)
    expect(first.width).toBe(660)
    expect(first.height).toBe(340)
    expect(first.svg).toContain('<svg xmlns="http://www.w3.org/2000/svg" width="660" height="340"')
    expect(first.svg).toContain('API')
    expect(first.svg).toContain('Postgres')
  })

  test('applies branded themes and their default mode', () => {
    const clayDiagram = structuredClone(diagram)
    clayDiagram.connectorStyles.sql.color = 'orange'
    const claude = renderDiagramSvg(clayDiagram, { theme: 'claude', includeGrid: true })
    expect(claude.theme).toBe('claude')
    expect(claude.mode).toBe('light')
    expect(claude.svg).toContain('#f6f1e8')
    expect(claude.svg).toContain('#d97757')

    const spacex = renderDiagramSvg(diagram, { theme: 'spacex' })
    expect(spacex.mode).toBe('dark')
    expect(spacex.svg).toContain('#050608')
    expect(spacex.svg).toContain('#67e8f9')
    expect(spacex.svg).toContain('<defs><pattern')
    expect(renderDiagramSvg(diagram, { theme: 'spacex', includeGrid: false }).svg).not.toContain('<defs><pattern')
  })

  test('rejects unknown themes and modes', () => {
    expect(() => renderDiagramSvg(diagram, { theme: 'unknown' })).toThrow(expect.objectContaining({ code: 'render/invalid-option' }))
    expect(() => renderDiagramSvg(diagram, { theme: 'codex', mode: 'sepia' as never })).toThrow(expect.objectContaining({ code: 'render/invalid-option' }))
  })

  test('rejects unsafe background values', () => {
    expect(() => renderDiagramSvg(diagram, { backgroundColor: 'red" onclick="x' })).toThrow(RenderError)
  })

  test('rejects malformed saved exportZone bounds', () => {
    const malformed = { ...diagram, exportZone: { x: 0, y: 0, width: 0, height: 100 } }
    expect(() => renderDiagramSvg(malformed)).toThrow(expect.objectContaining({ code: 'render/invalid-diagram' }))
  })
})

describe('renderDiagramPng', () => {
  test('invokes Chrome headlessly and returns the produced PNG', async () => {
    let seenArgs: string[] = []
    const rendered = await renderDiagramPng(diagram, {
      chromePath: process.execPath,
      scale: 2,
      theme: 'codex',
      runChrome: async (_executable, args) => {
        seenArgs = args
        const output = args.find(arg => arg.startsWith('--screenshot='))?.slice('--screenshot='.length)
        expect(output).toBeTruthy()
        writeFileSync(join(output!), PNG_BYTES)
      },
    })

    expect(rendered.png.equals(PNG_BYTES)).toBe(true)
    expect(rendered.theme).toBe('codex')
    expect(rendered.mode).toBe('dark')
    expect(rendered.width).toBe(680)
    expect(rendered.height).toBe(360)
    expect(seenArgs).toContain('--headless')
    expect(seenArgs).toContain('--window-size=680,360')
    expect(seenArgs).toContain('--force-device-scale-factor=2')
  })

  test('fails with a coded error when Chrome is unavailable', async () => {
    await expect(renderDiagramPng(diagram, { chromePath: '/definitely/missing/chrome' })).rejects.toMatchObject({
      code: 'render/chrome-unavailable',
    })
  })

  test('rejects oversized rasters before launching Chrome', async () => {
    const huge = {
      ...diagram,
      layout: { width: 20_000, height: 20_000 },
    }
    await expect(renderDiagramPng(huge, { chromePath: process.execPath })).rejects.toMatchObject({
      code: 'render/png-too-large',
    })
  })
})

describe('findChrome', () => {
  test('prefers ARC_CHROME when it points at an executable', () => {
    expect(findChrome({ ARC_CHROME: process.execPath, PATH: '' })).toBe(process.execPath)
  })

  test('returns null when no executable is available', () => {
    expect(findChrome({ PATH: '' }, 'linux')).toBe(null)
  })
})
