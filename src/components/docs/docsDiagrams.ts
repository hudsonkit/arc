import type { ArcDiagramData } from '../../types/diagram'

// Page-specific diagrams for docs - showcasing Arc's full capabilities
export const docsDiagrams: Record<string, ArcDiagramData> = {
  // Overview: Comprehensive microservices example showing all features
  overview: {
    id: 'DOCS.OVERVIEW',
    // Columns sit 60–70px apart so connector labels (HTTPS, SQL) have a clear
    // run between the boxes instead of landing on their edges.
    layout: { width: 960, height: 340 },
    nodes: {
      client: { x: 30, y: 130, size: 'm' },
      gateway: { x: 250, y: 122.5, size: 'l' },
      auth: { x: 540, y: 30, size: 'm' },
      api: { x: 540, y: 130, size: 'm' },
      cache: { x: 540, y: 236, size: 's' },
      db: { x: 770, y: 130, size: 'm' },
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
