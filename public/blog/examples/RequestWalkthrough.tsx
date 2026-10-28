import { ArcDiagram, type ArcDiagramData } from '@hudsonkit/arc'
import '@hudsonkit/arc/arc.css'
import data from './request-walkthrough.arc.json'

export function RequestWalkthrough() {
  return (
    <ArcDiagram
      data={data as ArcDiagramData}
      theme="engineering"
      mode="light"
      showViews
      defaultViewId="request"
    />
  )
}
