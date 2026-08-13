import { useId } from 'react'

/**
 * Tiny trend line for a wallet row. Deliberately hand-rolled SVG rather than a
 * chart instance: at 50×18 with no axes, ticks or tooltip, a full charting
 * engine costs far more than the mark is worth, and there would be one per row.
 *
 * **Painted by sign, not by the wallet's colour** — expense below zero, income
 * above it, the same rule the feed's Total Wealth chart follows. A wallet that
 * has gone negative is the one thing worth seeing from across the row, and the
 * accent said nothing about it.
 *
 * The split is a `linearGradient` in user space with two stops at the same
 * offset, which is a hard edge rather than a blend — the SVG equivalent of the
 * piecewise `visualMap` the big chart compiles down to. Both colours are read as
 * `var()` rather than resolved values: this is DOM, not canvas, so the mark
 * re-tints itself when the mode changes with no work here.
 */
export function Sparkline({
  values,
  width = 50,
  height = 18,
  strokeWidth = 1.8,
}: {
  values: number[]
  width?: number
  height?: number
  strokeWidth?: number
}) {
  // Called before the early return: hooks cannot sit behind a condition, and a
  // one-point series still has to not crash.
  const gradientId = useId()

  if (values.length < 2) return <div style={{ width, height }} />

  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const pad = 3

  // Inset on all four sides: without it the first and last points sit on the
  // viewBox edge, where half the stroke is clipped and the line reads as running
  // off the row rather than ending in it.
  const yOf = (v: number) => height - pad - ((v - min) / span) * (height - pad * 2)

  const points = values
    .map((v, i) => {
      const x = pad + (i / (values.length - 1)) * (width - pad * 2)
      return `${x.toFixed(1)},${yOf(v).toFixed(1)}`
    })
    .join(' ')

  // A series that never crosses zero needs no gradient at all — and must not get
  // one, because the crossing it would be built from is off the scale.
  const crosses = min < 0 && max > 0
  const stroke = crosses
    ? `url(#${gradientId})`
    : min < 0
      ? 'var(--color-expense)'
      : 'var(--color-income)'

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className="block flex-none"
      aria-hidden="true"
    >
      {crosses && (
        <defs>
          <linearGradient
            id={gradientId}
            // User space, so the stop can be placed at the y the data puts zero
            // at rather than at a fraction of the bounding box of whatever
            // happens to be stroked.
            gradientUnits="userSpaceOnUse"
            x1="0"
            y1="0"
            x2="0"
            y2={height}
          >
            <stop offset={yOf(0) / height} stopColor="var(--color-income)" />
            <stop offset={yOf(0) / height} stopColor="var(--color-expense)" />
          </linearGradient>
        </defs>
      )}
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points}
      />
    </svg>
  )
}
