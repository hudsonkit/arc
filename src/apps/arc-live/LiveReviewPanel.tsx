import { useEffect, useState, type Ref } from 'react'
import { Check, Copy, Download, ExternalLink, X } from 'lucide-react'
import { useLiveDiagram } from './LiveDiagramContext'
import { reviewSourceUrl, reviewWebUrl } from './reviewData'

export type ReviewPanelMode = 'review' | 'changes'

export function LiveReviewPanel({ mode, onModeChange, onClose, closeRef }: {
  mode: ReviewPanelMode
  onModeChange: (mode: ReviewPanelMode) => void
  onClose: () => void
  closeRef: Ref<HTMLButtonElement>
}) {
  const s = useLiveDiagram()
  const review = s.snapshot?.review
  const savedReview = !!review || !!s.artifact
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')
  const [downloadError, setDownloadError] = useState(false)
  useEffect(() => {
    if (copyState !== 'copied') return
    const timer = setTimeout(() => setCopyState('idle'), 2500)
    return () => clearTimeout(timer)
  }, [copyState])
  const currentSaved = !!s.artifact && s.artifact.snapshot.revision >= (s.snapshot?.revision ?? 0)
  const savedLabel = s.artifact
    ? `${currentSaved ? 'Saved' : 'Saved through'} r${s.artifact.snapshot.revision} · ${s.artifact.revisions.length} revisions`
    : s.artifactLoading ? 'Loading saved review…' : s.testBench ? 'Edits in the sample sequence.' : 'Saved history is not available.'
  const downloadReview = () => {
    if (!s.artifact || !currentSaved) return
    try {
      const url = URL.createObjectURL(new Blob([JSON.stringify(s.artifact, null, 2)], { type: 'application/json' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `${s.artifact.snapshot.title.replace(/[^a-z0-9_-]+/gi, '-').slice(0, 80) || 'architecture'}.arc-review.json`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setDownloadError(false)
    } catch { setDownloadError(true) }
  }
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopyState('copied')
    } catch { setCopyState('error') }
  }
  const repositoryUrl = reviewWebUrl(review?.repository?.url)

  return (
    <aside id="arc-live-activity" className="arc-live-review" aria-label={mode === 'review' ? 'Architecture review' : 'Recent diagram changes'} onKeyDown={event => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose() }
    }}>
      <div className="arc-live-review-heading">
        <nav aria-label="Review panels">
          {review && <button type="button" aria-pressed={mode === 'review'} onClick={() => onModeChange('review')}>Review</button>}
          <button type="button" aria-pressed={mode === 'changes'} onClick={() => onModeChange('changes')}>Changes</button>
        </nav>
        <button ref={closeRef} type="button" className="arc-live-control arc-live-icon-control" aria-label={mode === 'review' ? 'Close review' : 'Close recent changes'} onClick={onClose}><X size={15} /></button>
      </div>
      <div className="arc-live-review-body">
        {mode === 'review' && review ? (
          <>
            {review.repository && <div className="arc-live-review-repository">
              {repositoryUrl ? <a href={repositoryUrl} target="_blank" rel="noopener noreferrer">{review.repository.name}<ExternalLink size={12} aria-hidden="true" /></a> : <span>{review.repository.name}</span>}
              {review.repository.revision && <code title={review.repository.revision}>{review.repository.revision}</code>}
            </div>}
            <h2 className="arc-live-review-question">{review.question}</h2>
            {review.summary && <p className="arc-live-review-summary">{review.summary}</p>}
            <section className="arc-live-review-section" aria-label="Findings">
              <h3>Findings <span>{review.findings.length}</span></h3>
              {review.findings.length === 0 ? <p className="arc-live-review-muted">No findings recorded.</p> : <ol className="arc-live-findings">
                {review.findings.map(finding => <li key={finding.id} data-finding-id={finding.id}>
                  <div className="arc-live-finding-title"><h4>{finding.title}</h4><span className="arc-live-severity" data-severity={finding.severity}>{finding.severity}</span></div>
                  <p>{finding.detail}</p>
                  {finding.sources.length > 0 && <ul className="arc-live-review-sources" aria-label={`Sources for ${finding.title}`}>
                    {finding.sources.map((source, index) => {
                      const url = reviewSourceUrl(source, review.repository)
                      const label = `${source.path}${source.line ? `:${source.line}` : ''}`
                      return <li key={`${label}:${index}`}>{url
                        ? <a href={url} target="_blank" rel="noopener noreferrer"><code>{label}</code><ExternalLink size={12} aria-hidden="true" /></a>
                        : <code>{label}</code>}{source.revision && source.revision !== review.repository?.revision && <span title={source.revision}>{source.revision}</span>}</li>
                    })}
                  </ul>}
                  {!!finding.nodeIds?.length && <div className="arc-live-finding-nodes"><span>Nodes</span>{finding.nodeIds.map((id, index) => <code key={`${id}:${index}`}>{id}</code>)}</div>}
                </li>)}
              </ol>}
            </section>
            {review.decisions.length > 0 && <section className="arc-live-review-section"><h3>Decisions</h3><ul className="arc-live-review-notes">{review.decisions.map((decision, index) => <li key={index}>{decision}</li>)}</ul></section>}
            {review.openQuestions.length > 0 && <section className="arc-live-review-section"><h3>Open questions</h3><ul className="arc-live-review-notes">{review.openQuestions.map((question, index) => <li key={index}>{question}</li>)}</ul></section>}
          </>
        ) : (
          <div className="arc-live-activity arc-live-review-history">
            <h2>Change history</h2>
            <p>{s.testBench ? 'Edits in the sample sequence.' : s.artifact ? 'Revisions are saved with this review and remain available when you reopen its link.' : savedReview ? 'Live revisions appear here. Saved history will join them when the server is available.' : 'Revisions received in this view.'}</p>
            {s.activity.length === 0 ? <p>Waiting for the first revision.</p> : <ol>{s.activity.map(entry => <li key={entry.revision}>
              <div><code>r{entry.revision}</code>{!s.testBench && <time dateTime={entry.updatedAt} title={new Date(entry.updatedAt).toLocaleString()}>{new Date(entry.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>}</div>
              <strong>{entry.message}</strong><span>{entry.actor}</span>
            </li>)}</ol>}
          </div>
        )}
      </div>
      {!s.testBench && savedReview && <footer className="arc-live-review-footer">
        <p className="arc-live-review-saved" role="status">{savedLabel}</p>
        {(s.artifactError || downloadError || copyState === 'error') && <p className="arc-live-review-error" role="status">{s.artifactError || (downloadError ? 'The download could not start. Try again.' : 'The link could not be copied. You can copy it from the address bar.')}</p>}
        <div className="arc-live-review-actions">
          <button type="button" className="arc-live-control" onClick={downloadReview} disabled={!currentSaved} title={currentSaved ? 'Download the review, baseline, and revision history' : 'Waiting for the latest saved revision'}><Download size={14} />Save review</button>
          {s.stream && <button type="button" className="arc-live-control" onClick={copyLink}>{copyState === 'copied' ? <Check size={14} /> : <Copy size={14} />}{copyState === 'copied' ? 'Copied link' : 'Copy review link'}</button>}
          {s.artifactError && <button type="button" className="arc-live-control" onClick={s.retry}>Retry</button>}
        </div>
        {s.stream && <p className="arc-live-review-link-note">This private link reopens the saved review while its MCP server is available. Anyone with the link can read it.</p>}
      </footer>}
    </aside>
  )
}
