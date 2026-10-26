import { expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { createArcHttpHandler } from '../packages/mcp/src/http-server.ts'

// Exercise the actual JSONL client against the real MCP handler. Delaying the
// handshake ensures piped stdin reaches readline before client.connect resolves.
test('review CLI retains piped commands during connection and preserves SDK validation errors', async () => {
  let delayedHandshake = false
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0,
    async fetch(request) {
      if (request.method === 'POST') {
        const body = await request.clone().json()
        if (body.method === 'initialize') {
          delayedHandshake = true
          await Bun.sleep(150)
        }
      }
      return handler.fetch(request)
    },
  })
  const base = `http://127.0.0.1:${server.port}`
  const handler: ReturnType<typeof createArcHttpHandler> = createArcHttpHandler({ publicBaseUrl: base, editorUrl: base })
  const child = Bun.spawn([process.execPath, 'scripts/review.control.ts'], {
    cwd: resolve(import.meta.dir, '..'),
    env: { ...process.env, ARC_MCP_URL: `${base}/mcp`, ARC_MCP_TOKEN: '' },
    stdin: 'pipe', stdout: 'pipe', stderr: 'pipe',
  })
  const output = new Response(child.stdout).text()
  const errors = new Response(child.stderr).text()
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    // Write and close immediately, without waiting for the client's ready line.
    child.stdin.write(`${JSON.stringify({ id: 'invalid-input', name: 'open_architecture_review', arguments: { diagram: {}, title: '', question: '' } })}\n${JSON.stringify({ type: 'quit' })}\n`)
    child.stdin.end()
    const exitCode = await Promise.race([
      child.exited,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Review CLI did not process piped input and exit')), 5000)
      }),
    ])
    expect(delayedHandshake).toBe(true)
    expect(exitCode).toBe(0)
    expect(await errors).toBe('')
    const records = (await output).trim().split('\n').map(line => JSON.parse(line))
    expect(records).toHaveLength(2)
    expect(records[0]).toEqual({ type: 'ready' })
    expect(records[1]).toMatchObject({ id: 'invalid-input', type: 'error' })
    expect(records[1].result).toBeString()
    expect(records[1].result).toContain('-32602')
    expect(records[1].result).toContain('Input validation error')
    expect(records[1].result).not.toContain('JSON Parse error')
  } finally {
    clearTimeout(timeout)
    if (child.exitCode === null) child.kill('SIGKILL')
    await child.exited
    await handler.close()
    server.stop(true)
  }
}, 10_000)
