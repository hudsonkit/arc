import type { SVGProps } from 'react'

type ArcMarkProps = SVGProps<SVGSVGElement> & {
  title?: string
  /**
   * `glyph` (default) draws on whatever is behind it: the arc follows
   * `currentColor`, so a host sets the brand color with CSS `color`.
   * `tile` puts the glyph on its own ink square — the app icon and favicon form.
   */
  variant?: 'glyph' | 'tile'
}

/**
 * Arc's identity mark: one routed edge — a true circular arc — springing from a
 * square origin node and landing on a round terminal. It reads as an arch, as
 * the letter's namesake curve, and as the thing Arc draws all day: two system
 * endpoints and the route between them.
 *
 * Geometry is on a 32-unit grid: centre (16, 21), radius 9, so the feet sit on
 * x = 7 and x = 25 and the crown at y = 12. Every part carries its own paint,
 * so the mark renders correctly on pages that never load the landing CSS.
 */
export default function ArcMark({ title, variant = 'glyph', className = '', ...props }: ArcMarkProps) {
  const isDecorative = !title
  const tile = variant === 'tile'

  return (
    <svg
      className={`arc-mark arc-mark--${variant} ${className}`.trim()}
      viewBox="0 0 32 32"
      fill="none"
      role={isDecorative ? undefined : 'img'}
      aria-hidden={isDecorative ? true : undefined}
      aria-label={title}
      {...props}
    >
      {tile && <rect className="arc-mark__tile" width="32" height="32" rx="8" fill="#0d1726" />}
      <path
        className="arc-mark__route"
        d="M7 21A9 9 0 0 1 25 21"
        stroke={tile ? '#f3efe6' : 'currentColor'}
        strokeWidth="3.25"
        strokeLinecap="butt"
      />
      <rect
        className="arc-mark__origin"
        x="4" y="19" width="6" height="6" rx="1"
        fill={tile ? '#f3efe6' : 'currentColor'}
      />
      <circle className="arc-mark__terminal" cx="25" cy="22" r="3.25" fill="#ff6a3d" />
    </svg>
  )
}
