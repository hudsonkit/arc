/** Shared print material for React and static SVG exports. */
export const PRINT_COLORS: Record<string, { top: string; side: string; front: string }> = {
  rose: { top: '#c58a70', side: '#a86c55', front: '#b57860' },
  slate: { top: '#9aaab6', side: '#718693', front: '#8196a2' },
  cyan: { top: '#679c99', side: '#467f7d', front: '#568e8a' },
  emerald: { top: '#a2b08b', side: '#7d9168', front: '#8e9f78' },
  blue: { top: '#829eae', side: '#5b798b', front: '#6b8999' },
  violet: { top: '#a698ac', side: '#807187', front: '#918297' },
  amber: { top: '#c6ac71', side: '#a08950', front: '#b09a61' },
}
// Fixed seed: texture stays still on hover, rerenders, and static export.
export const PRINT_DOTS = Array.from({ length: 180 }, (_, i) => ({
  x: ((i * 73.37 + 11.7) % 64), y: ((i * i * 13.19 + 5.3) % 64),
  r: i % 3 === 0 ? 0.48 : 0.28,
}))

/**
 * Matte: an ink drawing. Faces are near-white with light from the top left
 * (left face lighter than right), every box carries a 1px ink silhouette, and
 * colour is spent on the few boxes that need telling apart — `slate` is the
 * neutral the majority should wear.
 */
export const MATTE_COLORS: Record<string, { top: string; side: string; front: string }> = {
  slate: { top: '#ffffff', side: '#eef0f4', front: '#dde1e8' },
  blue: { top: '#dfe8fb', side: '#c3d3f5', front: '#a3b9ea' },
  violet: { top: '#e9e2fb', side: '#d3c7f5', front: '#b9a8eb' },
  cyan: { top: '#dcf1f4', side: '#b9e0e7', front: '#93ccd7' },
  emerald: { top: '#dcf2e6', side: '#b8e2cc', front: '#92ceb0' },
  amber: { top: '#fbefd4', side: '#f5dcaa', front: '#ecc57f' },
  rose: { top: '#fde5db', side: '#f8c9b5', front: '#efa587' },
}
export const MATTE_INK = '#1e293b'
export const MATTE_EDGE = 'rgba(30,41,59,0.45)'
