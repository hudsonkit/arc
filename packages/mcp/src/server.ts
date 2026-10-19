/**
 * Arc MCP server — stdio tools for diagram authoring.
 * Run locally: `bun packages/mcp/src/server.ts` or `bun run mcp`
 * Published bin: `@hudsonkit/arc-mcp` → dist/arc-mcp.mjs (built via `bun run build:mcp`)
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
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
import pkg from '../package.json'
// Inlined by `bun run build:mcp` so the published arc-mcp bin serves these
// without depending on the package's on-disk layout.
import diagramSchemaJson from '../../../schemas/arc-diagram.schema.json'
import skillMarkdown from '../../../skills/arc-diagrams/SKILL.md' with { type: 'text' }
import llmBriefing from '../../../docs/llm.txt' with { type: 'text' }

const diagramSchema = z.record(z.unknown())
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

export function createArcMcpServer(): McpServer {
  const server = new McpServer({
    name: 'arc',
    version: pkg.version,
  })

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
  await server.connect(transport)
}

if (import.meta.main) {
  runArcMcpServer().catch((err) => {
    console.error('arc-mcp failed:', err)
    process.exit(1)
  })
}
