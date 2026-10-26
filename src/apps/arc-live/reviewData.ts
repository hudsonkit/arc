import type { ArchitectureReview, ArchitectureReviewRepository, ArchitectureReviewSource } from '../../types/live'

const invalid = (): never => { throw new Error('The live session sent an invalid review.') }
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid()
  return value as Record<string, unknown>
}
const text = (value: unknown, limit: number, optional = false, allowEmpty = false): string | undefined => {
  if (optional && value === undefined) return undefined
  // Reject unsafe control characters while retaining tabs and line breaks in review text.
  // eslint-disable-next-line no-control-regex
  if (typeof value !== 'string' || (!allowEmpty && !value.trim()) || value.length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) return invalid()
  return value
}
const list = (value: unknown, limit: number): unknown[] => {
  if (!Array.isArray(value) || value.length > limit) return invalid()
  return value
}

/** Only web links can leave the review; a source can never execute a URL scheme. */
export function reviewWebUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 2048) return undefined
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined
  } catch { return undefined }
}

const optionalUrl = (value: unknown): string | undefined => {
  if (value === undefined) return undefined
  return reviewWebUrl(value) ?? invalid()
}

/** Pick the public fields explicitly so downloaded artifacts cannot inherit transport metadata. */
export function readArchitectureReview(value: unknown): ArchitectureReview {
  const r = record(value)
  if (new TextEncoder().encode(JSON.stringify(r)).byteLength > 1024 * 1024) return invalid()
  let repository: ArchitectureReviewRepository | undefined
  if (r.repository !== undefined) {
    const repo = record(r.repository)
    repository = { name: text(repo.name, 200)!, url: optionalUrl(repo.url), revision: text(repo.revision, 200, true) }
  }
  const ids = new Set<string>()
  const findings = list(r.findings, 200).map(value => {
    const finding = record(value)
    const id = text(finding.id, 200)!
    if (ids.has(id)) return invalid()
    ids.add(id)
    if (!['info', 'low', 'medium', 'high'].includes(finding.severity as string)) return invalid()
    return {
      id, title: text(finding.title, 500)!, detail: text(finding.detail, 16000)!,
      severity: finding.severity as ArchitectureReview['findings'][number]['severity'],
      ...(finding.nodeIds === undefined ? {} : { nodeIds: list(finding.nodeIds, 200).map(id => text(id, 200)!) }),
      sources: list(finding.sources, 50).map(value => {
        const source = record(value)
        if (source.line !== undefined && (!Number.isSafeInteger(source.line) || (source.line as number) < 1)) return invalid()
        return {
          path: text(source.path, 2000)!, line: source.line as number | undefined,
          revision: text(source.revision, 200, true), url: optionalUrl(source.url),
        }
      }),
    }
  })
  return {
    question: text(r.question, 4000)!, repository, summary: text(r.summary, 16000, true, true), findings,
    decisions: list(r.decisions, 200).map(value => text(value, 4000)!),
    openQuestions: list(r.openQuestions, 200).map(value => text(value, 4000)!),
  }
}

export function reviewSourceUrl(source: ArchitectureReviewSource, repository?: ArchitectureReviewRepository): string | undefined {
  if (source.url) return reviewWebUrl(source.url)
  const repositoryUrl = reviewWebUrl(repository?.url)
  const revision = source.revision || repository?.revision
  if (!repositoryUrl || !revision || source.path.startsWith('/') || source.path.includes('\\')) return undefined
  const segments = source.path.split('/')
  if (segments.some(segment => !segment || segment === '.' || segment === '..')) return undefined
  const url = new URL(repositoryUrl)
  const repoPath = url.pathname.replace(/\/$/, '').replace(/\.git$/, '')
  // A repository and a known revision are required; never invent a default branch.
  if (url.hostname !== 'github.com' || repoPath.split('/').filter(Boolean).length !== 2) return undefined
  url.pathname = `${repoPath}/blob/${encodeURIComponent(revision)}/${segments.map(encodeURIComponent).join('/')}`
  url.search = ''
  url.hash = source.line ? `L${source.line}` : ''
  return url.href
}
