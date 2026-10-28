import { writeFileSync } from 'node:fs'

const before = {
  layout: { width: 900, height: 430 },
  nodes: {
    client: { x: 40, y: 60, size: 'm' },
    api: { x: 350, y: 60, size: 'm' },
    store: { x: 660, y: 60, size: 'm' },
  },
  nodeData: {
    client: { name: 'Client', kind: 'frontend' },
    api: {
      name: 'API', kind: 'backend',
      description: 'Write request',
    },
    store: { name: 'Storage', kind: 'database' },
  },
  connectors: [
    { id: 'request', from: 'client', to: 'api', fromAnchor: 'right', toAnchor: 'left', style: 'request' },
    { id: 'write', from: 'api', to: 'store', fromAnchor: 'right', toAnchor: 'left', style: 'request' },
  ],
  connectorStyles: {
    request: { color: 'blue', strokeWidth: 2 },
  },
}

const after = structuredClone(before)
after.nodes.queue = { x: 350, y: 290, size: 'm' }
after.nodes.worker = { x: 660, y: 290, size: 'm' }
after.nodeData.api.description =
  'Write and enqueue'
after.nodeData.queue = { name: 'Queue', kind: 'queue' }
after.nodeData.worker = { name: 'Worker', kind: 'service' }
after.connectors.push(
  { id: 'enqueue', from: 'api', to: 'queue', fromAnchor: 'bottom', toAnchor: 'top', style: 'background' },
  { id: 'consume', from: 'queue', to: 'worker', fromAnchor: 'right', toAnchor: 'left', style: 'background' },
)
after.connectorStyles.background = {
  color: 'zinc', strokeWidth: 1.5, dashed: true,
}

for (const [name, diagram] of Object.entries({ before, after })) {
  writeFileSync(`${name}.arc.json`, JSON.stringify(diagram, null, 2) + '\n')
}
