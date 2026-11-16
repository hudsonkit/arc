import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import postcss from 'postcss'
import { ARC_ROOT_CLASS as BUILD_ROOT_CLASS, scopeCss, scopeSelector } from './scopeCss.mjs'
import { ARC_ROOT_CLASS, withArcRoot } from '../src/utils/cssScope'

const ROOT = ':where(.arc-root)'
const INSIDE = ':where(.arc-root,.arc-root *)'

/**
 * True when a selector's subject can only be the Arc root or an element in
 * it: the subject compound (after the last top-level combinator) carries one
 * of the two scope forms outside any parentheses or brackets.
 */
function isScoped(selector: string): boolean {
  let depth = 0
  let found = false
  for (let i = 0; i < selector.length; i++) {
    const char = selector[i]
    if (char === '\\') { i++; continue }
    if (depth === 0 && (selector.startsWith(INSIDE, i) || selector.startsWith(ROOT, i))) {
      found = true
      i += (selector.startsWith(INSIDE, i) ? INSIDE : ROOT).length - 1
      continue
    }
    if (char === '(' || char === '[') depth++
    else if (char === ')' || char === ']') depth--
    else if (depth === 0 && /[\s>+~]/.test(char)) found = false
  }
  return found
}

describe('scopeSelector', () => {
  test('the page root as subject becomes the Arc root', () => {
    expect(scopeSelector(':root')).toBe(ROOT)
    expect(scopeSelector(':host')).toBe(ROOT)
    expect(scopeSelector('html')).toBe(ROOT)
    expect(scopeSelector('body')).toBe(ROOT)
    expect(scopeSelector(':root.dark')).toBe(`${ROOT}.dark`)
    // As an ancestor, the page root is left alone: it is still an ancestor.
    expect(scopeSelector('html .x')).toBe(`html .x${INSIDE}`)
    // Not page roots: names that merely start with the same letters.
    expect(scopeSelector('.html')).toBe(`.html${INSIDE}`)
    expect(scopeSelector(':host-context(.x)')).toBe(`:host-context(.x)${INSIDE}`)
  })

  test('the subject must be the root or inside it; ancestors are untouched', () => {
    expect(scopeSelector('*')).toBe(`*${INSIDE}`)
    expect(scopeSelector('button')).toBe(`button${INSIDE}`)
    expect(scopeSelector('[data-hudson-template=hudson][data-hudson-theme=dark]')).toBe(`[data-hudson-template=hudson][data-hudson-theme=dark]${INSIDE}`)
    expect(scopeSelector('[data-hudson-theme=dark] .hud-x')).toBe(`[data-hudson-theme=dark] .hud-x${INSIDE}`)
    expect(scopeSelector('.a > .b + .c ~ .d')).toBe(`.a > .b + .c ~ .d${INSIDE}`)
  })

  test('the scope goes before pseudo-elements, modern and legacy', () => {
    expect(scopeSelector('::backdrop')).toBe(`${INSIDE}::backdrop`)
    expect(scopeSelector(':before')).toBe(`${INSIDE}:before`)
    expect(scopeSelector('.frame-scrollbar::-webkit-scrollbar-thumb:hover')).toBe(`.frame-scrollbar${INSIDE}::-webkit-scrollbar-thumb:hover`)
    expect(scopeSelector('.a input::placeholder')).toBe(`.a input${INSIDE}::placeholder`)
    // A pseudo-class is not a pseudo-element.
    expect(scopeSelector('.a:hover')).toBe(`.a:hover${INSIDE}`)
    expect(scopeSelector(':-moz-focusring')).toBe(`:-moz-focusring${INSIDE}`)
  })

  test('escapes, brackets, strings and functional pseudo-classes stay whole', () => {
    expect(scopeSelector('.w-\\[min\\(44vw\\,720px\\)\\]')).toBe(`.w-\\[min\\(44vw\\,720px\\)\\]${INSIDE}`)
    expect(scopeSelector('.hover\\:bg-accent\\/30:hover')).toBe(`.hover\\:bg-accent\\/30:hover${INSIDE}`)
    expect(scopeSelector('.\\32 xl\\:flex')).toBe(`.\\32 xl\\:flex${INSIDE}`)
    expect(scopeSelector('.group-hover\\:block:is(:where(.group):hover *)')).toBe(`.group-hover\\:block:is(:where(.group):hover *)${INSIDE}`)
    expect(scopeSelector('.x [data-label="a b > c"]')).toBe(`.x [data-label="a b > c"]${INSIDE}`)
    expect(scopeSelector(':where(select:is([multiple],[size])) optgroup')).toBe(`:where(select:is([multiple],[size])) optgroup${INSIDE}`)
    expect(scopeSelector(':where(.space-y-1>:not(:last-child))')).toBe(`:where(.space-y-1>:not(:last-child))${INSIDE}`)
  })

  test('nested selectors are refused rather than mis-scoped', () => {
    expect(() => scopeSelector('& .x')).toThrow()
  })
})

describe('scopeCss', () => {
  test('rules are scoped, keyframes and global at-rules are not', () => {
    const out = scopeCss(':root,:host{--accent:red}@layer base{*,:before{box-sizing:border-box}}@keyframes spin{to{transform:rotate(1turn)}}@property --tw-x{syntax:"*";inherits:false}@media (hover:hover){.a:hover{color:red}}')
    // `:root` and `:host` collapse into one selector.
    expect(out).toContain(`${ROOT}{--accent:red}`)
    expect(out).toContain(`*${INSIDE},${INSIDE}:before{box-sizing:border-box}`)
    expect(out).toContain('@keyframes spin{to{transform:rotate(1turn)}}')
    expect(out).toContain('@property --tw-x{syntax:"*";inherits:false}')
    expect(out).toContain(`.a:hover${INSIDE}{color:red}`)
    expect(out).toMatch(/\/\*! @property registrations are global by nature/)
    expect(out.startsWith('/*! Arc stylesheet.')).toBe(true)
  })

  test('every rule of the real HudsonKit and Arc stylesheets ends up scoped', () => {
    const require = createRequire(import.meta.url)
    const sources = [
      readFileSync(require.resolve('hudsonkit/styles'), 'utf8'),
      readFileSync(require.resolve('hudsonkit/styles/tokens.css'), 'utf8'),
      // Arc's own shipped rules, minus its @import lines (resolved by the build).
      readFileSync(new URL('../src/editor-shell.css', import.meta.url), 'utf8').replace(/^@import[^;]*;/gm, ''),
    ]
    for (const source of sources) {
      const scoped = postcss.parse(scopeCss(source))
      let rules = 0
      scoped.walkRules(rule => {
        if (rule.parent?.type === 'atrule' && /keyframes$/i.test((rule.parent as postcss.AtRule).name)) return
        rules++
        for (const selector of rule.selectors) {
          if (!isScoped(selector)) throw new Error(`unscoped selector: ${selector}`)
        }
      })
      expect(rules).toBeGreaterThan(10)
    }
  })

  test('the build and the components agree on the scope class', () => {
    expect(BUILD_ROOT_CLASS).toBe(ARC_ROOT_CLASS)
    expect(withArcRoot('arc-panel-cube', undefined, 'x')).toBe('arc-root arc-panel-cube x')
  })
})
