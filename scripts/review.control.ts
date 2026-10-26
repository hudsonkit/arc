/**
 * Keep one authenticated HTTP MCP author connection open for an Arc review.
 * ARC_MCP_URL=http://127.0.0.1:5190/mcp bun scripts/review.control.ts
 * Optional ARC_MCP_TOKEN is sent only in Authorization headers.
 * Stdin is JSONL: {"id":"step-1","name":"open_architecture_review","arguments":{...}}
 * Each response is JSONL with the same id. EOF closes the author connection.
 * Tool results can contain private review capabilities; keep this terminal private.
 */
import { createInterface } from 'node:readline'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

async function main() {
  const endpoint = process.env.ARC_MCP_URL
  if (!endpoint) throw new Error('Set ARC_MCP_URL to the private preview MCP endpoint')
  const url = new URL(endpoint)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash || url.search) {
    throw new Error('ARC_MCP_URL must be an HTTP(S) endpoint without credentials, query, or fragment')
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (url.protocol !== 'https:' && !loopback) throw new Error('Use HTTPS or a private tunnel to loopback')
  const token = process.env.ARC_MCP_TOKEN
  const client = new Client({ name: 'Arc review CLI', version: '1.0.0' }, { capabilities: {} })
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
  })
  // PTY canonical input can silently truncate large diagram JSON lines. Read
  // bytes directly in a terminal, just as the piped JSONL transport does.
  const wasRaw = process.stdin.isRaw
  if (process.stdin.isTTY) process.stdin.setRawMode(true)
  const input = createInterface({ input: process.stdin, terminal: false, crlfDelay: Infinity })
  // Subscribe before connecting: piped input may arrive and close while the
  // MCP handshake is still pending.
  const lines = input[Symbol.asyncIterator]()
  const stop = () => input.close()
  const interrupt = (chunk: Buffer) => { if (chunk.includes(3)) stop() }
  if (process.stdin.isTTY) process.stdin.on('data', interrupt)
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
  let heartbeat: ReturnType<typeof setInterval> | undefined
  let closing = false
  try {
    await client.connect(transport)
    // Renew the HTTP author's inactivity lease while this client is alive.
    // A stopped bridge closes stdin, clears this timer, and deletes the session.
    let pingPending = false
    heartbeat = setInterval(() => {
      if (pingPending) return
      pingPending = true
      void client.ping({ timeout: 10_000 }).catch(() => {
        if (closing) return
        console.error('MCP heartbeat failed; reconnect and resume the review')
        process.exitCode = 1
        stop()
      }).finally(() => { pingPending = false })
    }, 60_000)
    heartbeat.unref()
    console.log(JSON.stringify({ type: 'ready' }))
    for await (const line of lines) {
      if (!line.trim()) continue
      let id: unknown
      try {
        const command = JSON.parse(line)
        id = command.id
        if (command.type === 'quit') break
        if (typeof command.name !== 'string' || !command.arguments || typeof command.arguments !== 'object' || Array.isArray(command.arguments)) {
          throw new Error('Expected {id?, name, arguments}')
        }
        const result = await client.callTool({ name: command.name, arguments: command.arguments })
        const item = Array.isArray(result.content) ? result.content.find(value => value.type === 'text') : undefined
        let payload: unknown = result
        if (item && typeof item.text === 'string') {
          // SDK validation errors are plain text; retain the actual diagnostic.
          try { payload = JSON.parse(item.text) } catch { payload = item.text }
        }
        console.log(JSON.stringify({ id, type: result.isError ? 'error' : 'result', result: payload }))
      } catch (error) {
        console.log(JSON.stringify({ id, type: 'error', message: error instanceof Error ? error.message : String(error) }))
      }
    }
  } finally {
    closing = true
    clearInterval(heartbeat)
    input.close()
    await transport.terminateSession().catch(() => {})
    await client.close()
    process.off('SIGINT', stop)
    process.off('SIGTERM', stop)
    process.stdin.off('data', interrupt)
    if (process.stdin.isTTY) process.stdin.setRawMode(wasRaw ?? false)
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
