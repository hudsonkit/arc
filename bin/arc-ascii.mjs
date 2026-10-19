#!/usr/bin/env node

/**
 * arc-ascii — Render Arc diagram JSON as monospace ASCII art.
 *
 * Usage:
 *   bunx @hudsonkit/arc diagram.json
 *   cat diagram.json | bunx @hudsonkit/arc
 *   bunx @hudsonkit/arc diagram.json --charset ascii
 *   bunx @hudsonkit/arc diagram.json --max-width 80
 */

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Import renderAscii from the built lib (works when installed from npm)
// or from source (works during local dev with tsx)
let renderAscii
try {
  const lib = await import(resolve(__dirname, '..', 'lib', 'arc.es.js'))
  renderAscii = lib.renderAscii
} catch {
  const src = await import(resolve(__dirname, '..', 'src', 'utils', 'asciiRenderer.ts'))
  renderAscii = src.renderAscii
}

// ── Parse args ──────────────────────────────

const args = process.argv.slice(2)
let filePath = null
const opts = {}

for (let i = 0; i < args.length; i++) {
  const a = args[i]
  if (a === '--charset' || a === '-c') { opts.charset = args[++i]; continue }
  if (a === '--max-width' || a === '-w') { opts.maxWidth = Number(args[++i]); continue }
  if (a === '--no-labels') { opts.showLabels = false; continue }
  if (a === '--scale-x') { opts.scaleX = Number(args[++i]); continue }
  if (a === '--scale-y') { opts.scaleY = Number(args[++i]); continue }
  if (a === '--help' || a === '-h') { printHelp(); process.exit(0) }
  if (!a.startsWith('-')) filePath = a
}

// ── Read input ──────────────────────────────

let json
try {
  if (filePath) {
    json = readFileSync(filePath, 'utf-8')
  } else if (!process.stdin.isTTY) {
    const chunks = []
    for await (const chunk of process.stdin) chunks.push(chunk)
    json = Buffer.concat(chunks).toString('utf-8')
  } else {
    printHelp()
    process.exit(1)
  }
} catch (err) {
  console.error(`Error reading input: ${err.message}`)
  process.exit(1)
}

// ── Parse & render ──────────────────────────

let data
try {
  data = JSON.parse(json)
} catch {
  const match = json.match(/(?:export\s+default\s+|(?:const|let|var)\s+\w+(?::\s*\S+)?\s*=\s*)(\{[\s\S]*\})/)
  if (match) {
    try {
      const normalized = match[1]
        .replace(/'/g, '"')
        .replace(/,(\s*[}\]])/g, '$1')
        .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3')
      data = JSON.parse(normalized)
    } catch {
      console.error('Error: Could not parse diagram data.')
      process.exit(1)
    }
  } else {
    console.error('Error: Input is not valid JSON or a recognizable diagram module.')
    process.exit(1)
  }
}

if (!data.layout || !data.nodes || !data.nodeData) {
  console.error('Error: Input does not look like ArcDiagramData (missing layout, nodes, or nodeData).')
  process.exit(1)
}

if (!data.connectorStyles) data.connectorStyles = {}

console.log(renderAscii(data, opts))

// ── Help ────────────────────────────────────

function printHelp() {
  console.log(`
arc-ascii — Render Arc diagrams as ASCII art

Usage:
  bunx @hudsonkit/arc <file.json>        Read diagram from file
  cat diagram.json | bunx @hudsonkit/arc Read from stdin

Options:
  -c, --charset <unicode|ascii>      Character set (default: unicode)
  -w, --max-width <cols>             Max output width in columns
      --no-labels                    Hide connector labels
      --scale-x <n>                  Pixels per char horizontally (default: 8)
      --scale-y <n>                  Pixels per char vertically (default: 16)
  -h, --help                         Show this help
`.trim())
}
