import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ArcDiagram from '../src/components/ArcDiagram'
import { writeFileSync } from 'node:fs'
import type { ArcDiagramData } from '../src/types/diagram.ts'
import { flowAnimationEnd, flowPositionAt, resolveDiagramFlow } from '../src/utils/flowAnimation.ts'
import { diagramFlowDuration, renderFlowLayer, smilRepeatCount } from '../src/utils/flowSvg.ts'
import { validateDiagram } from '../src/utils/diagramDiagnostics.ts'
import { renderDiagramSvg } from './renderImage.ts'
import { renderDiagramAnimation } from './renderAnimation.ts'

const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('fake-png'),
])

const diagram: ArcDiagramData = {
  layout: { width: 700, height: 320 },
  nodes: {
    client: { x: 40, y: 120, size: 'm' },
    gateway: { x: 300, y: 120, size: 'm' },
    db: { x: 560, y: 120, size: 'm' },
  },
  nodeData: {
    client: { icon: 'Monitor', name: 'Client', color: 'violet' },
    gateway: { icon: 'Shield', name: 'Gateway', color: 'blue' },
    db: { icon: 'Database', name: 'Postgres', color: 'amber' },
  },
  connectors: [
    { id: 'c1', from: 'client', to: 'gateway', fromAnchor: 'right', toAnchor: 'left', style: 'https' },
    { id: 'c2', from: 'gateway', to: 'db', fromAnchor: 'right', toAnchor: 'left', style: 'sql' },
  ],
  connectorStyles: {
    https: { color: 'blue', strokeWidth: 2 },
    sql: { color: 'amber', strokeWidth: 2, dashed: true },
  },
  flows: [
    {
      id: 'request',
      label: 'Request',
      legs: [{ id: 'c1' }, { id: 'c2' }],
      duration: 2,
      delay: 0.25,
      hold: 0.5,
      repeat: 1,
      marker: 'packet',
      color: 'emerald',
      trail: 'wake',
    },
  ],
}

describe('flow route resolution', () => {
  test('the React player draws the exact connector path used by sampled packets', () => {
    for (const curve of [undefined, 'natural', 'step', 'direct', 'up', 'down'] as const) {
      const fixture = structuredClone(diagram)
      fixture.nodes.gateway = { x: 40, y: 260, size: 'm' }
      fixture.connectors = [{ ...fixture.connectors[0], fromAnchor: 'left', toAnchor: 'left', curve, curveDepth: 25 }]
      fixture.flows![0].legs = [{ id: 'c1' }]
      const resolved = resolveDiagramFlow(fixture, fixture.flows![0])!
      const markup = renderToStaticMarkup(createElement(ArcDiagram, { data: { ...fixture, flows: [] }, interactive: false }))
      expect(markup).toContain(`d="${resolved.routePath}"`)
      if (curve === 'natural') expect(flowPositionAt(resolved, 1)?.x).toBeLessThan(40)
    }
  })
  test('resolves connector ids into one route with deterministic timing', () => {
    const flow = resolveDiagramFlow(diagram, diagram.flows![0])!
    expect(flow.legs.map(leg => leg.connectorId)).toEqual(['c1', 'c2'])
    expect(flow.routePath).toContain('C')
    expect(flow.routeLength).toBeGreaterThan(300)
    expect(flow.visibleLength).toBeLessThan(flow.routeLength)
    expect(flow.duration).toBeCloseTo(2)
    expect(flow.cycleDuration).toBeCloseTo(2.5)

    const start = flowPositionAt(flow, 0.25)
    const middle = flowPositionAt(flow, 1)
    const end = flowPositionAt(flow, 2.249)
    expect(start?.legIndex).toBe(0)
    expect(start?.transit).toBe(false)
    expect(middle?.distance).toBeGreaterThan(start!.distance)
    expect(end?.progress).toBeGreaterThan(0.98)
    expect(flowAnimationEnd(flow)).toBeCloseTo(2.25)
  })

  test('reverse legs traverse the connector from its to-anchor', () => {
    const reverse = structuredClone(diagram)
    reverse.flows![0].legs = [{ id: 'c2', direction: 'reverse' }]
    reverse.flows![0].duration = 1
    reverse.flows![0].delay = 0
    reverse.flows![0].hold = 0
    const flow = resolveDiagramFlow(reverse, reverse.flows![0])!
    const start = flowPositionAt(flow, 0)!
    const end = flowPositionAt(flow, 0.999)!
    expect(start.x).toBeGreaterThan(end.x)
    expect(start.transit).toBe(false)
    expect(end.progress).toBeCloseTo(1)
  })

  test('a return hop retraces the connector it arrived on', () => {
    const hop = structuredClone(diagram)
    hop.flows![0].legs = [{ id: 'c1' }, { id: 'c2' }, { id: 'c1', direction: 'reverse' }]
    hop.flows![0].delay = 0
    hop.flows![0].hold = 0
    const flow = resolveDiagramFlow(hop, hop.flows![0])!
    const kinds = flow.segments.map(item => item.segment.kind)
    expect(kinds).toEqual(['cubic', 'line', 'cubic', 'cubic', 'line', 'cubic'])
    const transits = flow.intervals.filter(span => span.transit)
    expect(transits).toHaveLength(2)
    const c2Length = flow.legs[1].routeEnd - flow.legs[1].routeStart
    expect(transits[1].toDistance - transits[1].fromDistance).toBeGreaterThan(c2Length)
  })

  test('indefinite repeats wrap while finite runs stop after their last pass', () => {
    const looping = structuredClone(diagram)
    looping.flows![0].repeat = 'indefinite'
    looping.flows![0].delay = 0
    looping.flows![0].hold = 0
    const flow = resolveDiagramFlow(looping, looping.flows![0])!
    expect(flowPositionAt(flow, 20)).not.toBeNull()

    const once = resolveDiagramFlow(diagram, diagram.flows![0])!
    expect(flowPositionAt(once, 10)).toBeNull()
  })
})

describe('flow SVG rendering', () => {
  test('animated SVG embeds SMIL route animation', () => {
    const layer = renderFlowLayer(diagram, { animate: true })
    expect(layer).toContain('data-arc-flows')
    expect(layer).toContain('<animateMotion')
    expect(layer).toContain('keyPoints=')
    expect(layer).toContain('data-arc-flow="request"')
    // The 0.5s hold hides markers after the 2s travel window inside a 2.5s cycle.
    expect(layer).toContain('values="0;1;0" keyTimes="0;0.015;0.8"')
  })

  test('repeatCount is always a whole number or "indefinite", never the raw value', () => {
    expect(smilRepeatCount('indefinite')).toBe('indefinite')
    expect(smilRepeatCount(3)).toBe('3')
    expect(smilRepeatCount(2.7)).toBe('2')
    expect(smilRepeatCount('4')).toBe('4')
    expect(smilRepeatCount(0)).toBe('1')
    expect(smilRepeatCount(-2)).toBe('1')
    for (const bad of [Number.NaN, Infinity, '', '"/><script>alert(1)</script>', null, {}, true]) {
      expect(smilRepeatCount(bad)).toBe('indefinite')
    }

    // An unvalidated document reaches the renderer with a hostile repeat.
    const hostile = structuredClone(diagram)
    hostile.flows![0].repeat = '1" onbegin="alert(1)' as unknown as number
    const layer = renderFlowLayer(hostile, { animate: true })
    expect(layer).not.toContain('onbegin')
    const counts = [...layer.matchAll(/repeatCount="([^"]*)"/g)].map(match => match[1])
    expect(counts.length).toBeGreaterThan(0)
    for (const count of counts) expect(count).toMatch(/^(?:indefinite|[1-9]\d*)$/)
  })

  test('flowTime renders a deterministic still instead of SMIL', () => {
    const layer = renderFlowLayer(diagram, { animate: false, flowTime: 1 })
    expect(layer).not.toContain('<animateMotion')
    expect(layer).toContain('data-arc-flow="request"')
    const moved = renderFlowLayer(diagram, { animate: false, flowTime: 1.4 })
    expect(layer).not.toBe(moved)
  })

  test('standalone SVG embeds animation and honors flowTime stills', () => {
    const animated = renderDiagramSvg(diagram).svg
    expect(animated).toContain('<animateMotion')
    const still = renderDiagramSvg(diagram, { flowTime: 1 }).svg
    expect(still).not.toContain('<animateMotion')
    expect(still).toContain('data-arc-flow="request"')
  })

  test('diagramFlowDuration reports one complete visible run', () => {
    expect(diagramFlowDuration(diagram)).toBeCloseTo(2.25)
  })
})

describe('flow diagnostics', () => {
  test('accepts a valid flow', () => {
    expect(validateDiagram(diagram).filter(d => d.subject.type === 'flow')).toEqual([])
  })

  test('flags malformed flow shapes and timing fields', () => {
    const bad = structuredClone(diagram)
    bad.flows = [
      { id: '', legs: [{ id: 'c1' }], marker: 'blob', easing: 'bounce', direction: 'sideways', speed: 0, duration: 0, repeat: 0 },
      42,
    ] as never
    const codes = validateDiagram(bad).map(d => d.code)
    expect(codes).toContain('shape/invalid-flow')
    expect(codes).toContain('semantic/unknown-flow-marker')
    expect(codes).toContain('semantic/unknown-flow-easing')
    expect(codes).toContain('semantic/unknown-flow-direction')
    expect(codes).toContain('semantic/invalid-flow-timing')
  })

  test('flags missing and ambiguous connector refs with repairable subjects', () => {
    const bad = structuredClone(diagram)
    bad.connectors.push({ id: 'c3', from: 'gateway', to: 'db', fromAnchor: 'right', toAnchor: 'left', style: 'sql' })
    bad.flows = [{ id: 'broken', legs: [{ id: 'missing' }, { from: 'gateway', to: 'db' }] }]
    const diags = validateDiagram(bad)
    const missing = diags.find(d => d.code === 'semantic/flow-missing-connector')
    expect(missing?.subject).toEqual({ type: 'flow', id: 'broken', index: 0 })
    const ambiguous = diags.find(d => d.code === 'semantic/ambiguous-flow-connector')
    expect(ambiguous?.severity).toBe('warning')
    expect(ambiguous?.supportedFixes).toContainEqual({ kind: 'set-flow-leg-id', id: 'c2' })
  })

  test('flags duration shorter than authored pauses', () => {
    const bad = structuredClone(diagram)
    bad.flows![0].legs[0].pause = 3
    bad.flows![0].duration = 2
    const diagnostic = validateDiagram(bad).find(d => d.code === 'semantic/invalid-flow-timing')
    expect(diagnostic?.message).toContain('duration')
    expect(diagnostic?.supportedFixes).toEqual([{ kind: 'set-flow-timing', field: 'duration', value: 4 }])
  })
})

describe('renderDiagramAnimation', () => {
  test('captures deterministic frames and invokes ffmpeg with the selected codec', async () => {
    const chromeCalls: string[][] = []
    let ffmpegArgs: string[] = []
    const rendered = await renderDiagramAnimation(diagram, {
      format: 'gif',
      duration: 1,
      fps: 4,
      scale: 1,
      chromePath: process.execPath,
      ffmpegPath: process.execPath,
      runChrome: async (_chrome, args) => {
        chromeCalls.push(args)
        const output = args.find(arg => arg.startsWith('--screenshot='))!.slice('--screenshot='.length)
        writeFileSync(output, PNG_BYTES)
      },
      runFfmpeg: async (_ffmpeg, args) => {
        ffmpegArgs = args
        writeFileSync(args[args.length - 1], Buffer.from('GIF89a-fake'))
      },
    })

    expect(rendered.frames).toBe(5)
    expect(rendered.width).toBe(740)
    expect(rendered.height).toBe(360)
    expect(rendered.data.subarray(0, 5).toString()).toBe('GIF89')
    expect(chromeCalls).toHaveLength(5)
    expect(chromeCalls[0]).toContain('--headless')
    expect(ffmpegArgs).toContain('-framerate')
    expect(ffmpegArgs).toContain('4')
    expect(ffmpegArgs.join(' ')).toContain('palettegen')
  })

  test('requires ffmpeg and reports a coded error', async () => {
    const env = { ...process.env, PATH: '', ARC_FFMPEG: undefined, FFMPEG_PATH: undefined }
    delete env.ARC_FFMPEG
    delete env.FFMPEG_PATH
    await expect(renderDiagramAnimation(diagram, {
      format: 'mp4',
      duration: 0.5,
      fps: 2,
      chromePath: process.execPath,
      env,
    })).rejects.toMatchObject({ code: 'render/ffmpeg-unavailable' })
  })
})
