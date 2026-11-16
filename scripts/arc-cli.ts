import { serveArcLive } from './arc-live.ts'
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { validateDiagram } from '../src/utils/diagramDiagnostics.ts'
import type { Diagnostic, DiagnosticSeverity, Fix } from '../src/utils/diagramDiagnostics.ts'
import { diffDiagram } from '../src/utils/diffDiagram.ts'
import type { ArcDiagramData } from '../src/types/diagram.ts'
import { renderDiagramAnimation, type AnimationFormat } from './renderAnimation.ts'
import { renderDiagramPng, renderDiagramSvg, RenderError } from './renderImage.ts'
import { runBench } from './arcBench.ts'
import type { BenchCandidateResult } from './arcBench.ts'
import diagramSchemaJson from '../schemas/arc-diagram.schema.json'

const USAGE = `arc — Arc diagram CLI

Usage:
  arc check <file|-> [--severity error|warning|all] [--format text|json] [--json] [--strict]
  arc diff <base> <head> [--format json|summary] [--json] [--summary]
  arc render <file|-> --out <file> [--format svg|png|gif|mp4] [--theme <id>] [--mode light|dark] [--scale <n>] [--flow-time <s>] [--duration <s>] [--fps <n>] [--padding <px>] [--background <color>] [--grid] [--strict] [--json]
  arc bench <case-dir|suite-dir> [candidate.json ...] [--strict] [--json]
  arc live serve <stream> [--port <port>]
  arc apply <stream> --ops <file|-> [--port <port>]
  arc schema

Commands:
  check    Validate a diagram and print coded diagnostics
  diff     Print the structural DiagramDelta between two diagrams
  render   Validate, render an SVG/PNG/GIF/MP4, and atomically replace the output
  bench    Score diagram candidates against a benchmark case or suite
  schema   Print the generated draft-07 JSON Schema

Input:
  use "-" or pipe JSON on stdin for check/render; diff expects two file paths

Exit codes:
  0 success · 1 diagnostics with errors or runtime failure · 2 usage error
`

type CheckFormat = 'text' | 'json'
type DiffFormat = 'json' | 'summary'
type RenderFormat = 'svg' | 'png' | AnimationFormat
type SeverityFilter = DiagnosticSeverity | 'all'

class CliError extends Error {
  constructor(message: string, readonly exitCode = 1) {
    super(message)
  }
}

function fail(message: string, exitCode = 1): never {
  throw new CliError(message, exitCode)
}

function parseJson(text: string, label: string): unknown {
  try {
    return JSON.parse(text)
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    fail(`${label}: invalid JSON — ${detail}`)
  }
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

async function readDiagramText(path: string | undefined, label: string): Promise<string> {
  if (path === '-' || (!path && !process.stdin.isTTY)) return readStdin()
  if (!path) fail(`${label}: missing file path (or pipe JSON on stdin)`, 2)
  try {
    return readFileSync(path, 'utf8')
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    fail(`${label}: could not read ${path} — ${detail}`)
  }
}

async function readDiagram(path: string | undefined, label: string): Promise<unknown> {
  return parseJson(await readDiagramText(path, label), label)
}

function subjectLabel(diagnostic: Diagnostic): string {
  const subject = diagnostic.subject
  const id = subject.id ? `:${subject.id}` : ''
  const index = subject.index === undefined ? '' : `:${subject.index}`
  return `${subject.type}${id}${index}`
}

function fixLabel(fix: Fix): string {
  switch (fix.kind) {
    case 'add-node':
    case 'remove-node':
    case 'add-node-data':
    case 'remove-node-data':
      return `${fix.kind}(${fix.nodeId})`
    case 'retarget':
      return `retarget(${fix.end}→${fix.to})`
    case 'set-connector-id':
      return `set-connector-id(${fix.id})`
    case 'set-style':
      return `set-style(${fix.style})`
    case 'set-color':
      return `set-color(${fix.color})`
    case 'set-size':
      return `set-size(${fix.size})`
    case 'set-shape':
      return `set-shape(${fix.shape})`
    case 'set-anchor':
      return `set-anchor(${fix.field}=${fix.anchor})`
    case 'set-flow-id':
      return `set-flow-id(${fix.id})`
    case 'set-flow-direction':
      return `set-flow-direction(${fix.direction})`
    case 'set-flow-easing':
      return `set-flow-easing(${fix.easing})`
    case 'set-flow-marker':
      return `set-flow-marker(${fix.marker})`
    case 'set-flow-trail':
      return `set-flow-trail(${fix.trail})`
    case 'set-flow-color':
      return `set-flow-color(${fix.color})`
    case 'set-flow-timing':
      return `set-flow-timing(${fix.field}=${fix.value})`
    case 'set-flow-repeat':
      return `set-flow-repeat(${fix.repeat})`
    case 'set-flow-leg-id':
      return `set-flow-leg-id(${fix.id})`
    default:
      return fix.kind
  }
}

function printDiagnostics(diagnostics: Diagnostic[]): void {
  for (const diagnostic of diagnostics) {
    console.log(`${diagnostic.severity} ${diagnostic.code} ${subjectLabel(diagnostic)} — ${diagnostic.message}`)
    if (diagnostic.supportedFixes?.length) {
      console.log(`  fixes: ${diagnostic.supportedFixes.map(fixLabel).join(', ')}`)
    }
  }
}

function parseCheckArgs(args: string[]): {
  file?: string
  severity: SeverityFilter
  format: CheckFormat
  strict: boolean
} {
  let file: string | undefined
  let severity: SeverityFilter = 'all'
  let format: CheckFormat = 'text'
  let strict = false

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--severity') {
      severity = args[++i] as SeverityFilter
      if (!['error', 'warning', 'all'].includes(severity)) fail('--severity must be error, warning, or all', 2)
    } else if (arg === '--format') {
      format = args[++i] as CheckFormat
      if (!['text', 'json'].includes(format)) fail('--format must be text or json', 2)
    } else if (arg === '--json') {
      format = 'json'
    } else if (arg === '--strict') {
      strict = true
    } else if (arg === '--help' || arg === '-h') {
      console.log(USAGE)
      process.exit(0)
    } else if (arg.startsWith('-') && arg !== '-') {
      fail(`unknown option: ${arg}`, 2)
    } else if (file !== undefined) {
      fail(`unexpected argument: ${arg}`, 2)
    } else {
      file = arg
    }
  }

  return { file, severity, format, strict }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

async function checkCommand(args: string[]): Promise<number> {
  const { file, severity, format, strict } = parseCheckArgs(args)
  let value: unknown
  try {
    value = await readDiagram(file, 'check')
  } catch (err) {
    if (format === 'json') console.log(JSON.stringify({ ok: false, error: errorMessage(err) }, null, 2))
    else console.error(errorMessage(err))
    return 1
  }

  const diagnostics = validateDiagram(value)
  const shown = severity === 'all' ? diagnostics : diagnostics.filter(d => d.severity === severity)
  const errors = diagnostics.filter(d => d.severity === 'error')
  const warnings = diagnostics.filter(d => d.severity === 'warning')
  const ok = errors.length === 0 && (!strict || warnings.length === 0)

  if (format === 'json') {
    console.log(JSON.stringify({ ok, diagnostics: shown }, null, 2))
  } else {
    if (diagnostics.length === 0) {
      console.log('ok — no diagnostics')
    } else {
      console.log(`${errors.length} error${errors.length === 1 ? '' : 's'}, ${warnings.length} warning${warnings.length === 1 ? '' : 's'}`)
      printDiagnostics(shown)
    }
  }

  return ok ? 0 : 1
}

function parseDiffArgs(args: string[]): { base?: string; head?: string; format: DiffFormat } {
  let base: string | undefined
  let head: string | undefined
  let format: DiffFormat = 'json'

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--format') {
      format = args[++i] as DiffFormat
      if (!['json', 'summary'].includes(format)) fail('--format must be json or summary', 2)
    } else if (arg === '--summary') {
      format = 'summary'
    } else if (arg === '--json') {
      format = 'json'
    } else if (arg === '--help' || arg === '-h') {
      console.log(USAGE)
      process.exit(0)
    } else if (arg.startsWith('-')) {
      fail(`unknown option: ${arg}`, 2)
    } else if (base === undefined) {
      base = arg
    } else if (head === undefined) {
      head = arg
    } else {
      fail(`unexpected argument: ${arg}`, 2)
    }
  }

  if (!base || !head) fail('diff requires <base> and <head> file paths', 2)
  return { base, head, format }
}

function diffSummary(delta: ReturnType<typeof diffDiagram>): string {
  const lines = [
    `nodes: +${delta.nodes.added.length} -${delta.nodes.removed.length} moved:${delta.nodes.moved.length} changed:${delta.nodes.changed.length}`,
    `connectors: +${delta.connectors.added.length} -${delta.connectors.removed.length} changed:${delta.connectors.changed.length}`,
    `connectorStyles: +${delta.connectorStyles.added.length} -${delta.connectorStyles.removed.length} changed:${delta.connectorStyles.changed.length}`,
    `groups: +${delta.groups.added.length} -${delta.groups.removed.length} changed:${delta.groups.changed.length}`,
    `layout: ${delta.layoutChanged ? 'changed' : 'unchanged'}`,
  ]
  const ambiguous = delta.connectors.changed.filter(c => c.ambiguous).length
  if (ambiguous) lines.push(`ambiguous connector matches: ${ambiguous}`)
  return lines.join('\n')
}

async function diffCommand(args: string[]): Promise<number> {
  const { base, head, format } = parseDiffArgs(args)
  let baseValue: unknown
  let headValue: unknown
  try {
    baseValue = await readDiagram(base, 'base')
    headValue = await readDiagram(head, 'head')
  } catch (err) {
    if (format === 'json') console.log(JSON.stringify({ ok: false, error: errorMessage(err) }, null, 2))
    else console.error(errorMessage(err))
    return 1
  }

  const baseDiagnostics = validateDiagram(baseValue)
  const headDiagnostics = validateDiagram(headValue)
  const baseErrors = baseDiagnostics.filter(d => d.severity === 'error')
  const headErrors = headDiagnostics.filter(d => d.severity === 'error')

  if (baseErrors.length || headErrors.length) {
    if (format === 'json') {
      console.log(JSON.stringify({
        ok: false,
        errors: {
          ...(baseDiagnostics.length ? { base: baseDiagnostics } : {}),
          ...(headDiagnostics.length ? { head: headDiagnostics } : {}),
        },
      }, null, 2))
    } else {
      if (baseDiagnostics.length) {
        console.log('base diagnostics:')
        printDiagnostics(baseDiagnostics)
      }
      if (headDiagnostics.length) {
        console.log('head diagnostics:')
        printDiagnostics(headDiagnostics)
      }
    }
    return 1
  }

  const delta = diffDiagram(baseValue as ArcDiagramData, headValue as ArcDiagramData)
  console.log(format === 'json' ? JSON.stringify(delta, null, 2) : diffSummary(delta))
  return 0
}

function sha256Hex(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

function atomicWriteFile(path: string, contents: string | Buffer): void {
  const output = resolve(path)
  const temp = join(dirname(output), `.${basename(output)}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`)
  try {
    writeFileSync(temp, contents, { flag: 'wx' })
    renameSync(temp, output)
  } finally {
    if (existsSync(temp)) rmSync(temp, { force: true })
  }
}

function emitRenderFailure(code: string, message: string, json: boolean, diagnostics: Diagnostic[] = [], exitCode = 1): number {
  if (json) {
    console.log(JSON.stringify({ ok: false, error: { code, message }, diagnostics }, null, 2))
  } else {
    console.error(`${code}: ${message}`)
    printDiagnostics(diagnostics)
  }
  return exitCode
}

function parseRenderArgs(args: string[]): {
  file?: string
  out?: string
  format: RenderFormat
  padding: number
  backgroundColor?: string
  includeGrid: boolean
  strict: boolean
  json: boolean
  theme?: string
  mode?: 'light' | 'dark'
  scale?: number
  flowTime?: number
  duration?: number
  fps?: number
  animateFlows: boolean
  chromePath?: string
  ffmpegPath?: string
} {
  let file: string | undefined
  let out: string | undefined
  let explicitFormat: RenderFormat | undefined
  let padding = 20
  // Unset means "let the render layer decide" — themed diagrams need their
  // theme canvas (e.g. a dark default mode), not a forced white page.
  let backgroundColor: string | undefined
  let includeGrid = false
  let strict = false
  let json = false
  let theme: string | undefined
  let mode: 'light' | 'dark' | undefined
  let scale: number | undefined
  let flowTime: number | undefined
  let duration: number | undefined
  let fps: number | undefined
  let animateFlows = true
  let chromePath: string | undefined
  let ffmpegPath: string | undefined

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--out' || arg === '-o') {
      out = args[++i]
      if (!out) fail('--out requires a file path', 2)
    } else if (arg === '--format') {
      const value = args[++i]
      if (value !== 'svg' && value !== 'png' && value !== 'gif' && value !== 'mp4') fail('--format must be svg, png, gif, or mp4', 2)
      explicitFormat = value
    } else if (arg === '--theme') {
      theme = args[++i]
      if (!theme) fail('--theme requires a theme id', 2)
    } else if (arg === '--mode') {
      mode = args[++i]
      if (mode !== 'light' && mode !== 'dark') fail('--mode must be light or dark', 2)
    } else if (arg === '--scale') {
      scale = Number(args[++i])
      if (!Number.isFinite(scale) || scale <= 0) fail('--scale must be a positive number', 2)
    } else if (arg === '--flow-time') {
      flowTime = Number(args[++i])
      if (!Number.isFinite(flowTime) || flowTime < 0) fail('--flow-time must be a non-negative number', 2)
    } else if (arg === '--duration') {
      duration = Number(args[++i])
      if (!Number.isFinite(duration) || duration <= 0) fail('--duration must be a positive number', 2)
    } else if (arg === '--fps') {
      fps = Number(args[++i])
      if (!Number.isFinite(fps) || fps <= 0) fail('--fps must be a positive number', 2)
    } else if (arg === '--chrome') {
      chromePath = args[++i]
      if (!chromePath) fail('--chrome requires an executable path', 2)
    } else if (arg === '--ffmpeg') {
      ffmpegPath = args[++i]
      if (!ffmpegPath) fail('--ffmpeg requires an executable path', 2)
    } else if (arg === '--animate') {
      animateFlows = true
    } else if (arg === '--no-animate') {
      animateFlows = false
    } else if (arg === '--padding') {
      const value = Number(args[++i])
      if (!Number.isInteger(value) || value < 0) fail('--padding must be a non-negative integer', 2)
      padding = value
    } else if (arg === '--background') {
      backgroundColor = args[++i]
      if (!backgroundColor) fail('--background requires a color', 2)
    } else if (arg === '--grid') {
      includeGrid = true
    } else if (arg === '--no-grid') {
      includeGrid = false
    } else if (arg === '--strict') {
      strict = true
    } else if (arg === '--json') {
      json = true
    } else if (arg === '--help' || arg === '-h') {
      console.log(USAGE)
      process.exit(0)
    } else if (arg.startsWith('-') && arg !== '-') {
      fail(`unknown option: ${arg}`, 2)
    } else if (file !== undefined) {
      fail(`unexpected argument: ${arg}`, 2)
    } else {
      file = arg
    }
  }

  if (!out) fail('render requires --out <file>', 2)
  if (out === '-') fail('render requires a real --out file so the artifact can be replaced atomically', 2)
  const extension = out.split('.').pop()?.toLowerCase()
  const inferred: RenderFormat | undefined = extension === 'svg' || extension === 'png' || extension === 'gif' || extension === 'mp4' ? extension : undefined
  const format = explicitFormat ?? inferred ?? 'svg'
  if (explicitFormat && inferred && explicitFormat !== inferred) {
    fail(`--out ends .${inferred} but --format is ${explicitFormat}`, 2)
  }
  if (backgroundColor !== undefined && !/^(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)$/.test(backgroundColor)) {
    fail('--background must be a hex or CSS named color', 2)
  }
  if (format === 'svg' && fps !== undefined) fail('--fps only applies to gif/mp4', 2)
  if (format === 'svg' && duration !== undefined) fail('--duration only applies to gif/mp4', 2)
  if (format === 'png' && fps !== undefined) fail('--fps only applies to gif/mp4', 2)
  if (format === 'png' && duration !== undefined) fail('--duration only applies to gif/mp4', 2)

  return { file, out, format, padding, backgroundColor, includeGrid, strict, json, theme, mode, scale, flowTime, duration, fps, animateFlows, chromePath, ffmpegPath }
}

async function renderCommand(args: string[]): Promise<number> {
  const jsonRequested = args.includes('--json')
  let parsed: ReturnType<typeof parseRenderArgs>
  try {
    parsed = parseRenderArgs(args)
  } catch (err) {
    const exitCode = err instanceof CliError ? err.exitCode : 2
    return emitRenderFailure('cli/usage-error', errorMessage(err), jsonRequested, [], exitCode)
  }

  let sourceText: string
  let value: unknown
  try {
    sourceText = await readDiagramText(parsed.file, 'render')
    value = parseJson(sourceText, 'render')
  } catch (err) {
    return emitRenderFailure('cli/input-error', errorMessage(err), parsed.json)
  }

  const sourceHash = sha256Hex(sourceText)
  const diagnostics = validateDiagram(value)
  const errors = diagnostics.filter(d => d.severity === 'error')
  const warnings = diagnostics.filter(d => d.severity === 'warning')
  if (errors.length || (parsed.strict && warnings.length)) {
    return emitRenderFailure('validation/failed', 'render: diagram has blocking diagnostics', parsed.json, diagnostics)
  }

  const output = resolve(parsed.out!)
  let outputBuffer: Buffer
  let width: number
  let height: number
  let animation: { frames: number; fps: number; duration: number } | undefined
  try {
    const shared = {
      backgroundColor: parsed.backgroundColor,
      includeGrid: parsed.includeGrid,
      padding: parsed.padding,
      theme: parsed.theme,
      mode: parsed.mode,
      flowTime: parsed.flowTime,
      animateFlows: parsed.animateFlows,
    }
    if (parsed.format === 'svg') {
      const rendered = renderDiagramSvg(value as ArcDiagramData, shared)
      outputBuffer = Buffer.from(rendered.svg, 'utf8')
      width = rendered.width
      height = rendered.height
    } else if (parsed.format === 'png') {
      const rendered = await renderDiagramPng(value as ArcDiagramData, {
        ...shared,
        scale: parsed.scale,
        chromePath: parsed.chromePath,
      })
      outputBuffer = rendered.png
      width = rendered.width
      height = rendered.height
    } else {
      const rendered = await renderDiagramAnimation(value as ArcDiagramData, {
        ...shared,
        format: parsed.format,
        scale: parsed.scale,
        duration: parsed.duration,
        fps: parsed.fps,
        chromePath: parsed.chromePath,
        ffmpegPath: parsed.ffmpegPath,
      })
      outputBuffer = rendered.data
      width = rendered.width
      height = rendered.height
      animation = { frames: rendered.frames, fps: rendered.fps, duration: rendered.duration }
    }
  } catch (err) {
    const code = err instanceof RenderError ? err.code : 'render/generate-failed'
    return emitRenderFailure(code, errorMessage(err), parsed.json, diagnostics)
  }

  try {
    atomicWriteFile(output, outputBuffer)
  } catch (err) {
    return emitRenderFailure('render/write-failed', errorMessage(err), parsed.json, diagnostics)
  }

  const receipt = {
    ok: true,
    command: 'render',
    input: parsed.file === '-' || parsed.file === undefined ? '-' : resolve(parsed.file),
    output,
    format: parsed.format,
    width,
    height,
    bytes: outputBuffer.length,
    ...(animation ? { animation } : {}),
    sha256: {
      source: sourceHash,
      output: sha256Hex(outputBuffer),
    },
    options: {
      padding: parsed.padding,
      backgroundColor: parsed.backgroundColor,
      includeGrid: parsed.includeGrid,
      theme: parsed.theme,
      mode: parsed.mode,
      scale: parsed.scale,
      flowTime: parsed.flowTime,
      animateFlows: parsed.animateFlows,
      ...(animation ? { duration: parsed.duration, fps: parsed.fps } : {}),
    },
    diagnostics,
  }

  if (parsed.json) {
    console.log(JSON.stringify(receipt, null, 2))
  } else {
    const timing = animation ? `, ${animation.frames} frames @ ${animation.fps}fps` : ''
    console.log(`rendered ${output} (${receipt.width}x${receipt.height}, ${receipt.bytes} bytes${timing}, sha256 ${receipt.sha256.output})`)
    printDiagnostics(warnings)
  }
  return 0
}

function benchLine(result: BenchCandidateResult): string {
  if (result.inputError) return `fail ${result.candidate} — input error: ${result.inputError}`
  const parts = [`nodes ${result.nodes.found}/${result.nodes.expected}`, `edges ${result.edges.found}/${result.edges.expected}`]
  if (result.renderBytes !== undefined) parts.push(`render ${result.renderBytes}b`)
  if (!result.valid) parts.push(`${result.errors} error${result.errors === 1 ? '' : 's'}`)
  if (result.warnings) parts.push(`${result.warnings} warning${result.warnings === 1 ? '' : 's'}`)
  const detail: string[] = []
  if (result.nodes.missing.length) detail.push(`missing nodes: ${result.nodes.missing.join(', ')}`)
  for (const [from, to] of result.edges.missing) detail.push(`missing edge: ${from}→${to}`)
  for (const [from, to] of result.edges.reversed) detail.push(`reversed edge: ${from}→${to}`)
  if (!result.size.ok) detail.push(`node count ${result.size.count} outside ${result.size.min ?? 0}–${result.size.max ?? '∞'}`)
  if (!result.rendered) detail.push('render failed')
  return `${result.pass ? 'pass' : 'fail'} ${result.candidate} (${parts.join(', ')})${detail.length ? ` — ${detail.join('; ')}` : ''}`
}

async function benchCommand(args: string[]): Promise<number> {
  let json = false
  let strict = false
  const positional: string[] = []
  for (const arg of args) {
    if (arg === '--json') json = true
    else if (arg === '--strict') strict = true
    else if (arg === '--help' || arg === '-h') {
      console.log(USAGE)
      return 0
    } else if (arg.startsWith('-')) {
      fail(`unknown option: ${arg}`, 2)
    } else {
      positional.push(arg)
    }
  }
  const [dir, ...candidates] = positional
  if (!dir) fail('bench requires a case or suite directory', 2)

  let report: ReturnType<typeof runBench>
  try {
    report = runBench(dir, candidates, { strict })
  } catch (err) {
    if (json) console.log(JSON.stringify({ ok: false, error: { code: 'cli/input-error', message: errorMessage(err) } }, null, 2))
    else console.error(errorMessage(err))
    return 1
  }

  if (json) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    for (const benchCase of report.cases) {
      console.log(`${benchCase.case}:`)
      if (!benchCase.candidates.length) console.log('  (no candidates in outputs/)')
      for (const candidate of benchCase.candidates) console.log(`  ${benchLine(candidate)}`)
    }
    const { totals } = report
    console.log(`${totals.passed}/${totals.candidates} candidates passed across ${totals.cases} case${totals.cases === 1 ? '' : 's'}${totals.skipped ? `, ${totals.skipped} skipped (no outputs)` : ''}`)
  }
  return report.ok && report.totals.candidates > 0 ? 0 : 1
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2)
  let exitCode: number

  switch (command) {
    case 'live': {
      if (args[0] !== 'serve' || !args[1]) fail('Expected arc live serve <stream> [--port <port>]', 2)
      const port = args.includes('--port') ? Number(args[args.indexOf('--port') + 1]) : 5190
      await serveArcLive(args[1], port, args.includes('--origin') ? args[args.indexOf('--origin') + 1] : undefined).ready
      console.log(`Arc stream ${args[1]} at http://127.0.0.1:${port} (/events, /socket, /apply, /state)`)
      return
    }
    case 'apply': {
      const stream = args[0]
      const file = args[args.indexOf('--ops') + 1]
      if (!stream || !args.includes('--ops') || !file) fail('Expected arc apply <stream> --ops <file|->', 2)
      const port = args.includes('--port') ? Number(args[args.indexOf('--port') + 1]) : 5190
      const baseUrl = `http://127.0.0.1:${port}`
      const input = parseJson(file === '-' ? await readStdin() : readFileSync(file, 'utf8'), file)
      const state = await (await fetch(baseUrl + '/state')).json() as { seq: number }
      const envelope = Array.isArray(input) ? { v: 1, stream, base: state.seq, seq: state.seq + 1, ops: input } : input
      const response = await fetch(baseUrl + '/apply', { method: 'POST', body: JSON.stringify(envelope) })
      console.log(await response.text())
      exitCode = response.ok ? 0 : 1
      break
    }
    case 'check':
      exitCode = await checkCommand(args)
      break
    case 'diff':
      exitCode = await diffCommand(args)
      break
    case 'render':
      exitCode = await renderCommand(args)
      break
    case 'bench':
      exitCode = await benchCommand(args)
      break
    case 'schema':
      if (args.length) fail(`schema takes no arguments`, 2)
      console.log(JSON.stringify(diagramSchemaJson, null, 2))
      exitCode = 0
      break
    case '--help':
    case '-h':
    case undefined:
      console.log(USAGE)
      exitCode = command ? 0 : 2
      break
    default:
      fail(`unknown command: ${command}`, 2)
  }

  process.exitCode = exitCode
}

main().catch((err: unknown) => {
  if (err instanceof CliError && err.message !== USAGE) {
    console.error(err.message)
    process.exitCode = err.exitCode
    return
  }
  console.error(err instanceof Error ? err.message : String(err))
  process.exitCode = 1
})
