/**
 * The app's own mark, inline.
 *
 * The same artwork `scripts/build-icons.mjs` rasterises into every icon — the
 * balance chart cropped to a rounded tile, red below zero and green above, with
 * the fill between the line and the undrawn zero line.
 *
 * Inline rather than `<img src="/favicon.svg">` so it paints with the first
 * frame: this is the only thing on the login screen above the fold, and a
 * network round trip for it would show as a hole. It is also a **fixed brand
 * asset** — the colours are literals, not tokens, because the mark must not
 * re-theme with the accent or the mode. It is baked into the home screen at
 * install time and cannot follow a user who later picks Copper.
 *
 * `useId` namespaces the gradients: two of these on one page with hardcoded ids
 * would have the second silently reuse the first's fills.
 */
import { useId } from 'react'

export function AppMark({ size = 64, radius = 20 }: { size?: number; radius?: number }) {
  const id = useId()
  const up = `${id}-up`
  const down = `${id}-down`
  const clip = `${id}-clip`

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 112 112"
      role="img"
      aria-label="oszczędź.se"
      className="flex-none"
    >
      <defs>
        <clipPath id={clip}>
          {/* The radius is in the 112-unit grid, so it has to scale with the
              rendered size or a 64px mark gets the 512px corner. */}
          <rect width="112" height="112" rx={(radius * 112) / size} />
        </clipPath>
        <linearGradient id={up} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7cbd89" stopOpacity=".45" />
          <stop offset="1" stopColor="#7cbd89" stopOpacity=".04" />
        </linearGradient>
        <linearGradient id={down} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d7654b" stopOpacity=".4" />
          <stop offset="1" stopColor="#d7654b" stopOpacity=".1" />
        </linearGradient>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect width="112" height="112" fill="#1e1f21" />
        <path d="M0 68 L0 86 L12 92 L24 76 L34 82 L42 68 Z" fill={`url(#${down})`} />
        <path
          d="M42 68 L52 44 L62 52 L70 30 L80 46 L94 60 L94 68 Z"
          fill={`url(#${up})`}
        />
        <path
          d="M0 86 L12 92 L24 76 L34 82 L42 68"
          fill="none"
          stroke="#d7654b"
          strokeWidth="9"
          strokeLinejoin="round"
        />
        <path
          d="M42 68 L52 44 L62 52 L70 30 L80 46 L94 60"
          fill="none"
          stroke="#7cbd89"
          strokeWidth="9"
          strokeLinejoin="round"
        />
        <circle cx="94" cy="60" r="10" fill="#f4f4f6" stroke="#1e1f21" strokeWidth="3.5" />
      </g>
    </svg>
  )
}
