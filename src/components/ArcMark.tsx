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
 * An upward-open smile (∪) joining two hollow, softly rounded rectangular eyes.
 * The curve meets the bottom of each eye, leaving their interiors transparent.
 * Keep geometry in sync with public/arc-mark.svg.
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
        d="M7 13.5A9 7 0 0 0 25 13.5"
        stroke={tile ? '#f3efe6' : 'currentColor'}
        strokeWidth="2"
        strokeLinecap="butt"
      />
      <rect
        className="arc-mark__origin"
        x="3.5" y="7.5" width="7" height="6" rx="1.5"
        stroke={tile ? '#f3efe6' : 'currentColor'}
        strokeWidth="1.5"
      />
      <rect
        className="arc-mark__terminal"
        x="21.5" y="7.5" width="7" height="6" rx="1.5"
        stroke="#ff6a3d"
        strokeWidth="1.5"
      />
    </svg>
  )
}
