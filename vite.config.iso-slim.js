import { copyFileSync } from 'node:fs'
import dts from 'vite-plugin-dts'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [
    react(),
    dts({
      include: ['src/iso/index.slim.ts', 'src/iso/types.ts'],
      outDir: 'dist-iso-slim',
      rollupTypes: true,
      afterBuild() {
        copyFileSync(resolve(__dirname, 'dist-iso-slim/index.d.ts'), resolve(__dirname, 'dist-iso/index.slim.d.ts'))
        copyFileSync(resolve(__dirname, 'dist-iso-slim/index.d.ts'), resolve(__dirname, 'dist-iso/index.slim.d.cts'))
      },
    }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/iso/index.slim.ts'),
      name: 'ArcIso',
      formats: ['es', 'cjs', 'umd'],
      fileName: (format) => format === 'cjs' ? 'arc-iso-slim.cjs' : `arc-iso-slim.${format}.js`,
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          'react/jsx-runtime': 'ReactJSXRuntime',
        },
      },
    },
    outDir: 'dist-iso',
    emptyOutDir: false,
    minify: 'esbuild',
  },
})
