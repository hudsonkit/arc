#!/usr/bin/env bun
/**
 * Regenerate `schemas/arc-diagram.schema.json` from the `ArcDiagramData` type,
 * and `schemas/arc-style.schema.json` from the host `ArcStyle` type.
 *
 * Uses ts-json-schema-generator (draft-07, `$ref` definitions, JSDoc carried
 * into `description`). The generator already emits `additionalProperties:
 * false` on closed object types; the post-pass below enforces it anyway so the
 * guarantee survives generator config drift. `Record<string, …>` maps (nodes,
 * nodeData, connectorStyles, focusTargets, layoutHints.*) are index-signature
 * objects, not closed types, so their keys stay open.
 *
 * Run: `bun run generate:schema`
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createGenerator, type Schema } from 'ts-json-schema-generator'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

export const SCHEMA_PATH = join(REPO_ROOT, 'schemas', 'arc-diagram.schema.json')
export const STYLE_SCHEMA_PATH = join(REPO_ROOT, 'schemas', 'arc-style.schema.json')
const TYPE_PATH = join(REPO_ROOT, 'src', 'types', 'diagram.ts')
const STYLE_TYPE_PATH = join(REPO_ROOT, 'src', 'utils', 'themes.ts')
const TSCONFIG_PATH = join(REPO_ROOT, 'tsconfig.json')

interface ObjectDef {
  type?: string
  properties?: Record<string, unknown>
  additionalProperties?: unknown
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Deep-sort object keys so the artifact is stable and diff-friendly. */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (!isPlainObject(value)) return value
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortKeys(value[key])]),
  )
}

function buildTypeSchema(path: string, type: string): Schema {
  const schema = createGenerator({
    path,
    tsconfig: TSCONFIG_PATH,
    type,
    jsDoc: 'extended',
    additionalProperties: false,
    sortProps: true,
    topRef: true,
  }).createSchema(type)

  // Closed object types reject invented fields; Record maps are index-signature
  // objects (their additionalProperties is a subschema) and stay open.
  const definitions = (schema.definitions ?? {}) as Record<string, ObjectDef>
  for (const def of Object.values(definitions)) {
    if (def?.type === 'object' && def.properties && def.additionalProperties === undefined) {
      def.additionalProperties = false
    }
  }
  return sortKeys(schema) as Schema
}

/** Build the draft-07 JSON Schema object for `ArcDiagramData`. */
export function buildSchema(): Schema {
  return buildTypeSchema(TYPE_PATH, 'ArcDiagramData')
}

/** Build the draft-07 JSON Schema object for a host `ArcStyle` file. */
export function buildStyleSchema(): Schema {
  return buildTypeSchema(STYLE_TYPE_PATH, 'ArcStyle')
}

/** Canonical serialized form — the committed artifact is exactly this text. */
export function generateSchemaText(): string {
  return `${JSON.stringify(buildSchema(), null, 2)}\n`
}

export function generateStyleSchemaText(): string {
  return `${JSON.stringify(buildStyleSchema(), null, 2)}\n`
}

if (import.meta.main) {
  mkdirSync(dirname(SCHEMA_PATH), { recursive: true })
  writeFileSync(SCHEMA_PATH, generateSchemaText())
  console.log(`wrote ${SCHEMA_PATH}`)
  writeFileSync(STYLE_SCHEMA_PATH, generateStyleSchemaText())
  console.log(`wrote ${STYLE_SCHEMA_PATH}`)
}
