/** A single remote JSONL author, using one credential-bearing local MCP client. */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
import type { Readable } from 'node:stream'

export const MAX_FRAME_BYTES = 4 * 1024 * 1024
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_MCP_URL = 'http://127.0.0.1:5190/mcp'
const COMMAND_TIMEOUT_MS = 120_000

type BridgeMetadata = { type: string; directory?: string; socketPath?: string; connectorPath?: string; connectCommand?: string; message?: string; code?: number | null }
export type BridgeOptions = {
  transport: string[]
  client: string[]
  env?: NodeJS.ProcessEnv
  onMetadata?: (metadata: BridgeMetadata) => void
  commandTimeoutMs?: number
  shutdownTimeoutMs?: number
  signal?: AbortSignal
}

export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}

export async function sshTransport(alias: string): Promise<string[]> {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.@-]{0,199}$/.test(alias)) throw new Error('Use an existing SSH alias or host')
  const source = await readFile(resolve(ROOT, 'scripts/review.bridge.py'), 'utf8')
  const wrapper = `import base64; BRIDGE_SOURCE=base64.b64decode('${Buffer.from(source).toString('base64')}').decode(); exec(compile(BRIDGE_SOURCE, '<arc-review-bridge>', 'exec'))`
  return ['ssh', '-T', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ForwardAgent=no', '-o', 'ForwardX11=no', '-o', 'ClearAllForwardings=yes', '-o', 'PermitLocalCommand=no', '-o', 'ControlPath=none', '-o', 'ConnectTimeout=10', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=3', '--', alias, `python3 -u -c ${shellQuote(wrapper)} server`]
}

/** Pull one bounded line at a time; do not let readline queue pending commands. */
async function* lines(stream: Readable, limit = MAX_FRAME_BYTES): AsyncGenerator<string> {
  let pending = Buffer.alloc(0)
  for await (const raw of stream) {
    const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw)
    let start = 0
    for (let index = 0; index <= chunk.length; index++) {
      if (index !== chunk.length && chunk[index] !== 10) continue
      const part = chunk.subarray(start, index)
      if (pending.length + part.length > limit) throw new Error('JSONL frame exceeds limit')
      pending = Buffer.concat([pending, part])
      if (index < chunk.length) {
        yield pending.toString('utf8')
        pending = Buffer.alloc(0)
      }
      start = index + 1
    }
  }
  if (pending.length) yield pending.toString('utf8')
}

function bounded<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  return Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Transport deadline exceeded')), ms) })]).finally(() => clearTimeout(timer!))
}
function exited(child: ChildProcessWithoutNullStreams): Promise<number | null> {
  return new Promise((resolveExit, reject) => { child.once('exit', resolveExit); child.once('error', reject) })
}
async function write(child: ChildProcessWithoutNullStreams, line: string): Promise<void> {
  await new Promise<void>((resolveWrite, reject) => child.stdin.write(`${line}\n`, error => error ? reject(error) : resolveWrite()))
}
async function stop(child: ChildProcessWithoutNullStreams, exit: Promise<number | null>, graceMs: number): Promise<void> {
  child.stdin.end()
  try { await bounded(exit, graceMs); return } catch { /* Only terminate our own child. */ }
  child.kill('SIGTERM')
  try { await bounded(exit, 2_000); return } catch { child.kill('SIGKILL') }
  await exit.catch(() => undefined)
}

export async function runReviewBridge(options: BridgeOptions): Promise<void> {
  const env = { ...process.env, ...options.env }
  // Never forward the MCP credential to SSH, even when its configuration sends env.
  const remoteEnv = { ...env }
  delete remoteEnv.ARC_MCP_TOKEN
  delete remoteEnv.ARC_MCP_URL
  const remote = spawn(options.transport[0], options.transport.slice(1), { cwd: ROOT, env: remoteEnv, stdio: 'pipe' })
  const remoteExit = exited(remote)
  remoteExit.catch(() => undefined)
  const remoteStopped = remoteExit.then(() => { throw new Error('SSH bridge disconnected') }, () => { throw new Error('SSH bridge unavailable') })
  remoteStopped.catch(() => undefined)
  remote.stdin.on('error', () => undefined)
  let client: ChildProcessWithoutNullStreams | undefined
  let clientExit: Promise<number | null> | undefined
  let connectedResolve!: () => void
  let connectedReject!: (error: Error) => void
  const connected = new Promise<void>((res, rej) => { connectedResolve = res; connectedReject = rej })
  let abortedReject!: (error: Error) => void
  const aborted = new Promise<never>((_, reject) => { abortedReject = reject })
  aborted.catch(() => undefined)
  const abort = () => abortedReject(new Error('Bridge stopped'))
  const send = (child: ChildProcessWithoutNullStreams, line: string) => Promise.race([
    bounded(write(child, line), options.commandTimeoutMs ?? COMMAND_TIMEOUT_MS), aborted, remoteStopped,
  ])
  options.signal?.addEventListener('abort', abort, { once: true })
  if (options.signal?.aborted) abort()
  const metadata = (async () => {
    for await (const line of lines(remote.stderr, 8192)) {
      let event: BridgeMetadata
      try { event = JSON.parse(line) } catch { continue } // Never repeat raw child output.
      if (event.type === 'bridge-ready') {
        const valid = /^\/tmp\/arc-review-[a-zA-Z0-9_-]+$/.test(event.directory ?? '')
        if (valid && event.socketPath === `${event.directory}/author.sock` && event.connectorPath === `${event.directory}/connect.py`) {
          options.onMetadata?.({ type: event.type, directory: event.directory, socketPath: event.socketPath, connectorPath: event.connectorPath,
            connectCommand: `python3 -u ${shellQuote(event.connectorPath)} connect ${shellQuote(event.socketPath)}` })
        }
      } else if (event.type === 'bridge-connected') {
        connectedResolve()
        options.onMetadata?.({ type: event.type })
      } else if (event.type === 'bridge-closed' || event.type === 'bridge-error') {
        options.onMetadata?.({ type: event.type })
      }
    }
  })()
  metadata.catch(() => connectedReject(new Error('Invalid bridge metadata')))
  remoteExit.then(() => connectedReject(new Error('SSH bridge exited')), () => connectedReject(new Error('SSH bridge unavailable')))
  try {
    await Promise.race([connected, aborted])
    client = spawn(options.client[0], options.client.slice(1), { cwd: ROOT, env, stdio: 'pipe' })
    client.stdin.on('error', () => undefined)
    client.stderr.resume() // It may contain capabilities; do not relay it to logs.
    clientExit = exited(client)
    clientExit.catch(() => undefined)
    const clientStopped = clientExit.then(() => { throw new Error('Local review client disconnected') })
    clientStopped.catch(() => undefined)
    const responses = lines(client.stdout)
    const nextResponse = async () => {
      const next = await Promise.race([bounded(responses.next(), options.commandTimeoutMs ?? COMMAND_TIMEOUT_MS), aborted, remoteStopped])
      if (next.done) throw new Error('Local review client disconnected')
      return next.value
    }
    const ready = await nextResponse()
    if (JSON.parse(ready).type !== 'ready') throw new Error('Local review client did not initialize')
    await send(remote, ready)
    const requests = lines(remote.stdout)
    for (;;) {
      const request = await Promise.race([requests.next(), aborted, remoteStopped, clientStopped])
      if (request.done) break
      if (!request.value.trim()) continue
      await send(client, request.value)
      let quit = false
      try { quit = JSON.parse(request.value).type === 'quit' } catch { /* Client returns structured errors. */ }
      if (quit) break
      await send(remote, await nextResponse())
    }
  } finally {
    options.signal?.removeEventListener('abort', abort)
    // EOF allows review.control.ts to DELETE its MCP session before transport close.
    if (client && clientExit) await stop(client, clientExit, options.shutdownTimeoutMs ?? 10_000)
    await stop(remote, remoteExit, options.signal?.aborted ? 500 : 5_000)
    await metadata.catch(() => undefined)
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  if (args.length !== 2 || args[0] !== '--ssh') throw new Error('Usage: bun scripts/review.bridge.ts --ssh existing-alias')
  const controller = new AbortController()
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => controller.abort())
  try {
    await runReviewBridge({
      transport: await sshTransport(args[1]),
      client: [process.execPath, resolve(ROOT, 'scripts/review.control.ts')],
      env: { ARC_MCP_URL: process.env.ARC_MCP_URL ?? DEFAULT_MCP_URL },
      signal: controller.signal,
      onMetadata: event => console.log(JSON.stringify(event)),
    })
  } catch {
    console.error(JSON.stringify({ type: 'bridge-error', message: 'Bridge stopped; inspect the local service before reconnecting' }))
    process.exitCode = 1
  }
}
