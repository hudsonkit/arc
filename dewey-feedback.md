# Dewey Dogfooding Feedback

Captured during Arc documentation setup (2026-01-14)

---

## Requirements for Arc-Quality Docs

These are the features Dewey needs to support production-quality documentation sites.

### 1. Bug Fixes (Critical)

#### 1.1 llms.txt Generator Empty
- **Issue**: `dewey generate` creates llms.txt with headers but no content
- **Expected**: Content should mirror AGENTS.md structure
- **Evidence**: AGENTS.md has content, llms.txt just has `## Overview`, `## Quickstart` headers with nothing under them

#### 1.2 styles.css Not Built
- **Issue**: Package.json declares `@arach/dewey/styles` export but `dist/styles.css` doesn't exist
- **Fix**: Either build the CSS file or remove the export declaration

#### 1.3 Frontmatter Stripping
- **Issue**: MarkdownContent renders raw YAML frontmatter (`---` blocks)
- **Expected**: Automatically strip frontmatter before rendering

### 2. Components Needed

#### 2.1 DocsIndex Component
Card-based landing page for `/docs` root:
```tsx
<DocsIndex
  sections={docsNav}
  onNavigate={(pageId) => navigate(`/docs/${pageId}`)}
/>
```
Features:
- Grouped navigation sections (Getting Started, Reference, etc.)
- Icon per doc page (Lucide icon name)
- Description text for each page
- Card hover effects
- Responsive grid layout

#### 2.2 TableOfContents Component
Right-side minimap/outline:
```tsx
<TableOfContents headings={extractedHeadings} />
```
Features:
- Auto-extraction of `##` and `###` headings from markdown
- Scroll-spy via IntersectionObserver
- Sticky positioning (follows scroll)
- Active heading highlight
- Smooth scroll on click

#### 2.3 Sidebar Component
Left navigation sidebar:
```tsx
<Sidebar
  sections={docsNav}
  currentPage={pageId}
  onNavigate={handleNavigate}
/>
```
Features:
- Grouped nav items with section headers
- Active page indicator (accent color bar)
- Collapsible sections (optional)
- Icon support per item
- Mobile-responsive (hamburger menu)

#### 2.4 AgentCopyButton Component
For LLM/agent documentation pages:
```tsx
<AgentCopyButton content={markdownContent} />
```
Features:
- "Copy for Agent" button with Bot icon
- Copies full markdown content to clipboard
- Visual feedback (checkmark) on successful copy
- Styled to match theme

### 3. Theming & Styling

#### 3.1 Font Configuration
```ts
// dewey.config.ts
theme: {
  fonts: {
    heading: 'system-ui, -apple-system, sans-serif',
    body: 'system-ui, -apple-system, sans-serif',
    mono: 'SF Mono, Consolas, monospace',
  }
}
```
- Support custom font families
- Include sensible defaults
- Apply consistently across all components

#### 3.2 Color Palette Configuration
```ts
// dewey.config.ts
theme: {
  colors: {
    bg: '#f7f3ec',           // Page background
    bgAlt: '#efe9df',        // Card/sidebar background
    text: '#101518',         // Primary text
    textMuted: '#5c676c',    // Secondary text
    border: 'rgba(16,21,24,0.1)',
    accent: '#c97856',       // Links, active states
    accentBg: 'rgba(201,120,86,0.1)',  // Accent backgrounds
  }
}
```

#### 3.3 Built-in Themes
Presets that can be selected:
```ts
theme: 'warm'  // or 'cool', 'dark', 'github'
```
- `warm` - Cream background, terracotta accent (Arc default)
- `cool` - White background, blue accent
- `dark` - Dark background, light text
- `github` - GitHub docs style

#### 3.4 Typography Scale
Consistent sizing for headings:
- h1: 2.5rem, font-weight 700
- h2: 1.75rem, font-weight 600
- h3: 1.25rem, font-weight 600
- body: 1rem, line-height 1.7
- code: 0.9em, background tinted

#### 3.5 Code Block Styling
```ts
theme: {
  codeTheme: 'one-dark'  // or 'github-light', 'dracula'
}
```
- Syntax highlighting theme selection
- Consistent with overall theme (light/dark)
- Copy button on code blocks
- Language label

### 4. Config Enhancements

#### 4.1 Navigation with Icons
```ts
// dewey.config.ts
agent: {
  sections: [
    { id: 'overview', title: 'Overview', icon: 'Lightbulb', description: 'Introduction to the project' },
    { id: 'quickstart', title: 'Quickstart', icon: 'Zap', description: 'Get up and running' },
    { id: 'api', title: 'API Reference', icon: 'FileCode', description: 'Complete API documentation' },
  ]
}
```

#### 4.2 Navigation Grouping
```ts
agent: {
  navigation: [
    {
      title: 'Getting Started',
      items: ['overview', 'quickstart']
    },
    {
      title: 'Reference',
      items: ['api', 'examples']
    },
    {
      title: 'For Agents',
      items: ['llm', 'agents']
    }
  ]
}
```

#### 4.3 Output Location Control
```ts
agent: {
  outputPath: './docs'  // Default: project root
}
```
- Option to output AGENTS.md, llms.txt, docs.json to docs/ folder
- Needed for serving at `/docs/llms.txt` route

### 5. CLI Improvements

#### 5.1 Verbose Audit Mode
```bash
dewey audit --verbose
```
Shows what's missing to reach max score per file.

#### 5.2 Config Validation
Warn on common issues:
- Empty `criticalContext` array
- Empty `entryPoints` object
- Missing required docs files

#### 5.3 Watch Mode
```bash
dewey audit --watch
```
Live feedback while writing documentation.

### 6. Layout Components

#### 6.1 DocsLayout
Full page layout wrapper:
```tsx
<DocsLayout
  sidebar={<Sidebar />}
  toc={<TableOfContents />}
  header={<DocsHeader />}
>
  {children}
</DocsLayout>
```
- Three-column layout (sidebar | content | TOC)
- Responsive breakpoints
- Sticky header option

#### 6.2 Responsive Behavior
- Desktop: Full three-column layout
- Tablet: Collapsible sidebar, hidden TOC
- Mobile: Hamburger menu, no TOC

---

## How Dewey Should Expose This

The goal: **Zero custom components needed**. Consumers configure `dewey.config.ts` and import ready-to-use components.

### Consumer Experience (What Arc Should Do)

```tsx
// src/components/docs/Docs.tsx
import { DocsApp } from '@arach/dewey/react'
import config from '../../../dewey.config'

// Import markdown files
import overview from '../../../docs/overview.md?raw'
import quickstart from '../../../docs/quickstart.md?raw'
import api from '../../../docs/api.md?raw'

const docs = { overview, quickstart, api }

export default function Docs() {
  return <DocsApp config={config} docs={docs} />
}
```

That's it. Everything else comes from config.

### dewey.config.ts (Full Example)

```ts
import { defineConfig } from '@arach/dewey'

export default defineConfig({
  project: {
    name: 'arc',
    tagline: 'Diagrams as Code',
    logo: '/logo.svg',  // optional
  },

  // Theme configuration
  theme: {
    preset: 'warm',  // 'warm' | 'cool' | 'dark' | 'github'
    // Or custom colors:
    colors: {
      bg: '#f7f3ec',
      bgAlt: '#efe9df',
      text: '#101518',
      textMuted: '#5c676c',
      accent: '#c97856',
      accentBg: 'rgba(201,120,86,0.1)',
      border: 'rgba(16,21,24,0.1)',
    },
    fonts: {
      heading: 'system-ui, -apple-system, sans-serif',
      body: 'system-ui, -apple-system, sans-serif',
      mono: 'SF Mono, Menlo, monospace',
    },
    codeTheme: 'one-dark',  // syntax highlighting
  },

  // Navigation structure
  navigation: [
    {
      title: 'Getting Started',
      items: [
        { id: 'overview', title: 'Overview', icon: 'Lightbulb', description: 'Introduction to Arc' },
        { id: 'quickstart', title: 'Quickstart', icon: 'Zap', description: 'Get up and running in 5 minutes' },
      ]
    },
    {
      title: 'Reference',
      items: [
        { id: 'api', title: 'API Reference', icon: 'FileCode', description: 'Complete API documentation' },
        { id: 'examples', title: 'Examples', icon: 'Boxes', description: 'Code examples and patterns' },
      ]
    },
    {
      title: 'For Agents',
      items: [
        { id: 'llm', title: 'LLM Context', icon: 'Bot', description: 'Full context for AI assistants' },
      ]
    },
  ],

  // Layout options
  layout: {
    sidebar: true,           // Show left sidebar
    toc: true,               // Show right TOC
    tocDepth: 3,             // h2 and h3
    header: true,            // Show top header
    footer: true,            // Show footer
    maxWidth: '1400px',      // Content max width
  },

  // Agent documentation
  agent: {
    outputPath: './docs',    // Where to output AGENTS.md, llms.txt, docs.json
    criticalContext: [
      'Arc exports @hudsonkit/arc, @hudsonkit/arc-viewer, and @hudsonkit/arc-iso npm packages',
      'Diagrams are declarative JSON configs',
    ],
    entryPoints: {
      'editor': 'src/components/editor/',
      'iso': 'src/iso/',
    },
  },

  // Docs source
  docs: {
    path: './docs',
    required: ['overview', 'quickstart', 'api'],
    optional: ['examples', 'architecture', 'contributing'],
  },
})
```

### Dewey Package Exports

```ts
// @arach/dewey - main exports
export { defineConfig } from './config'
export type { DeweyConfig } from './types'

// @arach/dewey/react - React components
export { DocsApp } from './components/DocsApp'           // Full app with routing
export { DocsLayout } from './components/DocsLayout'     // Layout wrapper
export { DocsIndex } from './components/DocsIndex'       // Card-based index
export { Sidebar } from './components/Sidebar'           // Left nav
export { TableOfContents } from './components/TableOfContents'  // Right TOC
export { MarkdownContent } from './components/MarkdownContent'  // MD renderer
export { CodeBlock } from './components/CodeBlock'       // Syntax highlighted
export { AgentCopyButton } from './components/AgentCopyButton'  // Copy for LLM

// @arach/dewey/styles - CSS (must be built!)
// Consumer imports: import '@arach/dewey/styles'
```

### DocsApp Component (What Dewey Builds)

```tsx
// Inside @arach/dewey/react
export function DocsApp({ config, docs }: DocsAppProps) {
  const theme = resolveTheme(config.theme)
  const nav = config.navigation

  return (
    <ThemeProvider theme={theme}>
      <Routes>
        <Route path="/docs" element={
          <DocsLayout config={config}>
            <DocsIndex sections={nav} />
          </DocsLayout>
        } />
        <Route path="/docs/:pageId" element={
          <DocsLayout config={config}>
            <DocPage docs={docs} nav={nav} />
          </DocsLayout>
        } />
      </Routes>
    </ThemeProvider>
  )
}
```

### Theme Resolution

Dewey should resolve themes like this:

```ts
function resolveTheme(themeConfig: ThemeConfig): ResolvedTheme {
  // If preset name, load built-in theme
  if (typeof themeConfig === 'string') {
    return BUILT_IN_THEMES[themeConfig]
  }

  // If has preset + overrides, merge them
  if (themeConfig.preset) {
    return {
      ...BUILT_IN_THEMES[themeConfig.preset],
      ...themeConfig.colors,
      fonts: { ...BUILT_IN_THEMES[themeConfig.preset].fonts, ...themeConfig.fonts },
    }
  }

  // Fully custom
  return themeConfig
}
```

### Built-in Themes

```ts
const BUILT_IN_THEMES = {
  warm: {
    colors: {
      bg: '#f7f3ec',
      bgAlt: '#efe9df',
      text: '#101518',
      textMuted: '#5c676c',
      accent: '#c97856',
      accentBg: 'rgba(201,120,86,0.1)',
      border: 'rgba(16,21,24,0.1)',
    },
    fonts: {
      heading: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
      body: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
      mono: 'SF Mono, Menlo, Monaco, Consolas, monospace',
    },
  },
  cool: {
    colors: {
      bg: '#ffffff',
      bgAlt: '#f6f8fa',
      text: '#1f2937',
      textMuted: '#6b7280',
      accent: '#3b82f6',
      accentBg: 'rgba(59,130,246,0.1)',
      border: 'rgba(0,0,0,0.1)',
    },
    // ...
  },
  dark: {
    colors: {
      bg: '#0d1117',
      bgAlt: '#161b22',
      text: '#f0f6fc',
      textMuted: '#8b949e',
      accent: '#58a6ff',
      accentBg: 'rgba(88,166,255,0.1)',
      border: 'rgba(240,246,252,0.1)',
    },
    // ...
  },
}
```

---

## Summary: What Dewey Must Build

1. **Bug fixes**: llms.txt content, styles.css export, frontmatter stripping
2. **DocsApp**: Single component that handles routing, layout, theming
3. **Theme system**: Presets + custom colors/fonts via config
4. **Navigation config**: Icons, descriptions, grouping - all from config
5. **Layout components**: Sidebar, TOC, DocsIndex - all themeable
6. **Zero custom code**: Consumer just passes config + markdown imports

The goal is Arc's `Docs.tsx` being ~10 lines, not 500.

---

## First-Run Experience

### Pain Points

1. **pnpm script not set up** - Had to find and run CLI via `node ./dist/cli/index.js`
   - Expected: `pnpm dewey audit`
   - Reality: CLI binary not linked in monorepo context
   - Suggestion: Add a root-level script or document how to run locally

2. **Build required first** - Had to run `pnpm install && pnpm build` before CLI worked
   - TS compilation errors appeared when node_modules was missing
   - Suggestion: Better error message like "Run pnpm install first"

3. **Config type import incorrect** - `@dewey/cli` doesn't exist anymore
   ```ts
   /** @type {import('@dewey/cli').DeweyConfig} */  // Wrong
   /** @type {import('@arach/dewey').DeweyConfig} */ // Should be this
   ```

### Good Parts

- `dewey init` worked smoothly and created sensible stubs
- Audit feedback was clear and actionable
- Generate output (AGENTS.md, llms.txt, docs.json) is comprehensive
- Score system motivates completion (69 → 88 felt rewarding)

## Feature Suggestions

1. **Verbose audit mode** - Show what's missing in each file to reach 40/40
2. **Config validation** - Warn if `criticalContext` or `entryPoints` are empty
3. **Watch mode** - `dewey audit --watch` for live feedback while writing docs
4. **Merge existing docs** - Detect existing content and merge rather than overwrite

## Generated Output Feedback

### AGENTS.md
- Entry point table has empty "Purpose" column - should pull from comments or infer
- Good critical context section
- Navigation rules are helpful

### llms.txt
- **BUG**: Content is empty - sections are created but doc content not included
- Just has headers: `## Overview`, `## Quickstart`, etc. with nothing under them
- AGENTS.md correctly includes content, but llms.txt doesn't
- This is a generator bug - llms.txt should mirror AGENTS.md content structure
- Format unclear - is this for RAG? What's the target consumer?

### docs.json
- Good structured format
- Could include file modification dates for cache invalidation

## Output Location Issues

- Agent files (AGENTS.md, llms.txt, docs.json) go to root, not docs/
- If serving docs at `/docs/*`, need `docs/llms.txt` for `/docs/llms.txt` route
- No agent-specific content in docs/ folder at all
- Suggestion: Output to `docs/` by default, or add `agents/` subfolder

## Build Issues

- **BUG**: `@arach/dewey/styles` export declared in package.json but `dist/styles.css` doesn't exist
- Build script doesn't generate CSS file
- Components seem to use inline styles so it may work without, but export shouldn't be declared if it doesn't exist

## Questions for Dewey

1. What's the intended relationship between CLAUDE.md and AGENTS.md?
2. Should dewey.config.ts be committed or gitignored?
3. How do criticalContext rules differ from entryPoints?
4. Where should agent files live - root or docs/?
