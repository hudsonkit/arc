import { useState } from 'react'
import {
  ArrowRight,
  Check,
  Clipboard,
  Code2,
  FileCheck2,
  Image,
  LayoutTemplate,
  Network,
  Plug,
  ScanSearch,
  Sparkles,
  WandSparkles,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useMeta } from '../hooks/useMeta'
import ArcMark from './ArcMark'
import '../agent-share.css'

type SharePageKind = 'mcp' | 'skills'

interface SetupOption {
  label: string
  codeLabel: string
  code: string
}

interface SharePageConfig {
  eyebrow: string
  title: string
  lead: string
  metaTitle: string
  metaDescription: string
  primaryCode: string
  setupOptions?: SetupOption[]
  docsHref: string
  docsLabel: string
  outcomes: Array<{
    icon: typeof Plug
    title: string
    description: string
  }>
  steps: Array<{
    number: string
    title: string
    description: string
  }>
}

const MCP_CONFIG: SharePageConfig = {
  eyebrow: '// AGENT TOOLING · MODEL CONTEXT PROTOCOL',
  title: 'Give your agent a diagram engine.',
  lead: 'Arc MCP turns architecture work into a tool call: validate a diagram, lay it out, preview it, render production artifacts, and hand the result to the visual studio.',
  metaTitle: 'Arc MCP | Diagram tools for AI agents',
  metaDescription: 'Give AI agents tools to validate, lay out, diff, render, and hand off architecture diagrams.',
  primaryCode: 'claude mcp add --scope project arc -- npx -y @hudsonkit/arc-mcp',
  setupOptions: [
    {
      label: 'Claude Code',
      codeLabel: 'terminal',
      code: 'claude mcp add --scope project arc -- npx -y @hudsonkit/arc-mcp',
    },
    {
      label: 'Devin',
      codeLabel: 'terminal',
      code: 'devin mcp add arc -- npx -y @hudsonkit/arc-mcp',
    },
    {
      label: 'Cursor',
      codeLabel: '.cursor/mcp.json',
      code: `{
  "mcpServers": {
    "arc": {
      "command": "npx",
      "args": ["-y", "@hudsonkit/arc-mcp"]
    }
  }
}`,
    },
    {
      label: 'Other clients',
      codeLabel: 'mcp.json',
      code: `{
  "mcpServers": {
    "arc": {
      "command": "npx",
      "args": ["-y", "@hudsonkit/arc-mcp"]
    }
  }
}`,
    },
  ],
  docsHref: '/docs/agent-mcp',
  docsLabel: 'Read the MCP reference',
  outcomes: [
    {
      icon: FileCheck2,
      title: 'Validate and repair',
      description: 'Return coded diagnostics and supported fixes instead of guessing why a diagram failed.',
    },
    {
      icon: Network,
      title: 'Lay out and review',
      description: 'Auto-layout a graph, compare revisions structurally, and inspect the delta before rendering.',
    },
    {
      icon: Image,
      title: 'Render real artifacts',
      description: 'Return ASCII, SVG, PNG, React, iframe, or standalone HTML from the same typed source.',
    },
    {
      icon: LayoutTemplate,
      title: 'Hand off to the studio',
      description: 'Open the generated document in Arc for visual editing, guided views, and final polish.',
    },
  ],
  steps: [
    {
      number: '01',
      title: 'Connect the server',
      description: 'Run the arc-mcp binary locally or point your MCP client at the hosted Arc endpoint.',
    },
    {
      number: '02',
      title: 'Describe the system',
      description: 'Ask your agent for an architecture, data flow, deployment map, or reviewable change.',
    },
    {
      number: '03',
      title: 'Ship the artifact',
      description: 'Validate, render, and embed the result in a pull request, document, deck, or product.',
    },
  ],
}

const SKILLS_CONFIG: SharePageConfig = {
  eyebrow: '// AGENT PLAYBOOKS · REUSABLE AUTHORING CONTRACT',
  title: 'Let your agents make amazing diagrams.',
  lead: 'Reusable instructions for creating, repairing, and exporting architecture diagrams that stay typed, readable, and reviewable.',
  metaTitle: 'Arc Skills | Architecture diagram playbooks for agents',
  metaDescription: 'Reusable agent skills for creating, repairing, reviewing, and exporting architecture diagrams with Arc.',
  primaryCode: 'npx skills add hudsonkit/arc --skill arc-diagrams',
  docsHref: '/docs/skills',
  docsLabel: 'Browse the skills reference',
  outcomes: [
    {
      icon: WandSparkles,
      title: 'Create from a brief',
      description: 'Turn a plain-language system description into typed Arc data with semantic node kinds.',
    },
    {
      icon: ScanSearch,
      title: 'Repair with evidence',
      description: 'Follow coded diagnostics through a repeatable validate, fix, and revalidate loop.',
    },
    {
      icon: Network,
      title: 'Compose for humans',
      description: 'Use node budgets, one visual spine, spacing math, and routing rules that survive review.',
    },
    {
      icon: Code2,
      title: 'Export where work happens',
      description: 'Produce JSON, TypeScript, ASCII, SVG, PNG, or an interactive player from one source.',
    },
  ],
  steps: [
    {
      number: '01',
      title: 'Add the skill',
      description: 'Commit the skill file to your repository so every agent gets the same diagram contract.',
    },
    {
      number: '02',
      title: 'Ask naturally',
      description: 'Request an architecture diagram, system flow, change review, or repair in ordinary language.',
    },
    {
      number: '03',
      title: 'Keep it reviewable',
      description: 'The agent validates the typed source and leaves a deterministic artifact your team can diff.',
    },
  ],
}

const MCP_TOOLS = [
  ['validate_diagram', 'Coded validation and repair suggestions'],
  ['diff_diagram', 'Structural before and after delta'],
  ['auto_layout', 'Deterministic graph positioning'],
  ['render_ascii', 'Fast terminal-safe preview'],
  ['render_svg', 'Deterministic vector artifact'],
  ['render_png', 'Agent-visible image output'],
  ['render_html', 'Component, iframe, or standalone page'],
  ['editor_handoff', 'Open the result in the visual studio'],
]

const SKILL_ACTIONS = [
  ['CREATE', 'Generate a new system diagram from a brief'],
  ['MODIFY', 'Add, remove, reconnect, or restyle existing nodes'],
  ['DEBUG', 'Repair schema, geometry, and composition problems'],
  ['REVIEW', 'Explain structural changes with stable connector identity'],
  ['EXPORT', 'Produce code, images, text, or interactive embeds'],
  ['GUIDE', 'Build a chaptered walkthrough with shareable views'],
]

function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <button className="asp-copy" type="button" onClick={copy} aria-label="Copy command">
      {copied ? <Check aria-hidden="true" /> : <Clipboard aria-hidden="true" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

function CodeBlock({ code, label = 'terminal' }: { code: string; label?: string }) {
  return (
    <div className="asp-code">
      <div className="asp-code-bar">
        <span>{label}</span>
        <CopyCode code={code} />
      </div>
      <pre><code>{code}</code></pre>
    </div>
  )
}

function SetupOptions({ options }: { options: SetupOption[] }) {
  const [selected, setSelected] = useState(0)
  const option = options[selected]

  return (
    <div className="asp-setup-picker">
      <div className="asp-client-tabs" role="tablist" aria-label="MCP client setup">
        {options.map((item, index) => (
          <button
            aria-controls="asp-setup-panel"
            aria-selected={selected === index}
            className={selected === index ? 'is-active' : ''}
            key={item.label}
            onClick={() => setSelected(index)}
            role="tab"
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>
      <div id="asp-setup-panel" role="tabpanel">
        <CodeBlock code={option.code} label={option.codeLabel} />
      </div>
    </div>
  )
}

export default function AgentSharePage({ kind }: { kind: SharePageKind }) {
  const config = kind === 'mcp' ? MCP_CONFIG : SKILLS_CONFIG
  const capabilities = kind === 'mcp' ? MCP_TOOLS : SKILL_ACTIONS

  useMeta({
    title: config.metaTitle,
    description: config.metaDescription,
    image: kind === 'mcp' ? '/og-mcp.png' : '/og-skills.png',
    url: `/${kind}`,
  })

  return (
    <div className="asp-root">
      <div className="asp-grid" aria-hidden="true" />
      <div className="asp-shell">
        <header className="asp-header">
          <Link className="asp-brand" to="/" aria-label="Arc home">
            <ArcMark className="asp-mark" />
            <span>
              <strong>Arc</strong>
              <small>diagrams as code</small>
            </span>
          </Link>
          <nav className="asp-nav" aria-label="Agent pages">
            <Link className={kind === 'mcp' ? 'is-active' : ''} to="/mcp">MCP</Link>
            <Link className={kind === 'skills' ? 'is-active' : ''} to="/skills">Skills</Link>
            <Link to="/architecture-diagram-software">Software</Link>
            <Link to="/docs">Docs</Link>
            <a href="https://github.com/hudsonkit/arc" target="_blank" rel="noreferrer">GitHub ↗</a>
          </nav>
        </header>

        <main>
          <section className="asp-hero">
            <div className="asp-hero-copy">
              <div className="asp-eyebrow">{config.eyebrow}</div>
              <h1>{config.title}</h1>
              <p>{config.lead}</p>
              <div className="asp-actions">
                <a className="asp-button asp-button-primary" href="#start">Get started <ArrowRight aria-hidden="true" /></a>
                <Link className="asp-button asp-button-secondary" to={config.docsHref}>{config.docsLabel}</Link>
              </div>
              <div className="asp-signal-row">
                <span>TYPED INPUT</span>
                <span>CODED DIAGNOSTICS</span>
                <span>DETERMINISTIC OUTPUT</span>
              </div>
            </div>

            <div className="asp-terminal" aria-label={`${kind} example`}>
              <div className="asp-terminal-bar">
                <span>{kind === 'mcp' ? 'agent.tool-call' : 'agent.skill-run'}</span>
                <div><i /><i /><i /></div>
              </div>
              <div className="asp-terminal-body">
                <div className="asp-terminal-label">REQUEST</div>
                <p>{kind === 'mcp'
                  ? 'Map this service, validate the result, and return a PNG for the pull request.'
                  : 'Create a reviewable architecture diagram for this repository.'}</p>
                <div className="asp-trace">
                  <span>01</span><b>{kind === 'mcp' ? 'validate_diagram' : 'read contract'}</b><em>pass</em>
                  <span>02</span><b>{kind === 'mcp' ? 'auto_layout' : 'compose model'}</b><em>pass</em>
                  <span>03</span><b>{kind === 'mcp' ? 'render_png' : 'validate + render'}</b><em>pass</em>
                </div>
                <div className="asp-result">
                  <Sparkles aria-hidden="true" />
                  <span>{kind === 'mcp' ? 'diagram.png + typed source' : 'system.arc.ts + diagram.svg'}</span>
                </div>
              </div>
            </div>
          </section>

          <section className="asp-install asp-start" id="start">
            <div>
              <div className="asp-tag">// GETTING STARTED</div>
              <h2>{kind === 'mcp' ? 'Add Arc MCP in one command.' : 'Add the skill in one command.'}</h2>
              <p>{kind === 'mcp'
                ? 'Choose your client, copy its native setup, and start using the same Arc tools everywhere.'
                : 'The open Skills installer finds your coding agents and puts the Arc playbook in the right place.'}</p>
            </div>
            {config.setupOptions
              ? <SetupOptions options={config.setupOptions} />
              : <CodeBlock code={config.primaryCode} />}
          </section>

          <div className="asp-ruler" aria-hidden="true" />

          <section className="asp-section">
            <div className="asp-section-heading">
              <div>
                <div className="asp-tag">// WHAT IT UNLOCKS</div>
                <h2>From prompt to artifact, without the hand-waving.</h2>
              </div>
              <p>Arc gives agents a closed contract and a renderer, so the result is not merely plausible text. It is data your team can validate, diff, edit, and ship.</p>
            </div>
            <div className="asp-outcomes">
              {config.outcomes.map(({ icon: Icon, title, description }, index) => (
                <article key={title}>
                  <div className="asp-outcome-top">
                    <Icon aria-hidden="true" />
                    <span>0{index + 1}</span>
                  </div>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="asp-section asp-capabilities">
            <div>
              <div className="asp-tag">// CAPABILITIES</div>
              <h2>{kind === 'mcp' ? 'A complete authoring loop.' : 'A diagram craft playbook.'}</h2>
              <p>{kind === 'mcp'
                ? 'Each tool does one clear job. Agents can inspect intermediate results and recover from errors instead of treating rendering as a black box.'
                : 'The skill covers more than syntax. It teaches judgment: what belongs in the view, how information should flow, and when a diagram needs chapters.'}</p>
            </div>
            <div className="asp-capability-list">
              {capabilities.map(([name, description]) => (
                <div key={name}>
                  <code>{name}</code>
                  <span>{description}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="asp-section">
            <div className="asp-tag">// START IN THREE STEPS</div>
            <div className="asp-steps">
              {config.steps.map((step) => (
                <article key={step.number}>
                  <span>{step.number}</span>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="asp-cta">
            <div>
              <div className="asp-eyebrow">// THE DIAGRAM IS THE SOURCE</div>
              <h2>Give the agent structure. Keep the result yours.</h2>
            </div>
            <div className="asp-actions">
              <Link className="asp-button asp-button-primary" to={config.docsHref}>{config.docsLabel} <ArrowRight aria-hidden="true" /></Link>
              <Link className="asp-button asp-button-secondary" to={kind === 'mcp' ? '/skills' : '/mcp'}>
                Explore Arc {kind === 'mcp' ? 'Skills' : 'MCP'}
              </Link>
            </div>
          </section>
        </main>

        <footer className="asp-footer">
          <span>ARC · AGENT-NATIVE DIAGRAMS</span>
          <span>JSON / TS → VALIDATE → RENDER → REVIEW</span>
        </footer>
      </div>
    </div>
  )
}
