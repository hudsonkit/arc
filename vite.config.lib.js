import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import dts from 'vite-plugin-dts'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import { copyFileSync } from 'node:fs'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [
    react(),
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
        copyFileSync(resolve(__dirname, 'lib/index.d.ts'), resolve(__dirname, 'lib/index.d.cts'))
      },
    }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'Arc',
      // CJS keeps optional editor imports lazy; UMD inlines and eagerly runs them.
      formats: ['es', 'cjs'],
      fileName: (format) => format === 'cjs' ? 'arc.cjs' : `arc.${format}.js`,
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
