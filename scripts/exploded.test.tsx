import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { ArcExploded, aiStackExploded, explodedColor, explodedReadingOrder, keyboardExploded, phoneExploded, layoutExploded, projectExploded, renderExplodedSvg, validateExplodedDocument, type ExplodedDocument } from '../src/exploded'
import { createExplodedScene, serializeExplodedScene, type ExplodedSvgNode } from '../src/exploded/scene'
import { convexHull, depthOrder, explodedOutline, insetFootprint, spanRightOf } from '../src/exploded/geometry'
import { isoToScreen, COS_30 } from '../src/utils/isometric'

const copy = (doc: ExplodedDocument = phoneExploded): ExplodedDocument => structuredClone(doc)
function walk(scene: ExplodedSvgNode): ExplodedSvgNode[] { return [scene, ...(scene.children ?? []).flatMap(c => typeof c === 'string' ? [] : walk(c))] }

describe('native exploded model', () => {
  test('2:1 dimetric projection leaves the legacy 30-degree projection unchanged', () => {
    expect(projectExploded(100, 40, 12)).toEqual({ x: 60, y: 58 })
    expect(isoToScreen(100, 40, 12).screenX).toBeCloseTo(60 * COS_30, 10)
    expect(isoToScreen(100, 40, 12).screenY).toBeCloseTo(-82, 10)
    expect(projectExploded(0, 0, 10)).toEqual({ x: 0, y: -10 })
  })
  test.each([keyboardExploded, aiStackExploded, phoneExploded])('$id lays out without mutation and separates labels by at least 40 units', doc => {
    const before = JSON.stringify(doc), layout = layoutExploded(doc)
    expect(JSON.stringify(doc)).toBe(before)
    expect(layoutExploded(copy(doc))).toEqual(layout)
    expect(layout.gap % 4).toBe(0)
    for (let i = 0; i < layout.parts.length; i++) {
      const a = layout.parts[i]
      for (const b of layout.parts.slice(i + 1)) expect(Math.abs(a.anchor.y - b.anchor.y)).toBeGreaterThanOrEqual(40)
      for (const b of layout.parts.filter(p => p !== a)) {
        // Leaders run right from the anchor and must clear every other part's projected silhouette.
        const region = spanRightOf(b.silhouette, a.anchor.x + 1)
        expect(!!region && a.anchor.y >= region.min - 3 && a.anchor.y <= region.max + 3).toBe(false)
      }
    }
  })
  test('side-by-side level preserves its assembled offsets', () => {
    const doc = copy()
    doc.parts.find(p => p.id === 'battery')!.assembledZ = 6
    const layout = layoutExploded(doc, false)
    const board = layout.parts.find(p => p.part.id === 'board')!, battery = layout.parts.find(p => p.part.id === 'battery')!
    expect(battery.explodedZ - board.explodedZ).toBe(2)
    expect(layout.parts.find(p => p.part.id === 'housing')!.explodedZ).toBe(0)
  })
  test('sparse levels remain ordinal and part input ordering is irrelevant', () => {
    const doc = copy(aiStackExploded)
    doc.parts.reverse().forEach(p => p.level *= 10)
    expect(layoutExploded(doc).parts.map(p => p.explodedZ)).toEqual(layoutExploded(aiStackExploded).parts.map(p => p.explodedZ))
  })
  test('same-level leader conflicts fail clearly, with an explicit label-free rendering option', () => {
    const doc = copy(); doc.parts.find(p => p.id === 'battery')!.y = 92
    expect(() => layoutExploded(doc)).toThrow('same level')
    expect(() => layoutExploded(doc, false)).not.toThrow()
  })
  test('housing dimensions do not inflate gap as solid thickness', () => {
    const doc: ExplodedDocument = { kind: 'exploded', version: 1, id: 'tray', title: 'Tray', parts: [{ id: 'tray', label: 'Tray', x: 0, y: 0, width: 100, depth: 100, height: 80, level: 0, assembledZ: 0, housing: { wall: 5, floor: 3 } }] }
    expect(layoutExploded(doc).gap).toBe(52)
  })
  test('rejects wrong families, duplicate identities, cycles, invalid numbers, and inverted solids', () => {
    expect(() => validateExplodedDocument({ nodes: {} })).toThrow('kind')
    for (const mutate of [
      (d: ExplodedDocument) => { d.parts[1].id = d.parts[0].id },
      (d: ExplodedDocument) => { d.parts[1].height = NaN },
      (d: ExplodedDocument) => { d.parts[1].width = -1 },
      (d: ExplodedDocument) => { d.parts[1].level = 1.5 },
      (d: ExplodedDocument) => { d.parts[0].housing!.wall = 60 },
      (d: ExplodedDocument) => { d.parts[1].containerId = 'missing' },
      (d: ExplodedDocument) => { d.parts[0].containerId = 'housing' },
      (d: ExplodedDocument) => { d.parts[1].assembledZ = 17 },
      (d: ExplodedDocument) => { d.parts[1].radius = 100 },
    ]) { const doc = copy(); mutate(doc); expect(() => validateExplodedDocument(doc)).toThrow('Invalid exploded document') }
  })
  test('contents and details must fit rounded footprints, not just their bounding rectangles', () => {
    const doc = copy(); doc.parts[1].x = 5; doc.parts[1].y = 5; doc.parts[1].radius = 0
    expect(() => validateExplodedDocument(doc)).toThrow('assembled cavity')
    const detailed = copy(aiStackExploded); detailed.parts[0].details = [{ x: 0, y: 0, width: 4, depth: 4 }]
    expect(() => validateExplodedDocument(detailed)).toThrow('footprint')
  })
  test('mini keyboard is a 40% board: four rows of 12.5u, keycaps over switches over plate over PCB in the case', () => {
    expect(() => validateExplodedDocument(keyboardExploded)).not.toThrow()
    const part = (id: string) => keyboardExploded.parts.find(p => p.id === id)!
    expect(keyboardExploded.parts.map(p => p.id)).toEqual(['case', 'pcb', 'plate', 'switches', 'keycaps'])
    expect(explodedReadingOrder(keyboardExploded).map(p => p.id)).toEqual(['keycaps', 'switches', 'plate', 'pcb', 'case'])
    const caps = part('keycaps').details!.filter(d => d.label !== undefined || d.height === 8)
    expect(caps.length).toBe(40)
    const stems = part('switches').details!.filter(d => d.tone === 'accent')
    expect(stems.length).toBe(40)
    for (const id of ['pcb', 'plate']) expect(part(id).containerId).toBe('case')
    expect(part('switches').body).toBe('none'); expect(part('keycaps').body).toBe('none')
  })
  test('materials, taper, stacked details, and envelope bodies validate strictly', () => {
    const base = (): ExplodedDocument => ({ kind: 'exploded', version: 1, id: 'm', title: 'M', materials: { brass: { light: '#c8a050', dark: '#a08040' } }, parts: [
      { id: 'a', label: 'A', x: 0, y: 0, width: 40, depth: 40, height: 6, level: 0, assembledZ: 0, material: 'brass', taper: 4 },
      { id: 'b', label: 'B', x: 0, y: 0, width: 40, depth: 40, height: 10, level: 1, assembledZ: 6, body: 'none', details: [{ x: 2, y: 2, width: 10, depth: 10, height: 4, z: 3, taper: 2 }] },
    ] })
    expect(() => validateExplodedDocument(base())).not.toThrow()
    for (const mutate of [
      (d: ExplodedDocument) => { d.parts[0].material = 'missing' },
      (d: ExplodedDocument) => { d.materials!.brass.light = 'gold' },
      (d: ExplodedDocument) => { d.materials = { Bad: { light: '#000000', dark: '#000000' } } },
      (d: ExplodedDocument) => { d.parts[0].taper = 20 },
      (d: ExplodedDocument) => { d.parts[1].details![0].z = 8 },
      (d: ExplodedDocument) => { d.parts[1].details![0].z = -1 },
      (d: ExplodedDocument) => { d.parts[1].details = [] },
      (d: ExplodedDocument) => { d.parts[1].body = 'hollow' as 'none' },
      (d: ExplodedDocument) => { d.parts[0].details = [{ x: 0, y: 0, width: 4, depth: 4 }] },
    ]) { const doc = base(); mutate(doc); expect(() => validateExplodedDocument(doc)).toThrow('Invalid exploded document') }
    const doc = base()
    expect(explodedColor(doc, doc.parts[0], 'light')).toBe('#c8a050')
    expect(explodedColor(doc, doc.parts[0], 'dark')).toBe('#a08040')
    expect(explodedColor(doc, { tone: 'accent' }, 'light')).toBe('#ff6a3d')
    // An envelope draws no slab of its own: only its details reach the scene.
    const solids = walk(createExplodedScene(doc, { labels: false })).filter(n => n.attrs?.['data-part'] === 'b')
    expect(solids.length).toBe(1)
  })
  test('details paint back to front even when their footprints interleave', () => {
    const boxes = [
      { x: 20, y: 0, width: 10, depth: 30, radius: 0, z: 0 },
      { x: 0, y: 0, width: 10, depth: 10, radius: 0, z: 0 },
      { x: 0, y: 20, width: 10, depth: 10, radius: 0, z: 0 },
      { x: 0, y: 0, width: 10, depth: 10, radius: 0, z: 5 },
    ]
    expect(depthOrder(boxes).map(b => boxes.indexOf(b))).toEqual([1, 3, 2, 0])
    expect(insetFootprint({ x: 0, y: 0, width: 20, depth: 10, radius: 6 }, 2)).toEqual({ x: 2, y: 2, width: 16, depth: 6, radius: 3 })
    const hull = convexHull([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 10 }, { x: 0, y: 10 }])
    expect(hull.length).toBe(4)
    expect(spanRightOf(hull, 5)).toEqual({ min: 0, max: 10 })
    expect(spanRightOf(hull, 11)).toBeNull()
  })
  test('rounded world corners retain their radius and extrema', () => {
    const outline = explodedOutline({ x: 0, y: 0, width: 100, depth: 60, radius: 10 })
    for (const p of outline.slice(0, 13)) expect(Math.hypot(p.x - 90, p.y - 10)).toBeCloseTo(10, 8)
    expect(Math.max(...outline.map(p => p.x))).toBe(100)
    expect(Math.max(...outline.map(p => p.y))).toBe(60)
  })
})

describe('native exploded rendering', () => {
  test.each([0, 0.25, 0.5, 0.75, 1])('housing wraps contents at separation %s', progress => {
    const nodes = walk(createExplodedScene(phoneExploded, { progress }))
    const back = nodes.findIndex(n => n.attrs?.['data-face'] === 'housing-back')
    const front = nodes.findIndex(n => n.attrs?.['data-face'] === 'housing-front')
    for (const id of ['board', 'battery']) {
      const index = nodes.findIndex(n => n.attrs?.['data-part'] === id)
      expect(index).toBeGreaterThan(back); expect(index).toBeLessThan(front)
    }
    expect(front).toBeLessThan(nodes.findIndex(n => n.attrs?.['data-part'] === 'shield'))
    expect(nodes.filter(n => n.attrs?.['data-layer'] === 'labels').length).toBe(progress === 1 ? 1 : 0)
  })
  test.each([keyboardExploded, aiStackExploded, phoneExploded])('$id uses stable framing and contains all geometry at every separation', doc => {
    const initial = createExplodedScene(doc).attrs!.viewBox
    for (const progress of [0, 0.2, 0.5, 0.9, 1]) {
      const scene = createExplodedScene(doc, { progress })
      expect(scene.attrs!.viewBox).toBe(initial)
      const [x, y, w, h] = String(initial).split(' ').map(Number)
      for (const n of walk(scene).filter(n => n.tag === 'path')) {
        for (const m of String(n.attrs!.d).matchAll(/(?:M|L)([-\d.]+),([-\d.]+)/g)) {
          expect(+m[1]).toBeGreaterThanOrEqual(x); expect(+m[1]).toBeLessThanOrEqual(x + w)
          expect(+m[2]).toBeGreaterThanOrEqual(y); expect(+m[2]).toBeLessThanOrEqual(y + h)
        }
      }
    }
  })
  test('guide bounds cover shifted footprints, and paint order follows assembled elevations', () => {
    const doc: ExplodedDocument = { kind: 'exploded', version: 1, id: 'shifted', title: 'Shifted', parts: [
      { id: 'base', label: 'Base', x: 0, y: 0, width: 30, depth: 30, height: 2, assembledZ: 50, level: 0 },
      { id: 'offset', label: 'Offset', x: 200, y: 200, width: 30, depth: 30, height: 2, assembledZ: 0, level: 1 },
    ] }
    const layout = layoutExploded(doc, false)
    const guideTop = projectExploded(0, 0, Math.max(...layout.parts.map(p => p.explodedZ + p.part.height)))
    expect(layout.bounds.y).toBeLessThan(guideTop.y)
    const assembled = walk(createExplodedScene(doc, { progress: 0, labels: false })).filter(n => n.attrs?.['data-part'])
    expect(assembled.map(n => n.attrs!['data-part'])).toEqual(['offset', 'base'])
    doc.parts[0].containerId = ''
    expect(() => validateExplodedDocument(doc)).toThrow('containerId')
  })
  test('React and exported SVG share the same scene and coordinates', () => {
    const svg = renderExplodedSvg(phoneExploded, { mode: 'dark', progress: 0.5 })
    const react = renderToStaticMarkup(<ArcExploded document={phoneExploded} mode="dark" progress={0.5} />)
    expect([...react.matchAll(/ d="([^"]+)"/g)].map(m => m[1])).toEqual([...svg.matchAll(/ d="([^"]+)"/g)].map(m => m[1]))
    expect(svg).toBe(serializeExplodedScene(createExplodedScene(phoneExploded, { mode: 'dark', progress: 0.5 })))
  })
  test('exports escape untrusted strings and need no external dependencies or IDs', () => {
    const doc = copy(); doc.title = '<script>alert("x")</script>'; doc.parts[0].label = '<img onerror="x">'; doc.parts[0].id = 'x" onclick="bad'
    doc.parts.filter(p => p.containerId).forEach(p => p.containerId = doc.parts[0].id)
    const svg = renderExplodedSvg(doc)
    expect(svg).toContain('&lt;script&gt;'); expect(svg).not.toContain('<script>'); expect(svg).not.toContain(' onclick="bad')
    expect(svg).not.toMatch(/<image|<foreignObject|<style|<script| id=|url\(/)
    expect(svg).toBe(renderExplodedSvg(doc))
  })
  test('invalid progress is rejected instead of producing NaN or extrapolated geometry', () => {
    for (const progress of [-1, 2, Infinity, NaN]) expect(() => renderExplodedSvg(phoneExploded, { progress })).toThrow('progress')
  })
})
