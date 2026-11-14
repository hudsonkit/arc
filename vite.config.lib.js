import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import dts from 'vite-plugin-dts'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import { copyFileSync } from 'node:fs'
import { scopeCssPlugin } from './scripts/scopeCss.mjs'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

// Entry name -> declaration name. `index` is the React library (lib/arc.*.js, lib/index.d.ts);
// `validate` is the React-free validator behind `@hudsonkit/arc/validate`.
const ENTRIES = {
  index: 'src/index.ts',
  validate: 'src/validate.ts',
}

export default defineConfig({
  plugins: [
    react(),
    // Scope lib/arc.css to Arc's root element so a host page can load it
    // without restyling itself. See scripts/scopeCss.mjs.
    scopeCssPlugin(),
    dts({
      // Must cover every source file reachable from src/index.ts (components,
      // utils, iso, editor) — otherwise api-extractor can't inline their types
      // and leaves dangling source-relative imports in the rolled-up index.d.ts.
      include: ['src'],
      outDir: 'lib',
      rollupTypes: true,
      // Motion is bundled into runtime JS; inline its overlay value types too
      // so consumers only need Arc's existing React peer dependencies.
      bundledPackages: ['motion', 'framer-motion', 'motion-dom', 'motion-utils'],
      afterBuild() {
        for (const name of ['index', 'validate']) {
          copyFileSync(resolve(__dirname, `lib/${name}.d.ts`), resolve(__dirname, `lib/${name}.d.cts`))
        }
      },
    }),
  ],
  build: {
    lib: {
      entry: Object.fromEntries(Object.entries(ENTRIES).map(([name, file]) => [name, resolve(__dirname, file)])),
      name: 'Arc',
      // CJS keeps optional editor imports lazy; UMD inlines and eagerly runs them.
      formats: ['es', 'cjs'],
      fileName: (format, entryName) => entryName === 'index'
        ? (format === 'cjs' ? 'arc.cjs' : `arc.${format}.js`)
        : (format === 'cjs' ? `${entryName}.cjs` : `${entryName}.js`),
      cssFileName: 'arc',
    },
    rollupOptions: {
      // Externalize React - users provide their own
      external: ['react', 'react-dom', 'react/jsx-runtime'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          'react/jsx-runtime': 'ReactJSXRuntime',
        },
        // Preserve CSS imports
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === 'style.css') return 'style.css'
          return assetInfo.name
        },
      },
    },
    outDir: 'lib',
    emptyOutDir: true,
    minify: 'esbuild',
    cssCodeSplit: false,
  },
})
