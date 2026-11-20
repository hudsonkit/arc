import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  arcStyleTheme,
  arcStyleVars,
  resolveStylePerspective,
  resolveStyleTokens,
  styleDiagnostics,
  validateArcStyle,
} from '../src/utils/arcStyle'
import { altitudeStack, deepestClaim, type DiagramSet } from '../src/utils/altitudes'
import { hostFallbackTokens } from '../packages/viewer/src/theme/host'
import type { ArcStyle } from '../src/utils/themes'
import { renderDiagramSvg } from './renderImage'

const CLI = join(import.meta.dir, 'arc-cli.ts')
const run = (args: string[]) => {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' })
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
}

const light = {
  background: '#fbfaf7', foreground: '#1b1a17', muted: '#6b665c', surface: '#ffffff', border: '#d9d4c7',
  line: '#8a8475', accent: '#2f5bd3', success: '#2e7d4f', warning: '#b7791f', danger: '#c0392b',
}
const dark = { ...light, background: '#121110', foreground: '#f1eee6', surface: '#1c1b19' }

const style: ArcStyle = {
  id: 'linea',
  version: '2.1.0',
  modes: { light: { ...light, colors: { violet: '#7a3cff' } }, dark },
  type: { font: 'Söhne, sans-serif', mono: 'Berkeley Mono, monospace' },
  brand: { nodeShape: 'square', nodeDecor: 'rule' },
  perspective: { default: 'isometric', isoStyle: 'blueprint' },
}

const diagram = {
  layout: { width: 600, height: 300 },
  nodes: { a: { x: 40, y: 80, size: 'm' }, b: { x: 300, y: 80, size: 'm' } },
  nodeData: {
    a: { icon: 'Server', name: 'A', color: 'violet' },
    b: { icon: 'Database', name: 'B', color: 'emerald' },
  },
  connectors: [{ from: 'a', to: 'b', fromAnchor: 'right', toAnchor: 'left', style: 'http' }],
  connectorStyles: { http: { color: 'amber', strokeWidth: 1, label: 'HTTP' } },
}

describe('style resolver', () => {
  test('palette: color override → role token → neutral fallback', () => {
    const r = resolveStyleTokens(style, 'light')
    expect(r.colors.violet).toBe('#7a3cff') // modes.light.colors
    expect(r.colors.emerald).toBe(light.success) // HOST_COLOR_ROLES role
    expect(r.colors.amber).toBe(light.warning)
    expect(resolveStyleTokens(style, 'dark').colors.violet).toBe(dark.accent) // override is per mode

    const sparse = { ...style, modes: { light: { ...light, danger: '' }, dark } } as ArcStyle
    expect(resolveStyleTokens(sparse, 'light').tokens.danger).toBe(hostFallbackTokens('light').danger)
  })

  test('writes one variable per token and per logical color', () => {
    const vars = arcStyleVars(style, 'light')
    expect(vars['--arc-diagram-accent']).toBe(light.accent)
    expect(vars['--arc-diagram-violet']).toBe('#7a3cff')
    expect(vars['--arc-diagram-rose']).toBe(light.danger)
    expect(vars['--arc-diagram-font']).toBe('Söhne, sans-serif')
    expect(Object.keys(vars)).toHaveLength(10 + 8 + 2)
  })

  test('theme carries the brand; literal mode drops var()', () => {
    const live = arcStyleTheme(style)
    expect(live.brand?.nodeShape).toBe('square')
    expect(live.light.palette.violet.stroke).toBe('var(--arc-diagram-violet, #7a3cff)')
    expect(arcStyleTheme(style, { literal: true }).light.palette.violet.stroke).toBe('#7a3cff')
  })

  test('perspective: _meta first, then the style', () => {
    expect(resolveStylePerspective(undefined, style)).toEqual({ viewMode: 'isometric', isoStyle: 'blueprint' })
    expect(resolveStylePerspective({ viewMode: '2d' }, style)).toEqual({ viewMode: '2d', isoStyle: 'blueprint' })
    expect(resolveStylePerspective({ isoStyle: 'cyanotype' }, undefined)).toEqual({ viewMode: '2d', isoStyle: 'cyanotype' })
  })

  test('validates the document shape', () => {
    expect(validateArcStyle(style)).toEqual([])
    expect(validateArcStyle({ ...style, perspective: { default: '3d' } })).toContain('`perspective.default` must be "2d" or "isometric"')
    expect(validateArcStyle({ ...style, altitude: 'system' })).toContain('unknown field `altitude`')
  })

  test('style/theme-ignored only when the diagram names a theme', () => {
    expect(styleDiagnostics(diagram, style)).toEqual([])
    const [d] = styleDiagnostics({ ...diagram, _meta: { themeId: 'command' } }, style)
    expect(d).toMatchObject({ code: 'style/theme-ignored', severity: 'warning', evidence: { themeId: 'command', style: 'linea' } })
  })
})

describe('render with a style', () => {
  test('standalone SVG paints literal colors and fonts', () => {
    const { svg, style: stamp } = renderDiagramSvg(diagram as never, { style, mode: 'light' })
    expect(stamp).toEqual({ id: 'linea', version: '2.1.0' })
    expect(svg).not.toContain('var(')
    expect(svg).toContain('#7a3cff')
    expect(svg).toContain(light.warning) // amber connector via role
    expect(svg).toContain('Söhne')
  })

  test('inline SVG may keep var(--arc-diagram-*, literal)', () => {
    const { svg } = renderDiagramSvg(diagram as never, { style, mode: 'light', inlineVars: true })
    expect(svg).toContain('var(--arc-diagram-violet, #7a3cff)')
  })

  test('an invalid style is a coded render error', () => {
    expect(() => renderDiagramSvg(diagram as never, { style: { id: 'x' } })).toThrow(/style/)
  })
})

describe('arc check/render --style', () => {
  const withFiles = (fn: (dir: string, d: string, s: string) => void, meta?: object) => {
    const dir = mkdtempSync(join(tmpdir(), 'arc-style-'))
    try {
      const d = join(dir, 'diagram.json'), s = join(dir, 'style.json')
      writeFileSync(d, JSON.stringify({ ...diagram, ...(meta ? { _meta: meta } : {}) }))
      writeFileSync(s, JSON.stringify(style))
      fn(dir, d, s)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  test('check reports style/theme-ignored without failing', () => withFiles((_dir, d, s) => {
    const r = run(['check', d, '--style', s, '--json'])
    expect(r.status).toBe(0)
    const out = JSON.parse(r.stdout)
    expect(out.diagnostics.map((x: { code: string }) => x.code)).toContain('style/theme-ignored')
    // No style file, no style diagnostic.
    const plain = JSON.parse(run(['check', d, '--json']).stdout)
    expect(plain.diagnostics.map((x: { code: string }) => x.code)).not.toContain('style/theme-ignored')
  }, { themeId: 'command' }))

  test('check rejects an invalid style file', () => withFiles((dir, d) => {
    const bad = join(dir, 'bad.json')
    writeFileSync(bad, JSON.stringify({ id: 'x' }))
    const r = run(['check', d, '--style', bad, '--json'])
    expect(r.status).not.toBe(0)
  }))

  test('render --style writes literal colors and records the style', () => withFiles((dir, d, s) => {
    const out = join(dir, 'out.svg')
    const r = run(['render', d, '--style', s, '--mode', 'light', '--out', out, '--json'])
    expect(r.status).toBe(0)
    expect(JSON.parse(r.stdout).options.style).toEqual({ id: 'linea', version: '2.1.0' })
    const svg = readFileSync(out, 'utf8')
    expect(svg).not.toContain('var(')
    expect(svg).toContain('#7a3cff')
  }))

  test('render refuses --theme with --style', () => withFiles((dir, d, s) => {
    expect(run(['render', d, '--style', s, '--theme', 'cool', '--out', join(dir, 'x.svg')]).status).toBe(2)
  }))
})

describe('altitudes', () => {
  const node = (name: string, extra: object = {}) => ({ name, ...extra })
  const set: DiagramSet = {
    system: { id: 'system', nodeData: { web: node('Web', { watches: ['apps/web/**'] }), auth: node('Auth', { child: 'auth' }) } },
    auth: { id: 'auth', nodeData: { login: node('Login'), session: node('Session', { child: 'session' }) } },
    session: { id: 'session', nodeData: { store: node('Store', { source: { path: 'services/auth/session/store.ts' } }), loop: node('Loop', { child: 'system' }) } },
  }

  test('child path opens the plate and stops at a stale step', () => {
    const path = [{ diagram: 'system', node: 'auth' }, { diagram: 'auth', node: 'session' }]
    expect(altitudeStack('system', set, path)).toEqual(['system', 'auth', 'session'])
    expect(altitudeStack('system', set, [{ diagram: 'system', node: 'web' }])).toEqual(['system'])
    expect(altitudeStack('system', set, [{ diagram: 'auth', node: 'session' }])).toEqual(['system'])
    // session → system is a cycle; it is not followed.
    expect(altitudeStack('system', set, [...path, { diagram: 'session', node: 'loop' }])).toEqual(['system', 'auth', 'session'])
  })

  test('deepest claim walks child links to the node that owns the file', () => {
    const hit = deepestClaim('system', set, ['services/auth/session/store.ts'])
    expect(hit?.path).toEqual([
      { diagram: 'system', node: 'auth' },
      { diagram: 'auth', node: 'session' },
      { diagram: 'session', node: 'store' },
    ])
    expect(hit?.matches[0]).toMatchObject({ node: 'store', via: 'source' })
    expect(altitudeStack('system', set, hit!.path)).toEqual(['system', 'auth', 'session'])
  })

  test('a shallow claim wins when nothing deeper claims; none returns null', () => {
    expect(deepestClaim('system', set, ['apps/web/page.tsx'])?.path).toEqual([{ diagram: 'system', node: 'web' }])
    expect(deepestClaim('system', set, ['docs/readme.md'])).toBeNull()
  })
})
