import { useMemo, useState } from 'react'
import { Check, Code2, Copy, Play } from 'lucide-react'
import ArcDiagram, { type ArcDiagramData } from './ArcDiagram'

type IsoPlateId = 'blueprint' | 'cyanotype'

const isoPlates: Record<IsoPlateId, { plate: string; detail: string }> = {
  blueprint: {
    plate: 'PLATE 01',
    detail: 'isoStyle: blueprint — sepia ink on parchment',
  },
  cyanotype: {
    plate: 'PLATE 02',
    detail: 'isoStyle: cyanotype — white ink on blueprint blue',
  },
}

function buildMarkupSource(data: ArcDiagramData, isoStyle: IsoPlateId): string {
  const { id: _id, ...rest } = data
  return JSON.stringify(
    {
      ...rest,
      _meta: { viewMode: 'isometric', isoStyle },
    },
    null,
    2,
  )
}

function buildPlayerSource(isoStyle: IsoPlateId): string {
  return `import { ArcDiagram } from '@hudsonkit/arc'
import diagram from './arc.arch.001.json'

export function ArchitecturePlate() {
  return (
    <ArcDiagram
      data={diagram}
      theme="cool"
      mode="light"
      defaultViewMode="isometric"
      defaultIsoStyle="${isoStyle}"
      defaultZoom="fit"
      maxFitZoom={1}
      interactive={false}
      hoverEffects={false}
      label="arc.arch.001"
    />
  )
}`
}

function SourcePanel({
  filename,
  source,
  label,
}: {
  filename: string
  source: string
  label: string
}) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    await navigator.clipboard.writeText(source)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div className="tl-iso-source-panel">
      <div className="tl-iso-source-bar">
        <span className="tl-iso-source-name">{filename}</span>
        <button type="button" className="tl-iso-source-copy" onClick={copy} aria-label={`Copy ${label}`}>
          {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="tl-iso-source-code" tabIndex={0} aria-label={label}>
        <code>{source}</code>
      </pre>
    </div>
  )
}

export default function IsoPlateShowcase({ data }: { data: ArcDiagramData }) {
  const [isoPlate, setIsoPlate] = useState<IsoPlateId>('blueprint')
  const [view, setView] = useState<'player' | 'source'>('player')
  const activeIso = isoPlates[isoPlate]

  const markupSource = useMemo(() => buildMarkupSource(data, isoPlate), [data, isoPlate])
  const playerSource = useMemo(() => buildPlayerSource(isoPlate), [isoPlate])

  return (
    <div className="tl-iso-showcase">
      <div className="tl-iso-toolbar">
        <div className="tl-iso-toggle" role="tablist" aria-label="Isometric plate style">
          {(Object.keys(isoPlates) as IsoPlateId[]).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={isoPlate === id}
              className={`tl-iso-toggle-btn${isoPlate === id ? ' is-active' : ''}`}
              onClick={() => setIsoPlate(id)}
            >
              {isoPlates[id].plate}
            </button>
          ))}
        </div>
        <div className="tl-iso-toggle tl-iso-view-toggle" role="tablist" aria-label="Plate preview">
          <button
            type="button"
            role="tab"
            aria-selected={view === 'player'}
            className={`tl-iso-toggle-btn${view === 'player' ? ' is-active' : ''}`}
            onClick={() => setView('player')}
          >
            <Play size={13} aria-hidden="true" /> Player
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'source'}
            className={`tl-iso-toggle-btn${view === 'source' ? ' is-active' : ''}`}
            onClick={() => setView('source')}
          >
            <Code2 size={13} aria-hidden="true" /> Source
          </button>
        </div>
      </div>

      {view === 'player' ? (
        <figure className="tl-iso-card">
          <div className="tl-diagram-mount">
            <ArcDiagram
              key={isoPlate}
              data={data}
              mode="light"
              theme="cool"
              defaultZoom="fit"
              maxFitZoom={1}
              interactive={false}
              hoverEffects={false}
              showArcToggle={false}
              defaultViewMode="isometric"
              defaultIsoStyle={isoPlate}
              label="arc.arch.001"
            />
          </div>
          <figcaption className="tl-iso-caption">
            <span>{activeIso.plate}</span>
            <span className="tl-iso-style">{activeIso.detail}</span>
          </figcaption>
        </figure>
      ) : (
        <div className="tl-iso-source-grid">
          <SourcePanel
            filename="arc.arch.001.json"
            source={markupSource}
            label="Diagram markup"
          />
          <SourcePanel
            filename="ArchitecturePlate.tsx"
            source={playerSource}
            label="Player embed"
          />
        </div>
      )}
    </div>
  )
}
