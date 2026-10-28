import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { visualizer } from 'rollup-plugin-visualizer'
import { resolve } from 'path'
import { existsSync, readFileSync } from 'fs'
import captureMiddleware from './plugins/captureMiddleware.js'
import { resolveSiteVersion } from './scripts/site-version.js'

const __dirname = new URL('.', import.meta.url).pathname

export default defineConfig(async ({ mode }) => {
  const release = await resolveSiteVersion()
  // Dogfood: In production, use the pre-built library (lib/) to catch regressions
  // This requires running `pnpm build:lib` first before `pnpm build`
  const libPath = resolve(__dirname, 'lib/arc.es.js')
  const libExists = existsSync(libPath)
  const useBuiltLib = mode === 'production' && libExists

  // Error if production build is attempted without pre-built library
  if (mode === 'production' && !libExists) {
    throw new Error(
      'Production build requires pre-built library. Run `pnpm build:lib` first.\n' +
      `Expected file at: ${libPath}`
    )
  }

  return {
    // Mount path for the site bundle — '/arc/' when vendored into
    // hudsonkit.com, '/' when deployed standalone at arc.jdi.sh.
    base: process.env.ARC_BASE || '/',
    define: {
      __ARC_SITE_VERSION__: JSON.stringify(release.version),
      // GA measurement id baked at build time — GA_MEASUREMENT_ID overrides
      // per deployment; the default is arc's own GA4 property.
      'import.meta.env.GA_MEASUREMENT_ID': JSON.stringify(process.env.GA_MEASUREMENT_ID || 'G-SEDXMKVG9K'),
      'import.meta.env.VITE_SITE_URL': JSON.stringify((process.env.SITE_URL || 'https://hudsonkit.com/arc').replace(/\/$/, '')),
    },
    plugins: [
      {
        // Vite's SPA preview otherwise serves index.html for extensionless
        // article URLs. Match the generated directory routes before fallback.
        name: 'arc-static-blog-preview',
        configurePreviewServer(server) {
          server.middlewares.use((req, res, next) => {
            const url = new URL(req.url || '/', 'http://localhost')
            const base = (process.env.ARC_BASE || '/').replace(/\/?$/, '/')
            if (!url.pathname.startsWith(base)) return next()
            const route = url.pathname.slice(base.length).replace(/\/$/, '')
            if (!/^blog(?:\/[a-z0-9-]+)?$/.test(route)) return next()
            const output = resolve(__dirname, 'dist', route, 'index.html')
            if (!existsSync(output)) return next()
            if (!url.pathname.endsWith('/')) {
              res.statusCode = 308
              res.setHeader('Location', `${url.pathname}/${url.search}`)
              return res.end()
            }
            res.setHeader('Content-Type', 'text/html; charset=utf-8')
            res.end(readFileSync(output))
          })
        },
      },
      {
        name: 'arc-release-metadata',
        generateBundle() {
          this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify(release, null, 2) + '\n' })
        },
      },
      react(),
      tailwindcss(),
      captureMiddleware(),
      visualizer({ open: false, gzipSize: true, filename: 'bundle-stats.html' }),
    ],
    resolve: {
      alias: {
        '@hudsonkit/arc': useBuiltLib ? libPath : resolve(__dirname, 'src/index.ts'),
      },
    },
    server: {
      port: 5188,
      strictPort: true,
    },
    preview: {
      port: 5188,
      strictPort: true,
      host: true,
      allowedHosts: ['arc-studio.exe.xyz', '.exe.xyz'],
    },
    build: {
      manifest: true,
      rollupOptions: {
        input: {
          main: './index.html',
        },
      },
    },
  }
})
