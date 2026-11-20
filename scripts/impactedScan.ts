// Walk a tree for `*.arc.json` and report which of them claim the given paths.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { validateDiagramShape } from '../src/utils/diagramValidation.ts'
import { diagramImpacts, normalizeRepoPath, type ImpactMatch } from '../src/utils/impacted.ts'

const SKIP = new Set([
  'node_modules', '.git', 'dist', 'dist-iso', 'dist-iso-slim', 'dist-hudson',
  'lib', 'coverage', '.dewey',
])

export interface ImpactReport {
  paths: string[]
  diagrams: { file: string; matches: ImpactMatch[] }[]
  skipped: { file: string; message: string }[]
}

/** A changed path, as repo-relative posix, even when the caller passed an absolute path. */
export function repoPath(root: string, input: string): string {
  const abs = resolve(root, input)
  const rel = relative(resolve(root), abs)
  if (rel.startsWith('..') || rel === '') return normalizeRepoPath(input)
  return normalizeRepoPath(rel.split(sep).join('/'))
}

function walk(dir: string, out: string[]): void {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue
    if (entry.isDirectory()) {
      if (SKIP.has(entry.name)) continue
      walk(join(dir, entry.name), out)
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.arc.json')) out.push(join(dir, entry.name))
  }
}

export function collectImpacts(root: string, inputs: string[]): ImpactReport {
  const base = resolve(root)
  const paths = inputs.map(input => repoPath(base, input)).filter(Boolean)
  const files: string[] = []
  walk(base, files)
  const diagrams: ImpactReport['diagrams'] = []
  const skipped: ImpactReport['skipped'] = []
  for (const file of files) {
    const rel = normalizeRepoPath(relative(base, file).split(sep).join('/'))
    let parsed: unknown
    try {
      parsed = JSON.parse(readFileSync(file, 'utf8'))
    } catch (err) {
      skipped.push({ file: rel, message: err instanceof Error ? err.message : String(err) })
      continue
    }
    const shape = validateDiagramShape(parsed)
    if (shape) {
      skipped.push({ file: rel, message: shape })
      continue
    }
    const matches = diagramImpacts(parsed as { watches?: unknown; nodeData?: Record<string, { source?: { path?: unknown }; watches?: unknown }> }, paths)
    if (matches.length) diagrams.push({ file: rel, matches })
  }
  return { paths, diagrams, skipped }
}
