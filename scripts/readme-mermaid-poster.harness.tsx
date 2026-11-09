/**
 * Browser-side mount for scripts/generate-readme-mermaid-poster.ts.
 * The sequence only: no library chrome, no zoom bar, one message lit.
 */
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { ArcMermaidPlayer } from '../packages/viewer/src/mermaid/index'

const source = `sequenceDiagram
  participant Client
  participant API
  participant Cache
  participant DB as Database
  Client->>API: Get product
  API->>Cache: Lookup key
  alt Cache hit
    Cache-->>API: Cached value
  else Cache miss
    Cache-->>API: Not found
    API->>DB: Read product
    DB-->>API: Product row
    API->>Cache: Store with TTL
  end
  API-->>Client: Product`

export function mount(element: HTMLElement, sequenceWidth: number) {
  const root = createRoot(element)
  flushSync(() => {
    root.render(
      <ArcMermaidPlayer
        source={source}
        mode="light"
        showControls={false}
        showPlayback={false}
        defaultZoom={1}
        defaultStep={4}
        sequence={{ width: sequenceWidth }}
      />,
    )
  })
}
