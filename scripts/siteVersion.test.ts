import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveSiteVersion } from './site-version.js'

test('site uses the npm release rather than the checkout version', async () => {
  const result = await resolveSiteVersion({ fetchRelease: async () => new Response(JSON.stringify({ name: '@hudsonkit/arc', version: '0.12.1' })) })
  assert.deepEqual(result, { version: '0.12.1', source: 'npm' })
})
test('explicit release makes offline builds reproducible', async () => {
  assert.deepEqual(await resolveSiteVersion({ override: '0.12.1', fetchRelease: () => { throw Error('Must not fetch') } }), { version: '0.12.1', source: 'override' })
})
test('failed or invalid metadata cannot silently show a stale release', async () => {
  await assert.rejects(resolveSiteVersion({ fetchRelease: async () => new Response('{}', { status: 503 }) }), /Cannot resolve/)
  await assert.rejects(resolveSiteVersion({ fetchRelease: async () => new Response(JSON.stringify({ name: 'another-package', version: '1.0.0' })) }), /Cannot resolve/)
  await assert.rejects(resolveSiteVersion({ override: 'latest' }), /must be a release/)
})
