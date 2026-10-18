import { test } from 'node:test'
import assert from 'node:assert/strict'
import { examples } from '../src/content/examples'
import { importMermaid } from '../packages/viewer/src/importMermaid'
import { parseMermaid } from '../packages/viewer/src/mermaid/parseMermaid'

test('gallery sources parse and every animated leg has a real connector', () => {
  assert.equal(new Set(examples.map(example => example.id)).size, examples.length)
  assert.equal(examples.length, 16)
  for (const example of examples) {
    if (example.category === 'Sequence') {
      const parsed = parseMermaid(example.source!)
      assert.equal(parsed.document?.family, 'sequence', example.id)
      assert.deepEqual(parsed.diagnostics, [], example.id)
      continue
    }
    const imported = example.source ? importMermaid(example.source) : null
    if (imported) {
      assert.deepEqual(imported.warnings, [], example.id)
      assert.deepEqual(imported.unsupported, example.id === 'release-decision' ? ['direction directives'] : [], example.id)
    }
    const diagram = example.diagram ?? imported!.diagram
    assert.ok(Object.keys(diagram.nodes).length >= 3, example.id)
    for (const connector of diagram.connectors) {
      assert.ok(diagram.nodes[connector.from] && diagram.nodes[connector.to], example.id)
    }
    for (const flow of diagram.flows ?? []) {
      for (const leg of flow.legs) {
        assert.ok(diagram.connectors.some(c => c.from === leg.from && c.to === leg.to), example.id)
      }
    }
  }
})
