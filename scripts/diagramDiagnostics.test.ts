import { describe, expect, test } from 'bun:test'
import { validateDiagram, type Diagnostic } from '../src/utils/diagramDiagnostics'
import cleanFixture from '../src/components/diagrams/architecture.diagram'

const base = () => JSON.parse(JSON.stringify(cleanFixture))

const codes = (value: unknown) => validateDiagram(value).map(d => d.code)
const find = (diags: Diagnostic[], code: string) => diags.find(d => d.code === code)

describe('validateDiagram — clean diagram', () => {
  test('a real fixture produces zero diagnostics', () => {
    expect(validateDiagram(cleanFixture)).toEqual([])
  })
})

describe('validateDiagram — shape layer', () => {
  test('non-object payloads', () => {
    for (const v of [42, 'x', null, [], undefined]) {
      const diags = validateDiagram(v)
      expect(diags).toHaveLength(1)
      expect(diags[0].code).toBe('shape/not-object')
      expect(diags[0].subject.type).toBe('diagram')
    }
  })

  test.each([
    [{ ...base(), layout: undefined }, 'shape/missing-layout'],
    [{ ...base(), layout: { width: 'x' } }, 'shape/invalid-layout'],
    [{ ...base(), nodes: undefined }, 'shape/missing-nodes'],
    [{ ...base(), nodeData: undefined }, 'shape/missing-node-data'],
    [{ ...base(), connectors: {} }, 'shape/invalid-connectors'],
    [{ ...base(), groups: {} }, 'shape/invalid-groups'],
    [{ ...base(), images: 'x' }, 'shape/invalid-images'],
  ])('shape failure %s', (value, code) => {
    const diags = validateDiagram(value)
    expect(diags).toHaveLength(1)
    expect(diags[0].code).toBe(code)
    expect(diags[0].severity).toBe('error')
  })

  test('nodes entry without nodeData stops the run with a fix', () => {
    const d = base()
    d.nodes.orphan = { x: 10, y: 10, size: 'm' }
    const diags = validateDiagram(d)
    expect(diags).toHaveLength(1)
    const diag = diags[0]
    expect(diag.code).toBe('shape/missing-node-data-entry')
    expect(diag.subject).toEqual({ type: 'node', id: 'orphan' })
    expect(diag.supportedFixes).toContainEqual({ kind: 'add-node-data', nodeId: 'orphan' })
  })

  test('malformed entries are flagged and skipped, not fatal', () => {
    const d = base()
    d.nodes.broken = 'x'
    d.nodeData.broken = { icon: 'X', name: 'Broken', color: 'zinc' }
    const diags = validateDiagram(d)
    const diag = find(diags, 'shape/invalid-node')
    expect(diag?.subject).toEqual({ type: 'node', id: 'broken' })
    // other nodes still get checked — nothing else is wrong
    expect(codes(d)).toEqual(['shape/invalid-node'])
  })

  test('node entry missing required fields', () => {
    const d = base()
    d.nodes.bare = { x: 1 }
    d.nodeData.bare = { icon: 'X', name: 'Bare', color: 'zinc' }
    const diag = find(validateDiagram(d), 'shape/invalid-node')
    expect(diag?.subject.id).toBe('bare')
    expect(diag?.evidence?.missing).toEqual(['y', 'size'])
  })

  test('nodeData entry that is not an object or lacks fields', () => {
    const d = base()
    d.nodeData.editor = 42
    expect(find(validateDiagram(d), 'shape/invalid-node-data')?.subject.id).toBe('editor')

    const d2 = base()
    d2.nodeData.model = { name: 'Model' }
    const diag = find(validateDiagram(d2), 'shape/invalid-node-data')
    expect(diag?.evidence?.missing).toEqual(['icon', 'color'])
  })

  test('connector entries that are not objects or lack fields', () => {
    const d = base()
    d.connectors.push(42)
    const diag = find(validateDiagram(d), 'shape/invalid-connector')
    expect(diag?.subject.type).toBe('connector')
    expect(diag?.subject.index).toBe(d.connectors.length - 1)

    const d2 = base()
    d2.connectors.push({ from: 'editor' })
    const diag2 = find(validateDiagram(d2), 'shape/invalid-connector')
    expect(diag2?.evidence?.missing).toEqual(['to', 'fromAnchor', 'toAnchor', 'style'])
  })

  test('non-object connector style entry', () => {
    const d = base()
    d.connectorStyles.diagram = 'nope'
    const diag = find(validateDiagram(d), 'shape/invalid-connector-style')
    expect(diag?.subject).toEqual({ type: 'style', id: 'diagram' })
  })

  test('connectorStyles wrong type / missing entirely while connectors exist', () => {
    const d = base()
    d.connectorStyles = 42
    expect(codes(d)).toContain('shape/invalid-connector-styles')

    const d2 = base()
    delete d2.connectorStyles
    const diag = find(validateDiagram(d2), 'shape/missing-connector-styles')
    expect(diag?.supportedFixes).toContainEqual({ kind: 'add-style' })
  })

  test('malformed group and image entries', () => {
    const d = base()
    d.groups = [42, { id: 'g', x: 0, y: 0, width: 10, height: 10, type: 'blob' }]
    d.images = ['x']
    const diags = validateDiagram(d)
    expect(diags.filter(dd => dd.code === 'shape/invalid-group')).toHaveLength(2)
    expect(diags.filter(dd => dd.code === 'shape/invalid-image')).toHaveLength(1)
    expect(diags[0].subject.index).toBe(0)
  })

  test('non-object focusTargets and layoutHints containers', () => {
    const d = base()
    d.focusTargets = 'x'
    expect(codes(d)).toContain('shape/invalid-focus-targets')
    const d2 = base()
    d2.layoutHints = []
    expect(codes(d2)).toContain('shape/invalid-layout-hints')
  })
})

describe('validateDiagram — semantic layer', () => {
  test('dangling connector endpoint names subject, end, and fixes', () => {
    const d = base()
    d.connectors.push({ id: 'c-bad', from: 'editor', to: 'modell', fromAnchor: 'right', toAnchor: 'left', style: 'diagram' })
    const diag = find(validateDiagram(d), 'semantic/dangling-connector-endpoint')
    expect(diag?.severity).toBe('error')
    expect(diag?.subject).toEqual({ type: 'connector', id: 'c-bad', index: d.connectors.length - 1 })
    expect(diag?.evidence).toEqual({ end: 'to', value: 'modell' })
    expect(diag?.supportedFixes).toContainEqual({ kind: 'retarget', end: 'to', to: 'model' })
    expect(diag?.supportedFixes).toContainEqual({ kind: 'remove-connector' })
  })

  test('connector subject falls back to from->to key without an id', () => {
    const d = base()
    d.connectors.push({ from: 'editor', to: 'ghost', fromAnchor: 'right', toAnchor: 'left', style: 'diagram' })
    const diag = find(validateDiagram(d), 'semantic/dangling-connector-endpoint')
    expect(diag?.subject.id).toBe('editor->ghost')
  })

  test('unknown connector style', () => {
    const d = base()
    d.connectors[0].style = 'diagrm'
    const diag = find(validateDiagram(d), 'semantic/unknown-connector-style')
    expect(diag?.severity).toBe('error')
    expect(diag?.subject.id).toBe('editor->model')
    expect(diag?.evidence?.value).toBe('diagrm')
    expect(diag?.supportedFixes).toContainEqual({ kind: 'add-style' })
    expect(diag?.supportedFixes).toContainEqual({ kind: 'set-style', style: 'diagram' })
  })

  test('unused connector style is a warning', () => {
    const d = base()
    d.connectorStyles.spare = { color: 'zinc', strokeWidth: 1 }
    const diag = find(validateDiagram(d), 'semantic/unused-connector-style')
    expect(diag?.severity).toBe('warning')
    expect(diag?.subject).toEqual({ type: 'style', id: 'spare' })
    expect(diag?.supportedFixes).toContainEqual({ kind: 'remove-style' })
  })

  test('unknown color on node, style, and group subjects', () => {
    const d = base()
    d.nodeData.editor.color = 'puce'
    d.connectorStyles.diagram.color = 'teal'
    d.groups = [{ id: 'g1', x: 0, y: 0, width: 100, height: 100, type: 'rect', color: 'charcoal' }]
    const diags = validateDiagram(d).filter(dd => dd.code === 'semantic/unknown-color')
    expect(diags.map(dd => dd.subject)).toEqual([
      { type: 'node', id: 'editor' },
      { type: 'style', id: 'diagram' },
      { type: 'group', id: 'g1' },
    ])
    expect(diags[0].supportedFixes).toEqual([{ kind: 'set-color', color: 'blue' }])
  })

  test('unknown node size, anchor, and node shape', () => {
    const d = base()
    d.nodes.editor.size = 'xl'
    d.connectors[0].fromAnchor = 'diagonal'
    d.nodeData.docs.shape = 'hexagon'
    const diags = validateDiagram(d)

    const size = find(diags, 'semantic/unknown-node-size')
    expect(size?.subject).toEqual({ type: 'node', id: 'editor' })
    expect(size?.supportedFixes).toEqual([{ kind: 'set-size', size: 'xs' }])

    const anch = find(diags, 'semantic/unknown-anchor')
    expect(anch?.evidence?.field).toBe('fromAnchor')
    expect(anch?.supportedFixes?.[0].kind).toBe('set-anchor')

    const shape = find(diags, 'semantic/unknown-node-shape')
    expect(shape?.subject).toEqual({ type: 'node', id: 'docs' })
    expect(shape?.supportedFixes?.[0].kind).toBe('set-shape')
  })

  test('duplicate connector id', () => {
    const d = base()
    d.connectors[0].id = 'edge-1'
    d.connectors[1].id = 'edge-1'
    const diag = find(validateDiagram(d), 'semantic/duplicate-connector-id')
    expect(diag?.subject).toEqual({ type: 'connector', id: 'edge-1', index: 1 })
    expect(diag?.evidence).toEqual({ id: 'edge-1', firstIndex: 0 })
    expect(diag?.supportedFixes?.[0].kind).toBe('set-connector-id')
  })

  test('nodeData without a nodes entry is an orphan warning', () => {
    const d = base()
    d.nodeData.stray = { icon: 'X', name: 'Stray', color: 'zinc' }
    const diag = find(validateDiagram(d), 'semantic/orphan-node-data')
    expect(diag?.severity).toBe('warning')
    expect(diag?.subject).toEqual({ type: 'node', id: 'stray' })
    expect(diag?.supportedFixes).toContainEqual({ kind: 'remove-node-data', nodeId: 'stray' })
  })

  test('focusTargets referencing missing nodes and connectors', () => {
    const d = base()
    d.connectors[0].id = 'e0'
    d.focusTargets = {
      ghost: { nodes: ['alsoghost'], connectors: [{ id: 'nope' }] },
      editor: { nodes: ['model'], connectors: [{ id: 'e0' }, { from: 'docs', to: 'editor' }] },
    }
    const diags = validateDiagram(d)
    const missingNodes = diags.filter(dd => dd.code === 'semantic/focus-target-missing-node')
    expect(missingNodes.map(dd => dd.subject.id).sort()).toEqual(['alsoghost', 'ghost'])
    const missingConns = diags.filter(dd => dd.code === 'semantic/focus-target-missing-connector')
    expect(missingConns).toHaveLength(2)
    expect(missingConns[0].supportedFixes).toContainEqual({ kind: 'remove-ref' })
  })

  test('layoutHints referencing missing nodes and groups', () => {
    const d = base()
    d.groups = [{ id: 'real', x: 0, y: 0, width: 100, height: 100, type: 'rect', color: 'zinc' }]
    d.layoutHints = {
      nodes: {
        ghost: { group: 'real' },
        editor: { group: 'nogroup' },
      },
      groups: { real: {}, vanished: {} },
    }
    const diags = validateDiagram(d)
    const missingNode = find(diags, 'semantic/layout-hint-missing-node')
    expect(missingNode?.subject).toEqual({ type: 'node', id: 'ghost' })
    const missingGroups = diags.filter(dd => dd.code === 'semantic/layout-hint-missing-group')
    expect(missingGroups.map(dd => dd.subject)).toEqual([
      { type: 'node', id: 'editor' },
      { type: 'group', id: 'vanished' },
    ])
  })
})

describe('validateDiagram — geometry layer', () => {
  test('overlapping node boxes report measured overlap', () => {
    const d = base()
    d.nodes.templates = { x: 55, y: 55, size: 'm' } // overlaps editor (l at 50,50)
    const diag = find(validateDiagram(d), 'geometry/node-overlap')
    expect(diag?.severity).toBe('error')
    expect(diag?.subject).toEqual({ type: 'node', id: 'templates' })
    expect(diag?.evidence?.other).toBe('editor')
    expect((diag?.evidence?.overlap as { area: number }).area).toBeGreaterThan(0)
    expect(diag?.supportedFixes).toContainEqual({ kind: 'auto-layout' })
  })

  test('connector routed through an unrelated node', () => {
    const d = {
      layout: { width: 800, height: 300 },
      nodes: {
        a: { x: 50, y: 50, size: 'm' },
        blocker: { x: 300, y: 50, size: 'm' },
        b: { x: 550, y: 50, size: 'm' },
      },
      nodeData: {
        a: { icon: 'A', name: 'A', color: 'blue' },
        blocker: { icon: 'B', name: 'Blocker', color: 'zinc' },
        b: { icon: 'C', name: 'B', color: 'emerald' },
      },
      connectors: [
        { id: 'a-b', from: 'a', to: 'b', fromAnchor: 'right', toAnchor: 'left', style: 'http' },
      ],
      connectorStyles: { http: { color: 'blue', strokeWidth: 2 } },
    }
    const diag = find(validateDiagram(d), 'geometry/connector-through-node')
    expect(diag?.subject).toEqual({ type: 'connector', id: 'a-b', index: 0 })
    expect(diag?.evidence?.node).toBe('blocker')
    expect(diag?.supportedFixes).toContainEqual({ kind: 'auto-layout' })
  })

  test('composition/too-dense — flat diagram over the node budget warns', () => {
    const d = base()
    // 17 nodes, no groups/views/layoutHints
    for (let i = 0; i < 20; i++) {
      const id = `n${i}`
      d.nodes[id] = { x: 40 + (i % 5) * 300, y: 40 + Math.floor(i / 5) * 160, size: 's' }
      d.nodeData[id] = { icon: 'Box', name: `Node ${i}`, color: 'zinc' }
    }
    const diag = find(validateDiagram(d), 'composition/too-dense')
    expect(diag?.severity).toBe('warning')
    expect((diag?.evidence as any).nodeCount).toBe(25)
    expect(diag?.supportedFixes).toContainEqual({ kind: 'auto-layout' })
  })

  test('composition/too-dense — chaptered diagrams stay quiet', () => {
    const d = base()
    for (let i = 0; i < 20; i++) {
      const id = `n${i}`
      d.nodes[id] = { x: 40 + (i % 5) * 300, y: 40 + Math.floor(i / 5) * 160, size: 's' }
      d.nodeData[id] = { icon: 'Box', name: `Node ${i}`, color: 'zinc' }
    }
    d.groups = [{ id: 'g', x: 0, y: 0, width: 2000, height: 1000, type: 'rect', color: 'zinc' }]
    expect(codes(d)).not.toContain('composition/too-dense')
  })

  test('composition/label-overflow — long names suggest the fitting size', () => {
    const d = base()
    d.nodes.puff = { x: 40, y: 600, size: 'xs' }
    d.nodeData.puff = { icon: 'Box', name: 'Distributed Coordination', color: 'zinc' }
    const diag = find(validateDiagram(d), 'composition/label-overflow')
    expect(diag?.subject).toEqual({ type: 'node', id: 'puff' })
    expect((diag?.evidence as any).size).toBe('xs')
    expect(diag?.supportedFixes).toContainEqual({ kind: 'set-size', size: 'l' })
  })

  test('composition/label-overflow — in-budget names stay quiet', () => {
    const d = base()
    d.nodes.small = { x: 40, y: 600, size: 'l' }
    d.nodeData.small = { icon: 'Box', name: 'Reasonable Name', color: 'zinc' }
    expect(codes(d)).not.toContain('composition/label-overflow')
  })

  test('endpoints and clear routes are not flagged', () => {
    const d = base()
    // no connector in the fixture passes through an unrelated node
    expect(codes(d)).not.toContain('geometry/connector-through-node')
    expect(codes(d)).not.toContain('geometry/node-overlap')
    expect(codes(d)).not.toContain('geometry/node-outside-layout')
  })

  test('node clipped by the layout bounds', () => {
    const d = base()
    d.nodes.docs = { x: 750, y: 150, size: 'm' } // 750+160 = 910 > 860
    const diag = find(validateDiagram(d), 'geometry/node-outside-layout')
    expect(diag?.subject).toEqual({ type: 'node', id: 'docs' })
    expect((diag?.evidence?.overflow as { right: number }).right).toBe(50)
    expect(diag?.supportedFixes).toContainEqual({ kind: 'auto-layout' })
  })

  describe('source evidence', () => {
    const withSource = (source: unknown) => {
      const d = base()
      const id = Object.keys(d.nodeData)[0]
      d.nodeData[id].source = source
      return { d, id }
    }

    test('watches accept repo-relative globs and reject the rest', () => {
      const ok = base()
      ok.watches = ['src/billing/**']
      const id = Object.keys(ok.nodeData)[0]
      ok.nodeData[id].watches = ['*.ts']
      expect(validateDiagram(ok)).toEqual([])

      const empty = base()
      empty.watches = []
      expect(find(validateDiagram(empty), 'semantic/invalid-watches')?.supportedFixes).toEqual([{ kind: 'remove-watches' }])

      const escaped = base()
      const nodeId = Object.keys(escaped.nodeData)[0]
      escaped.nodeData[nodeId].watches = ['../secrets/**']
      const diag = find(validateDiagram(escaped), 'semantic/invalid-watches')
      expect(diag?.subject).toEqual({ type: 'node', id: nodeId })
    })

    test('a well-formed source produces no diagnostics', () => {
      for (const source of [
        { path: 'src/foo.ts' },
        { path: 'src/foo.ts', line: 12 },
        { path: 'src/foo.ts', line: 12, endLine: 20, commit: 'abc123' },
      ]) {
        const { d } = withSource(source)
        expect(validateDiagram(d)).toEqual([])
      }
    })

    test.each([
      ['not an object', 'x'],
      ['missing path', { line: 3 }],
      ['empty path', { path: '' }],
      ['non-string path', { path: 7 }],
      ['fractional line', { path: 'a.ts', line: 1.5 }],
      ['zero line', { path: 'a.ts', line: 0 }],
      ['endLine before line', { path: 'a.ts', line: 20, endLine: 10 }],
      ['non-string commit', { path: 'a.ts', commit: 42 }],
    ])('invalid source — %s', (_label, source) => {
      const { d, id } = withSource(source)
      const diag = find(validateDiagram(d), 'semantic/invalid-source')
      expect(diag?.severity).toBe('error')
      expect(diag?.subject).toEqual({ type: 'node', id })
      expect(diag?.supportedFixes).toEqual([{ kind: 'remove-source' }])
    })
  })
})

describe('validateDiagram — node kinds', () => {
  test('kind supplies icon and color', () => {
    const d = base()
    const id = Object.keys(d.nodeData)[0]
    d.nodeData[id] = { name: 'API Gateway', kind: 'gateway' }
    expect(validateDiagram(d)).toEqual([])
  })

  test('explicit icon/color still win and validate', () => {
    const d = base()
    const id = Object.keys(d.nodeData)[0]
    d.nodeData[id] = { name: 'Cache', kind: 'database', icon: 'Zap', color: 'amber' }
    expect(validateDiagram(d)).toEqual([])
  })

  test('unknown kind is an error with a set-kind fix', () => {
    const d = base()
    const id = Object.keys(d.nodeData)[0]
    d.nodeData[id] = { name: 'Postgres', icon: 'Database', color: 'emerald', kind: 'databse' }
    const diag = find(validateDiagram(d), 'semantic/unknown-kind')
    expect(diag?.severity).toBe('error')
    expect(diag?.subject).toEqual({ type: 'node', id })
    expect(diag?.supportedFixes).toContainEqual({ kind: 'set-kind', value: 'database' })
  })

  test('an invalid kind does not waive the icon/color requirement', () => {
    const d = base()
    const id = Object.keys(d.nodeData)[0]
    d.nodeData[id] = { name: 'Postgres', kind: 'databse' }
    const diags = validateDiagram(d)
    const shape = find(diags, 'shape/invalid-node-data')
    expect((shape?.evidence?.missing as string[]).sort()).toEqual(['color', 'icon'])
    expect(find(diags, 'semantic/unknown-kind')).toBeTruthy()
  })

  test('missing icon/color suggests a kind inferred from the name', () => {
    const d = base()
    const id = Object.keys(d.nodeData)[0]
    d.nodeData[id] = { name: 'Postgres Primary' }
    const diag = find(validateDiagram(d), 'shape/invalid-node-data')
    expect(diag?.supportedFixes).toContainEqual({ kind: 'set-kind', value: 'database' })
  })

  test('missing icon/color without a guessable kind has no fix', () => {
    const d = base()
    const id = Object.keys(d.nodeData)[0]
    d.nodeData[id] = { name: 'Widget Co.' }
    const diag = find(validateDiagram(d), 'shape/invalid-node-data')
    expect(diag?.supportedFixes).toBeUndefined()
  })

  describe('legend + locale contracts', () => {
    test.each([
      [{ legend: 'auto' }],
      [{ legend: 'all' }],
      [{ legend: 'hidden' }],
      [{ _meta: { locale: 'en' } }],
      [{ _meta: { locale: 'ar-EG' } }],
      [{ _meta: {} }],
      [{ _meta: { themeId: 'command', colorMode: 'dark' } }],
    ])('valid doc-level field %s', (patch) => {
      expect(validateDiagram({ ...base(), ...patch })).toEqual([])
    })

    test('unknown legend value proposes the nearest mode', () => {
      const d = { ...base(), legend: 'aut' }
      const diag = find(validateDiagram(d), 'semantic/unknown-legend')
      expect(diag?.severity).toBe('error')
      expect(diag?.subject).toEqual({ type: 'diagram' })
      expect(diag?.supportedFixes).toEqual([{ kind: 'set-legend', legend: 'auto' }])
    })

    test('non-object _meta is an error with a remove fix', () => {
      const diag = find(validateDiagram({ ...base(), _meta: 'en' }), 'semantic/invalid-meta')
      expect(diag?.supportedFixes).toEqual([{ kind: 'remove-meta' }])
    })

    test.each([['en_US'], ['not a locale'], [42]])('invalid locale %s', (locale) => {
      const diag = find(validateDiagram({ ...base(), _meta: { locale } }), 'semantic/invalid-locale')
      expect(diag?.severity).toBe('error')
      expect(diag?.supportedFixes).toEqual([{ kind: 'remove-meta' }])
    })
  })
})
