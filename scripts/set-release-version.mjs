import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))

/** Set package metadata before bundling code that embeds it (notably MCP). */
export function setReleaseVersion(version, scope = 'all', directory = root) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version ?? '')) throw new Error('Expected a release version such as 0.14.0')
  if (!['all', 'arc', 'mcp'].includes(scope)) throw new Error('Release scope must be all, arc, or mcp')
  const manifests = scope === 'mcp'
    ? ['packages/mcp/package.json']
    : ['package.json', ...(scope === 'all' ? ['packages/viewer/package.json', 'packages/iso/package.json', 'packages/mcp/package.json'] : [])]
  // Read every manifest before writing so an invalid checkout cannot be partly updated.
  const updates = manifests.map(file => {
    const target = path.join(directory, file)
    const pkg = JSON.parse(readFileSync(target, 'utf8'))
    return { target, pkg: { ...pkg, version } }
  })
  if (scope !== 'arc') {
    const target = path.join(directory, 'packages/mcp/server.json')
    const server = JSON.parse(readFileSync(target, 'utf8'))
    const mcp = updates.find(update => update.target === path.join(directory, 'packages/mcp/package.json')).pkg
    if (!server.packages?.some(pkg => pkg.registryType === 'npm' && pkg.identifier === mcp.name)) {
      throw new Error(`MCP server manifest must include npm package ${mcp.name}`)
    }
    updates.push({
      target,
      pkg: {
        ...server,
        version,
        packages: server.packages.map(pkg => pkg.registryType === 'npm' && pkg.identifier === mcp.name ? { ...pkg, version } : pkg),
      },
    })
  }
  for (const { target, pkg } of updates) writeFileSync(target, JSON.stringify(pkg, null, 2) + '\n')
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  setReleaseVersion(process.argv[2], process.argv[3])
  console.log(`Release metadata set to ${process.argv[2]} (${process.argv[3] || 'all'})`)
}
