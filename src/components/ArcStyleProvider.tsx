import { createContext, useContext, type ReactNode } from 'react'
import type { ArcStyle } from '../utils/themes'

const ArcStyleContext = createContext<ArcStyle | undefined>(undefined)

/**
 * Hand one host style to every `<ArcDiagram>` below it. A diagram's own
 * `style` prop still wins. The host keeps choosing `mode`.
 */
export function ArcStyleProvider({ style, children }: { style: ArcStyle; children: ReactNode }) {
  return <ArcStyleContext.Provider value={style}>{children}</ArcStyleContext.Provider>
}

/** The style from the nearest `<ArcStyleProvider>`, if any. */
// eslint-disable-next-line react-refresh/only-export-components
export function useArcStyle(): ArcStyle | undefined {
  return useContext(ArcStyleContext)
}
