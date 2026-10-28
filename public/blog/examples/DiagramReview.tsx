import {
  ArcDiagram, diffDiagram, type ArcDiagramData,
} from '@hudsonkit/arc'
import '@hudsonkit/arc/arc.css'
import before from './before.arc.json'
import after from './after.arc.json'

export function DiagramReview() {
  const base = before as ArcDiagramData
  const head = after as ArcDiagramData
  return (
    <ArcDiagram
      data={head}
      delta={diffDiagram(base, head)}
      theme="engineering"
      mode="light"
    />
  )
}
