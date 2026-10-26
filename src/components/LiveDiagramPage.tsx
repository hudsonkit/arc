import { useMemo } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { AppShell } from 'hudsonkit/app-shell'
import { createLiveApp } from '../apps/arc-live/createLiveApp'
import { parseLiveStream } from '../apps/arc-live/liveState'
import { useChromeTheme } from '../hooks/useChromeTheme'
import { useUiScale } from '../hooks/useUiScale'
import { useMeta } from '../hooks/useMeta'
import '../editor-shell.css'
import '../live-diagram.css'

export default function LiveDiagramPage() {
  const { sessionId = '' } = useParams<{ sessionId: string }>()
  const { hash } = useLocation()
  const stream = parseLiveStream(hash, sessionId)
  const app = useMemo(() => createLiveApp(sessionId, stream), [sessionId, stream])
  useChromeTheme()
  useUiScale()
  useMeta({ title: 'Arc | Live architecture', description: 'Your architecture, as your agents build it.' })
  return <div className="arc-editor-root arc-live-root">
    <AppShell key={`${sessionId}:${stream}`} app={app} assistant={false} defaultTheme="dark" defaultTemplate="hudson"
      chrome={{ palette: false, terminal: false, leftPanel: false, rightPanel: false }} />
  </div>
}
