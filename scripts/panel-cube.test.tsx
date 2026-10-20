import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { ArcPanelCube, fieldRecorderCube, layoutPanelCube, projectPanelCube, renderPanelCubeSvg, validatePanelCubeDocument, type PanelCubeDocument, type PanelCubeRotation } from '../src/panel-cube'
import { panelDepthAt, PANEL_CUBE_COMPACT_VIEWBOX, PANEL_CUBE_VIEWBOX } from '../src/panel-cube/geometry'
import { createPanelCubeScene, type PanelCubeSvgNode } from '../src/panel-cube/render'

const copy = (): PanelCubeDocument => structuredClone(fieldRecorderCube)
const ids = (svg: string) => [...svg.matchAll(/ id="([^"]+)"/g)].map(match => match[1])
const paths = (svg: string) => [...svg.matchAll(/ d="([^"]+)"/g)].map(match => match[1])
const callouts = (data: PanelCubeDocument, rotation: PanelCubeRotation) => createPanelCubeScene(data, { rotation }).children!.filter((child): child is PanelCubeSvgNode => typeof child !== 'string' && child.attrs?.['data-callout'] !== undefined)

describe('panel cube geometry', () => {
  test('closed panels assemble around one center; three front plates open while the rear shell stays fixed', () => {
    const before = JSON.stringify(fieldRecorderCube), closed = layoutPanelCube(fieldRecorderCube, 0), open = layoutPanelCube(fieldRecorderCube, 1)
    expect(closed.length).toBe(6)
    for (let i = 0; i < closed.length; i++) {
      const start = closed[i], finish = open[i]
      expect(start.offset).toEqual({ x: 0, y: 0, z: 0 })
      expect(Object.values(finish.offset).filter(value => value !== 0).length).toBe(finish.back ? 0 : 1)
      if (finish.back) expect(finish.points).toEqual(start.points)
      else expect(Object.values(finish.offset).some(value => value < 0)).toBe(true)
      for (let corner = 1; corner < 4; corner++) {
        const distance = (points: typeof start.points) => Math.hypot(points[corner].x - points[0].x, points[corner].y - points[0].y)
        expect(distance(start.points)).toBeCloseTo(distance(finish.points), 10)
      }
    }
    const front = open.filter(plate => !plate.back)
    expect(front.find(plate => plate.face.side === 'top')!.center.y).toBeLessThan(230)
    expect(front.find(plate => plate.face.side === 'left')!.center.y).toBeGreaterThan(350)
    expect(front.find(plate => plate.face.side === 'right')!.center.x).toBeGreaterThan(480)
    expect(JSON.stringify(fieldRecorderCube)).toBe(before)
  })
  test('the stationary rear shell covers the center throughout opening', () => {
    for (const progress of [0, 0.5, 1]) for (const plate of layoutPanelCube(fieldRecorderCube, progress).filter(plate => plate.back)) {
      expect(plate.points.some(point => point.x === 400 && point.y === 290)).toBe(true)
    }
  })
  test('all intermediate geometry fits the stable viewport and preserves linear motion', () => {
    const closed = layoutPanelCube(fieldRecorderCube, 0), open = layoutPanelCube(fieldRecorderCube, 1)
    for (const progress of [0, 0.1, 0.35, 0.5, 0.8, 1]) {
      const plates = layoutPanelCube(fieldRecorderCube, progress)
      for (const [i, plate] of plates.entries()) {
        expect(plate.center.x).toBeCloseTo(closed[i].center.x + (open[i].center.x - closed[i].center.x) * progress, 9)
        for (const point of plate.points) {
          for (const bounds of [PANEL_CUBE_VIEWBOX, PANEL_CUBE_COMPACT_VIEWBOX]) {
            expect(point.x).toBeGreaterThan(bounds.x); expect(point.x).toBeLessThan(bounds.x + bounds.width)
            expect(point.y).toBeGreaterThan(bounds.y); expect(point.y).toBeLessThan(bounds.y + bounds.height)
          }
        }
      }
      expect(renderPanelCubeSvg(fieldRecorderCube, { progress })).toContain('viewBox="0 0 800 500"')
      expect(renderPanelCubeSvg(fieldRecorderCube, { progress, labels: false })).toContain('viewBox="160 120 480 380"')
    }
  })
  test('malformed documents and unsupported states fail at the public boundary', () => {
    for (const mutate of [
      (doc: PanelCubeDocument) => { doc.faces.pop() },
      (doc: PanelCubeDocument) => { doc.faces[1].id = doc.faces[0].id },
      (doc: PanelCubeDocument) => { doc.faces[1].side = 'top' },
      (doc: PanelCubeDocument) => { doc.faces[0].label = ' ' },
      (doc: PanelCubeDocument) => { doc.faces[0].description = 'x'.repeat(101) },
    ]) { const doc = copy(); mutate(doc); expect(() => validatePanelCubeDocument(doc)).toThrow('Invalid panel cube') }
    for (const invalid of [null, {}, { kind: 'exploded', version: 1 }]) {
      expect(() => validatePanelCubeDocument(invalid)).toThrow('Invalid panel cube')
      expect(() => renderPanelCubeSvg(invalid as PanelCubeDocument)).toThrow('Invalid panel cube')
    }
    for (const progress of [NaN, Infinity, -0.1, 1.1]) expect(() => renderPanelCubeSvg(copy(), { progress })).toThrow('progress')
    for (const rotation of [null, {}, { yaw: 0 }, { yaw: NaN, pitch: 0 }, { yaw: 0, pitch: Infinity }]) {
      expect(() => renderPanelCubeSvg(copy(), { rotation: rotation as PanelCubeRotation })).toThrow('rotation')
      expect(() => projectPanelCube({ x: 0, y: 0, z: 0 }, rotation as PanelCubeRotation)).toThrow('rotation')
    }
    expect(() => renderPanelCubeSvg(copy(), { activeFace: 'missing' })).toThrow('activeFace')
  })
  test('orbit rotates in depth about the cube center and returns exactly after complete turns', () => {
    const zero = { yaw: 0, pitch: 0 }
    expect(layoutPanelCube(copy(), 1, zero)).toEqual(layoutPanelCube(copy(), 1))
    expect(renderPanelCubeSvg(copy(), { rotation: { yaw: 360, pitch: -720 } })).toBe(renderPanelCubeSvg(copy()))
    for (const rotation of [zero, { yaw: 90, pitch: 45 }, { yaw: -145, pitch: 210 }]) {
      expect(projectPanelCube({ x: 72.5, y: 72.5, z: 72.5 }, rotation)).toEqual({ x: 400, y: 290 })
    }
    // Opposite world vertices initially lie on the same camera ray. An actual
    // yaw separates them on screen; a 2D SVG transform cannot separate them.
    const origin = { x: 0, y: 0, z: 0 }, opposite = { x: 145, y: 145, z: 145 }
    expect(projectPanelCube(origin)).toEqual(projectPanelCube(opposite))
    const turnedOrigin = projectPanelCube(origin, { yaw: 90, pitch: 0 })
    const turnedOpposite = projectPanelCube(opposite, { yaw: 90, pitch: 0 })
    expect(Math.abs(turnedOrigin.x - turnedOpposite.x)).toBeGreaterThan(300)
    expect(turnedOrigin.y).toBeCloseTo(turnedOpposite.y, 8)
  })
  test('full yaw and pitch orbits fit the fixed viewport and paint overlapping planes in depth order', () => {
    for (const yaw of [0, 45, 90, 135, 180, 225, 270, 315]) for (const pitch of [-90, -45, 0, 45, 90, 180]) {
      const plates = layoutPanelCube(fieldRecorderCube, 1, { yaw, pitch })
      for (const plate of plates) for (const point of plate.points) {
        const bounds = PANEL_CUBE_COMPACT_VIEWBOX
        expect(point.x > bounds.x && point.x < bounds.x + bounds.width && point.y > bounds.y && point.y < bounds.y + bounds.height).toBe(true)
      }
      // Sampling pixels independently checks which plane must win at overlaps,
      // rather than merely comparing the sort keys used by the implementation.
      for (let x = 250; x <= 550; x += 50) for (let y = 140; y <= 440; y += 50) {
        const depths = plates.map(plate => panelDepthAt(plate, { x, y })).filter((depth): depth is number => depth !== null)
        if (depths.length > 1) expect(depths.at(-1)!).toBeGreaterThanOrEqual(Math.max(...depths) - 1e-7)
      }
      for (const plate of plates.filter(candidate => candidate.exposed)) {
        expect(plate.back).toBe(false)
        expect(plate.facing).toBeGreaterThan(0)
        expect(plates.every(other => (panelDepthAt(other, plate.center) ?? -Infinity) <= plate.depth + 0.1)).toBe(true)
      }
    }
  })
  test('face-on and edge-on views remain finite, with hidden semantic faces excluded', () => {
    const direct = { yaw: -Math.atan(Math.sqrt(2)) * 180 / Math.PI, pitch: 0 }
    for (const rotation of [direct, { yaw: 180, pitch: 0 }, { yaw: 0, pitch: 180 }]) {
      expect(renderPanelCubeSvg(copy(), { rotation })).not.toMatch(/NaN|Infinity/)
    }
    const rear = layoutPanelCube(copy(), 1, { yaw: 180, pitch: 0 })
    expect(rear.filter(plate => plate.back && plate.facing > 0).length).toBe(3)
    expect(rear.some(plate => plate.exposed)).toBe(false)
    const output = renderPanelCubeSvg(copy(), { rotation: { yaw: 180, pitch: 0 } })
    expect(output).not.toContain('data-callout')
    expect(output).not.toContain('data-front-face')
    for (const side of ['top', 'left', 'right']) expect(output).toMatch(new RegExp(`data-side="${side}" data-back="true"><path[^>]*></path><path[^>]*fill="url`))
  })
})

describe('panel cube presentation', () => {
  test('callouts move continuously from the initial view and keep leaders short', () => {
    const initial = callouts(copy(), { yaw: 0, pitch: 0 }), moved = callouts(copy(), { yaw: 0.001, pitch: 0.001 })
    for (const group of initial) {
      const matching = moved.find(candidate => candidate.attrs!['data-callout'] === group.attrs!['data-callout'])!
      const before = group.children as PanelCubeSvgNode[], after = matching.children as PanelCubeSvgNode[]
      for (const index of [1, 2, 3]) for (const coordinate of index === 1 ? ['cx', 'cy'] : ['x', 'y']) {
        expect(Math.abs(Number(before[index].attrs![coordinate]) - Number(after[index].attrs![coordinate]))).toBeLessThan(0.1)
      }
    }
    for (const rotation of [{ yaw: 0, pitch: 0 }, { yaw: 38, pitch: 12 }, { yaw: -75, pitch: 45 }, { yaw: 90, pitch: -25 }]) {
      for (const group of callouts(copy(), rotation)) {
        const path = String((group.children![0] as PanelCubeSvgNode).attrs!.d)
        expect(path.match(/[A-Z]/g)!.length).toBeLessThanOrEqual(3)
        expect(path).not.toContain('V')
        const [x, y, elbowX, endX, endY] = path.match(/-?\d+(?:\.\d+)?/g)!.map(Number)
        const direct = Math.hypot(endX - x, endY - y)
        const routed = Math.abs(elbowX - x) + Math.hypot(endX - elbowX, endY - y)
        expect(routed).toBeLessThan(direct + 27)
      }
    }
  })
  test('long callout text stays separated and within the viewport throughout orbit', () => {
    const data = copy()
    data.faces.forEach(face => {
      face.label = 'A longer descriptive component title'
      face.description = 'This description explains the component with enough detail to exercise several lines of label text.'
    })
    for (let yaw = 0; yaw < 360; yaw += 30) for (const pitch of [-60, 0, 60]) {
      const boxes = callouts(data, { yaw, pitch }).map(group => {
        const texts = (group.children as PanelCubeSvgNode[]).filter(child => child.tag === 'text')
        const top = Number(texts[0].attrs!.y) - 14
        const bottom = Math.max(...texts.map(text => Number(text.attrs!.y) + (text.children as PanelCubeSvgNode[]).slice(1).reduce((sum, span) => sum + Number(span.attrs!.dy), 0)))
        return { x: Number(texts[0].attrs!.x), top, bottom }
      })
      for (const box of boxes) { expect(box.top).toBeGreaterThanOrEqual(20); expect(box.bottom).toBeLessThanOrEqual(480) }
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) if (boxes[i].x === boxes[j].x) {
        expect(Math.max(boxes[i].top, boxes[j].top) - Math.min(boxes[i].bottom, boxes[j].bottom)).toBeGreaterThanOrEqual(20)
      }
    }
  })
  test('standalone output is deterministic, self-contained and escapes untrusted labels', () => {
    const data = copy()
    data.title = '<script>alert("x")</script>'
    data.faces[0].label = '<img onerror="bad">'
    data.faces[0].id = 'x" onclick="bad'
    const output = renderPanelCubeSvg(data)
    expect(output).toBe(renderPanelCubeSvg(data))
    expect(output).toContain('&lt;script&gt;'); expect(output).not.toContain('<script')
    expect(output).not.toMatch(/<image|<foreignObject|<style| onclick="|href=|https?:\/\/(?!www.w3.org)/)
    const declared = new Set(ids(output))
    for (const match of output.matchAll(/url\(#([^)]+)\)/g)) expect(declared.has(match[1])).toBe(true)
  })
  test('multiple React instances have distinct paint references and static output matches their geometry', () => {
    const output = renderToStaticMarkup(<><ArcPanelCube data={fieldRecorderCube} progress={0.6} /><ArcPanelCube data={fieldRecorderCube} progress={0.6} /></>)
    const declared = ids(output)
    expect(new Set(declared).size).toBe(declared.length)
    for (const match of output.matchAll(/url\(#([^)]+)\)/g)) expect(declared).toContain(match[1])
    for (const rotation of [{ yaw: 0, pitch: 0 }, { yaw: 45, pitch: 20 }, { yaw: 180, pitch: 0 }]) {
      const rendered = renderToStaticMarkup(<ArcPanelCube data={fieldRecorderCube} progress={0.6} activeFace="capture" rotation={rotation} />)
      expect(paths(rendered)).toEqual(paths(renderPanelCubeSvg(fieldRecorderCube, { progress: 0.6, activeFace: 'capture', rotation })))
    }
  })
  test('interaction is opt-in and labels reveal without affecting geometry', () => {
    const passive = renderToStaticMarkup(<ArcPanelCube data={fieldRecorderCube} />)
    const interactive = renderToStaticMarkup(<ArcPanelCube data={fieldRecorderCube} onFaceChange={() => {}} activeFace="storage" />)
    expect(passive).not.toContain('tabindex')
    expect([...interactive.matchAll(/tabindex="0"/g)].length).toBe(3)
    expect([...interactive.matchAll(/role="button"/g)].length).toBe(3)
    expect(interactive).toContain('aria-pressed="true"')
    expect(renderPanelCubeSvg(fieldRecorderCube, { progress: 0 })).not.toContain('data-callout')
    expect(renderPanelCubeSvg(fieldRecorderCube, { labels: false })).not.toContain('data-callout')
    expect([...renderPanelCubeSvg(fieldRecorderCube).matchAll(/data-callout=/g)].length).toBe(3)
  })
  test('axis handles require controlled rotation and remain absent from standalone illustrations', () => {
    const passive = renderToStaticMarkup(<ArcPanelCube data={fieldRecorderCube} rotationHandles />)
    const freeDrag = renderToStaticMarkup(<ArcPanelCube data={fieldRecorderCube} onRotationChange={() => {}} />)
    const handled = renderToStaticMarkup(<ArcPanelCube data={fieldRecorderCube} rotationHandles onRotationChange={() => {}} />)
    expect(passive).not.toContain('role="slider"')
    expect(freeDrag).not.toContain('role="slider"')
    expect([...handled.matchAll(/role="slider"/g)].length).toBe(2)
    expect(handled).toContain('aria-label="Turn"')
    expect(handled).toContain('aria-label="Tilt"')
    expect(renderPanelCubeSvg(fieldRecorderCube)).not.toContain('data-rotation')
  })
})
