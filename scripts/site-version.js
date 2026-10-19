// Resolve the published release once during site generation, never in the browser.
const NPM_LATEST_URL = 'https://registry.npmjs.org/@hudsonkit%2Farc/latest'
const RELEASE_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/

export async function resolveSiteVersion({ override = process.env.ARC_SITE_VERSION, fetchRelease = fetch } = {}) {
  if (override !== undefined) {
    if (!RELEASE_VERSION.test(override)) throw new Error('ARC_SITE_VERSION must be a release version, e.g. 0.12.1')
    return { version: override, source: 'override' }
  }
  try {
    const response = await fetchRelease(NPM_LATEST_URL, { signal: AbortSignal.timeout(10000) })
    if (!response.ok) throw new Error(`npm registry returned ${response.status}`)
    const release = await response.json()
    if (release.name !== '@hudsonkit/arc' || !RELEASE_VERSION.test(release.version)) throw new Error('Invalid npm release metadata')
    return { version: release.version, source: 'npm' }
  } catch (cause) {
    throw new Error('Cannot resolve published @hudsonkit/arc version. Set ARC_SITE_VERSION to a verified release for an offline build.', { cause })
  }
}
