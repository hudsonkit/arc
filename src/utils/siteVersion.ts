import { version as packageVersion } from '../../package.json'

/** Site builds resolve npm once. Library consumers retain their package version. */
declare const __ARC_SITE_VERSION__: string
export const siteVersion = typeof __ARC_SITE_VERSION__ === 'string' ? __ARC_SITE_VERSION__ : packageVersion
