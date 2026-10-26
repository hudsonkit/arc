import type { ArcDiagramData } from './diagram'

/** MCP connection identity with optional caller-declared labels for this session. */
export interface LiveDiagramActor {
  /** Actual client name from the MCP initialize handshake. */
  name: string
  version?: string
  /** Server-generated MCP connection ID, not a conversation ID. */
  id: string
  /** Caller-declared harness label; not inferred from the connection or verified. */
  harness?: string
  /** Optional caller-declared agent name; distinct from the MCP client name. */
  displayName?: string
}

/** Declared work can target existing nodes or space for components not added yet. */
export type LiveWorkScope =
  | { type: 'canvas' }
  | { type: 'nodes'; nodeIds: string[] }
  | { type: 'region'; x: number; y: number; width: number; height: number }

export interface LiveDiagramWork {
  id: string
  summary: string
  scope: LiveWorkScope
  status: 'working' | 'complete' | 'interrupted'
  startedAt: string
  finishedAt?: string
}

export interface ArchitectureReviewRepository {
  name: string
  url?: string
  revision?: string
}

export interface ArchitectureReviewSource {
  path: string
  line?: number
  revision?: string
  url?: string
}

export interface ArchitectureReviewFinding {
  id: string
  title: string
  detail: string
  severity: 'info' | 'low' | 'medium' | 'high'
  nodeIds?: string[]
  sources: ArchitectureReviewSource[]
}

export interface ArchitectureReview {
  question: string
  repository?: ArchitectureReviewRepository
  summary?: string
  findings: ArchitectureReviewFinding[]
  decisions: string[]
  openQuestions: string[]
}

/** Shareable review data. Read and resume capabilities never belong here. */
export interface ArchitectureReviewArtifact {
  schemaVersion: 1
  baseline: ArcDiagramData
  snapshot: LiveDiagramSnapshot
  revisions: LiveDiagramSnapshot[]
}

/** Full snapshots make a newly opened or reconnected viewer independent of history. */
export interface LiveDiagramSnapshot {
  sessionId: string
  revision: number
  diagram: ArcDiagramData
  title: string
  actor: LiveDiagramActor
  status: 'working' | 'idle' | 'complete'
  work?: LiveDiagramWork
  review?: ArchitectureReview
  message?: string
  updatedAt: string
}
