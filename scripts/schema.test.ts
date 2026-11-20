import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { generateSchemaText, generateStyleSchemaText, SCHEMA_PATH, STYLE_SCHEMA_PATH } from './generate-schema'
import { validateArcStyle } from '../src/utils/arcStyle'

type Json = Record<string, unknown>

/** Minimal draft-07 validator covering the subset this schema uses. */
function validate(value: unknown, schema: Json, root: Json, path = '$'): string[] {
  const errors: string[] = []

  if (typeof schema.$ref === 'string') {
    const target = schema.$ref.startsWith('#/definitions/')
      ? (root.definitions as Json | undefined)?.[schema.$ref.slice('#/definitions/'.length)]
      : undefined
    if (!target || typeof target !== 'object') return [`${path}: unresolved $ref ${schema.$ref}`]
    return validate(value, target as Json, root, path)
  }

  if (Array.isArray(schema.anyOf)) {
    const ok = (schema.anyOf as Json[]).some((sub) => validate(value, sub, root, path).length === 0)
    if (!ok) errors.push(`${path}: matches no anyOf branch`)
    return errors
  }

  if (Array.isArray(schema.enum) && !(schema.enum as unknown[]).includes(value)) {
    errors.push(`${path}: ${JSON.stringify(value)} not in enum ${JSON.stringify(schema.enum)}`)
  }

  switch (schema.type) {
    case 'object': {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return [`${path}: expected object, got ${JSON.stringify(value)}`]
      }
      const obj = value as Json
      const properties = (schema.properties ?? {}) as Record<string, Json>
      for (const key of (schema.required as string[] | undefined) ?? []) {
        if (!(key in obj)) errors.push(`${path}: missing required property "${key}"`)
      }
      for (const [key, propValue] of Object.entries(obj)) {
        const propSchema = properties[key]
        if (propSchema) {
          errors.push(...validate(propValue, propSchema, root, `${path}.${key}`))
        } else if (schema.additionalProperties === false) {
          errors.push(`${path}: additional property "${key}"`)
        } else if (isSchema(schema.additionalProperties)) {
          errors.push(...validate(propValue, schema.additionalProperties, root, `${path}.${key}`))
        }
      }
      break
    }
    case 'array': {
      if (!Array.isArray(value)) return [`${path}: expected array, got ${JSON.stringify(value)}`]
      if (isSchema(schema.items)) {
        for (const [i, item] of value.entries()) {
          errors.push(...validate(item, schema.items, root, `${path}[${i}]`))
        }
      }
      break
    }
    case 'string':
      if (typeof value !== 'string') errors.push(`${path}: expected string, got ${JSON.stringify(value)}`)
      break
    case 'number':
    case 'integer':
      if (typeof value !== 'number' || (schema.type === 'integer' && !Number.isInteger(value))) {
        errors.push(`${path}: expected ${schema.type}, got ${JSON.stringify(value)}`)
      }
      break
    case 'boolean':
      if (typeof value !== 'boolean') errors.push(`${path}: expected boolean, got ${JSON.stringify(value)}`)
      break
  }
  return errors
}

function isSchema(value: unknown): value is Json {
  return typeof value === 'object' && value !== null
}

const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')) as Json

const validDiagram = {
  id: 'TEST.001',
  layout: { width: 860, height: 400 },
  layoutHints: {
    groups: { backend: { direction: 'vertical', padding: 20, align: 'center' } },
    nodes: { api: { group: 'backend', layer: 0, order: 1 } },
  },
  nodes: {
    editor: { x: 50, y: 50, size: 'l', width: 240, height: 110, z: 8, isoHeight: 24, isoDepth: 90, isoOrder: 1, isoLabelDir: 'x', isoLabelFlip: true, isoLabelFont: 'mono' },
    api: { x: 340, y: 150, size: 'm' },
    'db-primary': { x: 600, y: 150, size: 's' },
  },
  nodeData: {
    editor: { icon: 'Monitor', name: 'Arc Editor', color: 'violet', shape: 'chamfer' },
    api: { icon: 'Server', name: 'API', subtitle: 'REST', color: 'blue' },
    'db-primary': { icon: 'Database', name: 'Postgres', description: 'Primary store.', color: 'emerald' },
  },
  connectors: [
    { id: 'c1', from: 'editor', to: 'api', fromAnchor: 'right', toAnchor: 'left', style: 'http', curve: 'down', curveDepth: 65 },
    { from: 'api', to: 'db-primary', fromAnchor: 'right', toAnchor: 'left', style: 'db', curve: 'step' },
  ],
  connectorStyles: {
    http: { color: 'violet', strokeWidth: 2, label: 'HTTP', labelAlign: 'left', bidirectional: true, animated: false, showArrow: true, showEndpoints: false },
    db: { color: 'blue', strokeWidth: 1.5, dashed: true },
  },
  groups: [
    { id: 'backend', x: 300, y: 100, width: 420, height: 200, type: 'rect', color: 'zinc', label: 'Backend', dashed: true },
  ],
  focusTargets: {
    api: {
      mode: 'replace',
      nodes: ['db-primary'],
      connectors: [{ id: 'c1' }, { from: 'api', to: 'db-primary' }],
      caption: 'Reads hit the primary.',
      steps: [{ icon: 'Server', label: 'Accept request' }],
    },
  },
}

describe('arc-diagram.schema.json', () => {
  test('committed artifact matches the generator output byte-for-byte', () => {
    expect(generateSchemaText()).toBe(readFileSync(SCHEMA_PATH, 'utf8'))
  }, 30_000)

  test('is draft-07 rooted at ArcDiagramData', () => {
    expect(schema.$schema).toBe('http://json-schema.org/draft-07/schema#')
    expect(schema.$ref).toBe('#/definitions/ArcDiagramData')
  })

  test('closed object types forbid additional properties; Record maps stay open', () => {
    const defs = schema.definitions as Record<string, Json>
    for (const name of ['ArcDiagramData', 'Connector', 'NodePosition', 'DiagramLayout', 'NodeData', 'ConnectorStyle', 'GroupShape']) {
      expect(defs[name].additionalProperties).toBe(false)
    }
    for (const mapKey of ['nodes', 'nodeData', 'connectorStyles', 'focusTargets']) {
      expect((defs.ArcDiagramData.properties as Json)[mapKey].additionalProperties).toBeTypeOf('object')
    }
  })

  test('accepts diagram and node watches', () => {
    const diagram = {
      ...validDiagram,
      watches: ['src/billing/**', '*.ts'],
      nodeData: {
        ...validDiagram.nodeData,
        api: {
          ...validDiagram.nodeData.api,
          source: { path: 'src/api.ts', line: 4, endLine: 20, commit: 'abc' },
          watches: ['src/api.ts'],
        },
      },
    }
    expect(validate(diagram, schema, schema)).toEqual([])
  })

  test('accepts a fully-populated valid diagram', () => {
    expect(validate(validDiagram, schema, schema)).toEqual([])
  })

  test('Record maps accept arbitrary user-defined keys', () => {
    const diagram = {
      ...validDiagram,
      nodes: { 'my/node id v2': { x: 0, y: 0, size: 'xs' } },
      connectorStyles: { 'weird style': { color: 'rose', strokeWidth: 3 } },
    }
    expect(validate(diagram, schema, schema)).toEqual([])
  })

  test('rejects an invented top-level field', () => {
    const errors = validate({ ...validDiagram, canvas: { zoom: 2 } }, schema, schema)
    expect(errors.some((e) => e.includes('additional property "canvas"'))).toBe(true)
  })

  test('rejects an invented connector field and a bad enum value', () => {
    const badConnector = { ...validDiagram, connectors: [{ from: 'a', to: 'b', fromAnchor: 'right', toAnchor: 'left', style: 'x', strokeDash: 4 }] }
    const badSize = { ...validDiagram, nodes: { n: { x: 0, y: 0, size: 'huge' } } }
    expect(validate(badConnector, schema, schema).some((e) => e.includes('additional property "strokeDash"'))).toBe(true)
    expect(validate(badSize, schema, schema).some((e) => e.includes('not in enum'))).toBe(true)
  })

  test('rejects a diagram missing required connector fields', () => {
    const diagram = { ...validDiagram, connectors: [{ from: 'a' }] }
    const errors = validate(diagram, schema, schema)
    for (const key of ['to', 'fromAnchor', 'toAnchor', 'style']) {
      expect(errors.some((e) => e.includes(`missing required property "${key}"`))).toBe(true)
    }
  })
})

describe('arc-style.schema.json', () => {
  const styleSchema = JSON.parse(readFileSync(STYLE_SCHEMA_PATH, 'utf8')) as Json
  const mode = { background: '#fff', foreground: '#111', muted: '#666', surface: '#f6f6f6', border: '#ddd', line: '#999', accent: '#36c', success: '#2a6', warning: '#c80', danger: '#c33' }
  const style = { id: 'linea', version: '1.0.0', modes: { light: { ...mode, colors: { violet: '#639' } }, dark: mode }, type: { font: 'Inter' }, brand: { nodeShape: 'square' }, perspective: { default: 'isometric', isoStyle: 'blueprint' } }

  test('committed artifact matches the generator output byte-for-byte', () => {
    expect(generateStyleSchemaText()).toBe(readFileSync(STYLE_SCHEMA_PATH, 'utf8'))
  })

  test('is draft-07 rooted at ArcStyle', () => {
    expect(styleSchema.$schema).toBe('http://json-schema.org/draft-07/schema#')
    expect(styleSchema.$ref).toBe('#/definitions/ArcStyle')
  })

  test('accepts a full style, and the runtime check agrees', () => {
    expect(validate(style, styleSchema, styleSchema)).toEqual([])
    expect(validateArcStyle(style)).toEqual([])
  })

  test('rejects what is out of scope: extends, a missing token, an unknown color', () => {
    const withExtends = { ...style, extends: 'scout' }
    expect(validate(withExtends, styleSchema, styleSchema).some((e) => e.includes('additional property "extends"'))).toBe(true)
    expect(validateArcStyle(withExtends)).toContain('unknown field `extends`')
    const { danger: _danger, ...partial } = mode
    void _danger
    const missing = { ...style, modes: { light: partial, dark: mode } }
    expect(validate(missing, styleSchema, styleSchema).some((e) => e.includes('missing required property "danger"'))).toBe(true)
    expect(validateArcStyle(missing).some((p) => p.includes('modes.light.danger'))).toBe(true)
    const badColor = { ...style, modes: { light: { ...mode, colors: { teal: '#0aa' } }, dark: mode } }
    expect(validate(badColor, styleSchema, styleSchema).some((e) => e.includes('additional property "teal"'))).toBe(true)
    expect(validateArcStyle(badColor).some((p) => p.includes('colors.teal'))).toBe(true)
  })
})
