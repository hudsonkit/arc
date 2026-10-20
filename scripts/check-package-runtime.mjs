import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const repository = process.cwd()
const root = path.resolve(repository, process.argv[2] || '.')
const temporary = mkdtempSync(path.join(tmpdir(), 'arc-package-runtime-'))
try {
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
  const output = JSON.parse(execFileSync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', temporary], { cwd: root, encoding: 'utf8' }))
  const pack = Array.isArray(output) ? output[0] : output[pkg.name]
  const modules = path.join(temporary, 'node_modules')
  const extracted = path.join(modules, pkg.name)
  mkdirSync(extracted, { recursive: true })
  execFileSync('tar', ['-xzf', path.join(temporary, pack.filename), '--strip-components=1', '-C', extracted])
  if (pkg.name === '@hudsonkit/arc-mcp') {
    // The SDK is declared by the MCP workspace, not by the repository root.
    const workspaceRequire = createRequire(path.join(root, 'package.json'))
    const { Client } = await import(pathToFileURL(workspaceRequire.resolve('@modelcontextprotocol/sdk/client/index.js')).href)
    const { StdioClientTransport } = await import(pathToFileURL(workspaceRequire.resolve('@modelcontextprotocol/sdk/client/stdio.js')).href)
    const assert = await import('node:assert/strict')
    const client = new Client({ name: 'release-check', version: '1.0.0' })
    try {
      await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(extracted, 'dist/arc-mcp.mjs')] }))
      assert.equal(client.getServerVersion()?.version, pkg.version)
      assert.ok((await client.listTools()).tools.some(tool => tool.name === 'render_svg'))
      console.log(`Packed ${pkg.name}@${pkg.version}: MCP initialization, runtime version, and tool discovery passed.`)
    } finally { await client.close() }
  } else {
    // Only the declared React peers are available to the packed library.
    for (const peer of ['react', 'react-dom']) symlinkSync(path.join(repository, 'node_modules', peer), path.join(modules, peer))
    const assertions = pkg.name === '@hudsonkit/arc' ? `
        assert.equal(typeof arc.ArcDiagram, 'function');
        assert.equal(typeof arc.ArcExploded, 'function');
        assert.equal(typeof arc.ArcPanelCube, 'function');
        assert.match(arc.renderExplodedSvg(arc.keyboardExploded), /<svg/);
        assert.match(arc.renderPanelCubeSvg(arc.fieldRecorderCube), /<svg/);
      ` : pkg.name === '@hudsonkit/arc-viewer' ? `
        assert.equal(typeof arc.ArcDiagram, 'function');
        assert.equal(typeof arc.ArcMermaid, 'function');
      ` : pkg.name === '@hudsonkit/arc-iso' ? `
        assert.equal(typeof arc.ArcDiagram, 'function');
        assert.match(arc.renderToString({theme:'light',canvas:{width:400,height:300},origin:{x:200,y:100},tiers:{},floorSize:100,nodes:[]}), /<svg/);
      ` : (() => { throw new Error('No runtime assertions for ' + pkg.name) })()
    const entrypoints = [pkg.name, ...(pkg.name === '@hudsonkit/arc-iso' ? [pkg.name + '/slim'] : [])]
    const verify = `
      const assert = require('node:assert/strict');
      function verify(arc) {
        ${assertions}
      }
      (async () => {
        for (const entrypoint of ${JSON.stringify(entrypoints)}) {
          verify(require(entrypoint));
          verify(await import(entrypoint));
        }
      })().catch(error => { console.error(error.message); process.exit(1); });
    `
    const probe = path.join(temporary, 'probe.cjs')
    writeFileSync(probe, verify)
    execFileSync(process.execPath, [probe], { cwd: temporary, stdio: 'pipe' })
    console.log(`Packed ${pkg.name}@${pkg.version}: ESM import, CommonJS require, and public renderer exports passed with only React peers.`)
  }
} finally { rmSync(temporary, { recursive: true, force: true }) }
