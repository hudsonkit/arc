import { ArcDiagramIsometric } from '@hudsonkit/arc'

// Ported from src/components/IsometricExamples.tsx (DESIGN_SYSTEM). Three stacked
// tiers of an isometric architecture. animate:false so the card renders statically.
const designSystem = {
  id: 'ARC.ISO.001',
  title: 'Design System',
  description: 'UI component hierarchy',
  theme: 'dark' as const,
  canvas: { width: 1100, height: 700 },
  origin: { x: 550, y: 620 },
  cornerRadius: 6,
  tiers: [
    { name: 'Documents',  elevation: 0,   floorColor: '#0f172a', floorOpacity: 0.95, borderColor: '#334155' },
    { name: 'Components', elevation: 150, floorColor: '#1e293b', floorOpacity: 0.7,  borderColor: '#475569' },
    { name: 'Application',elevation: 300, floorColor: '#334155', floorOpacity: 0.5,  borderColor: '#64748b' },
  ],
  floorSize: { width: 380, depth: 260 },
  nodes: [
    { tier: 0, x: 25,  y: 25,  width: 150, depth: 100, height: 14, color: 'slate',   label: 'Doc' },
    { tier: 0, x: 200, y: 25,  width: 150, depth: 100, height: 14, color: 'slate',   label: 'Chart' },
    { tier: 0, x: 25,  y: 145, width: 150, depth: 100, height: 14, color: 'emerald', label: 'Data' },
    { tier: 0, x: 200, y: 145, width: 150, depth: 100, height: 14, color: 'slate',   label: 'Report' },
    { tier: 1, x: 25,  y: 25,  width: 150, depth: 100, height: 26, color: 'slate',   label: 'Card' },
    { tier: 1, x: 200, y: 25,  width: 150, depth: 100, height: 26, color: 'blue',    label: 'Button' },
    { tier: 1, x: 25,  y: 145, width: 150, depth: 100, height: 26, color: 'slate',   label: 'Input' },
    { tier: 1, x: 200, y: 145, width: 150, depth: 100, height: 26, color: 'violet',  label: 'Modal' },
    { tier: 2, x: 25,  y: 25,  width: 150, depth: 100, height: 24, color: 'slate',   label: 'Nav' },
    { tier: 2, x: 200, y: 25,  width: 150, depth: 100, height: 32, color: 'blue',    label: 'Dashboard' },
    { tier: 2, x: 25,  y: 145, width: 150, depth: 100, height: 24, color: 'cyan',    label: 'Sidebar' },
    { tier: 2, x: 200, y: 145, width: 150, depth: 100, height: 24, color: 'amber',   label: 'Panel' },
  ],
}

const dataPlatformLight = {
  ...designSystem,
  id: 'ARC.ISO.002',
  title: 'Data Platform',
  theme: 'light' as const,
  tiers: [
    { name: 'Data',     elevation: 0,   floorColor: '#f1f5f9', floorOpacity: 0.9, borderColor: '#94a3b8' },
    { name: 'Services', elevation: 150, floorColor: '#e0f2fe', floorOpacity: 0.7, borderColor: '#7dd3fc' },
    { name: 'Domains',  elevation: 300, floorColor: '#dbeafe', floorOpacity: 0.5, borderColor: '#93c5fd' },
  ],
}

function Frame({ children }: { children: React.ReactNode }) {
  return <div style={{ width: 640, height: 440 }}>{children}</div>
}

/** Dark, three-tier isometric stack — the canonical isometric view. */
export function DesignSystem() {
  return <Frame><ArcDiagramIsometric config={designSystem} options={{ animate: false, interactive: false }} /></Frame>
}

/** Light theme, same stacked-tier structure. */
export function Light() {
  return <Frame><ArcDiagramIsometric config={dataPlatformLight} options={{ animate: false, interactive: false }} /></Frame>
}
