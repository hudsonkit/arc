import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
const packOutput = JSON.parse(
  execFileSync('npm', ['pack', '--dry-run', '--ignore-scripts', '--json'], {
    cwd: root,
    encoding: 'utf8',
  }),
)
// npm 12 keys results by package name; npm 11 and earlier return an array.
const pack = Array.isArray(packOutput) ? packOutput[0] : packOutput[packageJson.name]
if (!pack || !Array.isArray(pack.files)) {
  throw new Error('npm pack returned no file list for ' + packageJson.name)
}
const packedFiles = new Set(pack.files.map(({ path: file }) => file))
const productionDependencies = Object.keys(packageJson.dependencies ?? {})

if (productionDependencies.length > 0) {
  console.error('The bundled root package must not install production dependencies:')
  for (const dependency of productionDependencies.sort()) console.error(`- ${dependency}`)
  process.exit(1)
}

if (packageJson.publishConfig?.provenance !== true) {
  console.error('package.json must enable publishConfig.provenance for release attestations.')
  process.exit(1)
}

const entrypoints = [packageJson.main, packageJson.module, packageJson.types]
  .filter(Boolean)
  .map((file) => file.replace(/^\.\//, ''))

function collectEntrypoints(target) {
  if (typeof target === 'string') entrypoints.push(target.replace(/^\.\//, ''))
  else if (target && typeof target === 'object') {
    for (const condition of Object.values(target)) collectEntrypoints(condition)
  }
}
collectEntrypoints(packageJson.exports)

const missing = new Set(entrypoints.filter((file) => !packedFiles.has(file)))
const relativeSpecifier = /(?:from\s*|import\s*\(|require\s*\()\s*['"](\.{1,2}\/[^'"]+)['"]/g

for (const file of packedFiles) {
  if (!/\.[cm]?js$/.test(file)) continue

  const source = readFileSync(path.join(root, file), 'utf8')
  for (const match of source.matchAll(relativeSpecifier)) {
    const referenced = path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1]))
    const candidates = [referenced, `${referenced}.js`, `${referenced}.mjs`, `${referenced}.cjs`]
    if (!candidates.some((candidate) => packedFiles.has(candidate))) missing.add(referenced)
  }
}

if (missing.size > 0) {
  console.error('Package tarball is missing referenced files:')
  for (const file of [...missing].sort()) console.error(`- ${file}`)
  process.exit(1)
}

console.log(
  `Packlist verified: ${packedFiles.size} files, no production dependencies, provenance enabled, and all entrypoints and relative imports included.`,
)
