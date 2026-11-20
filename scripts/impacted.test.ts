import { describe, expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { diagramImpacts, watchMatches } from '../src/utils/impacted'
import { collectImpacts } from './impactedScan'

describe('watch globs', () => {
  test('exact, single-segment, and recursive globs', () => {
    expect(watchMatches('src/auth/session.ts', 'src/auth/session.ts')).toBe(true)
    expect(watchMatches('src/auth/*', 'src/auth/session.ts')).toBe(true)
    expect(watchMatches('src/auth/*', 'src/auth/token/verify.ts')).toBe(false)
    expect(watchMatches('src/auth/**', 'src/auth/token/verify.ts')).toBe(true)
    expect(watchMatches('src/**/*.ts', 'src/auth/session.ts')).toBe(true)
    expect(watchMatches('**/*.ts', 'src/auth/session.ts')).toBe(true)
    expect(watchMatches('*.ts', 'src/auth/session.ts')).toBe(true)
    expect(watchMatches('*.ts', 'src/auth/session.js')).toBe(false)
    expect(watchMatches('src/auth/**', 'src/billing/invoice.ts')).toBe(false)
    expect(watchMatches('../secret', 'secret')).toBe(false)
  })
})

describe('diagramImpacts', () => {
  const diagram = {
    watches: ['src/billing/**'],
    nodeData: {
      auth: { name: 'Auth', source: { path: 'src/auth/session.ts' }, watches: ['src/auth/**'] },
      queue: { name: 'Queue', watches: ['src/queue/*.ts'] },
    },
  }

  test('a source path names the node and wins over that node’s watch', () => {
    expect(diagramImpacts(diagram, ['src/auth/session.ts'])).toEqual([
      { path: 'src/auth/session.ts', via: 'source', node: 'auth' },
    ])
  })

  test('a node watch matches when the source file is a different path', () => {
    expect(diagramImpacts(diagram, ['src/auth/token/verify.ts'])).toEqual([
      { path: 'src/auth/token/verify.ts', via: 'watch', node: 'auth', watch: 'src/auth/**' },
    ])
  })

  test('a diagram watch is the claim when no node matches', () => {
    expect(diagramImpacts(diagram, ['src/billing/invoice.ts'])).toEqual([
      { path: 'src/billing/invoice.ts', via: 'watch', watch: 'src/billing/**' },
    ])
  })

  test('an unclaimed path produces no match', () => {
    expect(diagramImpacts(diagram, ['README.md'])).toEqual([])
  })
})

describe('collectImpacts', () => {
  test('scans .arc.json files and skips a document that is not a diagram', () => {
    const root = mkdtempSync(join(tmpdir(), 'arc-impacted-'))
    writeFileSync(join(root, 'services.arc.json'), JSON.stringify({
      layout: { width: 600, height: 300 },
      nodes: { auth: { x: 40, y: 80, size: 'm' } },
      nodeData: { auth: { name: 'Auth', kind: 'service', source: { path: 'src/auth/session.ts' } } },
      connectors: [],
      connectorStyles: {},
      watches: ['src/billing/**'],
    }))
    writeFileSync(join(root, 'notes.arc.json'), '{')
    const report = collectImpacts(root, ['src/auth/session.ts', 'src/other.ts'])
    expect(report.diagrams).toEqual([{
      file: 'services.arc.json',
      matches: [{ path: 'src/auth/session.ts', via: 'source', node: 'auth' }],
    }])
    expect(report.skipped.map(skip => skip.file)).toEqual(['notes.arc.json'])
  })
})
