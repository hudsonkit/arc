#!/usr/bin/env bun
/**
 * Bundle the Node stdio and Bun private-preview HTTP bins.
 * Dev: `bun src/server.ts` or `bun run dev`
 */
import { chmodSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
for (const [entry, name, runtime] of [
  ['server.ts', 'arc-mcp.mjs', 'node'],
  ['http-server.ts', 'arc-mcp-http.mjs', 'bun'],
]) {
  const result = await Bun.build({
    entrypoints: [join(root, 'src', entry)],
    outdir: join(root, 'dist'),
    naming: name,
    target: runtime,
    format: 'esm',
    banner: `#!/usr/bin/env ${runtime}`,
  })
  if (!result.success) {
    console.error(`build failed: ${name}`)
    for (const log of result.logs) console.error(log)
    process.exit(1)
  }
  chmodSync(join(root, 'dist', name), 0o755)
  console.log(`built dist/${name}`)
}
