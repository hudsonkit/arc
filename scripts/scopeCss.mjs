// Scope Arc's published stylesheet to Arc's own root element.
//
// `lib/arc.css` bundles HudsonKit's compiled Tailwind (preflight, utilities,
// shadcn tokens on `:root`, HudsonKit templates on `[data-hudson-template]`)
// plus Arc's own rules. Loaded into a host page unchanged, it restyles the
// host: the host's `--accent` or `[data-hudson-theme]` would take Arc's values.
//
// Every style rule is rewritten so its subject (the element it styles) must be
// an element carrying ARC_ROOT_CLASS, which every Arc component root renders,
// or one inside it:
//
//   :root, :host, html, body  ->  :where(.arc-root)
//   A B                       ->  A B:where(.arc-root,.arc-root *)
//   A B::before               ->  A B:where(.arc-root,.arc-root *)::before
//
// Ancestors in a selector (`A`) are left alone, so `.dark .x` or `.group:hover
// .x` still respond to an ancestor wherever it is, as before. `:where()` adds
// no specificity, so every rule keeps the specificity it had and the cascade
// inside Arc is unchanged.
//
// At-rules that are global by nature are left alone: `@property` registers a
// custom property for the whole document, and `@keyframes`, `@font-face` and
// `@layer` names are document-wide too.

import postcss from 'postcss'

export const ARC_ROOT_CLASS = 'arc-root'

const PAGE_ROOT = /^(?::root|:host(?:\([^)]*\))?|html|body)(?![\w-])/i
const LEGACY_PSEUDO_ELEMENT = /^:(?:before|after|first-line|first-letter)(?![\w-])/i

/**
 * Locate the subject compound (the last one) and, within it, where its
 * pseudo-element starts, if it has one. Escapes, strings, brackets and
 * parentheses are skipped, so Tailwind names like `.w-\[min\(44vw\,720px\)\]`
 * and `:is(:where(.group):hover *)` stay whole.
 */
function subjectCompound(selector) {
  let depth = 0
  let quote = null
  let start = 0
  let pseudoElement = -1
  for (let i = 0; i < selector.length; i++) {
    const char = selector[i]
    if (char === '\\') {
      // A hex escape is up to six hex digits plus one optional whitespace
      // terminator (Tailwind writes `.\32 xl\:flex`); any other escape is one character.
      const hex = /^[0-9a-f]{1,6}\s?/i.exec(selector.slice(i + 1))
      i += hex ? hex[0].length : 1
      continue
    }
    if (quote) { if (char === quote) quote = null; continue }
    if (char === '"' || char === "'") { quote = char; continue }
    if (char === '(' || char === '[') { depth++; continue }
    if (char === ')' || char === ']') { depth--; continue }
    if (depth > 0) continue
    if (char === '&') throw new Error(`scopeCss: nested selector "${selector}" is not supported`)
    if (/[\s>+~]/.test(char)) {
      start = i + 1
      pseudoElement = -1
      continue
    }
    if (char === ':' && pseudoElement < 0) {
      if (selector[i + 1] === ':' || LEGACY_PSEUDO_ELEMENT.test(selector.slice(i))) pseudoElement = i
    }
  }
  return { start, pseudoElement: pseudoElement < 0 ? selector.length : pseudoElement }
}

/** Rewrite one complex selector so it only matches the Arc root or inside it. */
export function scopeSelector(selector, rootClass = ARC_ROOT_CLASS) {
  const trimmed = selector.trim()
  const { start, pseudoElement } = subjectCompound(trimmed)
  const subject = trimmed.slice(start)
  const pageRoot = subject.match(PAGE_ROOT)
  // The page root as subject (`:root`, `html.dark`) becomes the Arc root.
  if (pageRoot) return `${trimmed.slice(0, start)}:where(.${rootClass})${subject.slice(pageRoot[0].length)}`
  return `${trimmed.slice(0, pseudoElement)}:where(.${rootClass},.${rootClass} *)${trimmed.slice(pseudoElement)}`
}

function insideKeyframes(node) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.type === 'atrule' && /keyframes$/i.test(parent.name)) return true
  }
  return false
}

/** Scope every style rule in a stylesheet to `.${rootClass}`. */
export function scopeCss(css, { rootClass = ARC_ROOT_CLASS } = {}) {
  const root = postcss.parse(css)
  root.walkRules(rule => {
    if (insideKeyframes(rule)) return
    rule.selectors = [...new Set(rule.selectors.map(selector => scopeSelector(selector, rootClass)))]
  })
  let noted = false
  root.walkAtRules('property', rule => {
    if (noted) return
    noted = true
    rule.before(legalComment('@property registrations are global by nature: they register Tailwind\'s --tw-* properties for the whole document, as a host\'s own Tailwind does, and cannot be scoped.'))
  })
  root.prepend(legalComment(`Arc stylesheet. Every rule is scoped to .${rootClass}, the class on each Arc component's root element, so loading it does not restyle the host page.`))
  return root.toString()
}

/** A `/*! ... *\/` comment, which minifiers keep. */
function legalComment(text) {
  return postcss.comment({ text: `! ${text}`, raws: { left: '', right: ' ' } })
}

/** Vite plugin: scope the emitted CSS assets after minification. */
export function scopeCssPlugin(options = {}) {
  return {
    name: 'arc-scope-css',
    enforce: 'post',
    generateBundle(_options, bundle) {
      for (const asset of Object.values(bundle)) {
        if (asset.type !== 'asset' || !asset.fileName.endsWith('.css')) continue
        const source = typeof asset.source === 'string' ? asset.source : new TextDecoder().decode(asset.source)
        asset.source = scopeCss(source, options)
      }
    },
  }
}
