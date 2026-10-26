import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, stat, access, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createInterface } from 'node:readline'
import { spawn } from 'node:child_process'
import { runReviewBridge, shellQuote, MAX_FRAME_BYTES, type BridgeOptions } from './review.bridge.ts'
import { createArcHttpHandler } from '../packages/mcp/src/http-server.ts'

const PYTHON = resolve(import.meta.dir, 'review.bridge.py')
const fakeClient = `
import { createInterface } from 'node:readline';
import { appendFileSync } from 'node:fs';
const input=createInterface({input:process.stdin});
const lines=input[Symbol.asyncIterator]();
appendFileSync(process.env.MARKER, 'start\\n');
console.error(process.env.ARC_MCP_TOKEN);
await Bun.sleep(100);
console.log(JSON.stringify({type:'ready'}));
try {
 for await(const line of lines) {
  const command=JSON.parse(line);
  if(command.type==='quit') break;
  if(command.delay) await Bun.sleep(command.delay);
  console.log(JSON.stringify({id:command.id,type:'result',result:command,localCredential:!!process.env.ARC_MCP_TOKEN}));
 }
} finally { appendFileSync(process.env.MARKER, 'closed\\n'); input.close(); }
`
const transport = () => ['python3', '-u', '-c', `import os,runpy; assert 'ARC_MCP_TOKEN' not in os.environ; runpy.run_path(${JSON.stringify(PYTHON)},run_name='__main__')`, 'server', '--wait-seconds', '4', '--lifetime-seconds', '10']

async function within<T>(promise: Promise<T>, ms = 10_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  return Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Test deadline')), ms) })]).finally(() => clearTimeout(timer!))
}
async function fixture(overrides: Partial<BridgeOptions> = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'arc-bridge-test-'))
  const marker = join(directory, 'client.txt')
  const controller = new AbortController()
  const events: Record<string, unknown>[] = []
  let ready!: (event: Record<string, string>) => void
  const listening = new Promise<Record<string, string>>(resolve => { ready = resolve })
  const done = runReviewBridge({ transport: transport(), client: [process.execPath, '-e', fakeClient],
    env: { ARC_MCP_TOKEN: 'private-test-credential', MARKER: marker }, signal: controller.signal,
    commandTimeoutMs: 2_000, shutdownTimeoutMs: 1_000, ...overrides,
    onMetadata: event => { events.push(event); if (event.type === 'bridge-ready') ready(event as Record<string, string>) },
  })
  done.catch(() => undefined)
  const remote = await within(listening)
  const connect = () => spawn('python3', ['-u', remote.connectorPath, 'connect', remote.socketPath, '--lifetime-seconds', '10'], { stdio: 'pipe' })
  return { directory, marker, events, remote, done, connect, abort: () => controller.abort(), async cleanup() { controller.abort(); await done.catch(() => {}); await rm(directory, { recursive: true, force: true }) } }
}

test('private one-use socket preserves early piped JSONL and cleans up one client', async () => {
  const f = await fixture()
  try {
    expect((await stat(f.remote.directory)).mode & 0o777).toBe(0o700)
    expect((await stat(f.remote.socketPath)).mode & 0o777).toBe(0o600)
    expect((await stat(f.remote.connectorPath)).mode & 0o777).toBe(0o600)
    const remote = f.connect()
    const output = new Response(remote.stdout as never).text()
    const exit = new Promise(resolve => remote.on('exit', resolve))
    remote.stdin.end('{"id":"one","text":"quoted \' value"}\n{"id":"two"}\n{"type":"quit"}\n')
    await within(f.done)
    expect(await within(exit)).toBe(0)
    const rows = (await output).trim().split('\n').map(line => JSON.parse(line))
    expect(rows.map(row => row.type)).toEqual(['ready', 'result', 'result'])
    expect(rows[1].result.text).toBe("quoted ' value")
    expect(rows[2].id).toBe('two')
    expect(rows[1].localCredential).toBe(true)
    expect(await readFile(f.marker, 'utf8')).toBe('start\nclosed\n')
    expect(JSON.stringify(f.events)).not.toContain('private-test-credential')
    expect(JSON.stringify(f.events)).not.toContain('quoted')
    expect(await access(f.remote.directory).then(() => true, () => false)).toBe(false)
  } finally { await f.cleanup() }
})

test('remote disconnect removes listener and closes the local author before bridge exit', async () => {
  const f = await fixture()
  try {
    const remote = f.connect()
    remote.stderr.resume()
    const replies = createInterface({ input: remote.stdout })[Symbol.asyncIterator]()
    expect(JSON.parse((await within(replies.next())).value).type).toBe('ready')
    expect(await access(f.remote.socketPath).then(() => true, () => false)).toBe(false)
    const second = f.connect()
    second.stdout.resume(); second.stderr.resume()
    const secondExit = new Promise(resolve => second.on('exit', resolve))
    expect(await within(secondExit)).not.toBe(0)
    remote.kill('SIGTERM')
    await within(f.done)
    expect(await readFile(f.marker, 'utf8')).toBe('start\nclosed\n')
    expect(await access(f.remote.directory).then(() => true, () => false)).toBe(false)
  } finally { await f.cleanup() }
})

test('exec with devnull stdin fails before consuming the author socket', async () => {
  const f = await fixture()
  try {
    const invalid = spawn('python3', ['-u', f.remote.connectorPath, 'connect', f.remote.socketPath], { stdio: ['ignore', 'pipe', 'pipe'] })
    const diagnostic = new Response(invalid.stderr as never).text()
    const exit = new Promise(resolve => invalid.once('exit', resolve))
    expect(await within(exit)).toBe(1)
    expect(JSON.parse((await diagnostic).trim()).message).toContain('persistent pipe')
    expect(f.events.some(event => event.type === 'bridge-connected')).toBe(false)
    expect(await access(f.remote.socketPath).then(() => true, () => false)).toBe(true)
    const remote = f.connect()
    const output = new Response(remote.stdout as never).text()
    remote.stderr.resume()
    remote.stdin.end('{"id":"after-rejected-exec"}\n{"type":"quit"}\n')
    await within(f.done)
    expect((await output).trim().split('\n').map(line => JSON.parse(line).type)).toEqual(['ready', 'result'])
  } finally { await f.cleanup() }
})

test('pipelined requests reach the local client only after the preceding reply', async () => {
  const observedClient = fakeClient.replace('const lines=input[Symbol.asyncIterator]();', "input.on('line',()=>appendFileSync(process.env.MARKER,'queued\\n')); const lines=input[Symbol.asyncIterator]();")
  const f = await fixture({ client: [process.execPath, '-e', observedClient] })
  try {
    const remote = f.connect()
    remote.stderr.resume()
    const replies = createInterface({ input: remote.stdout })[Symbol.asyncIterator]()
    expect(JSON.parse((await within(replies.next())).value).type).toBe('ready')
    remote.stdin.end('{"id":"slow","delay":500}\n{"id":"next"}\n{"type":"quit"}\n')
    await Bun.sleep(150)
    expect((await readFile(f.marker, 'utf8')).match(/queued/g)?.length).toBe(1)
    expect(JSON.parse((await within(replies.next())).value).id).toBe('slow')
    expect(JSON.parse((await within(replies.next())).value).id).toBe('next')
    await within(f.done)
  } finally { await f.cleanup() }
})

test('oversized incoming frame is rejected and temporary transport is removed', async () => {
  const f = await fixture()
  try {
    const remote = f.connect()
    remote.stderr.resume(); remote.stdout.resume(); remote.stdin.on('error', () => {})
    const exit = new Promise(resolve => remote.on('exit', resolve))
    remote.stdin.end('x'.repeat(MAX_FRAME_BYTES + 1) + '\n')
    await within(f.done.catch(() => undefined))
    expect(await within(exit)).not.toBe(0)
    expect(await access(f.remote.directory).then(() => true, () => false)).toBe(false)
    expect(JSON.stringify(f.events)).not.toContain('xxx')
  } finally { await f.cleanup() }
})

test('oversized local output cannot escape through the bridge', async () => {
  const f = await fixture({ client: [process.execPath, '-e', `console.log(JSON.stringify({type:'ready'}));process.stdin.once('data',()=>console.log('x'.repeat(${MAX_FRAME_BYTES + 1})));`] })
  try {
    const remote = f.connect()
    const output = new Response(remote.stdout as never).text()
    remote.stderr.resume(); remote.stdin.on('error', () => {}); remote.stdin.write('{"id":"one"}\n')
    await expect(within(f.done)).rejects.toThrow('JSONL frame exceeds limit')
    expect((await output).length).toBeLessThan(100)
    expect(await access(f.remote.directory).then(() => true, () => false)).toBe(false)
  } finally { await f.cleanup() }
})

test('aborting before connection removes private directory without starting a client', async () => {
  const f = await fixture()
  await f.cleanup()
  expect(await access(f.remote.directory).then(() => true, () => false)).toBe(false)
  expect(await access(f.marker).then(() => true, () => false)).toBe(false)
})

test('an author that stops reading cannot block cancellation of a large response', async () => {
  const f = await fixture({ commandTimeoutMs: 20_000, client: [process.execPath, '-e', `console.log(JSON.stringify({type:'ready'}));process.stdin.once('data',()=>console.log(JSON.stringify({type:'result',data:'x'.repeat(3*1024*1024)})));`] })
  try {
    const remote = f.connect()
    remote.stderr.resume(); remote.stdin.on('error', () => {})
    // Deliberately leave stdout unread so the socket, SSH pipe, and bounded
    // Python queues back up all the way to the local child's response write.
    remote.stdin.write('{"id":"large"}\n')
    await Bun.sleep(500)
    f.abort()
    await expect(within(f.done, 4_000)).rejects.toThrow('Bridge stopped')
    expect(await access(f.remote.directory).then(() => true, () => false)).toBe(false)
    remote.kill('SIGTERM')
  } finally { await f.cleanup() }
}, 8_000)

test('transport loss during an outstanding command begins client cleanup promptly', async () => {
  const pidDir = await mkdtemp(join(tmpdir(), 'arc-bridge-pid-'))
  const pidPath = join(pidDir, 'transport.pid')
  const f = await fixture({ commandTimeoutMs: 20_000, transport: ['python3', '-u', '-c',
    `import os,runpy; open(${JSON.stringify(pidPath)},'w').write(str(os.getpid()));runpy.run_path(${JSON.stringify(PYTHON)},run_name='__main__')`, 'server'] })
  try {
    const remote = f.connect()
    remote.stderr.resume(); remote.stdin.on('error', () => {})
    const replies = createInterface({ input: remote.stdout })[Symbol.asyncIterator]()
    expect(JSON.parse((await within(replies.next())).value).type).toBe('ready')
    remote.stdin.write('{"id":"delayed","delay":30000}\n')
    await Bun.sleep(100)
    process.kill(Number(await readFile(pidPath, 'utf8')), 'SIGTERM')
    await expect(within(f.done, 4_000)).rejects.toThrow('SSH bridge disconnected')
    expect(await access(f.remote.directory).then(() => true, () => false)).toBe(false)
  } finally { await f.cleanup(); await rm(pidDir, { recursive: true, force: true }) }
}, 8_000)

test('socket EOF makes the actual MCP client DELETE exactly one initialized HTTP session', async () => {
  let initialize = 0
  let deletes = 0
  let pings = 0
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, async fetch(request) {
    if (request.method === 'DELETE') deletes++
    if (request.method === 'POST') {
      const method = (await request.clone().json()).method
      if (method === 'initialize') initialize++
      if (method === 'ping') pings++
    }
    return handler.fetch(request)
  } })
  const origin = `http://127.0.0.1:${server.port}`
  const handler: ReturnType<typeof createArcHttpHandler> = createArcHttpHandler({ publicBaseUrl: origin, token: 'test-bridge-only', editorUrl: origin })
  const clockDir = await mkdtemp(join(tmpdir(), 'arc-bridge-clock-'))
  const preload = join(clockDir, 'clock.ts')
  await writeFile(preload, 'const original=globalThis.setInterval;globalThis.setInterval=((fn,ms,...args)=>original(fn,ms===60000?20:ms,...args)) as typeof setInterval;')
  const f = await fixture({ commandTimeoutMs: 10_000, client: [process.execPath, '--preload', preload, resolve(import.meta.dir, 'review.control.ts')], env: { ARC_MCP_URL: `${origin}/mcp`, ARC_MCP_TOKEN: 'test-bridge-only' } })
  try {
    const remote = f.connect()
    const replies = createInterface({ input: remote.stdout })[Symbol.asyncIterator]()
    remote.stderr.resume()
    expect(JSON.parse((await within(replies.next())).value).type).toBe('ready')
    remote.stdin.write('{"id":"validation","name":"validate_diagram","arguments":{"diagram":{"layout":{"width":800,"height":400},"nodes":{},"nodeData":{},"connectors":[],"connectorStyles":{}}}}\n')
    expect(JSON.parse((await within(replies.next())).value).type).toBe('result')
    for (let count = 0; pings === 0 && count < 50; count++) await Bun.sleep(20)
    expect(pings).toBeGreaterThan(0)
    remote.kill('SIGTERM')
    await within(f.done)
    expect(initialize).toBe(1)
    expect(deletes).toBe(1)
  } finally { await f.cleanup(); await handler.close(); server.stop(true); await rm(clockDir, { recursive: true, force: true }) }
}, 15_000)

test('remote command quoting preserves literal shell metacharacters', async () => {
  const literal = `spaces ' " $HOME $(printf bad) \n back\\slash`
  const child = Bun.spawn(['sh', '-c', `printf %s ${shellQuote(literal)}`], { stdout: 'pipe' })
  expect(await new Response(child.stdout).text()).toBe(literal)
  expect(await child.exited).toBe(0)
})
