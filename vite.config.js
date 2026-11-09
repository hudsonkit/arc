import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { visualizer } from 'rollup-plugin-visualizer'
import { Marked } from 'marked'
import { resolve } from 'path'
import { existsSync, readFileSync } from 'fs'
import captureMiddleware from './plugins/captureMiddleware.js'
import { resolveSiteVersion } from './scripts/site-version.js'

const readmeMarked = new Marked()
readmeMarked.use({
  renderer: {
    heading({ text, depth }) {
      const plain = text.replace(/<[^>]+>/g, '')
      const id = plain.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-')
      return `<h${depth} id="${id}">${text}</h${depth}>\n`
    },
  },
})

/** Dev-only page at /readme-preview. Repo images load from public/, not GitHub. */
function readmePreviewHtml(root) {
  const markdown = readFileSync(resolve(root, 'README.md'), 'utf8')
    .replaceAll('https://raw.githubusercontent.com/hudsonkit/arc/main/public/', '/')
  const body = readmeMarked.parse(markdown)
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Arc README · local</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; background: #f4f1ea; color: #1c2126; font: 16px/1.6 ui-sans-serif, system-ui, sans-serif; }
  main { max-width: 880px; margin: 0 auto; padding: 28px 24px 96px; }
  .note { margin: 0 0 28px; color: #5c656c; font-size: 13px; }
  h1, h2, h3 { line-height: 1.25; letter-spacing: -0.02em; }
  h1 { font-size: 32px; } h2 { font-size: 24px; margin-top: 2.2em; } h3 { font-size: 18px; }
  a { color: #1d4e89; }
  img { display: block; max-width: 100%; height: auto; margin: 16px 0; }
  p > img, a > img { margin-inline: auto; }
  pre { overflow: auto; padding: 14px 16px; background: #fff; border: 1px solid #e4ddd0; border-radius: 8px; }
  code { font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 0.86em; }
  table { border-collapse: collapse; width: 100%; margin: 16px 0; background: #fff; }
  th, td { border: 1px solid #e4ddd0; padding: 8px 12px; text-align: left; vertical-align: top; }
  blockquote { margin-left: 0; padding-left: 14px; border-left: 3px solid #d9d0c2; color: #3d464c; }
  hr { border: 0; border-top: 1px solid #e4ddd0; }
</style>
</head>
<body>
<main>
<p class="note">Local preview of README.md. Pictures are the files in this checkout. Refresh after you edit.</p>
${body}
</main>
</body>
</html>`
}

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
        name: 'arc-readme-preview',
        apply: 'serve',
        configureServer(server) {
          const root = server.config.root
          server.middlewares.use((req, res, next) => {
            const pathname = (req.url || '/').split('?')[0]
            if (pathname !== '/readme-preview' && pathname !== '/readme-preview/') return next()
            res.setHeader('Content-Type', 'text/html; charset=utf-8')
            res.setHeader('Cache-Control', 'no-store')
            res.end(readmePreviewHtml(root))
          })
        },
      },
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
