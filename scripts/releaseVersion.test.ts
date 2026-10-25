import { expect, test } from 'bun:test'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { setReleaseVersion } from './set-release-version.mjs'

const packageFiles = ['package.json', ...['viewer', 'iso', 'mcp', 'arc-editor'].map(name => `packages/${name}/package.json`)]
const serverFile = 'packages/mcp/server.json'

function withReleaseFixture(check: (root: string) => void) {
  const root = mkdtempSync(path.join(tmpdir(), 'arc-release-'))
  try {
    for (const file of packageFiles) {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
      writeFileSync(path.join(root, file), JSON.stringify({ name: file === 'packages/mcp/package.json' ? '@hudsonkit/arc-mcp' : file, version: '0.13.3' }))
    }
    writeFileSync(path.join(root, serverFile), JSON.stringify({
      name: 'io.github.hudsonkit/arc',
      version: '0.13.3',
      packages: [
        { registryType: 'npm', identifier: '@hudsonkit/arc-mcp', version: '0.13.3', transport: { type: 'stdio' } },
        { registryType: 'npm', identifier: '@example/other-server', version: '1.0.0' },
      ],
    }))
    check(root)
  } finally { rmSync(root, { recursive: true, force: true }) }
}

const read = (root: string, file: string) => JSON.parse(readFileSync(path.join(root, file), 'utf8'))
const packageVersions = (root: string) => packageFiles.map(file => read(root, file).version)

test('release preparation preserves arc scope and rejects invalid inputs before writing', () => {
  withReleaseFixture(root => {
    expect(() => setReleaseVersion('v0.14.0', 'all', root)).toThrow('version')
    expect(() => setReleaseVersion('0.14.0', 'unknown', root)).toThrow('scope')
    expect(packageVersions(root)).toEqual(packageFiles.map(() => '0.13.3'))
    const serverBefore = readFileSync(path.join(root, serverFile), 'utf8')
    setReleaseVersion('0.14.0', 'arc', root)
    expect(packageVersions(root)).toEqual(['0.14.0', '0.13.3', '0.13.3', '0.13.3', '0.13.3'])
    expect(readFileSync(path.join(root, serverFile), 'utf8')).toBe(serverBefore)
  })
})

test('MCP-only releases synchronize registry and npm versions without updating other packages', () => {
  withReleaseFixture(root => {
    setReleaseVersion('0.14.1', 'mcp', root)
    expect(packageVersions(root)).toEqual(['0.13.3', '0.13.3', '0.13.3', '0.14.1', '0.13.3'])
    expect(read(root, serverFile)).toEqual({
      name: 'io.github.hudsonkit/arc',
      version: '0.14.1',
      packages: [
        { registryType: 'npm', identifier: '@hudsonkit/arc-mcp', version: '0.14.1', transport: { type: 'stdio' } },
        { registryType: 'npm', identifier: '@example/other-server', version: '1.0.0' },
      ],
    })
  })
})

test('all releases synchronize public packages and the registry manifest while preserving the editor', () => {
  withReleaseFixture(root => {
    setReleaseVersion('0.15.0', 'all', root)
    expect(packageVersions(root)).toEqual(['0.15.0', '0.15.0', '0.15.0', '0.15.0', '0.13.3'])
    expect(read(root, serverFile).version).toBe('0.15.0')
    expect(read(root, serverFile).packages.map((pkg: { version: string }) => pkg.version)).toEqual(['0.15.0', '1.0.0'])
  })
})

test('missing or invalid MCP registry metadata cannot leave a release partly updated', () => {
  for (const scope of ['all', 'mcp']) {
    withReleaseFixture(root => {
      const originals = packageFiles.map(file => readFileSync(path.join(root, file), 'utf8'))
      rmSync(path.join(root, serverFile))
      expect(() => setReleaseVersion('0.15.0', scope, root)).toThrow()
      expect(packageFiles.map(file => readFileSync(path.join(root, file), 'utf8'))).toEqual(originals)
      writeFileSync(path.join(root, serverFile), JSON.stringify({ version: '0.13.3', packages: [] }))
      expect(() => setReleaseVersion('0.15.0', scope, root)).toThrow('must include npm package')
      expect(packageFiles.map(file => readFileSync(path.join(root, file), 'utf8'))).toEqual(originals)
    })
  }
})
