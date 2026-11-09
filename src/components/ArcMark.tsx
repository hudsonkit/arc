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
 * An upward-open smile (∪) joining two hollow, softly rounded rectangular eyes,
 * measured by a dimension line underneath (slash ends, value 25.0) — study I1,
 * design/face-studies/face-studies-4.svg. One ink: every stroke follows the same color.
 * The favicon (public/arc-favicon.svg) drops the dimension line, which is specks at 16px.
 * Keep geometry in sync with public/arc-mark.svg.
 */
export default function ArcMark({ title, variant = 'glyph', className = '', ...props }: ArcMarkProps) {
  const isDecorative = !title
  const tile = variant === 'tile'
  const ink = tile ? '#f3efe6' : 'currentColor'

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
        stroke={ink}
        strokeWidth="1.6"
        strokeLinecap="butt"
      />
      <rect
        className="arc-mark__origin"
        x="3.5" y="7.5" width="7" height="6" rx="1.5"
        stroke={ink}
        strokeWidth="1.4"
      />
      <rect
        className="arc-mark__terminal"
        x="21.5" y="7.5" width="7" height="6" rx="1.5"
        stroke={ink}
        strokeWidth="1.4"
      />
      <g className="arc-mark__dimension" stroke={ink}>
        <path d="M3.5 22.6V28.2M28.5 22.6V28.2" strokeWidth="0.35" />
        <path d="M3.5 26.6H28.5" strokeWidth="0.45" />
        <path d="M2.7 27.4L4.3 25.8M27.7 27.4L29.3 25.8" strokeWidth="0.55" />
        <text
          x="16" y="25.4" fontSize="2.4" textAnchor="middle" fill={ink} stroke="none"
          fontFamily="Menlo, 'JetBrains Mono', monospace"
        >
          25.0
        </text>
      </g>
    </svg>
  )
}
