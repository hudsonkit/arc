import React, { useState, useEffect, useRef } from 'react'
import ReactDOM from 'react-dom'
import { Link } from 'react-router-dom'
import { Book, Menu, Bot, Download, Sparkles } from 'lucide-react'
import {
  DeweyProvider,
  Header,
  DocsIndex,
  Sidebar,
  MarkdownContent,
  CopyButtons,
  PromptSlideout,
  extractTocItems,
  useActiveSection,
  type PageNode,
  type PromptParam,
} from '@arach/dewey'
import { ArcDiagram, type ArcDiagramData } from '@hudsonkit/arc'
import { SITE_URL } from '../../utils/site'
import { useMeta } from '../../hooks/useMeta'
import RenderShowcase from './RenderShowcase'
import Showcase from './Showcase'

// ============================================
// CodePreviewToggle - Tabbed code/preview component
// Replaces code blocks with a toggle between source and rendered diagram
// ============================================

function parseDiagramFromCode(codeText: string): ArcDiagramData | null {
  try {
    let jsonText = codeText.trim()

    // If it starts with const/let/var, extract the object (handle TypeScript type annotations)
    const assignmentMatch = jsonText.match(/(?:const|let|var)\s+\w+(?::\s*[\w<>[\]]+)?\s*=\s*(\{[\s\S]*\})/)
    if (assignmentMatch) {
      jsonText = assignmentMatch[1]
    }

    // Convert JS object literal to valid JSON
    const normalizedJson = jsonText
      .replace(/'/g, '"')
      .replace(/,(\s*[}\]])/g, '$1')
      .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3')

    const parsed = JSON.parse(normalizedJson)

    // Check if it has Arc diagram structure
    if (!parsed.layout || !parsed.nodes || !parsed.nodeData) {
      return null
    }

    // Validate it's a real diagram, not a template/example
    const nodeIds = Object.keys(parsed.nodes)
    const nodeDataIds = Object.keys(parsed.nodeData)

    // Must have at least one real node
    if (nodeIds.length === 0) return null

    // Node IDs must match between nodes and nodeData
    if (!nodeIds.every(id => nodeDataIds.includes(id))) return null

    // Check for valid sizes (reject "large", "medium", etc.)
    const validSizes = ['xs', 's', 'm', 'l']
    for (const node of Object.values(parsed.nodes) as Array<{ size?: string }>) {
      if (node.size && !validSizes.includes(node.size)) {
        return null
      }
    }

    // Check nodeData has real values (reject placeholders like "...")
    for (const data of Object.values(parsed.nodeData) as Array<{ name?: string; icon?: string }>) {
      if (!data.name || data.name === '...' || !data.icon) {
        return null
      }
    }

    return parsed as ArcDiagramData
  } catch {
    // Not a valid diagram
  }
  return null
}

interface CodePreviewToggleProps {
  diagram: ArcDiagramData
  codeHtml: string // Preserve Dewey's syntax highlighting
}

function CodePreviewToggle({ diagram, codeHtml }: CodePreviewToggleProps) {
  const [view, setView] = useState<'code' | 'preview'>('code')

  return (
    <div
      style={{
        borderRadius: '0.5rem',
        overflow: 'hidden',
        border: '1px solid rgba(16, 21, 24, 0.08)',
        background: '#1e1e1e',
      }}
    >
      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0',
          padding: '0.5rem 0.75rem',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          background: '#252526',
        }}
      >
        <button
          onClick={() => setView('code')}
          style={{
            padding: '0.375rem 0.75rem',
            fontSize: '0.8125rem',
            fontWeight: 500,
            border: 'none',
            background: view === 'code' ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
            color: view === 'code' ? '#fff' : 'rgba(255, 255, 255, 0.5)',
            cursor: 'pointer',
            borderRadius: '0.25rem 0 0 0.25rem',
            transition: 'all 0.15s ease',
          }}
        >
          Code
        </button>
        <button
          onClick={() => setView('preview')}
          style={{
            padding: '0.375rem 0.75rem',
            fontSize: '0.8125rem',
            fontWeight: 500,
            border: 'none',
            background: view === 'preview' ? '#2e5fa5' : 'transparent',
            color: view === 'preview' ? '#fff' : 'rgba(255, 255, 255, 0.5)',
            cursor: 'pointer',
            borderRadius: '0 0.25rem 0.25rem 0',
            transition: 'all 0.15s ease',
          }}
        >
          Preview
        </button>
      </div>

      {/* Content */}
      {view === 'code' ? (
        <div
          style={{ margin: 0 }}
          dangerouslySetInnerHTML={{ __html: codeHtml }}
        />
      ) : (
        <div
          style={{
            padding: '1.5rem',
            background: '#fff',
          }}
        >
          <ArcDiagram data={diagram} mode="light" theme="cool" interactive={false} defaultZoom="fit" />
        </div>
      )}
    </div>
  )
}

interface DiagramCodeBlock {
  id: string
  diagram: ArcDiagramData
  code: string
  codeHtml: string
}

function useDiagramCodeBlocks(containerRef: React.RefObject<HTMLDivElement | null>, pageId: string) {
  const [blocks, setBlocks] = useState<DiagramCodeBlock[]>([])

  useEffect(() => {
    if (!containerRef.current) return

    // Small delay to ensure markdown is rendered
    const timer: ReturnType<typeof setTimeout> = setTimeout(() => {
      const found: DiagramCodeBlock[] = []

      // Find all code blocks (Dewey wraps them in .dw-code-block or just pre)
      const codeBlocks = containerRef.current!.querySelectorAll('pre code')

      codeBlocks.forEach((codeEl, index) => {
        const codeText = codeEl.textContent || ''
        const diagram = parseDiagramFromCode(codeText)

        if (diagram) {
          // Get the full code block wrapper (Dewey's .dw-code-block or the pre element)
          const wrapper = codeEl.closest('.dw-code-block') || codeEl.closest('pre')?.parentElement || codeEl.parentElement
          if (!wrapper) return

          // Get the pre element's innerHTML for syntax highlighting
          const preElement = wrapper.querySelector('pre')
          const codeHtml = preElement ? preElement.outerHTML : `<pre><code>${codeText}</code></pre>`

          // Create a container div to hold our component
          const containerId = `${pageId}-toggle-${index}`
          let container = wrapper.parentElement?.querySelector(`[data-toggle-container="${containerId}"]`) as HTMLElement

          if (!container) {
            container = document.createElement('div')
            container.setAttribute('data-toggle-container', containerId)
            wrapper.parentElement?.insertBefore(container, wrapper)
            // Hide the original code block
            ;(wrapper as HTMLElement).style.display = 'none'
          }

          found.push({
            id: containerId,
            diagram,
            code: codeText,
            codeHtml,
          })
        }
      })

      setBlocks(found)
    }, 100)

    return () => {
      clearTimeout(timer)
      // Cleanup: show original code blocks again
      const containers = containerRef.current?.querySelectorAll('[data-toggle-container]')
      containers?.forEach((container) => {
        const nextSibling = container.nextElementSibling
        if (nextSibling && (nextSibling as HTMLElement).style.display === 'none') {
          ;(nextSibling as HTMLElement).style.display = ''
        }
        container.remove()
      })
    }
  }, [containerRef, pageId])

  return blocks
}

// Renders CodePreviewToggle components using portals
function DiagramTogglePortals({ blocks, containerRef }: { blocks: DiagramCodeBlock[], containerRef: React.RefObject<HTMLDivElement | null> }) {
  return (
    <>
      {blocks.map(({ id, diagram, codeHtml }) => {
        const container = containerRef.current?.querySelector(`[data-toggle-container="${id}"]`)
        if (!container) return null
        return ReactDOM.createPortal(
          <CodePreviewToggle diagram={diagram} codeHtml={codeHtml} />,
          container,
          id
        )
      })}
    </>
  )
}


// Page-specific diagrams for docs - showcasing Arc's full capabilities
const docsDiagrams: Record<string, ArcDiagramData> = {
  // Overview: Comprehensive microservices example showing all features
  overview: {
    id: 'DOCS.OVERVIEW',
    layout: { width: 850, height: 340 },
    nodes: {
      client: { x: 40, y: 130, size: 'm' },
      gateway: { x: 220, y: 130, size: 'l' },
      auth: { x: 460, y: 40, size: 'm' },
      api: { x: 460, y: 140, size: 'm' },
      cache: { x: 460, y: 240, size: 's' },
      db: { x: 680, y: 140, size: 'm' },
    },
    nodeData: {
      client: { icon: 'Monitor', name: 'Client', subtitle: 'React App', color: 'violet' },
      gateway: { icon: 'Server', name: 'API Gateway', subtitle: 'Express', description: 'Load balanced', color: 'emerald' },
      auth: { icon: 'Shield', name: 'Auth', subtitle: 'JWT', color: 'amber' },
      api: { icon: 'Code', name: 'API', subtitle: 'REST', color: 'blue' },
      cache: { icon: 'Zap', name: 'Cache', color: 'sky' },
      db: { icon: 'Database', name: 'PostgreSQL', subtitle: 'Primary', color: 'blue' },
    },
    connectors: [
      { from: 'client', to: 'gateway', fromAnchor: 'right', toAnchor: 'left', style: 'https' },
      { from: 'gateway', to: 'auth', fromAnchor: 'right', toAnchor: 'left', style: 'internal' },
      { from: 'gateway', to: 'api', fromAnchor: 'right', toAnchor: 'left', style: 'internal' },
      { from: 'gateway', to: 'cache', fromAnchor: 'bottomRight', toAnchor: 'left', style: 'cache' },
      { from: 'api', to: 'db', fromAnchor: 'right', toAnchor: 'left', style: 'sql' },
    ],
    connectorStyles: {
      https: { color: 'violet', strokeWidth: 2, label: 'HTTPS' },
      internal: { color: 'emerald', strokeWidth: 2 },
      cache: { color: 'sky', strokeWidth: 1, dashed: true },
      sql: { color: 'blue', strokeWidth: 2, label: 'SQL' },
    },
  },

  // Quickstart: Clean 3-tier example
  quickstart: {
    id: 'DOCS.QUICKSTART',
    layout: { width: 700, height: 260 },
    nodes: {
      frontend: { x: 50, y: 90, size: 'm' },
      backend: { x: 280, y: 90, size: 'l' },
      database: { x: 530, y: 90, size: 'm' },
    },
    nodeData: {
      frontend: { icon: 'Monitor', name: 'Frontend', subtitle: 'React', color: 'violet' },
      backend: { icon: 'Server', name: 'Backend', subtitle: 'Node.js', description: 'REST API', color: 'emerald' },
      database: { icon: 'Database', name: 'Database', subtitle: 'PostgreSQL', color: 'blue' },
    },
    connectors: [
      { from: 'frontend', to: 'backend', fromAnchor: 'right', toAnchor: 'left', style: 'api' },
      { from: 'backend', to: 'database', fromAnchor: 'right', toAnchor: 'left', style: 'query' },
    ],
    connectorStyles: {
      api: { color: 'violet', strokeWidth: 2, label: 'REST' },
      query: { color: 'blue', strokeWidth: 2, label: 'SQL' },
    },
  },

  // Diagram Format: Shows all JSON properties with labels
  'diagram-format': {
    id: 'DOCS.FORMAT',
    layout: { width: 800, height: 320 },
    nodes: {
      small: { x: 40, y: 130, size: 's' },
      medium: { x: 180, y: 120, size: 'm' },
      large: { x: 380, y: 100, size: 'l' },
      another: { x: 620, y: 120, size: 'm' },
    },
    nodeData: {
      small: { icon: 'Zap', name: 'Small (s)', color: 'sky' },
      medium: { icon: 'Box', name: 'Medium (m)', subtitle: 'With subtitle', color: 'amber' },
      large: { icon: 'Server', name: 'Large (l)', subtitle: 'Has subtitle', description: 'And description', color: 'violet' },
      another: { icon: 'Database', name: 'Node', subtitle: 'PostgreSQL', color: 'blue' },
    },
    connectors: [
      { from: 'small', to: 'medium', fromAnchor: 'right', toAnchor: 'left', style: 'dashed' },
      { from: 'medium', to: 'large', fromAnchor: 'right', toAnchor: 'left', style: 'labeled' },
      { from: 'large', to: 'another', fromAnchor: 'right', toAnchor: 'left', style: 'thick' },
    ],
    connectorStyles: {
      dashed: { color: 'sky', strokeWidth: 1, dashed: true },
      labeled: { color: 'amber', strokeWidth: 2, label: 'Labeled' },
      thick: { color: 'violet', strokeWidth: 3, label: 'Thick' },
    },
  },

  // Architecture: Arc's own architecture - improved
  architecture: {
    id: 'ARC.ARCH',
    layout: { width: 800, height: 320 },
    nodes: {
      editor: { x: 40, y: 110, size: 'l' },
      json: { x: 290, y: 40, size: 'm' },
      player: { x: 290, y: 200, size: 'm' },
      docs: { x: 540, y: 40, size: 'm' },
      landing: { x: 540, y: 200, size: 'm' },
    },
    nodeData: {
      editor: { icon: 'PenTool', name: 'Arc Editor', subtitle: 'Visual editing', description: 'Drag & drop', color: 'violet' },
      json: { icon: 'FileJson', name: 'JSON Config', subtitle: 'Portable', color: 'amber' },
      player: { icon: 'Play', name: 'ArcDiagram', subtitle: 'React component', color: 'emerald' },
      docs: { icon: 'BookOpen', name: 'Documentation', subtitle: 'Any framework', color: 'sky' },
      landing: { icon: 'Globe', name: 'Landing Pages', subtitle: 'Marketing sites', color: 'blue' },
    },
    connectors: [
      { from: 'editor', to: 'json', fromAnchor: 'right', toAnchor: 'left', style: 'export' },
      { from: 'json', to: 'player', fromAnchor: 'bottom', toAnchor: 'top', style: 'import' },
      { from: 'player', to: 'docs', fromAnchor: 'right', toAnchor: 'left', style: 'render' },
      { from: 'player', to: 'landing', fromAnchor: 'right', toAnchor: 'left', style: 'render' },
    ],
    connectorStyles: {
      export: { color: 'amber', strokeWidth: 2, label: 'Export' },
      import: { color: 'emerald', strokeWidth: 2, label: 'Import' },
      render: { color: 'sky', strokeWidth: 2 },
    },
  },

  // Templates: Show all 4 sizes in a hierarchy
  templates: {
    id: 'DOCS.TEMPLATES',
    layout: { width: 850, height: 340 },
    nodes: {
      xs1: { x: 40, y: 60, size: 'xs' },
      xs2: { x: 40, y: 120, size: 'xs' },
      xs3: { x: 40, y: 180, size: 'xs' },
      small: { x: 160, y: 90, size: 's' },
      small2: { x: 160, y: 180, size: 's' },
      medium: { x: 320, y: 130, size: 'm' },
      large: { x: 520, y: 110, size: 'l' },
      output: { x: 760, y: 130, size: 'm' },
    },
    nodeData: {
      xs1: { icon: 'Circle', name: 'xs', color: 'zinc' },
      xs2: { icon: 'Circle', name: 'xs', color: 'zinc' },
      xs3: { icon: 'Circle', name: 'xs', color: 'zinc' },
      small: { icon: 'Box', name: 'Small', color: 'sky' },
      small2: { icon: 'Box', name: 'Small', color: 'sky' },
      medium: { icon: 'Layers', name: 'Medium', subtitle: 'Services', color: 'amber' },
      large: { icon: 'Server', name: 'Large', subtitle: 'Primary', description: 'Main component', color: 'violet' },
      output: { icon: 'Package', name: 'Output', subtitle: 'Result', color: 'emerald' },
    },
    connectors: [
      { from: 'xs1', to: 'small', fromAnchor: 'right', toAnchor: 'left', style: 'thin' },
      { from: 'xs2', to: 'small', fromAnchor: 'right', toAnchor: 'left', style: 'thin' },
      { from: 'xs3', to: 'small2', fromAnchor: 'right', toAnchor: 'left', style: 'thin' },
      { from: 'small', to: 'medium', fromAnchor: 'right', toAnchor: 'left', style: 'normal' },
      { from: 'small2', to: 'medium', fromAnchor: 'right', toAnchor: 'left', style: 'normal' },
      { from: 'medium', to: 'large', fromAnchor: 'right', toAnchor: 'left', style: 'thick' },
      { from: 'large', to: 'output', fromAnchor: 'right', toAnchor: 'left', style: 'thick' },
    ],
    connectorStyles: {
      thin: { color: 'zinc', strokeWidth: 1 },
      normal: { color: 'sky', strokeWidth: 2 },
      thick: { color: 'violet', strokeWidth: 3 },
    },
  },

  // Themes: Show all 6 colors
  themes: {
    id: 'DOCS.THEMES',
    layout: { width: 850, height: 300 },
    nodes: {
      violet: { x: 40, y: 110, size: 'm' },
      emerald: { x: 200, y: 110, size: 'm' },
      blue: { x: 360, y: 110, size: 'm' },
      amber: { x: 520, y: 110, size: 'm' },
      sky: { x: 680, y: 110, size: 'm' },
      zinc: { x: 360, y: 220, size: 's' },
    },
    nodeData: {
      violet: { icon: 'Sparkles', name: 'Violet', subtitle: 'Primary', color: 'violet' },
      emerald: { icon: 'Check', name: 'Emerald', subtitle: 'Success', color: 'emerald' },
      blue: { icon: 'Database', name: 'Blue', subtitle: 'Data', color: 'blue' },
      amber: { icon: 'AlertTriangle', name: 'Amber', subtitle: 'Warning', color: 'amber' },
      sky: { icon: 'Cloud', name: 'Sky', subtitle: 'External', color: 'sky' },
      zinc: { icon: 'Settings', name: 'Zinc', subtitle: 'Neutral', color: 'zinc' },
    },
    connectors: [
      { from: 'violet', to: 'emerald', fromAnchor: 'right', toAnchor: 'left', style: 'violet' },
      { from: 'emerald', to: 'blue', fromAnchor: 'right', toAnchor: 'left', style: 'emerald' },
      { from: 'blue', to: 'amber', fromAnchor: 'right', toAnchor: 'left', style: 'blue' },
      { from: 'amber', to: 'sky', fromAnchor: 'right', toAnchor: 'left', style: 'amber' },
      { from: 'blue', to: 'zinc', fromAnchor: 'bottom', toAnchor: 'top', style: 'zinc' },
    ],
    connectorStyles: {
      violet: { color: 'violet', strokeWidth: 2 },
      emerald: { color: 'emerald', strokeWidth: 2 },
      blue: { color: 'blue', strokeWidth: 2 },
      amber: { color: 'amber', strokeWidth: 2 },
      zinc: { color: 'zinc', strokeWidth: 1, dashed: true },
    },
  },

  // Agents: AI workflow with context
  agents: {
    id: 'DOCS.AGENTS',
    layout: { width: 800, height: 300 },
    nodes: {
      docs: { x: 40, y: 50, size: 's' },
      llmtxt: { x: 40, y: 140, size: 's' },
      prompt: { x: 200, y: 100, size: 'm' },
      llm: { x: 400, y: 100, size: 'l' },
      config: { x: 640, y: 100, size: 'm' },
    },
    nodeData: {
      docs: { icon: 'BookOpen', name: 'AGENTS.md', color: 'sky' },
      llmtxt: { icon: 'FileText', name: 'llm.txt', color: 'sky' },
      prompt: { icon: 'MessageSquare', name: 'Prompt', subtitle: 'Your request', color: 'amber' },
      llm: { icon: 'Bot', name: 'AI Agent', subtitle: 'Claude / GPT', description: 'With Arc context', color: 'violet' },
      config: { icon: 'FileJson', name: 'Config', subtitle: 'Valid JSON', color: 'emerald' },
    },
    connectors: [
      { from: 'docs', to: 'prompt', fromAnchor: 'right', toAnchor: 'left', style: 'context' },
      { from: 'llmtxt', to: 'prompt', fromAnchor: 'right', toAnchor: 'left', style: 'context' },
      { from: 'prompt', to: 'llm', fromAnchor: 'right', toAnchor: 'left', style: 'input' },
      { from: 'llm', to: 'config', fromAnchor: 'right', toAnchor: 'left', style: 'generate' },
    ],
    connectorStyles: {
      context: { color: 'sky', strokeWidth: 1, dashed: true },
      input: { color: 'amber', strokeWidth: 2 },
      generate: { color: 'emerald', strokeWidth: 2, label: 'Generate' },
    },
  },

  // Skills: Pre-built capabilities with categories
  skills: {
    id: 'DOCS.SKILLS',
    layout: { width: 800, height: 340 },
    nodes: {
      create: { x: 40, y: 60, size: 's' },
      modify: { x: 40, y: 140, size: 's' },
      style: { x: 40, y: 220, size: 's' },
      debug: { x: 40, y: 300, size: 'xs' },
      agent: { x: 250, y: 140, size: 'l' },
      diagram: { x: 480, y: 80, size: 'm' },
      code: { x: 480, y: 200, size: 'm' },
      export: { x: 680, y: 140, size: 's' },
    },
    nodeData: {
      create: { icon: 'Plus', name: 'Create', color: 'emerald' },
      modify: { icon: 'Pencil', name: 'Modify', color: 'amber' },
      style: { icon: 'Palette', name: 'Style', color: 'violet' },
      debug: { icon: 'Bug', name: 'Debug', color: 'zinc' },
      agent: { icon: 'Bot', name: 'Arc Agent', subtitle: 'Skills library', description: 'Pre-built prompts', color: 'blue' },
      diagram: { icon: 'Box', name: 'Diagram', subtitle: 'Visual output', color: 'violet' },
      code: { icon: 'Code', name: 'Config', subtitle: 'JSON output', color: 'emerald' },
      export: { icon: 'Download', name: 'Export', color: 'sky' },
    },
    connectors: [
      { from: 'create', to: 'agent', fromAnchor: 'right', toAnchor: 'left', style: 'skill' },
      { from: 'modify', to: 'agent', fromAnchor: 'right', toAnchor: 'left', style: 'skill' },
      { from: 'style', to: 'agent', fromAnchor: 'right', toAnchor: 'left', style: 'skill' },
      { from: 'debug', to: 'agent', fromAnchor: 'right', toAnchor: 'bottomLeft', style: 'skill' },
      { from: 'agent', to: 'diagram', fromAnchor: 'right', toAnchor: 'left', style: 'output' },
      { from: 'agent', to: 'code', fromAnchor: 'right', toAnchor: 'left', style: 'output' },
      { from: 'diagram', to: 'export', fromAnchor: 'right', toAnchor: 'left', style: 'final' },
      { from: 'code', to: 'export', fromAnchor: 'right', toAnchor: 'left', style: 'final' },
    ],
    connectorStyles: {
      skill: { color: 'zinc', strokeWidth: 1 },
      output: { color: 'blue', strokeWidth: 2 },
      final: { color: 'sky', strokeWidth: 1, dashed: true },
    },
  },
}

// Import Dewey CSS from npm package
import '@arach/dewey/css/colors/warm.css'
import '@arach/dewey/css/base.css'
// Blueprint override — must come AFTER Dewey CSS to win by source order
import '../../docs-blueprint.css'

// Import human-readable markdown files
import overviewMd from '../../../docs/overview.md?raw'
import quickstartMd from '../../../docs/quickstart.md?raw'
import apiMd from '../../../docs/api.md?raw'
import examplesMd from '../../../docs/examples.md?raw'
import architectureMd from '../../../docs/architecture.md?raw'
import agentsMd from '../../../docs/AGENTS.md?raw'
import themesMd from '../../../docs/themes.md?raw'
import exportsMd from '../../../docs/exports.md?raw'
import mermaidImportMd from '../../../docs/mermaid-import.md?raw'
import mermaidSequencesMd from '../../../docs/mermaid-sequences.md?raw'
import viewsMd from '../../../docs/views.md?raw'
import focusStoriesMd from '../../../docs/focus-stories.md?raw'
import groupLayoutMd from '../../../docs/group-layout.md?raw'
import diffMd from '../../../docs/diff.md?raw'
import agenticLoopMd from '../../../docs/agentic-loop.md?raw'

// Import agent-optimized markdown files
import overviewAgentMd from '../../../docs/agent/overview.agent.md?raw'
import quickstartAgentMd from '../../../docs/agent/quickstart.agent.md?raw'
import apiAgentMd from '../../../docs/agent/api.agent.md?raw'
import architectureAgentMd from '../../../docs/agent/architecture.agent.md?raw'

import packagesAgentMd from '../../../docs/agent/packages.agent.md?raw'
import editorActionsAgentMd from '../../../docs/agent/editor-actions.agent.md?raw'
import verificationAgentMd from '../../../docs/agent/verification.agent.md?raw'
import mcpAgentMd from '../../../docs/agent/mcp.agent.md?raw'
import skillMd from '../../../docs/skill.md?raw'

// Import combined llm.txt for full context
import llmTxt from '../../../docs/llm.txt?raw'

// Strip frontmatter
function stripFrontmatter(content: string): string {
  const match = content.match(/^---\n[\s\S]*?\n---\n/)
  return match ? content.slice(match[0].length) : content
}

// Replace {BASE_URL} with the site's canonical URL (origin + mount path)
function withBaseUrl(content: string): string {
  return content.replace(/\{BASE_URL\}/g, SITE_URL)
}

// Page tree - exact match to production docsNav
const pageTree: PageNode[] = [
  {
    type: 'folder',
    name: 'Getting Started',
    children: [
      { type: 'page', id: 'overview', name: 'Overview', icon: 'Lightbulb', description: 'Introduction to Arc' },
      { type: 'page', id: 'quickstart', name: 'Quickstart', icon: 'ChevronRight', description: 'Get up and running' },
      { type: 'page', id: 'examples', name: 'Examples', icon: 'Layers', description: 'Real-world diagram examples' },
    ],
  },
  {
    type: 'folder',
    name: 'Core Concepts',
    children: [
      { type: 'page', id: 'diagram-format', name: 'Diagram Format', icon: 'FileCode', description: 'Data structure & schema' },
      { type: 'page', id: 'architecture', name: 'Architecture', icon: 'Boxes', description: 'Templates & themes' },
    ],
  },
  {
    type: 'folder',
    name: 'Guides',
    children: [
      { type: 'page', id: 'views', name: 'Guided Views', icon: 'Presentation', description: 'Ordered chapters and deep links' },
      { type: 'page', id: 'focus-stories', name: 'Focus Stories', icon: 'Focus', description: 'Explain a path on selection' },
      { type: 'page', id: 'group-layout', name: 'Group Layout', icon: 'LayoutGrid', description: 'Align nodes inside boundaries' },
      { type: 'page', id: 'diff', name: 'Diagram Diffs', icon: 'GitCompare', description: 'Added, removed, moved, changed' },
      { type: 'page', id: 'agentic-loop', name: 'The Agentic Loop', icon: 'Repeat', description: 'Diagrams maintained by agents' },
    ],
  },
  {
    type: 'folder',
    name: 'Rendering Engines',
    children: [
      { type: 'page', id: 'mermaid-import', name: 'Mermaid Imports', icon: 'GitBranch', description: 'Source from Mermaid, Pele, and Beautiful Mermaid' },
      { type: 'page', id: 'mermaid-sequences', name: 'Mermaid Sequences', icon: 'GitBranch', description: 'Native sequence renderer & player' },
    ],
  },
  {
    type: 'folder',
    name: 'Styling',
    children: [
      { type: 'page', id: 'themes', name: 'Themes', icon: 'Palette', description: 'Color palettes' },
    ],
  },
  {
    type: 'folder',
    name: 'Exports',
    children: [
      { type: 'page', id: 'exports', name: 'Export Formats', icon: 'Upload', description: 'PNG, SVG, GIF, MP4, HTML, and source' },
    ],
  },
  {
    type: 'folder',
    name: 'Agents',
    children: [
      { type: 'page', id: 'agents', name: 'AI Agents', icon: 'Bot', description: 'LLM-optimized docs' },
      { type: 'page', id: 'agent-packages', name: 'Packages', icon: 'Package', description: 'Which package to use' },
      { type: 'page', id: 'agent-actions', name: 'Editor Actions', icon: 'Workflow', description: 'Reducer action reference' },
      { type: 'page', id: 'agent-verification', name: 'Verification', icon: 'ScanSearch', description: 'Test and capture workflows' },
      { type: 'page', id: 'agent-mcp', name: 'MCP Server', icon: 'Plug', description: 'Model Context Protocol tools' },
      { type: 'page', id: 'skills', name: 'Skills', icon: 'Sparkles', description: 'Pre-built agent skills' },
    ],
  },
]

// Prompt configuration for slideout
interface PromptConfig {
  title: string
  description: string
  /** Grounding TLDR for the user */
  info: string
  /** Man-page style parameter definitions */
  params?: PromptParam[]
  /** Starter template with {VARIABLE} placeholders */
  starterTemplate: string
  /** In-context learning JSON examples */
  examples?: string
  /** Expected output format */
  expectedOutput?: string
}

// Page content map with human, agent, and prompt content
interface PageData {
  content: string
  agentContent?: string
  prompt?: PromptConfig
  title: string
  description: string
  badge?: string
}

const pages: Record<string, PageData> = {
  'mermaid-sequences': {
    content: stripFrontmatter(mermaidSequencesMd),
    title: 'Native Mermaid Sequences',
    description: 'Parse canonical Mermaid sequence source into a typed Arc document and interactive player.',
    badge: 'Rendering Engines',
  },
  overview: {
    content: stripFrontmatter(overviewMd),
    agentContent: stripFrontmatter(overviewAgentMd),
    prompt: {
      title: 'Create an Arc Diagram',
      description: 'Generate architecture diagrams from natural language descriptions',
      info: 'Arc outputs JSON configs with four keys: layout (canvas), nodes (positions), nodeData (appearance), connectors (lines). Choose a layout pattern (left-to-right for pipelines, hub-and-spoke for central services) based on your architecture.',
      params: [
        { name: 'ARCHITECTURE', description: 'The system you\'re diagramming', example: 'microservices with API gateway, auth, and three backends' },
        { name: 'PATTERN', description: 'Layout style: "flow" (left-to-right) or "hub" (central node with spokes)', example: 'flow' },
      ],
      starterTemplate: `Create an Arc diagram for: {ARCHITECTURE}

Layout pattern: {PATTERN}

Requirements:
- Use size "l" for the primary/central component
- Use size "m" for services and "s" for utilities
- Space nodes ~200px apart horizontally
- Keep canvas compact (700-900px wide)`,
      examples: `// examples.json
// PATTERN 1: Left-to-right flow (pipelines, data flow)
{
  "layout": { "width": 700, "height": 350 },
  "nodes": {
    "client": { "x": 50, "y": 130, "size": "m" },
    "api": { "x": 270, "y": 100, "size": "l" },    // WHY: Primary component = large
    "db": { "x": 520, "y": 130, "size": "m" }
  },
  "nodeData": {
    "client": { "icon": "Monitor", "name": "Client", "color": "sky" },
    "api": { "icon": "Server", "name": "API", "subtitle": "Express", "color": "violet" },
    "db": { "icon": "Database", "name": "PostgreSQL", "color": "emerald" }
  },
  "connectors": [
    { "from": "client", "to": "api", "fromAnchor": "right", "toAnchor": "left" },  // WHY: right→left for horizontal flow
    { "from": "api", "to": "db", "fromAnchor": "right", "toAnchor": "left" }
  ]
}

// PATTERN 2: Hub-and-spoke (gateway, orchestrator, central service)
{
  "layout": { "width": 600, "height": 400 },
  "nodes": {
    "gateway": { "x": 220, "y": 140, "size": "l" },  // WHY: Central hub = large, centered
    "auth": { "x": 50, "y": 50, "size": "m" },
    "users": { "x": 420, "y": 50, "size": "m" },
    "orders": { "x": 420, "y": 260, "size": "m" }
  },
  "nodeData": {
    "gateway": { "icon": "Server", "name": "Gateway", "color": "violet" },
    "auth": { "icon": "Lock", "name": "Auth", "color": "emerald" },
    "users": { "icon": "Users", "name": "Users API", "color": "blue" },
    "orders": { "icon": "Package", "name": "Orders", "color": "amber" }
  },
  "connectors": [
    { "from": "gateway", "to": "auth", "fromAnchor": "top", "toAnchor": "bottom" },  // WHY: spokes radiate from center
    { "from": "gateway", "to": "users", "fromAnchor": "right", "toAnchor": "left" },
    { "from": "gateway", "to": "orders", "fromAnchor": "bottomRight", "toAnchor": "left" }
  ]
}`,
      expectedOutput: `// validation-rules.md
Return complete JSON. Before responding, verify:
1. All four keys present: layout, nodes, nodeData, connectors
2. Node IDs match exactly between "nodes" and "nodeData"
3. Icons from valid set: Monitor, Server, Cloud, Database, Lock, User, Users, Globe, Code, Terminal, Zap, Settings, Mail, Package, Box, Layers (48 total)
4. Colors: violet, emerald, blue, amber, zinc, sky
5. Sizes: xs, s, m, l
6. Anchors: top, right, bottom, left, bottomRight, bottomLeft
7. Spacing: ~200px between nodes, canvas fits content`,
    },
    title: 'Overview',
    description: 'Arc is a visual diagram editor for creating architecture diagrams that are readable, versionable, and ready for docs.',
    badge: 'Introduction',
  },
  quickstart: {
    content: stripFrontmatter(quickstartMd),
    agentContent: stripFrontmatter(quickstartAgentMd),
    prompt: {
      title: 'Set Up Arc',
      description: 'Add Arc diagrams to your React project',
      info: 'Arc is a React component that renders diagrams from JSON configs. Install the package, import ArcDiagram, and pass your config as the data prop. Works with Next.js, Vite, CRA, and any React setup.',
      params: [
        { name: 'FRAMEWORK', description: 'Your React setup', example: 'Next.js 14 with App Router' },
        { name: 'PACKAGE_MANAGER', description: 'npm, yarn, pnpm, or bun', example: 'pnpm' },
        { name: 'DIAGRAM', description: 'What you want to visualize', example: 'authentication flow' },
      ],
      starterTemplate: `Help me add Arc diagrams to my {FRAMEWORK} project.

Package manager: {PACKAGE_MANAGER}
First diagram: {DIAGRAM}

I need:
1. Installation command
2. Basic component setup
3. A starter config for my diagram`,
      examples: `// setup-examples.md
// INSTALLATION (choose your package manager)
npm install @hudsonkit/arc
pnpm add @hudsonkit/arc
yarn add @hudsonkit/arc

// BASIC USAGE - React component
import { ArcDiagram } from '@hudsonkit/arc'

const config = {
  layout: { width: 600, height: 300 },
  nodes: {
    client: { x: 50, y: 100, size: "m" },
    server: { x: 300, y: 100, size: "l" }
  },
  nodeData: {
    client: { icon: "Monitor", name: "Client", color: "sky" },
    server: { icon: "Server", name: "API", color: "violet" }
  },
  connectors: [
    { from: "client", to: "server", fromAnchor: "right", toAnchor: "left" }
  ]
}

export default function Page() {
  return <ArcDiagram data={config} />
}

// NEXT.JS APP ROUTER - app/architecture/page.tsx
// WHY: Use 'use client' because Arc uses browser APIs
'use client'
import { ArcDiagram } from '@hudsonkit/arc'
// ... rest of component

// STORING CONFIGS - recommended pattern
// WHY: Keep configs in separate files for reusability
// lib/diagrams/auth-flow.json
{
  "layout": { "width": 700, "height": 350 },
  // ... config
}
// Then import: import authFlow from '@/lib/diagrams/auth-flow.json'`,
      expectedOutput: `// expected-output.md
Provide:
1. Exact install command for the user's package manager
2. Complete, copy-pasteable component code
3. A valid starter config matching their diagram description
4. Framework-specific notes (e.g., 'use client' for Next.js App Router)`,
    },
    title: 'Quickstart',
    description: 'Create your first Arc diagram in under 5 minutes.',
    badge: 'Getting Started',
  },
  'diagram-format': {
    content: stripFrontmatter(apiMd),
    agentContent: stripFrontmatter(apiAgentMd),
    prompt: {
      title: 'Work with Diagram Configs',
      description: 'Create, modify, or debug Arc diagram JSON',
      info: 'Arc configs are JSON with four required keys: layout (canvas size), nodes (positions), nodeData (appearance), and connectors (lines). Node IDs must match between nodes and nodeData.',
      params: [
        { name: 'CONFIG', description: 'Your existing Arc JSON config (paste below), or leave empty for new diagram' },
        { name: 'TASK', description: 'What you need done', example: 'add a database node on the right' },
      ],
      starterTemplate: `I need help with an Arc diagram config.

**My task:** {TASK}

**My current config (if modifying):**
\`\`\`json
{CONFIG}
\`\`\`

If creating from scratch, describe the architecture you want to visualize.`,
      examples: `// GOOD CONFIG - proper spacing, logical flow
{
  "layout": { "width": 800, "height": 400 },
  "nodes": {
    // ~200px horizontal spacing, vertically centered
    "client": { "x": 50, "y": 160, "size": "m" },
    "gateway": { "x": 280, "y": 115, "size": "l" },
    "auth": { "x": 560, "y": 100, "size": "m" },
    "db": { "x": 560, "y": 230, "size": "m" }
  },
  "nodeData": {
    // IDs MUST match "nodes" keys exactly
    "client": { "icon": "Monitor", "name": "Client", "color": "sky" },
    "gateway": { "icon": "Server", "name": "Gateway", "color": "violet" },
    "auth": { "icon": "Lock", "name": "Auth", "color": "emerald" },
    "db": { "icon": "Database", "name": "PostgreSQL", "color": "amber" }
  },
  "connectors": [
    { "from": "client", "to": "gateway", "fromAnchor": "right", "toAnchor": "left" },
    { "from": "gateway", "to": "auth", "fromAnchor": "right", "toAnchor": "left" },
    { "from": "gateway", "to": "db", "fromAnchor": "bottomRight", "toAnchor": "left" }
  ]
}

// BAD CONFIG - common mistakes
{
  // Missing "layout" key!
  "nodes": { "api": { "x": 50, "y": 50, "size": "medium" } },  // "medium" invalid, use "m"
  "nodeData": { "gateway": { "name": "API" } }  // ID mismatch! "api" vs "gateway"
}

// VALID VALUES:
// Icons (48): Monitor, Server, Smartphone, Cloud, Cpu, Database, HardDrive, Wifi, Globe, User, Users, Lock, Key, Shield, Code, Terminal, FileCode, Folder, Zap, Activity, BarChart, PieChart, Box, Package, Layers, Grid, Settings, Bell, Mail, MessageSquare, Search, Filter, Download, Upload, Play, Pause, Square, Circle...
// Colors (6): violet, emerald, blue, amber, zinc, sky
// Sizes: xs, s, m, l
// Anchors: top, right, bottom, left, bottomRight, bottomLeft`,
      expectedOutput: `Return complete, valid JSON. Before responding, verify:
1. All node IDs in "nodes" match entries in "nodeData"
2. All connector "from"/"to" values reference existing node IDs
3. Icons are from the 48 valid Lucide icons
4. Colors: violet, emerald, blue, amber, zinc, sky
5. Sizes: xs, s, m, l
6. Anchors: top, right, bottom, left, bottomRight, bottomLeft`,
    },
    title: 'Diagram Format',
    description: 'Data structure & schema for Arc diagrams.',
    badge: 'Reference',
  },
  architecture: {
    content: stripFrontmatter(architectureMd),
    agentContent: stripFrontmatter(architectureAgentMd),
    prompt: {
      title: 'Arc Editor Development',
      description: 'Understand, debug, or extend the Arc editor codebase',
      info: 'Arc editor uses useReducer + Context for state (diagram, editor, meta, history). Canvas handles pointer events, nodes use pointer capture for drag, SVG layer renders connectors. All state flows through dispatch actions.',
      params: [
        { name: 'TASK', description: 'Feature to add, bug to fix, or code to understand', example: 'add keyboard shortcuts for copy/paste' },
        { name: 'FILES', description: 'Specific files you\'re working with (optional)', example: 'EditableNode.jsx' },
      ],
      starterTemplate: `I'm working on the Arc editor codebase.

**Task:** {TASK}

**Files I'm looking at:** {FILES}

Help me understand the relevant patterns and implement the change.`,
      examples: `// architecture-patterns.md
// STATE SHAPE - EditorProvider.jsx
{
  diagram: {
    layout: { width, height },
    nodes: { [id]: { x, y, size } },
    nodeData: { [id]: { icon, name, subtitle, color } },
    connectors: [{ from, to, fromAnchor, toAnchor }]
  },
  editor: {
    selectedNodeId: string | null,
    selectedConnectorIndex: number | null,
    mode: 'select' | 'addNode' | 'addConnector',
    pendingConnector: { from, fromAnchor } | null,
    isDragging: boolean
  },
  meta: { filename, isDirty, lastSaved },
  history: { past: [], future: [] }
}

// ACTION PATTERNS - editorReducer.js
// WHY: All state changes go through dispatch, enabling undo/redo
dispatch({ type: 'SELECT_NODE', nodeId: 'api' })
dispatch({ type: 'UPDATE_NODE_DATA', nodeId: 'api', data: { name: 'New Name' } })
dispatch({ type: 'MOVE_NODE', nodeId: 'api', x: 100, y: 200 })
dispatch({ type: 'ADD_CONNECTOR', connector: { from, to, fromAnchor, toAnchor } })
dispatch({ type: 'UNDO' })  // Pops from history.past
dispatch({ type: 'REDO' })  // Pops from history.future

// DRAG PATTERN - EditableNode.jsx
// WHY: Pointer capture ensures drag continues even if cursor leaves element
const handlePointerDown = (e) => {
  e.target.setPointerCapture(e.pointerId)
  dispatch({ type: 'START_DRAG' })
}
const handlePointerMove = (e) => {
  if (!isDragging) return
  dispatch({ type: 'MOVE_NODE', nodeId, x: e.clientX - offset.x, y: e.clientY - offset.y })
}
const handlePointerUp = (e) => {
  e.target.releasePointerCapture(e.pointerId)
  dispatch({ type: 'END_DRAG' })
}

// CONNECTOR LAYER - ConnectorLayer.jsx
// WHY: SVG layer sits below nodes with pointer-events: none, except on paths
<svg style={{ pointerEvents: 'none' }}>
  <path style={{ pointerEvents: 'stroke' }} onClick={handleSelect} />
</svg>

// FILE STRUCTURE
src/components/editor/
├── DiagramEditor.jsx    // Main layout (toolbar + canvas + panel)
├── EditorProvider.jsx   // Context + useReducer setup
├── editorReducer.js     // All state mutation logic
├── DiagramCanvas.jsx    // Interactive canvas, pointer events
├── EditableNode.jsx     // Draggable node component
├── ConnectorLayer.jsx   // SVG connector rendering
├── AnchorPoints.jsx     // Connection point UI
├── Toolbar.jsx          // File/mode/history controls
└── PropertiesPanel.jsx  // Right sidebar editor`,
      expectedOutput: `// expected-output.md
Provide:
1. Specific file paths for changes
2. Code following existing patterns (dispatch actions, pointer capture)
3. Explanation of WHY this approach fits the architecture
4. Any new action types that need adding to editorReducer.js`,
    },
    title: 'Architecture',
    description: 'How the Arc editor is built.',
    badge: 'Core Concepts',
  },
  examples: {
    content: stripFrontmatter(examplesMd),
    agentContent: stripFrontmatter(apiAgentMd),
    prompt: {
      title: 'Apply Structural Styling',
      description: 'Change node sizes, spacing, and layout structure',
      info: 'Templates control structural styling: sizes (xs/s/m/l map to 60/80/120/160px), spacing (~200px between nodes), and layout patterns. Use sizes to create visual hierarchy - large for primary components, small for utilities.',
      params: [
        { name: 'CONFIG', description: 'Your current diagram config (paste JSON)', example: '' },
        { name: 'CHANGES', description: 'Structural changes needed', example: 'make gateway larger, add more spacing' },
      ],
      starterTemplate: `Apply structural changes to this Arc diagram:

\`\`\`json
{CONFIG}
\`\`\`

Changes needed: {CHANGES}`,
      examples: `// templates-examples.json
// SIZE HIERARCHY - creates visual importance
{
  "nodes": {
    "gateway": { "x": 250, "y": 100, "size": "l" },   // 160px - WHY: Primary entry point
    "auth": { "x": 50, "y": 100, "size": "m" },       // 120px - WHY: Core service
    "cache": { "x": 500, "y": 100, "size": "s" },     // 80px  - WHY: Supporting utility
    "metrics": { "x": 500, "y": 220, "size": "xs" }   // 60px  - WHY: Background process
  }
}

// SIZE REFERENCE:
// xs = 60px  - Background services, metrics, logs
// s  = 80px  - Utilities, caches, queues
// m  = 120px - Core services, APIs, databases
// l  = 160px - Primary components, gateways, main entry points

// SPACING PATTERNS
// Horizontal flow: ~200-250px between nodes
{
  "nodes": {
    "a": { "x": 50, "y": 100 },   // Start
    "b": { "x": 270, "y": 100 },  // +220px
    "c": { "x": 490, "y": 100 }   // +220px
  }
}

// Vertical stack: ~120-150px between rows
{
  "nodes": {
    "top": { "x": 200, "y": 50 },
    "mid": { "x": 200, "y": 180 },   // +130px
    "bot": { "x": 200, "y": 310 }    // +130px
  }
}

// BAD: Cramped spacing
{
  "nodes": {
    "a": { "x": 50, "y": 100 },
    "b": { "x": 120, "y": 100 }  // WHY BAD: Only 70px apart, nodes will overlap
  }
}`,
      expectedOutput: `// expected-output.md
Return the complete config with:
1. Sizes reflecting visual hierarchy (l for primary, xs for background)
2. Proper spacing (~200px horizontal, ~130px vertical)
3. Layout fitting canvas dimensions
4. Preserved nodeData and connectors (unless specifically changing them)`,
    },
    title: 'Examples',
    description: 'Real-world diagram examples.',
    badge: 'Getting Started',
  },
  views: {
    content: stripFrontmatter(viewsMd),
    title: 'Guided views',
    description: 'Turn a diagram into an ordered walkthrough with a chapter rail and deep links.',
    badge: 'Guides',
  },
  'focus-stories': {
    content: stripFrontmatter(focusStoriesMd),
    title: 'Focus stories',
    description: 'Explain an architecture path when a reader explores a node.',
    badge: 'Guides',
  },
  'group-layout': {
    content: stripFrontmatter(groupLayoutMd),
    title: 'Declarative group layout',
    description: 'Keep architecture nodes aligned inside explicit system boundaries.',
    badge: 'Guides',
  },
  diff: {
    content: stripFrontmatter(diffMd),
    title: 'Diagram diffs',
    description: 'Diff two diagrams and render the change set — added, removed, moved, changed.',
    badge: 'Guides',
  },
  'agentic-loop': {
    content: stripFrontmatter(agenticLoopMd),
    title: 'The agentic loop',
    description: 'Diagrams maintained by the same agents that change the code.',
    badge: 'Guides',
  },
  themes: {
    content: stripFrontmatter(themesMd),
    agentContent: stripFrontmatter(apiAgentMd),
    prompt: {
      title: 'Apply Color Theme',
      description: 'Change colors for visual cohesion or meaning',
      info: 'Arc has 6 theme colors: violet, emerald, blue, amber, sky, zinc. Apply colors semantically (violet for primary, emerald for data, amber for warnings) or aesthetically (warm palette, cool palette). Use 2-3 colors per diagram for cohesion.',
      params: [
        { name: 'CONFIG', description: 'Your diagram config (paste JSON)', example: '' },
        { name: 'THEME', description: 'Color scheme or semantic mapping', example: 'cool corporate look' },
      ],
      starterTemplate: `Apply color theme to this Arc diagram:

\`\`\`json
{CONFIG}
\`\`\`

Theme: {THEME}`,
      examples: `// themes-examples.json
// SEMANTIC COLORING - colors convey meaning
{
  "nodeData": {
    "gateway": { "icon": "Server", "name": "Gateway", "color": "violet" },   // WHY: Violet for primary/main entry
    "auth": { "icon": "Lock", "name": "Auth", "color": "emerald" },          // WHY: Emerald for security
    "db": { "icon": "Database", "name": "Database", "color": "blue" },       // WHY: Blue for data/storage
    "cache": { "icon": "Zap", "name": "Cache", "color": "amber" }            // WHY: Amber for performance/speed
  }
}

// SEMANTIC COLOR GUIDE:
// violet  - Primary components, main entry points, orchestrators
// emerald - Security, auth, encryption, validation
// blue    - Data, storage, databases, persistence
// amber   - Performance, caching, optimization, warnings
// sky     - External services, cloud, third-party integrations
// zinc    - Infrastructure, utilities, background processes

// AESTHETIC PALETTES
// Warm palette (friendly, approachable)
{
  "nodeData": {
    "main": { "color": "amber" },     // WHY: Warm primary
    "service": { "color": "emerald" }, // WHY: Complementary warmth
    "utility": { "color": "sky" }      // WHY: Cool accent for contrast
  }
}

// Cool palette (professional, corporate)
{
  "nodeData": {
    "main": { "color": "violet" },
    "service": { "color": "blue" },
    "utility": { "color": "zinc" }
  }
}

// Monochrome (clean, minimal)
{
  "nodeData": {
    "primary": { "color": "violet" },
    "secondary": { "color": "violet" },  // WHY: Same color, different sizes for hierarchy
    "tertiary": { "color": "zinc" }       // WHY: Neutral for supporting elements
  }
}

// BAD: Too many colors
{
  "nodeData": {
    "a": { "color": "violet" },
    "b": { "color": "emerald" },
    "c": { "color": "blue" },
    "d": { "color": "amber" },
    "e": { "color": "sky" },
    "f": { "color": "zinc" }  // WHY BAD: 6 colors = visual chaos, pick 2-3
  }
}`,
      expectedOutput: `// expected-output.md
Return the complete config with:
1. Colors applied to nodeData
2. 2-3 colors max for visual cohesion
3. Semantic meaning if requested (security=emerald, data=blue)
4. Preserved structure (nodes, connectors unchanged unless specified)`,
    },
    title: 'Themes',
    description: 'Color palettes that can be applied to any template.',
    badge: 'Styling',
  },
  'mermaid-import': {
    content: stripFrontmatter(mermaidImportMd),
    agentContent: stripFrontmatter(mermaidImportMd),
    title: 'Mermaid Imports',
    description: 'Reuse supported Mermaid source from Pele, Beautiful Mermaid, or your existing docs.',
    badge: 'Rendering Engines',
  },
  exports: {
    content: stripFrontmatter(exportsMd),
    agentContent: stripFrontmatter(exportsMd),
    title: 'Export Formats',
    description: 'Export PNG, SVG, GIF, MP4, HTML, ASCII, or editable source.',
    badge: 'Exports',
  },
  agents: {
    content: stripFrontmatter(agentsMd),
    agentContent: llmTxt,
    prompt: {
      title: 'Brief Your AI Agent',
      description: 'Self-contained context for any AI assistant',
      info: 'This prompt gives your AI assistant everything it needs to work with Arc configs: schema, valid values, and examples. Copy and paste to Claude, ChatGPT, Copilot, or any LLM.',
      params: [
        { name: 'TASK', description: 'What you need the AI to do', example: 'create a diagram for my microservices' },
        { name: 'CONTEXT', description: 'Additional context (existing config, constraints)', example: 'must fit in 600x400 canvas' },
      ],
      starterTemplate: `I need help with Arc, a diagram editor that outputs JSON configs.

**Task:** {TASK}

**Context:** {CONTEXT}

## Arc Config Schema

Arc configs have four required keys:
- layout: { width: number, height: number }
- nodes: { [id]: { x: number, y: number, size: "xs"|"s"|"m"|"l" } }
- nodeData: { [id]: { icon: string, name: string, subtitle?: string, color: string } }
- connectors: [{ from: string, to: string, fromAnchor: string, toAnchor: string }]

## Valid Values

Icons (48): Monitor, Server, Smartphone, Cloud, Cpu, Database, HardDrive, Wifi, Globe, User, Users, Lock, Key, Shield, Code, Terminal, FileCode, Folder, Zap, Activity, BarChart, Box, Package, Layers, Settings, Bell, Mail, MessageSquare, Search, Filter, Download, Upload, Play, GitBranch, Workflow...

Colors (6): violet, emerald, blue, amber, sky, zinc

Sizes: xs (60px), s (80px), m (120px), l (160px)

Anchors: top, right, bottom, left, bottomRight, bottomLeft

## Example Output
\`\`\`json
{
  "layout": { "width": 700, "height": 350 },
  "nodes": {
    "client": { "x": 50, "y": 130, "size": "m" },
    "api": { "x": 270, "y": 100, "size": "l" },
    "db": { "x": 520, "y": 130, "size": "m" }
  },
  "nodeData": {
    "client": { "icon": "Monitor", "name": "Client", "color": "sky" },
    "api": { "icon": "Server", "name": "API", "color": "violet" },
    "db": { "icon": "Database", "name": "PostgreSQL", "color": "emerald" }
  },
  "connectors": [
    { "from": "client", "to": "api", "fromAnchor": "right", "toAnchor": "left" },
    { "from": "api", "to": "db", "fromAnchor": "right", "toAnchor": "left" }
  ]
}
\`\`\``,
      examples: `// agent-briefing-tips.md
// TIP 1: Include schema inline (LLMs can't fetch URLs reliably)
// This prompt includes the full schema so it works without external fetch

// TIP 2: Add constraints to your CONTEXT
// Good: "must fit in 600x400, max 5 nodes"
// Bad: "make it look nice"

// TIP 3: Ask for validation
// Add to your task: "...and verify all node IDs match between nodes and nodeData"

// TIP 4: For complex diagrams, ask step by step
// First: "List the components I need"
// Then: "Now generate the config"`,
      expectedOutput: `// expected-output.md
The AI should return:
1. Complete, valid JSON (all four keys)
2. Node IDs matching between nodes and nodeData
3. Only valid icons, colors, sizes, and anchors
4. Proper spacing (~200px between nodes)`,
    },
    title: 'AI Agents',
    description: 'LLM-optimized documentation for AI coding assistants.',
    badge: 'Agents',
  },
  'agent-packages': {
    content: stripFrontmatter(packagesAgentMd),
    agentContent: stripFrontmatter(packagesAgentMd),
    title: 'Packages',
    description: 'Which npm package to install — and when to clone the studio repo instead.',
    badge: 'Agents',
  },
  'agent-actions': {
    content: stripFrontmatter(editorActionsAgentMd),
    agentContent: stripFrontmatter(editorActionsAgentMd),
    title: 'Editor Actions',
    description: 'Complete reference for editorReducer dispatch actions.',
    badge: 'Agents',
  },
  'agent-verification': {
    content: stripFrontmatter(verificationAgentMd),
    agentContent: stripFrontmatter(verificationAgentMd),
    title: 'Visual Verification',
    description: 'How agents validate diagrams headlessly and verify in the dev server.',
    badge: 'Agents',
  },
  'agent-mcp': {
    content: stripFrontmatter(mcpAgentMd),
    agentContent: stripFrontmatter(mcpAgentMd),
    title: 'MCP Server',
    description: 'Model Context Protocol tools for validate, layout, ASCII, and editor handoff.',
    badge: 'Agents',
  },
  skills: {
    content: stripFrontmatter(skillMd),
    agentContent: stripFrontmatter(skillMd),
    prompt: {
      title: 'Arc Skills Library',
      description: 'Task-specific prompts for common operations',
      info: 'Four pre-built skills: CREATE (new diagram), MODIFY (edit existing), DEBUG (fix invalid config), EXPORT (convert to Mermaid/PlantUML). Select a skill and provide your input.',
      params: [
        { name: 'SKILL', description: 'Which skill: create, modify, debug, or export', example: 'create' },
        { name: 'INPUT', description: 'Your architecture description or existing config', example: 'three-tier web app' },
      ],
      starterTemplate: `**Skill:** {SKILL}

**Input:** {INPUT}`,
      examples: `// skills-library.md
// ═══════════════════════════════════════════════════════════════
// SKILL: CREATE - Generate new diagram from description
// ═══════════════════════════════════════════════════════════════
Create an Arc diagram for: [YOUR ARCHITECTURE]

Requirements:
- layout: fit content (700-900px wide typical)
- sizes: "l" for primary, "m" for services, "s" for utilities
- colors: 2-3 max (violet/emerald/blue for cool, amber/sky for warm)
- spacing: ~200px between nodes horizontally
- flow: left-to-right for pipelines, hub-spoke for gateways

Return complete JSON with: layout, nodes, nodeData, connectors

// ═══════════════════════════════════════════════════════════════
// SKILL: MODIFY - Change existing config
// ═══════════════════════════════════════════════════════════════
Modify this Arc diagram:

\`\`\`json
[PASTE YOUR CONFIG]
\`\`\`

Changes needed: [DESCRIBE CHANGES]

Return the complete updated config (not just the diff).

// ═══════════════════════════════════════════════════════════════
// SKILL: DEBUG - Fix broken config
// ═══════════════════════════════════════════════════════════════
Debug this Arc config (it's not rendering correctly):

\`\`\`json
[PASTE BROKEN CONFIG]
\`\`\`

Check for:
1. Missing keys (layout, nodes, nodeData, connectors)
2. ID mismatches between nodes and nodeData
3. Invalid values (colors must be: violet, emerald, blue, amber, sky, zinc)
4. Invalid sizes (must be: xs, s, m, l)
5. Invalid anchors (must be: top, right, bottom, left, bottomRight, bottomLeft)

Return the fixed config with comments explaining what was wrong.

// ═══════════════════════════════════════════════════════════════
// SKILL: EXPORT - Convert to other formats
// ═══════════════════════════════════════════════════════════════
Export this Arc config for: [TARGET FORMAT]

Targets:
- Mermaid: Convert to Mermaid diagram syntax
- PlantUML: Convert to PlantUML syntax
- Markdown: Convert to markdown table describing components
- TypeScript: Generate TypeScript types for the config

\`\`\`json
[PASTE YOUR CONFIG]
\`\`\``,
      expectedOutput: `// expected-output.md
For CREATE: Complete JSON with all four keys, valid values only
For MODIFY: Complete updated config (not diff)
For DEBUG: Fixed config with // comments explaining fixes
For EXPORT: Target format output`,
    },
    title: 'Skills',
    description: 'Pre-built skills and prompts for AI assistants.',
    badge: 'Agents',
  },
}

// React Router Link adapter for Dewey
function RouterLink({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return <Link to={href} {...props}>{children}</Link>
}

// ============================================
// Doc Page Component
// ============================================
function DocPage({ pageId }: { pageId: string }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [promptOpen, setPromptOpen] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const page = pages[pageId] || pages.overview
  const tocItems = extractTocItems(page.content)
  const activeSection = useActiveSection(tocItems)

  // Replace diagram code blocks with toggle components
  const diagramBlocks = useDiagramCodeBlocks(contentRef, pageId)

  const handleDownloadLLM = () => {
    const blob = new Blob([llmTxt], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'arc-llm.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="dw-layout" style={{ marginTop: '56px' }}>
      {/* Sidebar */}
      <Sidebar
        tree={pageTree}
        projectName="Documentation"
        currentPage={pageId}
        basePath="/docs"
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main content - wider for better diagram display */}
      <main className="dw-main" style={{ maxWidth: '1000px' }}>
        <div className="dw-content" style={{ maxWidth: '100%' }}>
          {/* Mobile menu button */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden mb-4 flex items-center gap-2 text-sm"
            style={{ color: 'var(--color-dw-muted-foreground)' }}
          >
            <Menu className="w-4 h-4" /> Menu
          </button>

          {/* Page header - title row with buttons */}
          <div className="flex items-start justify-between mb-4">
            {/* Title */}
            <h1
              className="text-3xl md:text-4xl font-semibold tracking-tight"
              style={{ fontFamily: "'Space Grotesk', 'Segoe UI', sans-serif", color: '#101518' }}
            >
              {page.title}
            </h1>

            {/* Page controls - margin-top aligns button text baseline with title baseline */}
            {/* Formula: (title-size - button-size) × 0.8 ≈ (2.25rem - 0.75rem) × 0.8 = 1.2rem */}
            <div className="flex items-center gap-2" style={{ marginTop: '1.2rem' }}>
              {page.prompt && (
                <button
                  onClick={() => setPromptOpen(true)}
                  className="group relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                  style={{
                    color: '#2e5fa5',
                    border: '1px solid rgba(46, 95, 165, 0.3)',
                    background: '#eaf0f8',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <Sparkles className="w-3.5 h-3.5" style={{ flexShrink: 0 }} />
                  <span>AI Prompt</span>
                  {/* Tooltip */}
                  <div
                    className="absolute left-1/2 -translate-x-1/2 top-full mt-2 px-3 py-2 rounded-lg text-xs opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity"
                    style={{
                      background: '#1a1a1a',
                      color: 'white',
                      whiteSpace: 'nowrap',
                      zIndex: 50,
                    }}
                  >
                    Open context panel for AI assistants
                  </div>
                </button>
              )}
              <CopyButtons
                markdownContent={page.content}
                agentContent={page.agentContent}
              />
            </div>
          </div>

          {/* Description - full width */}
          <p className="text-lg leading-relaxed mb-8" style={{ color: '#3a4248' }}>
            {page.description}
          </p>

          {/* Agent quick action for agents page */}
          {(pageId === 'agents' || pageId === 'skills' || pageId === 'agent-mcp') && (
            <div
              className="mb-8 p-4 rounded-xl"
              style={{
                background: 'linear-gradient(135deg, rgba(46, 95, 165, 0.08) 0%, rgba(46, 95, 165, 0.02) 100%)',
                border: '1px solid rgba(46, 95, 165, 0.2)',
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Bot className="w-5 h-5" style={{ color: '#2e5fa5' }} />
                  <div>
                    <div className="font-medium" style={{ color: '#101518' }}>
                      Download Complete Context
                    </div>
                    <div className="text-sm" style={{ color: '#5c676c' }}>
                      Get llm.txt with everything your AI assistant needs
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleDownloadLLM}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm"
                  style={{
                    background: '#2e5fa5',
                    color: 'white',
                  }}
                >
                  <Download className="w-4 h-4" />
                  llm.txt
                </button>
              </div>
            </div>
          )}

          {/* Hero diagram - prominent example for each page */}
          {docsDiagrams[pageId] && (
            <div className="mb-10 not-prose">
              {(pageId === 'diagram-format' || pageId === 'architecture') ? (
                <RenderShowcase data={docsDiagrams[pageId]} />
              ) : (
                <div
                  style={{
                    background: '#ffffff',
                    borderRadius: '6px',
                    padding: '1.5rem',
                    border: '1px solid rgba(16, 21, 24, 0.10)',
                  }}
                >
                  <ArcDiagram
                    data={docsDiagrams[pageId]}
                    mode="light"
                    theme="cool"
                    interactive={false}
                    defaultZoom="fit"
                  />
                </div>
              )}
            </div>
          )}

          {/* Markdown content */}
          <div className="dw-prose" ref={contentRef}>
            <MarkdownContent content={page.content} />
          </div>

          {/* Render diagram toggle components via portals */}
          <DiagramTogglePortals blocks={diagramBlocks} containerRef={contentRef} />

          {/* Showcase section on overview page */}
          {pageId === 'overview' && (
            <div className="not-prose">
              <Showcase />
            </div>
          )}
        </div>
      </main>

      {/* Table of Contents */}
      <aside className="dw-toc hidden xl:block">
        <h4 className="dw-toc-title">ON THIS PAGE</h4>
        <nav>
          <ul className="dw-toc-list">
            {tocItems.map((item) => (
              <li key={item.id} className="dw-toc-item">
                <a
                  href={`#${item.id}`}
                  className={`dw-toc-link ${activeSection === item.id ? 'active' : ''}`}
                  data-level={item.level}
                >
                  {item.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      {/* Prompt Slideout */}
      {page.prompt && (
        <PromptSlideout
          isOpen={promptOpen}
          onClose={() => setPromptOpen(false)}
          title={page.prompt.title}
          description={page.prompt.description}
          info={page.prompt.info}
          params={page.prompt.params}
          starterTemplate={withBaseUrl(page.prompt.starterTemplate)}
          examples={page.prompt.examples}
          expectedOutput={page.prompt.expectedOutput}
        />
      )}
    </div>
  )
}

// ============================================
// Main Component
// ============================================
interface ArcDocsProps {
  pageId: string
}

export default function ArcDocs({ pageId }: ArcDocsProps) {
  const page = pages[pageId]
  useMeta({
    title: page ? `${page.title} | Arc Docs` : 'Arc Documentation',
    description: page?.description || 'Reference and guides for creating architecture diagrams with Arc.',
    url: page ? `/docs/${pageId}` : '/docs',
    image: '/og-docs.png',
  })
  return (
    <DeweyProvider
      components={{ Link: RouterLink }}
      theme="warm"
    >
      <div className="dw-layout" style={{ flexDirection: 'column' }}>
        <Header
          projectName="Arc"
          homeUrl="/docs"
          backUrl="/"
          backLabel="Back"
          label="DOCS"
        />

        {pageId === 'index' ? (
          <DocsIndex
            tree={pageTree}
            projectName="Arc Documentation"
            tagline="The reference for diagrams as code"
            description="Arc turns typed, diffable configs into diagrams you can render, review, and ship across docs, decks, and codebases."
            basePath="/docs"
            heroIcon={Book}
            layout="columns"
            quickLinks={[
              { label: 'Back to Arc', href: '/' },
              { label: 'Open Editor', href: '/editor', primary: true },
            ]}
          />
        ) : (
          <DocPage pageId={pageId} />
        )}
      </div>
    </DeweyProvider>
  )
}
