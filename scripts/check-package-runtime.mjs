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
    if (pkg.name === '@hudsonkit/arc') {
      // `@hudsonkit/arc/validate` must load and run with React absent: nothing
      // but the packed package is installed yet, and node has no DOM.
      const validateProbe = path.join(temporary, 'validate-probe.cjs')
      writeFileSync(validateProbe, `
        const assert = require('node:assert/strict');
        assert.throws(() => require.resolve('react'), /Cannot find module/);
        assert.equal(typeof document, 'undefined');
        const diagram = {
          layout: { width: 400, height: 200 },
          nodes: { a: { x: 20, y: 20, size: 'm' }, b: { x: 240, y: 20, size: 'm' } },
          nodeData: { a: { name: 'A', icon: 'Server', color: 'blue' }, b: { name: 'B', icon: 'Database', color: 'emerald' } },
          connectors: [{ id: 'ab', from: 'a', to: 'b', fromAnchor: 'right', toAnchor: 'left', style: 'x' }],
          connectorStyles: { x: { color: 'blue', strokeWidth: 2 } },
        };
        function verify(v) {
          assert.deepEqual(Object.keys(v).filter(key => key !== 'default' && key !== '__esModule').sort(), ['isDiagramShape', 'validateDiagram', 'validateDiagramShape']);
          assert.equal(v.validateDiagramShape(diagram), null);
          assert.equal(v.isDiagramShape({}), false);
          assert.deepEqual(v.validateDiagram(diagram).filter(d => d.severity === 'error'), []);
          const broken = { ...diagram, connectors: [{ ...diagram.connectors[0], to: 'missing' }] };
          assert.ok(v.validateDiagram(broken).some(d => d.severity === 'error'));
        }
        (async () => {
          verify(require('@hudsonkit/arc/validate'));
          verify(await import('@hudsonkit/arc/validate'));
        })().catch(error => { console.error(error.message); process.exit(1); });
      `)
      execFileSync(process.execPath, [validateProbe], { cwd: temporary, stdio: 'pipe' })
      // Its declarations must typecheck with no React types and no DOM lib.
      writeFileSync(path.join(temporary, 'validate-probe.mts'), `
        import { validateDiagram, validateDiagramShape, type Diagnostic } from '@hudsonkit/arc/validate';
        const diagnostics: Diagnostic[] = validateDiagram({});
        const shape: string | null = validateDiagramShape({});
        void diagnostics; void shape;
      `)
      writeFileSync(path.join(temporary, 'tsconfig.json'), JSON.stringify({
        compilerOptions: { noEmit: true, strict: true, target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', lib: ['ES2022'], types: [] },
        files: ['validate-probe.mts'],
      }))
      execFileSync(process.execPath, [path.join(repository, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json'], { cwd: temporary, stdio: 'pipe' })
      console.log(`Packed ${pkg.name}@${pkg.version}/validate: ESM import, CommonJS require and declarations passed without React or the DOM.`)
    }
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
    if (pkg.name === '@hudsonkit/arc') {
      // Typecheck the packed API in isolation too. A rolled-up declaration can
      // accidentally import a bundled dev dependency even when JS is portable.
      mkdirSync(path.join(modules, '@types'), { recursive: true })
      for (const peer of ['react', 'react-dom']) symlinkSync(path.join(repository, 'node_modules', '@types', peer), path.join(modules, '@types', peer))
      const typeProbe = path.join(temporary, 'probe.mts')
      writeFileSync(typeProbe, `
        import type { ComponentProps } from 'react';
        import { ArcDiagram } from '@hudsonkit/arc';
        const overlay: NonNullable<ComponentProps<typeof ArcDiagram>['renderCanvasOverlay']> = context => {
          const position = context.motion?.nodes.api?.x;
          if (position) {
            const current: number = position.get();
            const unsubscribe = position.on('change', (next: number) => { void next; });
            unsubscribe();
            void current;
          }
          return null;
        };
        void overlay;
      `)
      execFileSync(process.execPath, [path.join(repository, 'node_modules/typescript/bin/tsc'),
        '--noEmit', '--strict', '--target', 'ES2022', '--module', 'NodeNext',
        '--moduleResolution', 'NodeNext', '--lib', 'ES2022,DOM,DOM.Iterable',
        '--types', 'react,react-dom', typeProbe], { cwd: temporary, stdio: 'pipe' })
    }
    console.log(`Packed ${pkg.name}@${pkg.version}: ESM import, CommonJS require, public renderer exports${pkg.name === '@hudsonkit/arc' ? ', and isolated public declarations' : ''} passed with only React peers.`)
  }
} finally { rmSync(temporary, { recursive: true, force: true }) }
