import { useMemo, useState, type ReactNode } from 'react'
import { Check, Code2, Copy, FileCode2, Play, Sparkles } from 'lucide-react'
import {
  ArcMermaidPlayer,
  classifyNoteAccent,
} from '../../packages/viewer/src/mermaid/index'
import scoutSequenceSource from '../../fixtures/mermaid/scout-interaction.sequence.mmd?raw'
import '../sequence-showcase.css'

interface SequenceEngineShowcaseProps {
  mode?: 'light' | 'dark'
  showSource?: boolean
  /** The eyebrow, heading and lede; hosts that already title the section turn it off. */
  showIntro?: boolean
  compact?: boolean
  className?: string
}

type MermaidTokenKind =
  | 'keyword'
  | 'participant'
  | 'alias'
  | 'arrow'
  | 'punctuation'
  | 'message'
  | 'comment'

function token(kind: MermaidTokenKind, value: string, key: string): ReactNode {
  return (
    <span className={`arc-mermaid-token arc-mermaid-token--${kind}`} key={key}>
      {value}
    </span>
  )
}

function highlightMermaidLine(line: string, lineIndex: number): ReactNode[] {
  const key = (part: number) => `${lineIndex}-${part}`
  const commentIndex = line.indexOf('%%')

  if (commentIndex >= 0) {
    const before = line.slice(0, commentIndex)
    return [
      ...(before ? highlightMermaidLine(before, lineIndex) : []),
      token('comment', line.slice(commentIndex), key(90)),
    ]
  }

  const diagram = line.match(/^(\s*)(sequenceDiagram)(\s*)$/)
  if (diagram) {
    return [diagram[1], token('keyword', diagram[2], key(0)), diagram[3]]
  }

  const declaration = line.match(
    /^(\s*)(actor|participant)(\s+)([A-Za-z_][\w.-]*)(?:(\s+as\s+)(.*))?$/,
  )
  if (declaration) {
    return [
      declaration[1],
      token('keyword', declaration[2], key(0)),
      declaration[3],
      token('participant', declaration[4], key(1)),
      declaration[5] ?? '',
      declaration[6] ? token('alias', declaration[6], key(2)) : '',
    ]
  }

  const note = line.match(
    /^(\s*)(Note)(\s+)(over|left of|right of)(\s+)([^:]+)(:)(.*)$/i,
  )
  if (note) {
    return [
      note[1],
      token('keyword', note[2], key(0)),
      note[3],
      token('keyword', note[4], key(1)),
      note[5],
      token('participant', note[6], key(2)),
      token('punctuation', note[7], key(3)),
      token('message', note[8], key(4)),
    ]
  }

  const message = line.match(
    /^(\s*)([A-Za-z_][\w.-]*)(\s*)(-{1,2}(?:>>|>|x|\)))(\s*)([A-Za-z_][\w.-]*)(\s*)(:)(.*)$/,
  )
  if (message) {
    return [
      message[1],
      token('participant', message[2], key(0)),
      message[3],
      token('arrow', message[4], key(1)),
      message[5],
      token('participant', message[6], key(2)),
      message[7],
      token('punctuation', message[8], key(3)),
      token('message', message[9], key(4)),
    ]
  }

  const fragment = line.match(
    /^(\s*)(alt|else|opt|loop|par|and|rect|critical|break|end)(\b)?(.*)$/i,
  )
  if (fragment) {
    return [
      fragment[1],
      token('keyword', fragment[2], key(0)),
      fragment[3] ?? '',
      fragment[4] ? token('message', fragment[4], key(1)) : '',
    ]
  }

  return [line]
}

function MermaidSourceCode({ source }: { source: string }) {
  const [copied, setCopied] = useState(false)
  const highlightedLines = useMemo(
    () => source.replace(/\n$/, '').split('\n').map(highlightMermaidLine),
    [source],
  )

  const copySource = async () => {
    await navigator.clipboard.writeText(source)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div className="arc-sequence-showcase__source-shell">
      <div className="arc-sequence-showcase__source-toolbar">
        <span>
          <FileCode2 size={13} aria-hidden="true" /> scout-interaction.sequence.mmd
        </span>
        <button type="button" onClick={copySource} aria-label="Copy Mermaid source">
          {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="arc-sequence-showcase__source" tabIndex={0} aria-label="Mermaid source">
        <code>
          {highlightedLines.map((line, index) => (
            <span className="arc-sequence-showcase__source-line" key={index}>
              {line}
            </span>
          ))}
        </code>
      </pre>
    </div>
  )
}

export default function SequenceEngineShowcase({
  mode = 'light',
  showSource = false,
  showIntro = true,
  compact = false,
  className = '',
}: SequenceEngineShowcaseProps) {
  const [view, setView] = useState<'player' | 'source'>('player')
  // The player reads its zoom once at mount and the sequence is 1040 wide, so a
  // phone needs a smaller start or the right-hand lifelines open off-screen.
  const [startZoom] = useState(() => {
    const preferred = compact ? 0.72 : 0.82
    if (typeof window === 'undefined') return preferred
    return Math.max(0.5, Math.min(preferred, (window.innerWidth - 60) / 1040))
  })

  return (
    <section
      className={`arc-sequence-showcase ${compact ? 'is-compact' : ''} ${className}`.trim()}
      data-mode={mode}
      aria-label="Interactive Scout sequence diagram"
    >
      <header className="arc-sequence-showcase__header">
        {showIntro && (
          <div>
            <div className="arc-sequence-showcase__eyebrow">
              <Sparkles size={13} aria-hidden="true" />
              Rendered by Arc
            </div>
            <h3>A Scout request, end to end</h3>
            <p>Follow a message from local routing to a direct reply or delegated work.</p>
          </div>
        )}
        {showSource && (
          <div className="arc-sequence-showcase__tabs" aria-label="Sequence view">
            <button
              type="button"
              className={view === 'player' ? 'is-active' : ''}
              onClick={() => setView('player')}
            >
              <Play size={13} aria-hidden="true" /> Player
            </button>
            <button
              type="button"
              className={view === 'source' ? 'is-active' : ''}
              onClick={() => setView('source')}
            >
              <Code2 size={13} aria-hidden="true" /> Source
            </button>
          </div>
        )}
      </header>

      {view === 'player' ? (
        <div className="arc-sequence-showcase__player">
          <ArcMermaidPlayer
            source={scoutSequenceSource}
            mode={mode}
            defaultZoom={startZoom}
            minZoom={0.5}
            maxZoom={1.6}
            title="Scout interaction model"
            description="How a local Scout message becomes either a concierge reply or delegated repository work."
            sequence={{
              width: 1040,
              maxLabelWidth: 168,
              noteAccent: (event) => classifyNoteAccent(event.text),
            }}
          />
        </div>
      ) : (
        <MermaidSourceCode source={scoutSequenceSource} />
      )}

      <footer className="arc-sequence-showcase__footer">
        <span>Mermaid source stays canonical.</span>
        <span>Arc owns the semantic model, parts, theme, and player.</span>
      </footer>
    </section>
  )
}
