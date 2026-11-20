import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CLI = join(import.meta.dir, 'arc-cli.ts')

interface CliResult {
  status: number | null
  stdout: string
  stderr: string
}

function run(args: string[], input?: string): CliResult {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    input,
    encoding: 'utf8',
  })
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

const valid = {
  layout: { width: 600, height: 300 },
  nodes: {
    a: { x: 40, y: 80, size: 'm' },
  },
  nodeData: {
    a: { icon: 'Server', name: 'A', color: 'blue' },
  },
  connectors: [],
  connectorStyles: {},
}

const warningOnly = {
  ...valid,
  connectorStyles: {
    unused: { color: 'blue', strokeWidth: 2 },
  },
}

const invalid = {
  ...valid,
  nodeData: {
    a: { icon: 'Server', name: 'A', color: 'not-a-color' },
  },
}

const head = {
  ...valid,
  nodes: {
    ...valid.nodes,
    b: { x: 280, y: 80, size: 'm' },
  },
  nodeData: {
    ...valid.nodeData,
    b: { icon: 'Database', name: 'B', color: 'emerald' },
  },
  connectors: [
    { id: 'a-to-b', from: 'a', to: 'b', fromAnchor: 'right', toAnchor: 'left', style: 'api' },
  ],
  connectorStyles: {
    api: { color: 'violet', strokeWidth: 2, label: 'API' },
  },
}

describe('arc CLI', () => {
  test('check returns {ok:true, diagnostics:[]} for a clean stdin diagram', () => {
    const result = run(['check', '-', '--json'], JSON.stringify(valid))
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual({ ok: true, diagnostics: [] })
  })

  test('check returns coded diagnostics and exit 1 for invalid JSON documents', () => {
    const dir = mkdtempSync(join(tmpdir(), 'arc-cli-'))
    try {
      const file = join(dir, 'bad.json')
      writeFileSync(file, JSON.stringify(invalid))
      const result = run(['check', file, '--json'])
      expect(result.status).toBe(1)
      const payload = JSON.parse(result.stdout)
      expect(payload.ok).toBe(false)
      expect(payload.diagnostics[0].code).toBe('semantic/unknown-color')
      expect(payload.diagnostics[0].supportedFixes?.[0]).toEqual({ kind: 'set-color', color: 'violet' })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('check warnings do not fail unless --strict is set', () => {
    const normal = run(['check', '-', '--json'], JSON.stringify(warningOnly))
    expect(normal.status).toBe(0)
    expect(JSON.parse(normal.stdout).diagnostics[0].severity).toBe('warning')

    const strict = run(['check', '-', '--json', '--strict'], JSON.stringify(warningOnly))
    expect(strict.status).toBe(1)
    expect(JSON.parse(strict.stdout).ok).toBe(false)
  })

  test('check --severity error filters warnings out of the JSON payload', () => {
    const result = run(['check', '-', '--json', '--severity', 'error'], JSON.stringify(warningOnly))
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual({ ok: true, diagnostics: [] })
  })

  test('check --json emits an error payload for malformed JSON', () => {
    const result = run(['check', '-', '--json'], '{')
    expect(result.status).toBe(1)
    const payload = JSON.parse(result.stdout)
    expect(payload.ok).toBe(false)
    expect(payload.error).toContain('check: invalid JSON')
  })

  test('diff prints the structural delta JSON', () => {
    const dir = mkdtempSync(join(tmpdir(), 'arc-cli-'))
    try {
      const baseFile = join(dir, 'base.json')
      const headFile = join(dir, 'head.json')
      writeFileSync(baseFile, JSON.stringify(valid))
      writeFileSync(headFile, JSON.stringify(head))
      const result = run(['diff', baseFile, headFile])
      expect(result.status).toBe(0)
      const delta = JSON.parse(result.stdout)
      expect(delta.nodes.added).toEqual(['b'])
      expect(delta.connectors.added).toHaveLength(1)
      expect(delta.connectorStyles.added).toEqual(['api'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('diff --summary reports counts', () => {
    const dir = mkdtempSync(join(tmpdir(), 'arc-cli-'))
    try {
      const baseFile = join(dir, 'base.json')
      const headFile = join(dir, 'head.json')
      writeFileSync(baseFile, JSON.stringify(valid))
      writeFileSync(headFile, JSON.stringify(head))
      const result = run(['diff', baseFile, headFile, '--summary'])
      expect(result.status).toBe(0)
      expect(result.stdout).toContain('nodes: +1 -0 moved:0 changed:0')
      expect(result.stdout).toContain('connectors: +1 -0 changed:0')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('diff validates both inputs before diffing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'arc-cli-'))
    try {
      const baseFile = join(dir, 'base.json')
      const headFile = join(dir, 'head.json')
      writeFileSync(baseFile, JSON.stringify(invalid))
      writeFileSync(headFile, JSON.stringify(valid))
      const result = run(['diff', baseFile, headFile])
      expect(result.status).toBe(1)
      const payload = JSON.parse(result.stdout)
      expect(payload.ok).toBe(false)
      expect(payload.errors.base[0].code).toBe('semantic/unknown-color')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('render writes an SVG atomically and emits a deterministic receipt', () => {
    const dir = mkdtempSync(join(tmpdir(), 'arc-cli-'))
    try {
      const input = join(dir, 'diagram.json')
      const output = join(dir, 'diagram.svg')
      const source = JSON.stringify(valid)
      writeFileSync(input, source)

      const result = run(['render', input, '--out', output, '--json'])
      expect(result.status).toBe(0)
      const receipt = JSON.parse(result.stdout)
      const svg = readFileSync(output, 'utf8')
      expect(receipt).toMatchObject({
        ok: true,
        command: 'render',
        input,
        output,
        format: 'svg',
        width: 640,
        height: 340,
        bytes: Buffer.byteLength(svg),
      })
      expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="340"')
      expect(svg).toContain('A')
      expect(receipt.sha256.source).toBe(createHash('sha256').update(source).digest('hex'))
      expect(receipt.sha256.output).toBe(createHash('sha256').update(svg).digest('hex'))
      expect(readdirSync(dir).filter(name => name.startsWith('.diagram.svg.tmp'))).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('render fails closed and does not overwrite an existing artifact', () => {
    const dir = mkdtempSync(join(tmpdir(), 'arc-cli-'))
    try {
      const input = join(dir, 'bad.json')
      const output = join(dir, 'diagram.svg')
      writeFileSync(input, JSON.stringify(invalid))
      writeFileSync(output, 'keep me')

      const result = run(['render', input, '--out', output, '--json'])
      expect(result.status).toBe(1)
      const payload = JSON.parse(result.stdout)
      expect(payload.ok).toBe(false)
      expect(payload.error.code).toBe('validation/failed')
      expect(payload.diagnostics[0].code).toBe('semantic/unknown-color')
      expect(readFileSync(output, 'utf8')).toBe('keep me')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('render warns by default and --strict blocks the write', () => {
    const dir = mkdtempSync(join(tmpdir(), 'arc-cli-'))
    try {
      const input = join(dir, 'warning.json')
      const output = join(dir, 'warning.svg')
      writeFileSync(input, JSON.stringify(warningOnly))

      const allowed = run(['render', input, '--out', output, '--json'])
      expect(allowed.status).toBe(0)
      expect(JSON.parse(allowed.stdout).diagnostics[0].severity).toBe('warning')
      expect(existsSync(output)).toBe(true)

      rmSync(output)
      const strict = run(['render', input, '--out', output, '--json', '--strict'])
      expect(strict.status).toBe(1)
      expect(JSON.parse(strict.stdout).error.code).toBe('validation/failed')
      expect(existsSync(output)).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('render returns a coded JSON error without writing on malformed input', () => {
    const dir = mkdtempSync(join(tmpdir(), 'arc-cli-'))
    try {
      const output = join(dir, 'bad.svg')
      const result = run(['render', '-', '--out', output, '--json'], '{')
      expect(result.status).toBe(1)
      const payload = JSON.parse(result.stdout)
      expect(payload.error.code).toBe('cli/input-error')
      expect(existsSync(output)).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('render usage errors are still structured when --json is present', () => {
    const result = run(['render', '--json'])
    expect(result.status).toBe(2)
    const payload = JSON.parse(result.stdout)
    expect(payload.error.code).toBe('cli/usage-error')
  })

  test('render infers animation formats from --out and rejects mismatches', () => {
    const mismatch = run(['render', '-', '--out', 'x.gif', '--format', 'png', '--json'], JSON.stringify(valid))
    expect(mismatch.status).toBe(2)
    expect(JSON.parse(mismatch.stdout).error.message).toContain('--out ends .gif')

    const wrongFlag = run(['render', '-', '--out', 'x.svg', '--fps', '12', '--json'], JSON.stringify(valid))
    expect(wrongFlag.status).toBe(2)
    expect(JSON.parse(wrongFlag.stdout).error.message).toContain('--fps only applies to gif/mp4')
  })

  test('bench scores the committed reference suite and passes', () => {
    const result = run(['bench', join(import.meta.dir, '..', 'benchmarks'), '--json'])
    expect(result.status).toBe(0)
    const report = JSON.parse(result.stdout)
    expect(report.ok).toBe(true)
    expect(report.totals.cases).toBe(4)
    expect(report.totals.passed).toBe(report.totals.candidates)
    expect(report.cases.map((c: { case: string }) => c.case).sort()).toEqual(['auth-flow', 'event-pipeline', 'ml-training', 'web-app'])
  })

  test('bench reports missing nodes, missing edges, and reversed edges', () => {
    const dir = mkdtempSync(join(tmpdir(), 'arc-bench-'))
    try {
      writeFileSync(join(dir, 'expect.json'), JSON.stringify({
        nodes: ['frontend', 'api', 'missing-db'],
        edges: [['frontend', 'api'], ['api', 'frontend'], ['frontend', 'nowhere']],
      }))
      const candidate = join(dir, 'candidate.json')
      writeFileSync(candidate, JSON.stringify({
        ...head,
        nodeData: { a: { icon: 'Monitor', name: 'Frontend', color: 'blue' }, b: { icon: 'Server', name: 'API', color: 'violet' } },
      }))

      const result = run(['bench', dir, candidate, '--json'])
      expect(result.status).toBe(1)
      const report = JSON.parse(result.stdout)
      const scored = report.cases[0].candidates[0]
      expect(scored.pass).toBe(false)
      expect(scored.nodes.missing).toEqual(['missing-db'])
      expect(scored.edges.missing).toEqual([['frontend', 'nowhere']])
      expect(scored.edges.reversed).toEqual([['api', 'frontend']])
      expect(scored.edges.found).toBe(1)
      expect(report.ok).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('bench flags a reversed edge instead of counting it as found', () => {
    const dir = mkdtempSync(join(tmpdir(), 'arc-bench-'))
    try {
      writeFileSync(join(dir, 'expect.json'), JSON.stringify({ nodes: [], edges: [['a', 'b']] }))
      const candidate = join(dir, 'reversed.json')
      writeFileSync(candidate, JSON.stringify({
        ...head,
        connectors: [{ id: 'b-to-a', from: 'b', to: 'a', fromAnchor: 'left', toAnchor: 'right', style: 'api' }],
      }))

      const result = run(['bench', dir, candidate, '--json'])
      expect(result.status).toBe(1)
      const scored = JSON.parse(result.stdout).cases[0].candidates[0]
      expect(scored.edges.found).toBe(0)
      expect(scored.edges.reversed).toEqual([['a', 'b']])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('bench treats unparseable candidates as failures and empty outputs as skipped', () => {
    const dir = mkdtempSync(join(tmpdir(), 'arc-bench-'))
    try {
      writeFileSync(join(dir, 'expect.json'), JSON.stringify({ nodes: ['a'] }))
      const bad = join(dir, 'broken.json')
      writeFileSync(bad, '{')
      const result = run(['bench', dir, bad, '--json'])
      expect(result.status).toBe(1)
      expect(JSON.parse(result.stdout).cases[0].candidates[0].inputError).toContain('JSON')

      // an outputs-less case dir inside a suite reports as skipped
      const emptyCase = join(dir, 'suite', 'no-outputs')
      mkdirSync(emptyCase, { recursive: true })
      writeFileSync(join(emptyCase, 'expect.json'), JSON.stringify({ nodes: [] }))
      const skipped = run(['bench', join(dir, 'suite')])
      expect(skipped.status).toBe(1)
      expect(skipped.stdout).toContain('no candidates')
      expect(skipped.stdout).toContain('skipped')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('bench usage errors exit 2', () => {
    expect(run(['bench']).status).toBe(2)
    expect(run(['bench', '--bogus']).status).toBe(2)
    const missing = run(['bench', '/does/not/exist'])
    expect(missing.status).toBe(1)
  })

  test('apply writes operations into a diagram file and leaves it unchanged when one fails', () => {
    const dir = mkdtempSync(join(tmpdir(), 'arc-apply-'))
    try {
      const file = join(dir, 'services.arc.json')
      const original = `${JSON.stringify(valid, null, 2)}\n`
      writeFileSync(file, original)
      const bad = run(['apply', file, '--ops', '-', '--json'], JSON.stringify([{ op: 'node.remove', id: 'missing' }]))
      expect(bad.status).toBe(1)
      expect(JSON.parse(bad.stdout).ok).toBe(false)
      expect(readFileSync(file, 'utf8')).toBe(original)

      const focus = run(['apply', file, '--ops', '-'], JSON.stringify([{ op: 'focus', nodes: ['a'], caption: 'Working' }]))
      expect(focus.status).toBe(1)
      expect(focus.stderr).toContain('focus is viewer state')
      expect(readFileSync(file, 'utf8')).toBe(original)

      const ops = join(dir, 'ops.json')
      writeFileSync(ops, JSON.stringify([
        { op: 'node.add', id: 'db', data: { name: 'DB', kind: 'database' } },
        { op: 'focus', nodes: ['db'], caption: 'Added' },
      ]))
      const good = run(['apply', file, '--ops', ops, '--json'])
      expect(good.status).toBe(0)
      const payload = JSON.parse(good.stdout)
      expect(payload.ok).toBe(true)
      expect(payload.focusIgnored).toBe(true)
      const written = JSON.parse(readFileSync(file, 'utf8'))
      expect(written.nodeData.a.name).toBe('A')
      expect(written.nodeData.db).toEqual({ name: 'DB', kind: 'database' })
      expect(written.nodes.db.size).toBe('m')

      const renamed = run(['apply', file, '--ops', '-'], JSON.stringify({
        v: 1,
        stream: 'services',
        seq: 1,
        base: 0,
        ops: [{ op: 'node.update', id: 'a', data: { name: 'Renamed' } }],
      }))
      expect(renamed.status).toBe(0)
      expect(renamed.stdout).toContain('updated')
      expect(JSON.parse(readFileSync(file, 'utf8')).nodeData.a).toMatchObject({ name: 'Renamed', icon: 'Server', color: 'blue' })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('impacted reports the diagram and node that claim a path', () => {
    const dir = mkdtempSync(join(tmpdir(), 'arc-impacted-cli-'))
    try {
      writeFileSync(join(dir, 'services.arc.json'), JSON.stringify({
        ...valid,
        watches: ['src/billing/**'],
        nodeData: {
          a: { ...valid.nodeData.a, source: { path: 'src/auth/session.ts' } },
        },
      }))
      const result = run(['impacted', 'src/auth/session.ts', 'src/billing/invoice.ts', 'README.md', '--root', dir, '--json'])
      expect(result.status).toBe(0)
      const report = JSON.parse(result.stdout)
      expect(report.diagrams).toEqual([{
        file: 'services.arc.json',
        matches: [
          { path: 'src/auth/session.ts', via: 'source', node: 'a' },
          { path: 'src/billing/invoice.ts', via: 'watch', watch: 'src/billing/**' },
        ],
      }])
      const quiet = run(['impacted', 'README.md', '--root', dir])
      expect(quiet.status).toBe(0)
      expect(quiet.stdout).toContain('no diagrams claim these paths')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('schema prints the generated draft-07 schema', () => {
    const result = run(['schema'])
    expect(result.status).toBe(0)
    const schema = JSON.parse(result.stdout)
    expect(schema.$schema).toBe('http://json-schema.org/draft-07/schema#')
    expect(schema.$ref).toBe('#/definitions/ArcDiagramData')
  })
})
