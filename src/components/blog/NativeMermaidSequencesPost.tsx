import { ArrowLeft, ArrowRight, Github } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useMeta } from '../../hooks/useMeta'
import SequenceEngineShowcase from '../SequenceEngineShowcase'
import '../../blog.css'

export default function NativeMermaidSequencesPost() {
  useMeta({
    title: 'Mermaid in, Arc out | Arc',
    description: 'Why Arc gives sequence diagrams a native semantic model, renderer, and player.',
    url: '/blog/native-mermaid-sequences',
  })

  return (
    <div className="arc-note">
      <header className="arc-note__nav">
        <Link to="/" className="arc-note__brand" aria-label="Arc home">
          <span aria-hidden="true">A</span>
          Arc / notes
        </Link>
        <nav aria-label="Build note links">
          <Link to="/docs/mermaid-sequences">Sequence docs</Link>
          <a href="https://github.com/hudsonkit/arc" target="_blank" rel="noreferrer">
            <Github size={14} aria-hidden="true" /> GitHub
          </a>
        </nav>
      </header>

      <main className="arc-note__main">
        <article>
          <Link className="arc-note__back" to="/">
            <ArrowLeft size={14} aria-hidden="true" /> Back to Arc
          </Link>

          <header className="arc-note__hero">
            <div className="arc-note__kicker">BUILD NOTE · SEQUENCE ENGINE · JUL 2026</div>
            <h1>Mermaid in, Arc out.</h1>
            <p>
              Why Arc gives interactions a native semantic model instead of turning them into
              architecture boxes or putting new chrome around Mermaid.js.
            </p>
          </header>

          <div className="arc-note__prose arc-note__lead">
            <p>
              Architecture diagrams describe what exists. Sequence diagrams describe what
              happens: who speaks, in what order, and where the story branches. Those are
              different questions, so they need different models.
            </p>
            <p>
              A universal graph is tempting. Convert each participant into a node and each
              message into a connector, then reuse the architecture renderer. The conversion is
              easy, but it discards lifelines, authored order, notes, and fragments—the details
              that make the sequence useful.
            </p>
          </div>

          <figure className="arc-note__demo">
            <SequenceEngineShowcase showSource />
            <figcaption>
              The live Arc renderer. Step through messages in the player or open Source to inspect
              the canonical Mermaid text.
            </figcaption>
          </figure>

          <div className="arc-note__prose">
            <h2>A diagram family gets its own model</h2>
            <p>
              Arc's architecture engine uses nodes, connectors, groups, and positions. Sequence
              uses participants, lifelines, ordered messages, notes, and fragments. The parser
              therefore produces an <code>ArcSequenceDocument</code>, not a lossy
              <code>ArcDiagramData</code> projection.
            </p>

            <div className="arc-note__pipeline" aria-label="Sequence rendering pipeline">
              <span>Mermaid source</span><i>→</i><span>typed document</span><i>→</i>
              <span>pure layout</span><i>→</i><span>SVG parts</span><i>→</i><span>player</span>
            </div>

            <p>
              Mermaid remains the diffable source. Arc owns the semantic document, layout,
              replaceable visual parts, theme tokens, and interaction. Hosts can customize the
              presentation without changing what the sequence says.
            </p>

            <h2>A player, not a screenshot</h2>
            <p>
              A sequence is read in time. The player can focus participants, zoom, enter
              fullscreen, and move through messages in authored order. The Scout example uses
              those controls to reveal when a local request becomes delegated repository work.
            </p>
            <p>
              Its colored notes are an explicit presentation rule. The host maps known note
              language to accents; Arc does not infer cost boundaries from arbitrary prose.
            </p>

            <aside className="arc-note__callout">
              <strong>Why not Mermaid.js?</strong>
              <p>
                Arc is not pursuing grammar parity with a new skin. It needs a native, typed
                surface whose rendering and interaction are under product control.
              </p>
            </aside>

            <h2>What the first release supports</h2>
            <p>
              The current engine supports participants, common message arrows, notes, and the
              core fragment forms used by the Scout model. It renders in light and dark themes,
              and reports unsupported syntax instead of inventing a replacement.
            </p>
            <p>
              It is not full Mermaid support. Activation bars, measured fit-to-container, and
              native flowchart and state renderers remain future work. Naming those boundaries is
              part of keeping diagrams trustworthy.
            </p>

            <Link className="arc-note__next" to="/docs/mermaid-sequences">
              <span><small>IMPLEMENTATION GUIDE</small>Native Mermaid sequences</span>
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </div>
        </article>
      </main>
    </div>
  )
}
