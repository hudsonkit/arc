/**
 * Keep one live MCP connection open while a chat or terminal sends revisions.
 * bun scripts/liveDiagram.control.ts diagram.arc.json "Architecture title"
 * Then send one JSON command per line:
 * {"type":"begin","summary":"Adding a worker","scope":{"type":"region","x":400,"y":80,"width":200,"height":160}}
 * {"type":"update","file":"/absolute/path/diagram.arc.json","message":"Added a worker"}
 * {"type":"finish","workId":"<ID from begin>","message":"Worker connected"}
 * Updates may supply `diagram` directly instead of `file`. `status` prints the
 * local session metadata; `end` marks the whole session complete; `quit` closes
 * the relay and interrupts active work. Only begin declares ongoing work.
 * ARC_AGENT_HARNESS and optional ARC_AGENT_NAME declare display labels. They do
 * not replace the real MCP initialize identity, and neither has a default.
 */
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { normalizeLiveDiagram } from '../src/utils/liveDiagramValidation'

const DEFAULT_EDITOR_URL = 'http://127.0.0.1:5188'

async function main() {
  const [initialFile, title = 'Live architecture'] = process.argv.slice(2)
  if (!initialFile) throw new Error('Usage: bun scripts/liveDiagram.control.ts diagram.arc.json [title]')
  const initial = normalizeLiveDiagram(JSON.parse(await readFile(resolve(initialFile), 'utf8')))
  const harness = process.env.ARC_AGENT_HARNESS?.trim() || undefined
  const name = process.env.ARC_AGENT_NAME?.trim() || undefined
  if (name && !harness) throw new Error('ARC_AGENT_NAME requires ARC_AGENT_HARNESS')
  const agent = harness ? { harness, ...(name ? { name } : {}) } : undefined
  const input = createInterface({ input: process.stdin, terminal: false, crlfDelay: Infinity })
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['packages/mcp/src/server.ts'],
    cwd: join(import.meta.dir, '..'),
    env: { ...process.env, ARC_EDITOR_URL: process.env.ARC_EDITOR_URL || DEFAULT_EDITOR_URL },
    stderr: 'inherit',
  })
  const client = new Client({ name: 'Arc live CLI', version: '1.0.0' }, { capabilities: {} })
  const stop = () => input.close()
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
  let sessionId: string | undefined
  let ended = false
  let workId: string | undefined

  const call = async (name: string, args: Record<string, unknown>) => {
    const result = await client.callTool({ name, arguments: args })
    const content = Array.isArray(result.content)
      ? result.content.find(item => item && typeof item === 'object' && item.type === 'text')
      : undefined
    if (!content || typeof content.text !== 'string') throw new Error(`${name} returned no JSON text`)
    const payload = JSON.parse(content.text) as Record<string, unknown>
    if (result.isError || payload.ok !== true) throw new Error(`${name}: ${content.text}`)
    return payload
  }

  try {
    await client.connect(transport)
    const opened = await call('open_live_diagram', { title, diagram: initial, ...(agent ? { agent } : {}) })
    if (typeof opened.sessionId !== 'string' || typeof opened.liveUrl !== 'string') {
      throw new Error('MCP did not return a live session URL')
    }
    sessionId = opened.sessionId
    console.log(JSON.stringify({ type: 'ready', ...opened }))
    for await (const line of input) {
      if (!line.trim()) continue
      try {
        const command = JSON.parse(line)
        if (!command || typeof command !== 'object' || Array.isArray(command)) throw new Error('Expected a JSON command object')
        if (command.type === 'quit') break
        if (command.type === 'status') {
          console.log(JSON.stringify({ type: 'status', sessionId, liveUrl: opened.liveUrl, ended, lastStartedWorkId: workId }))
        } else if (command.type === 'begin') {
          const result = await call('begin_live_diagram_work', { sessionId, summary: command.summary, scope: command.scope })
          workId = result.workId as string
          console.log(JSON.stringify({ type: 'working', ...result }))
        } else if (command.type === 'finish') {
          const result = await call('finish_live_diagram_work', { sessionId, workId: command.workId, message: command.message })
          workId = undefined
          console.log(JSON.stringify({ type: 'finished', ...result }))
        } else if (command.type === 'end') {
          const result = await call('end_live_diagram', { sessionId, message: command.message })
          ended = true
          workId = undefined
          console.log(JSON.stringify({ type: 'complete', ...result }))
        } else if (command.type === 'update') {
          const value = typeof command.file === 'string'
            ? JSON.parse(await readFile(resolve(command.file), 'utf8'))
            : command.diagram
          const result = await call('update_live_diagram', {
            sessionId, diagram: normalizeLiveDiagram(value), message: command.message,
          })
          console.log(JSON.stringify({ type: 'updated', ...result }))
        } else throw new Error('Command type must be begin, update, finish, status, end, or quit')
      } catch (error) {
        console.error(JSON.stringify({ type: 'error', message: error instanceof Error ? error.message : String(error) }))
      }
    }
  } finally {
    input.close()
    await client.close()
    process.off('SIGINT', stop)
    process.off('SIGTERM', stop)
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
