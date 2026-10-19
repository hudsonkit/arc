// Design-sync-only entry — NOT part of the published package (src/index.ts).
//
// The Arc marketing homepage (src/components/LandingPage.tsx) is an app-internal
// page: it needs a react-router context for its <Link>s and an onLaunchEditor
// callback. This module re-exports it as a self-contained component so the
// design-sync converter can bundle it onto window.Arc and render it as a card
// in the "Arc — Design System" project, without polluting the published API.
//
// Wired in via `extraEntries` in .design-sync/config.json.
import { MemoryRouter } from 'react-router-dom'
import { ArcDiagram } from '@hudsonkit/arc'
import LandingPageImpl from './components/LandingPage'
import DiagramEditorImpl from './components/editor/DiagramEditor'
import architectureDiagram from './components/diagrams/architecture.diagram'

/**
 * Standalone Arc homepage — the full marketing page (hero, install, architecture,
 * docs grid) wrapped in a MemoryRouter with a no-op launch handler so it renders
 * with no host router and no required props.
 */
export function LandingPage() {
  return (
    <MemoryRouter>
      <LandingPageImpl onLaunchEditor={() => {}} />
    </MemoryRouter>
  )
}

/**
 * Standalone Arc studio — the full diagram editor (top bar, canvas, floating
 * toolbar, properties panel) loaded with the built-in sample diagram. The real
 * DiagramEditor self-wraps its EditorProvider and is h-screen, so it fills the
 * card viewport with no host state, router, or required props.
 */
export function DiagramStudio() {
  return <DiagramEditorImpl colorMode="light" />
}

// Design-language diagram versions — the canonical Arc architecture diagram
// rendered in each design-language theme. Each is its OWN export so it becomes a distinct
// card/tile in the design pane (not just a cell inside the ArcDiagram card).
function BrandDiagram({ theme, mode }: { theme: 'engineering' | 'workbench' | 'tactical' | 'spacex' | 'claude' | 'codex'; mode: 'light' | 'dark' }) {
  return (
    <div style={{ width: 860, height: 420 }}>
      <ArcDiagram data={architectureDiagram} mode={mode} theme={theme} interactive={false} defaultZoom="fit" showControls showMinimap />
    </div>
  )
}

/** Arc architecture diagram in the Engineering theme (systematic blue on structured gray). */
export function ArcDiagramEngineering() { return <BrandDiagram theme="engineering" mode="dark" /> }
/** Arc architecture diagram in the Workbench theme (dark slate + intents). */
export function ArcDiagramWorkbench() { return <BrandDiagram theme="workbench" mode="dark" /> }
/** Arc architecture diagram in the Tactical theme (tactical black + amber). */
export function ArcDiagramTactical() { return <BrandDiagram theme="tactical" mode="dark" /> }
/** Arc architecture diagram in the SpaceX theme (mission plate + telemetry cyan). */
export function ArcDiagramSpaceX() { return <BrandDiagram theme="spacex" mode="dark" /> }
/** Arc architecture diagram in the Claude theme (parchment + clay accents). */
export function ArcDiagramClaude() { return <BrandDiagram theme="claude" mode="light" /> }
/** Arc architecture diagram in the Codex theme (graphite console + mint signal). */
export function ArcDiagramCodex() { return <BrandDiagram theme="codex" mode="dark" /> }
