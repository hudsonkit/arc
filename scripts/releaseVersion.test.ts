import { expect, test } from 'bun:test'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { setReleaseVersion } from './set-release-version.mjs'

test('release preparation updates the public packages, preserves the editor, and rejects invalid inputs before writing', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'arc-release-'))
  const files = ['package.json', ...['viewer', 'iso', 'mcp', 'arc-editor'].map(name => `packages/${name}/package.json`)]
  const version = (file: string) => JSON.parse(readFileSync(path.join(root, file), 'utf8')).version
  try {
    for (const file of files) {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
      writeFileSync(path.join(root, file), JSON.stringify({ name: file, version: '0.13.3' }))
    }
    expect(() => setReleaseVersion('v0.14.0', 'all', root)).toThrow('version')
    expect(() => setReleaseVersion('0.14.0', 'unknown', root)).toThrow('scope')
    expect(files.map(version)).toEqual(files.map(() => '0.13.3'))
    setReleaseVersion('0.14.0', 'arc', root)
    expect(files.map(version)).toEqual(['0.14.0', '0.13.3', '0.13.3', '0.13.3', '0.13.3'])
    setReleaseVersion('0.14.0', 'all', root)
    expect(files.map(version)).toEqual(['0.14.0', '0.14.0', '0.14.0', '0.14.0', '0.13.3'])
    rmSync(path.join(root, 'packages/mcp/package.json'))
    expect(() => setReleaseVersion('0.15.0', 'all', root)).toThrow()
    expect(version('package.json')).toBe('0.14.0')
  } finally { rmSync(root, { recursive: true, force: true }) }
})
