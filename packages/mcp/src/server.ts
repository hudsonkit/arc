/**
 * Arc MCP server — stdio tools for diagram authoring.
 * Run locally: `bun packages/mcp/src/server.ts` or `bun run mcp`
 * Published bin: `@hudsonkit/arc-mcp` → dist/arc-mcp.mjs (built via `bun run build:mcp`)
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import {
  autoLayout,
  createAutoLayout,
} from '../../../src/utils/autoLayout.ts'
import { renderAscii } from '../../../src/utils/asciiRenderer.ts'
import { validateDiagramShape, isDiagramShape } from '../../../src/utils/diagramValidation.ts'
import { validateDiagram } from '../../../src/utils/diagramDiagnostics.ts'
import { diffDiagram } from '../../../src/utils/diffDiagram.ts'
import { buildEditorHandoff } from '../../../scripts/diagramHandoff.ts'
import { renderDiagramHtml } from '../../../scripts/renderHtml.ts'
import { renderDiagramAnimation } from '../../../scripts/renderAnimation.ts'
import { renderDiagramPng, renderDiagramSvg, RenderError } from '../../../scripts/renderImage.ts'
import { toTypeScriptSource } from '../../../src/types/diagram.ts'
import type { ArcDiagram, ArcDiagramData } from '../../../src/types/diagram.ts'
import type { LiveDiagramActor } from '../../../src/types/live.ts'
import { liveViewerBase, startLocalLiveService } from './live.ts'
import type { LiveDiagramService } from './live.ts'
import pkg from '../package.json'
// Inlined by `bun run build:mcp` so the published arc-mcp bin serves these
// without depending on the package's on-disk layout.
import diagramSchemaJson from '../../../schemas/arc-diagram.schema.json'
import skillMarkdown from '../../../skills/arc-diagrams/SKILL.md' with { type: 'text' }
import llmBriefing from '../../../docs/llm.txt' with { type: 'text' }

const diagramSchema = z.record(z.unknown())
const agentLabel = z.string().trim().min(1).max(80).regex(/^[^\u0000-\u001f\u007f]+$/, 'Agent labels must be single-line text without control characters')
const liveAgentSchema = z.object({
  harness: agentLabel.describe('Caller-declared harness label, for example Codex; not inferred or verified by Arc'),
  name: agentLabel.optional().describe('Optional caller-declared agent display name'),
}).strict()
const liveWorkScopeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('canvas') }).strict(),
  z.object({ type: z.literal('nodes'), nodeIds: z.array(z.string().min(1).max(200)).min(1).max(200) }).strict(),
  z.object({
    type: z.literal('region'),
    x: z.number().finite().min(-100_000).max(100_000),
    y: z.number().finite().min(-100_000).max(100_000),
    width: z.number().finite().positive().max(100_000),
    height: z.number().finite().positive().max(100_000),
  }).strict(),
])
const reviewRepositorySchema = z.object({ name: z.string().min(1).max(200), url: z.string().url().optional(), revision: z.string().min(1).max(200).optional() })
const reviewFindingSchema = z.object({
  id: z.string().min(1).max(200), title: z.string().min(1).max(500), detail: z.string().min(1).max(16000),
  severity: z.enum(['info', 'low', 'medium', 'high']), nodeIds: z.array(z.string().min(1).max(200)).max(200).optional(),
  sources: z.array(z.object({ path: z.string().min(1).max(2000), line: z.number().int().positive().optional(), revision: z.string().min(1).max(200).optional(), url: z.string().url().optional() })).max(50),
})
const themeDescription = 'Arc theme id: default, warm, cool, mono, engineering, workbench, tactical, command, spacex, claude, codex, or inherit'

function parseDiagram(value: unknown, label = 'diagram'): ArcDiagramData {
  const parsed = typeof value === 'string' ? JSON.parse(value) : value
  const problem = validateDiagramShape(parsed)
  if (problem) throw new Error(`${label}: ${problem}`)
  return parsed as ArcDiagramData
}

function renderToolError(err: unknown) {
  const payload = err instanceof RenderError
    ? { ok: false, error: { code: err.code, message: err.message, supportedFixes: err.supportedFixes } }
    : { ok: false, error: { code: 'render/internal', message: err instanceof Error ? err.message : String(err) } }
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
    isError: true as const,
  }
}

export function createArcMcpServer(options: { live?: LiveDiagramService; editorUrl?: string; connectionId?: string; reviewDir?: string } = {}): McpServer {
  const server = new McpServer({
    name: 'arc',
    version: pkg.version,
  })

  const connectionId = options.connectionId ?? randomUUID()
  let localService: ReturnType<typeof startLocalLiveService> | undefined
  const liveService = () => options.live
    ? Promise.resolve(options.live)
    : (localService ??= startLocalLiveService({ reviewDir: options.reviewDir }).catch(error => {
      localService = undefined
      throw error
    }))
  const actor = (): LiveDiagramActor => {
    const client = server.server.getClientVersion()
    if (!client) throw new Error('Initialize the MCP connection before opening a live diagram')
    return { name: client.name, version: client.version, id: connectionId }
  }
  server.server.onclose = () => {
    options.live?.hub.disconnect(connectionId)
    void localService?.then(service => { service.hub.disconnect(connectionId); service.close() }, () => {})
  }
  const liveResult = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] })
  const liveError = (error: unknown) => ({ ...liveResult({ ok: false, error: error instanceof Error ? error.message : String(error) }), isError: true as const })

  server.tool(
    'open_live_diagram',
    'Open an idle architecture view in the Hudson Kit Arc studio. Open the returned liveUrl once; use begin_live_diagram_work before doing diagram work, update_live_diagram for full revisions, and finish_live_diagram_work when that work ends. Keep stable node IDs for continuous motion. Connection identity comes from MCP initialization; optional agent labels are caller-declared.',
    {
      diagram: diagramSchema.describe('Valid ArcDiagramData JSON'),
      title: z.string().max(200).optional().describe('Human-readable title for the live architecture'),
      baseUrl: z.string().url().optional().describe('Studio base URL (default: ARC_EDITOR_URL or http://localhost:5188)'),
      agent: liveAgentSchema.optional().describe('Optional display identity for this session; preserves the actual MCP client name, version, and connection ID'),
    },
    async ({ diagram, title, baseUrl, agent }) => {
      try {
        const viewerBase = baseUrl ?? options.editorUrl
        liveViewerBase(viewerBase)
        const identity: LiveDiagramActor = {
          ...actor(),
          ...(agent ? { harness: agent.harness, ...(agent.name ? { displayName: agent.name } : {}) } : {}),
        }
        const service = await liveService()
        const snapshot = service.hub.open(diagram, identity, { title, baseUrl: viewerBase })
        return liveResult({
          ok: true, sessionId: snapshot.sessionId, revision: snapshot.revision, status: snapshot.status, actor: snapshot.actor,
          liveUrl: service.hub.viewerUrl(snapshot.sessionId, connectionId, service.baseUrl, viewerBase),
          streamUrl: service.hub.streamUrl(snapshot.sessionId, connectionId, service.baseUrl),
        })
      } catch (error) { return liveError(error) }
    },
  )

  server.tool(
    'open_architecture_review',
    'Open a saved architecture review with a baseline diagram and a concrete review question. The liveUrl is a read capability; keep the returned resumeToken private so a later MCP connection can resume after disconnect or restart. Revisions, findings, decisions, and open questions persist atomically in ARC_REVIEW_DIR. Use begin_live_diagram_work, update_live_diagram, and finish_live_diagram_work for declared work; use update_architecture_review for evidence. Requires configured durable storage.',
    {
      diagram: diagramSchema.describe('Initial baseline ArcDiagramData JSON'), title: z.string().trim().min(1).max(200),
      question: z.string().min(1).max(4000).describe('The concrete architecture question this review will answer'),
      repository: reviewRepositorySchema.optional(), agent: liveAgentSchema.optional(), baseUrl: z.string().url().optional(),
    },
    async ({ diagram, title, question, repository, agent, baseUrl }) => {
      try {
        const viewerBase = baseUrl ?? options.editorUrl
        const identity: LiveDiagramActor = { ...actor(), ...(agent ? { harness: agent.harness, ...(agent.name ? { displayName: agent.name } : {}) } : {}) }
        const service = await liveService()
        const { snapshot, resumeToken } = service.hub.openReview(diagram, identity, { title, question, repository, baseUrl: viewerBase })
        return liveResult({ ok: true, sessionId: snapshot.sessionId, revision: snapshot.revision, status: snapshot.status, actor: snapshot.actor, resumeToken,
          liveUrl: service.hub.viewerUrl(snapshot.sessionId, connectionId, service.baseUrl, viewerBase),
          streamUrl: service.hub.streamUrl(snapshot.sessionId, connectionId, service.baseUrl),
        })
      } catch (error) { return liveError(error) }
    },
  )

  server.tool(
    'update_architecture_review',
    'Publish review evidence. Only supplied fields are replaced; omitted fields are preserved. Findings must have stable unique IDs, a severity, and source references (use an empty sources array when evidence is not yet available). Arrays replace their previous contents, and an empty summary clears it. During declared work this renews its five-minute lease. Saved completed reviews are read-only.',
    {
      sessionId: z.string(), summary: z.string().max(16000).optional(), findings: z.array(reviewFindingSchema).max(200).optional(),
      decisions: z.array(z.string().min(1).max(4000)).max(200).optional(), openQuestions: z.array(z.string().min(1).max(4000)).max(200).optional(),
    },
    async ({ sessionId, ...patch }) => {
      try {
        const service = await liveService()
        const snapshot = service.hub.updateReview(sessionId, connectionId, patch)
        return liveResult({ ok: true, sessionId, revision: snapshot.revision, status: snapshot.status, review: snapshot.review })
      } catch (error) { return liveError(error) }
    },
  )

  server.tool(
    'resume_architecture_review',
    'Resume a saved review using its private author capability after the previous MCP owner disconnects. A live owner cannot be displaced. Restored in-progress work is interrupted; declare new work explicitly. Completed reviews remain read-only and can be reopened for viewing. This connection supplies its actual MCP identity; optional agent labels are caller-declared, as when opening a review. Omit agent to use only the new connection identity. Completed artifacts keep their final author unchanged. A new relay may return a new liveUrl.',
    {
      sessionId: z.string(), resumeToken: z.string().min(1).max(200), baseUrl: z.string().url().optional(),
      agent: liveAgentSchema.optional().describe('Optional caller-declared display identity for the resumed author; preserves actual MCP client name, version, and connection ID'),
    },
    async ({ sessionId, resumeToken, baseUrl, agent }) => {
      try {
        const viewerBase = baseUrl ?? options.editorUrl
        const service = await liveService()
        const identity: LiveDiagramActor = { ...actor(), ...(agent ? { harness: agent.harness, ...(agent.name ? { displayName: agent.name } : {}) } : {}) }
        const snapshot = service.hub.resumeReview(sessionId, resumeToken, identity, { baseUrl: viewerBase })
        return liveResult({ ok: true, sessionId, revision: snapshot.revision, status: snapshot.status, actor: snapshot.actor, readOnly: snapshot.status === 'complete',
          liveUrl: service.hub.viewerUrl(sessionId, connectionId, service.baseUrl, viewerBase), streamUrl: service.hub.streamUrl(sessionId, connectionId, service.baseUrl),
        })
      } catch (error) { return liveError(error) }
    },
  )

  server.tool(
    'revoke_architecture_review_share',
    'Invalidate the current review viewing link and disconnect its viewers. Returns a replacement liveUrl and streamUrl. This rotates only the read capability; the private author resumeToken remains valid. Only the owning MCP connection may revoke a share.',
    { sessionId: z.string(), baseUrl: z.string().url().optional() },
    async ({ sessionId, baseUrl }) => {
      try {
        const viewerBase = baseUrl ?? options.editorUrl
        liveViewerBase(viewerBase)
        const service = await liveService()
        const snapshot = service.hub.revokeReviewShare(sessionId, connectionId, { baseUrl: viewerBase })
        return liveResult({ ok: true, sessionId, revision: snapshot.revision, status: snapshot.status,
          liveUrl: service.hub.viewerUrl(sessionId, connectionId, service.baseUrl, viewerBase), streamUrl: service.hub.streamUrl(sessionId, connectionId, service.baseUrl),
        })
      } catch (error) { return liveError(error) }
    },
  )

  server.tool(
    'begin_live_diagram_work',
    'Declare diagram work before doing it, with a concise summary and optional scope (default canvas). Target existing node IDs or a canvas region where new boxes will appear. Returns workId; always finish that ID with finish_live_diagram_work when done. Only one work item may be active per session. Valid diagram updates renew its five-minute lease; expiry or disconnect interrupts it instead of claiming success.',
    {
      sessionId: z.string().describe('Live diagram or architecture review opened or resumed on this connection'),
      summary: z.string().trim().min(1).max(500).regex(/^[^\u0000-\u001f\u007f]+$/).describe('What diagram work you are about to perform; concise, honest, and specific'),
      scope: liveWorkScopeSchema.optional().describe('Canvas, 1–200 unique existing node IDs, or finite canvas coordinates for a planned region'),
    },
    async ({ sessionId, summary, scope }) => {
      try {
        const service = await liveService()
        const snapshot = service.hub.beginWork(sessionId, connectionId, summary, scope)
        return liveResult({ ok: true, sessionId, workId: snapshot.work!.id, revision: snapshot.revision, status: snapshot.status, work: snapshot.work })
      } catch (error) { return liveError(error) }
    },
  )

  server.tool(
    'finish_live_diagram_work',
    'Finish the active declared diagram work using its workId. Leaves the view idle and reusable for the next begin/update/finish cycle. Stale, expired, or already finished work IDs are rejected. Use end_live_diagram only when the entire diagram session is complete.',
    {
      sessionId: z.string().describe('Live diagram or architecture review opened or resumed on this connection'),
      workId: z.string().min(1).max(200).describe('Current workId returned by begin_live_diagram_work'),
      message: z.string().max(500).optional().describe('Short note describing the actual result'),
    },
    async ({ sessionId, workId, message }) => {
      try {
        const service = await liveService()
        const snapshot = service.hub.finishWork(sessionId, connectionId, workId, message)
        return liveResult({ ok: true, sessionId, workId, revision: snapshot.revision, status: snapshot.status, work: snapshot.work })
      } catch (error) { return liveError(error) }
    },
  )

  server.tool(
    'update_live_diagram',
    'Publish the next full diagram revision. Preserve node IDs for smooth moves and use new IDs for new nodes. During declared work this renews its five-minute lease and preserves its scope; otherwise the view stays idle. Invalid diagrams leave the previous revision intact. Only this MCP connection can update its sessions.',
    {
      sessionId: z.string().describe('Live diagram or architecture review opened or resumed on this connection'),
      diagram: diagramSchema.describe('Next complete ArcDiagramData JSON'),
      message: z.string().max(500).optional().describe('Short description of the current architecture change'),
    },
    async ({ sessionId, diagram, message }) => {
      try {
        const service = await liveService()
        const snapshot = service.hub.update(sessionId, connectionId, diagram, message)
        return liveResult({ ok: true, sessionId, revision: snapshot.revision, status: snapshot.status })
      } catch (error) { return liveError(error) }
    },
  )

  server.tool(
    'end_live_diagram',
    'Mark the entire live architecture session complete, also completing any active declared work. For a reusable idle view use finish_live_diagram_work instead. Ordinary diagrams expire after disconnect; saved architecture reviews remain durable and read-only. Open a new session to continue after ending.',
    {
      sessionId: z.string().describe('Live diagram or architecture review opened or resumed on this connection'),
      message: z.string().max(500).optional().describe('Short completion note'),
    },
    async ({ sessionId, message }) => {
      try {
        const service = await liveService()
        const snapshot = service.hub.complete(sessionId, connectionId, message)
        return liveResult({ ok: true, sessionId, revision: snapshot.revision, status: snapshot.status })
      } catch (error) { return liveError(error) }
    },
  )

  server.tool(
    'validate_diagram',
    'Validate an ArcDiagramData document. Returns coded diagnostics — consume by `code`, apply one `supportedFixes` entry, re-validate. `ok` is false while any error-severity diagnostic remains.',
    {
      diagram: diagramSchema.describe('Arc diagram JSON object or JSON string'),
      severity: z.enum(['error', 'warning', 'all']).optional().describe('Filter returned diagnostics by severity (default: all)'),
    },
    async ({ diagram, severity }) => {
      try {
        const value = typeof diagram === 'string' ? JSON.parse(diagram) : diagram
        const diagnostics = validateDiagram(value)
        const shown = severity && severity !== 'all'
          ? diagnostics.filter(d => d.severity === severity)
          : diagnostics
        const firstError = diagnostics.find(d => d.severity === 'error')
        const payload: Record<string, unknown> = { ok: !firstError, diagnostics: shown }
        if (firstError) payload.error = firstError.message
        return {
          content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return {
          content: [{ type: 'text', text: JSON.stringify({ ok: false, error: message }, null, 2) }],
          isError: true,
        }
      }
    },
  )

  server.tool(
    'diff_diagram',
    'Structural diff of two Arc diagrams. Returns a DiagramDelta — added/removed/moved/changed nodes, connector adds/removes/changes (keyed by connector id or from→to), connectorStyles and groups deltas, layoutChanged. Feed it to <ArcDiagram data={head} delta={delta} /> for a diff render.',
    {
      base: diagramSchema.describe('Base ArcDiagramData JSON object or JSON string'),
      head: diagramSchema.describe('Head ArcDiagramData JSON object or JSON string'),
    },
    async ({ base, head }) => {
      try {
        const delta = diffDiagram(parseDiagram(base, 'base'), parseDiagram(head, 'head'))
        return {
          content: [{ type: 'text', text: JSON.stringify(delta, null, 2) }],
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return {
          content: [{ type: 'text', text: message }],
          isError: true,
        }
      }
    },
  )

  server.tool(
    'auto_layout',
    'Run Arc auto-layout on a diagram. Pass a full diagram or minimal input (nodeData + connectors + connectorStyles).',
    {
      input: diagramSchema.describe('Full ArcDiagramData or AutoDiagramInput (nodeData, connectors, connectorStyles)'),
    },
    async ({ input }) => {
      try {
        const value = typeof input === 'string' ? JSON.parse(input) : input
        let result: ArcDiagramData

        if (isDiagramShape(value)) {
          result = autoLayout(value as ArcDiagramData)
        } else if (
          value &&
          typeof value === 'object' &&
          'nodeData' in value &&
          'connectors' in value &&
          'connectorStyles' in value
        ) {
          result = createAutoLayout(value as Parameters<typeof createAutoLayout>[0])
        } else {
          throw new Error('Expected ArcDiagramData or AutoDiagramInput (nodeData, connectors, connectorStyles)')
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: message }, null, 2) }],
          isError: true,
        }
      }
    },
  )

  server.tool(
    'render_ascii',
    'Render an Arc diagram as monospace ASCII/Unicode box art.',
    {
      diagram: diagramSchema.describe('Valid ArcDiagramData JSON'),
      charset: z.enum(['unicode', 'ascii']).optional().describe('Character set (default: unicode)'),
      maxWidth: z.number().int().positive().optional().describe('Max output width in characters'),
    },
    async ({ diagram, charset, maxWidth }) => {
      try {
        const data = parseDiagram(diagram)
        const ascii = renderAscii(data, {
          charset: charset ?? 'unicode',
          maxWidth,
        })
        return { content: [{ type: 'text', text: ascii }] }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return {
          content: [{ type: 'text', text: message }],
          isError: true,
        }
      }
    },
  )

  server.tool(
    'render_svg',
    'Render an Arc diagram as deterministic SVG markup using the package export path.',
    {
      diagram: diagramSchema.describe('Valid ArcDiagramData JSON'),
      theme: z.string().optional().describe(themeDescription),
      mode: z.enum(['light', 'dark']).optional().describe('Color mode; defaults to the theme default'),
      backgroundColor: z.string().optional().describe('CSS background color (defaults to the theme canvas)'),
      includeGrid: z.boolean().optional().describe('Render the diagram grid (default: branded themes on, others off)'),
      padding: z.number().nonnegative().optional().describe('Padding around the export bounds in px (default: 20)'),
      flowTime: z.number().nonnegative().optional().describe('Render flow markers at this route second (disables SMIL animation)'),
      animateFlows: z.boolean().optional().describe('Embed SMIL flow animation in the SVG (default: true; ignored when flowTime is set)'),
    },
    async ({ diagram, theme, mode, backgroundColor, includeGrid, padding, flowTime, animateFlows }) => {
      try {
        const data = parseDiagram(diagram)
        const rendered = renderDiagramSvg(data, { theme, mode, backgroundColor, includeGrid, padding, flowTime, animateFlows })
        return { content: [{ type: 'text', text: rendered.svg }] }
      } catch (err) {
        return renderToolError(err)
      }
    },
  )

  server.tool(
    'render_png',
    'Render an Arc diagram as a PNG via an installed Chrome/Chromium binary. Returns MCP image content plus render metadata. Set ARC_CHROME if Chrome is not on PATH.',
    {
      diagram: diagramSchema.describe('Valid ArcDiagramData JSON'),
      theme: z.string().optional().describe(themeDescription),
      mode: z.enum(['light', 'dark']).optional().describe('Color mode; defaults to the theme default'),
      backgroundColor: z.string().optional().describe('CSS background color (defaults to the theme canvas)'),
      includeGrid: z.boolean().optional().describe('Render the diagram grid (default: branded themes on, others off)'),
      padding: z.number().nonnegative().optional().describe('Padding around the export bounds in px (default: 20)'),
      scale: z.number().positive().max(4).optional().describe('Raster scale factor (default: 2, max: 4)'),
      flowTime: z.number().nonnegative().optional().describe('Flow route second to freeze into the PNG (default: 0)'),
    },
    async ({ diagram, theme, mode, backgroundColor, includeGrid, padding, scale, flowTime }) => {
      try {
        const data = parseDiagram(diagram)
        const rendered = await renderDiagramPng(data, { theme, mode, backgroundColor, includeGrid, padding, scale, flowTime })
        return {
          content: [
            { type: 'image', data: rendered.png.toString('base64'), mimeType: 'image/png' },
            {
              type: 'text',
              text: JSON.stringify({
                ok: true,
                width: rendered.width,
                height: rendered.height,
                scale: rendered.scale,
                bytes: rendered.png.length,
                chrome: rendered.chrome,
                theme: rendered.theme,
                mode: rendered.mode,
              }, null, 2),
            },
          ],
        }
      } catch (err) {
        return renderToolError(err)
      }
    },
  )

  server.tool(
    'render_animation',
    'Render diagram flows as a GIF or MP4 artifact. Uses deterministic frame captures through Chrome plus ffmpeg; requires an `output` path because video payloads are too large for MCP text.',
    {
      diagram: diagramSchema.describe('Valid ArcDiagramData JSON'),
      output: z.string().describe('Destination file path for the GIF or MP4'),
      format: z.enum(['gif', 'mp4']).optional().describe('Output format; inferred from `output` extension when omitted'),
      theme: z.string().optional().describe(themeDescription),
      mode: z.enum(['light', 'dark']).optional().describe('Color mode; defaults to the theme default'),
      backgroundColor: z.string().optional().describe('CSS background color (defaults to the theme canvas)'),
      includeGrid: z.boolean().optional().describe('Render the diagram grid (default: branded themes on, others off)'),
      padding: z.number().nonnegative().optional().describe('Padding around the export bounds in px (default: 20)'),
      scale: z.number().positive().max(4).optional().describe('Raster scale factor (default: 2, max: 4)'),
      fps: z.number().positive().max(60).optional().describe('Frames per second (default: 12 for GIF, 30 for MP4)'),
      duration: z.number().positive().max(120).optional().describe('Seconds to render (default: one full flow cycle)'),
    },
    async ({ diagram, output, format, theme, mode, backgroundColor, includeGrid, padding, scale, fps, duration }) => {
      try {
        const data = parseDiagram(diagram)
        const inferred = output.toLowerCase().endsWith('.mp4') ? 'mp4' : output.toLowerCase().endsWith('.gif') ? 'gif' : undefined
        const resolvedFormat = format ?? inferred
        if (!resolvedFormat) throw new RenderError('render/invalid-option', 'render_animation needs format gif/mp4 or an output ending .gif/.mp4', ['use --format gif|mp4'])
        if (format && inferred && format !== inferred) {
          throw new RenderError('render/invalid-option', `output ends .${inferred} but format is ${format}`, ['match the output extension or omit format'])
        }
        const rendered = await renderDiagramAnimation(data, {
          format: resolvedFormat,
          theme,
          mode,
          backgroundColor,
          includeGrid,
          padding,
          scale,
          fps,
          duration,
        })
        const outputPath = resolve(output)
        mkdirSync(dirname(outputPath), { recursive: true })
        writeFileSync(outputPath, rendered.data)
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              ok: true,
              output: outputPath,
              format: rendered.format,
              width: rendered.width,
              height: rendered.height,
              scale: rendered.scale,
              fps: rendered.fps,
              duration: rendered.duration,
              frames: rendered.frames,
              bytes: rendered.data.length,
              chrome: rendered.chrome,
              ffmpeg: rendered.ffmpeg,
              theme: rendered.theme,
              mode: rendered.mode,
            }, null, 2),
          }],
        }
      } catch (err) {
        return renderToolError(err)
      }
    },
  )

  server.tool(
    'render_html',
    'Render an Arc diagram as a React component snippet, iframe embed, or standalone HTML page.',
    {
      diagram: diagramSchema.describe('Valid ArcDiagramData JSON'),
      format: z.enum(['component', 'iframe', 'html']).optional().describe('Output format: component (TSX), iframe (embed tag), or html (standalone SVG page). Default: html'),
      componentName: z.string().optional().describe('Component function name for format=component (default: ArcDiagramExample)'),
      dataName: z.string().optional().describe('Diagram const name for format=component (default: diagram)'),
      theme: z.string().optional().describe(themeDescription),
      mode: z.enum(['light', 'dark']).optional().describe('Color mode; defaults to the theme default'),
      interactive: z.boolean().optional().describe('Whether the React component is interactive'),
      baseUrl: z.string().url().optional().describe('Studio base URL for format=iframe (default: ARC_EDITOR_URL or http://localhost:5188)'),
      sessionId: z.string().optional().describe('Session id for format=iframe URLs (generated if omitted)'),
      title: z.string().optional().describe('HTML document title or iframe title'),
      width: z.union([z.number().positive(), z.string()]).optional().describe('Iframe width in px or CSS percentage'),
      height: z.union([z.number().positive(), z.string()]).optional().describe('Iframe height in px or CSS percentage'),
      backgroundColor: z.string().optional().describe('CSS background color for format=html (defaults to the theme canvas)'),
      includeGrid: z.boolean().optional().describe('Render the diagram grid for format=html (default: branded themes on, others off)'),
      padding: z.number().nonnegative().optional().describe('Padding around the export bounds in px for format=html (default: 20)'),
    },
    async ({ diagram, format, componentName, dataName, theme, mode, interactive, baseUrl, sessionId, title, width, height, backgroundColor, includeGrid, padding }) => {
      try {
        const data = parseDiagram(diagram)
        const rendered = renderDiagramHtml(data, {
          format,
          componentName,
          dataName,
          theme,
          mode,
          interactive,
          baseUrl,
          sessionId,
          title,
          width,
          height,
          backgroundColor,
          includeGrid,
          padding,
        })
        return { content: [{ type: 'text', text: rendered.code }] }
      } catch (err) {
        return renderToolError(err)
      }
    },
  )

  server.tool(
    'diagram_to_typescript',
    'Convert a valid Arc diagram JSON into a TypeScript module that exports ArcDiagramData.',
    {
      diagram: diagramSchema.describe('Valid ArcDiagramData JSON'),
      exportName: z.string().optional().describe('Const name (default: diagram)'),
    },
    async ({ diagram, exportName }) => {
      try {
        const data = parseDiagram(diagram)
        const source = toTypeScriptSource(data as ArcDiagram, exportName ?? 'diagram')
        return { content: [{ type: 'text', text: source }] }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return {
          content: [{ type: 'text', text: message }],
          isError: true,
        }
      }
    },
  )

  server.tool(
    'editor_handoff',
    'Build URLs to open a diagram in the Arc studio. Returns a hash-based editor URL and showcase link.',
    {
      diagram: diagramSchema.describe('Valid ArcDiagramData JSON'),
      sessionId: z.string().optional().describe('Session id (generated if omitted)'),
      view: z.string().optional().describe('Guided view id to start on (data.views[].id) — deep-links the player chapter'),
      baseUrl: z.string().url().optional().describe('Studio base URL (default: ARC_EDITOR_URL or http://localhost:5188)'),
    },
    async ({ diagram, sessionId, baseUrl, view }) => {
      try {
        const data = parseDiagram(diagram)
        const handoff = buildEditorHandoff(data, { sessionId, baseUrl, view })

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              sessionId: handoff.sessionId,
              editorUrl: handoff.editorUrl,
              playerUrl: handoff.playerUrl,
              showcaseUrl: handoff.showcaseUrl,
              note: 'Open editorUrl in a browser with the Arc dev server running (bun run dev) — the hash seeds and persists the session; then playerUrl renders it read-only (deep-linked to the view, when given).',
              diagram: data,
            }, null, 2),
          }],
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return {
          content: [{ type: 'text', text: message }],
          isError: true,
        }
      }
    },
  )

  server.resource(
    'schema',
    'arc://schema/diagram',
    { description: 'Generated JSON Schema (draft-07) for ArcDiagramData', mimeType: 'application/json' },
    async () => ({
      contents: [{
        uri: 'arc://schema/diagram',
        mimeType: 'application/json',
        text: JSON.stringify(diagramSchemaJson, null, 2),
      }],
    }),
  )

  server.resource(
    'skill',
    'arc://skill/diagrams',
    { description: 'Arc diagram generation skill for agents', mimeType: 'text/markdown' },
    async () => ({
      contents: [{ uri: 'arc://skill/diagrams', mimeType: 'text/markdown', text: skillMarkdown }],
    }),
  )

  server.resource(
    'llm',
    'arc://docs/llm',
    { description: 'Dense LLM briefing (docs/llm.txt)', mimeType: 'text/plain' },
    async () => ({
      contents: [{ uri: 'arc://docs/llm', mimeType: 'text/plain', text: llmBriefing }],
    }),
  )

  return server
}

export async function runArcMcpServer(): Promise<void> {
  const server = createArcMcpServer()
  const transport = new StdioServerTransport()
  // The SDK stdio transport does not close on EOF. Once a live relay exists it
  // would otherwise keep an orphaned MCP process listening after its client exits.
  let closing = false
  const close = () => {
    if (closing) return
    closing = true
    process.stdin.off('end', close)
    process.off('SIGINT', close)
    process.off('SIGTERM', close)
    void server.close()
  }
  process.stdin.once('end', close)
  process.once('SIGINT', close)
  process.once('SIGTERM', close)
  await server.connect(transport)
}

if (import.meta.main) {
  runArcMcpServer().catch((err) => {
    console.error('arc-mcp failed:', err)
    process.exit(1)
  })
}
