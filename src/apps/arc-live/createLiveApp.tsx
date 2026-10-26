import { createElement, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { HudsonApp, StatusColor } from 'hudsonkit'
import { useTheme } from 'hudsonkit/theme'
import { Moon, Sun } from 'lucide-react'
import { LiveDiagramProvider, useLiveDiagram } from './LiveDiagramContext'
import { LiveDiagramContent } from './LiveDiagramContent'
import { connectionLabel } from './liveState'

function LiveNavCenter() {
  const { snapshot } = useLiveDiagram()
  return <div className="arc-editor-nav-center"><strong>{snapshot?.title || 'Live architecture'}</strong></div>
}

function LiveNavActions() {
  const { resolvedTheme, setTheme } = useTheme()
  const { testBench, openTestBench } = useLiveDiagram()
  return <div className="arc-editor-actions">
    <button type="button" className="arc-editor-btn-ghost" onClick={testBench ? testBench.close : openTestBench}>{testBench ? 'Back to live' : 'Test bench'}</button>
    <Link to="/mcp" className="arc-editor-btn-ghost arc-live-mcp-setup">MCP setup</Link>
    <button type="button" className="arc-editor-btn" aria-label="Toggle appearance" onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}>
      {resolvedTheme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  </div>
}

function useLiveStatus(): { label: string; color: StatusColor } {
  const s = useLiveDiagram()
  if (s.testBench) return { label: s.testBench.playing ? 'Playing sample sequence' : s.testBench.completed ? 'Sample sequence complete' : 'Sample sequence paused', color: 'neutral' }
  return {
    label: connectionLabel(s.connection, s.working),
    color: s.error || s.connection === 'unavailable' ? 'red' : s.connection === 'connected' || s.connection === 'complete' ? 'emerald' : 'neutral',
  }
}

function LiveStatusRight() {
  const { snapshot } = useLiveDiagram()
  return <span className="arc-editor-status-mode">{snapshot ? `${Object.keys(snapshot.diagram.nodes).length} nodes · ${snapshot.diagram.connectors.length} connections` : 'Arc MCP'}</span>
}

export function createLiveApp(sessionId: string, stream: string | null): HudsonApp {
  function Provider({ children }: { children: ReactNode }) {
    return <LiveDiagramProvider sessionId={sessionId} stream={stream}>{children}</LiveDiagramProvider>
  }
  return {
    id: 'arc-live', name: 'Arc', description: 'Live architecture from your agents', mode: 'panel',
    icon: createElement('span', { className: 'arc-editor-ver' }, 'live'),
    Provider, slots: { Content: LiveDiagramContent },
    hooks: {
      useCommands: () => [], useStatus: useLiveStatus,
      useStatusRight: () => createElement(LiveStatusRight),
      useNavCenter: () => createElement(LiveNavCenter), useNavActions: () => createElement(LiveNavActions),
      useLayoutMode: () => 'panel' as const,
    },
  }
}
