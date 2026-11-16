import { useState } from 'react'

/** kw: keyword or command · str: string · tag: JSX element · attr: JSX attribute · name: identifier · punc: punctuation */
type Kind = 'kw' | 'str' | 'tag' | 'attr' | 'name' | 'punc' | 'text'
type Line = Array<[Kind, string]>
export type CodeBlock = { label: string; lines: Line[] }

const text = (line: Line) => line.map(([, value]) => value).join('')

function CopyGlyph({ done }: { done: boolean }) {
  return done ? (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 8.5l3 3 6-7" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round">
      <rect x="5.5" y="5.5" width="7" height="7" rx="1" />
      <path d="M3.5 10.5v-6a1 1 0 0 1 1-1h6" />
    </svg>
  )
}

function Block({ block }: { block: CodeBlock }) {
  const [copied, setCopied] = useState(false)
  const source = block.lines.map(text).join('\n')
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(source)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      window.prompt('Copy this code', source)
    }
  }
  return (
    <div className="tl-code-block">
      <div className="tl-code-head">
        <span>{block.label}</span>
        <button type="button" className="tl-code-copy" onClick={copy} aria-label={copied ? `${block.label} code copied` : `Copy the ${block.label.toLowerCase()} code`}>
          <CopyGlyph done={copied} />
          <span aria-hidden="true">{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre className="tl-code-pre"><code>{block.lines.map((line, i) => (
        <span key={i} className="tl-code-line">
          {line.map(([kind, value], j) => kind === 'text' ? value : <span key={j} className={`tl-tok-${kind}`}>{value}</span>)}
        </span>
      ))}</code></pre>
    </div>
  )
}

/** Code on the landing: each block highlighted, with its own copy button. */
export default function LandingCode({ blocks, label }: { blocks: CodeBlock[]; label: string }) {
  return (
    <div className="tl-code" role="group" aria-label={label}>
      {blocks.map(block => <Block key={block.label} block={block} />)}
    </div>
  )
}
