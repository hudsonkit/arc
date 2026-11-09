/**
 * Browser-side mount for scripts/generate-readme-sequence.ts. Vite serves this
 * module from the running dev server, so the capture is the real showcase —
 * same component, CSS, fixture and fonts — not a re-drawing of it.
 */
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import SequenceEngineShowcase from '../src/components/SequenceEngineShowcase'

export function mount(element: HTMLElement, sequenceWidth: number) {
  const root = createRoot(element)
  flushSync(() => {
    root.render(<SequenceEngineShowcase showSource sequenceWidth={sequenceWidth} startZoom={1} />)
  })
}
