import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // Build output and vendored bundles. Without these the run reports hundreds
  // of "errors" in minified code and drowns anything real.
  globalIgnores([
    'dist',
    'dist-*',
    'ext',
    'bin/arc.mjs',
    'lib',
    'packages',
    'ds-bundle',
    'docs-backup',
    'public',
    '.claude',
  ]),
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      // The diagram model is deliberately loose in the editor's older layers;
      // tightening it is a refactor, not a lint fix.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',

      // Advisory, not correctness — kept visible as warnings so a real error
      // in a run still stands out.
      //   only-export-components  HMR granularity; the context files export
      //                           their hooks alongside the provider by design
      //   set-state-in-effect     several are deliberate (measure-then-correct,
      //                           staged animation)
      //   static-components       the icon registry returns stable references,
      //                           which the rule cannot see
      //   refs                    portal containers are read after mount
      'react-refresh/only-export-components': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/refs': 'warn',
    },
  },
  // Node-side tooling: build plugins, scripts, the CLI.
  {
    files: ['plugins/**/*.js', 'scripts/**/*.{js,mjs}', 'bin/**/*.mjs', '*.config.js', '*.config.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
])
