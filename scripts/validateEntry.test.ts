import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import * as validate from '../src/validate'

const SRC = path.resolve(import.meta.dir, '../src')

/** Runtime (non-type) import and re-export specifiers of a TypeScript module. */
function runtimeSpecifiers(source: string): string[] {
  const specifiers: string[] = []
  const statement = /^\s*(import|export)\s+(type\s+)?([^'"]*?)\s*from\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]/gm
  for (const match of source.matchAll(statement)) {
    if (match[5]) { specifiers.push(match[5]); continue }
    if (match[2]) continue // import type / export type
    // `import { type A, type B }` is type-only too.
    const names = match[3].replace(/^\{|\}$/g, '').split(',').map(name => name.trim()).filter(Boolean)
    if (names.length > 0 && names.every(name => name.startsWith('type '))) continue
    specifiers.push(match[4])
  }
  for (const match of source.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)|\brequire\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    specifiers.push(match[1] ?? match[2])
  }
  return specifiers
}

function resolveModule(from: string, specifier: string): string {
  const base = path.resolve(path.dirname(from), specifier)
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, path.join(base, 'index.ts')]) {
    if (existsSync(candidate) && !candidate.endsWith(path.sep)) return candidate
  }
  throw new Error(`cannot resolve ${specifier} from ${from}`)
}

describe('@hudsonkit/arc/validate', () => {
  test('its source graph imports no package, no TSX and no CSS', () => {
    const seen = new Set<string>()
    const queue = [path.join(SRC, 'validate.ts')]
    while (queue.length > 0) {
      const file = queue.pop()!
      if (seen.has(file)) continue
      seen.add(file)
      expect(file.endsWith('.ts')).toBe(true)
      for (const specifier of runtimeSpecifiers(readFileSync(file, 'utf8'))) {
        if (!specifier.startsWith('.')) throw new Error(`${path.relative(SRC, file)} imports the package "${specifier}" at runtime`)
        if (/\.css$/.test(specifier)) throw new Error(`${path.relative(SRC, file)} imports CSS`)
        queue.push(resolveModule(file, specifier))
      }
    }
    expect(seen.size).toBeGreaterThan(3)
  })

  test('exports the validators and they run without a DOM', () => {
    expect(Object.keys(validate).sort()).toEqual(['isDiagramShape', 'validateDiagram', 'validateDiagramShape'])
    expect(typeof globalThis.document).toBe('undefined')
    expect(validate.validateDiagramShape({})).toBeString()
    expect(validate.isDiagramShape({ layout: { width: 1, height: 1 }, nodes: {}, nodeData: {}, connectors: [], connectorStyles: {} })).toBe(true)
    const diagram = {
      layout: { width: 400, height: 200 },
      nodes: { a: { x: 20, y: 20, size: 'm' }, b: { x: 240, y: 20, size: 'm' } },
      nodeData: { a: { name: 'A', icon: 'Server', color: 'blue' }, b: { name: 'B', icon: 'Database', color: 'emerald' } },
      connectors: [{ id: 'ab', from: 'a', to: 'b', fromAnchor: 'right', toAnchor: 'left', style: 'x' }],
      connectorStyles: { x: { color: 'blue', strokeWidth: 2 } },
    }
    expect(validate.validateDiagram(diagram).filter(diagnostic => diagnostic.severity === 'error')).toEqual([])
    const broken = { ...diagram, connectors: [{ ...diagram.connectors[0], to: 'missing' }] }
    expect(validate.validateDiagram(broken).some(diagnostic => diagnostic.severity === 'error')).toBe(true)
  })
})
