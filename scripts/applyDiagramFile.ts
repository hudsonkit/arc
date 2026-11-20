// Apply a push-stream operation list to a diagram file.
// The write is all or nothing: a rejected operation leaves the file untouched.
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { applyDiagramOps } from '../src/live/protocol.ts'
import type { ArcDiagramData } from '../src/types/diagram.ts'

export interface FileApplyResult {
  ok: boolean
  file: string
  ops: number
  diagnostics: string[]
  focusIgnored: boolean
}

/** An operations array, or an envelope whose `ops` field is that array. */
export function unwrapOps(input: unknown): unknown[] {
  if (Array.isArray(input)) return input
  if (input && typeof input === 'object' && Array.isArray((input as { ops?: unknown }).ops)) {
    return (input as { ops: unknown[] }).ops
  }
  throw new Error('Expected an operations array or an envelope with ops')
}

function atomicWriteFile(path: string, contents: string): void {
  const output = resolve(path)
  const temp = join(dirname(output), `.${basename(output)}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`)
  try {
    writeFileSync(temp, contents, { flag: 'wx' })
    renameSync(temp, output)
  } finally {
    if (existsSync(temp)) rmSync(temp, { force: true })
  }
}

/**
 * Read `file`, apply `input`, and replace the file with pretty JSON.
 * On a diagnostic the file is not opened for writing.
 */
export function applyDiagramFile(file: string, input: unknown): FileApplyResult {
  const ops = unwrapOps(input)
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'))
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    throw new Error(`could not read ${file} — ${detail}`)
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, file, ops: ops.length, diagnostics: ['Diagram file must be a JSON object'], focusIgnored: false }
  }
  const result = applyDiagramOps(parsed as ArcDiagramData, ops)
  if (result.diagnostics.length) {
    return { ok: false, file, ops: ops.length, diagnostics: result.diagnostics, focusIgnored: false }
  }
  atomicWriteFile(file, `${JSON.stringify(result.diagram, null, 2)}\n`)
  return { ok: true, file, ops: ops.length, diagnostics: [], focusIgnored: result.focusIgnored }
}
