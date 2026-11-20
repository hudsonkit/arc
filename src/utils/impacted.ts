// Which diagrams and nodes claim a set of changed paths.
//
// A node claims a path through `source.path` (exact file) or through a
// `watches` glob. A diagram-level `watches` list claims a path that no node
// claimed. Globs are repo-relative: `*` stays inside one segment, `**` crosses
// segments, and a pattern with no slash matches the file name in any directory.

export interface ImpactMatch {
  /** Repo-relative changed path that hit a claim. */
  path: string
  via: 'source' | 'watch'
  /** Set when a node claimed the path. Absent when only the diagram did. */
  node?: string
  /** The glob that matched, when `via` is `watch`. */
  watch?: string
}

export interface ClaimNode {
  source?: { path?: unknown }
  watches?: unknown
}

export interface ClaimDiagram {
  watches?: unknown
  nodeData?: Record<string, ClaimNode | undefined>
}

/** Posix, no leading `./`, no trailing slash. */
export function normalizeRepoPath(input: string): string {
  let path = input.replace(/\\/g, '/')
  if (path.startsWith('./')) path = path.slice(2)
  path = path.replace(/\/+/g, '/').replace(/\/$/, '')
  return path
}

const compiled = new Map<string, RegExp>()

function compileGlob(pattern: string): RegExp {
  const cached = compiled.get(pattern)
  if (cached) return cached
  let out = ''
  let i = 0
  while (i < pattern.length) {
    if (pattern.startsWith('**/', i)) {
      out += '(?:.*/)*'
      i += 3
      continue
    }
    if (pattern.startsWith('**', i)) {
      out += '.*'
      i += 2
      continue
    }
    const ch = pattern[i]
    if (ch === '*') { out += '[^/]*'; i++; continue }
    if (ch === '?') { out += '[^/]'; i++; continue }
    out += /[.+^${}()|[\]\\]/.test(ch) ? `\\${ch}` : ch
    i++
  }
  const expression = new RegExp(`^${out}$`)
  compiled.set(pattern, expression)
  return expression
}

/** True when `glob` claims `path`. Both are normalized first. */
export function watchMatches(glob: string, path: string): boolean {
  const pattern = normalizeRepoPath(glob)
  const target = normalizeRepoPath(path)
  if (!pattern || pattern.split('/').includes('..')) return false
  if (pattern.includes('/')) return compileGlob(pattern).test(target)
  const name = target.split('/').pop() ?? target
  return compileGlob(pattern).test(name)
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
}

/**
 * Claims inside one diagram. Paths should already be repo-relative.
 * One node produces at most one match per path; a source hit wins over a watch.
 */
export function diagramImpacts(diagram: ClaimDiagram, paths: string[]): ImpactMatch[] {
  const matches: ImpactMatch[] = []
  const nodeData = diagram.nodeData ?? {}
  const diagramWatches = stringList(diagram.watches)
  for (const raw of paths) {
    const path = normalizeRepoPath(raw)
    if (!path) continue
    let nodeHit = false
    for (const [id, data] of Object.entries(nodeData)) {
      const source = typeof data?.source?.path === 'string' ? normalizeRepoPath(data.source.path) : ''
      if (source && source === path) {
        matches.push({ path, via: 'source', node: id })
        nodeHit = true
        continue
      }
      const watch = stringList(data?.watches).find(glob => watchMatches(glob, path))
      if (watch) {
        matches.push({ path, via: 'watch', node: id, watch })
        nodeHit = true
      }
    }
    if (!nodeHit) {
      const watch = diagramWatches.find(glob => watchMatches(glob, path))
      if (watch) matches.push({ path, via: 'watch', watch })
    }
  }
  return matches
}
