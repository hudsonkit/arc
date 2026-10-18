import catalog from './exampleCatalog.json'
import type { ArcDiagramData } from '../types/diagram'

export type ExampleCategory = 'Architecture' | 'Sequence' | 'Flowchart' | 'State'
export interface DiagramExample {
  id: string
  title: string
  description: string
  category: ExampleCategory
  diagram?: ArcDiagramData
  source?: string
}
export const examples = catalog as DiagramExample[]
export const exampleSource = (example: DiagramExample) => example.source ?? JSON.stringify(example.diagram, null, 2) + '\n'
