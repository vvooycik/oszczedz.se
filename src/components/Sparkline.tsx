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
  span: fixedSpan,
}: {
  values: number[]
  width?: number
  height?: number
  strokeWidth?: number
  /**
   * A value range shared with the marks beside it, in place of this series'
   * own.
   *
   * The Insight tab's balances block asks for wallets to be comparable — "so a
   * flat wallet reads flat" — which the default cannot do: stretching every
   * series to its own extremes makes a wallet that moved 12 zł look exactly as
   * dramatic as one that moved 12 000.
   *
   * It is a shared *span*, not a shared min and max. Those are different
   * things, and the literal version is unusable here: with a loan at −20 000 in
   * the set, one min/max flattens every other wallet to a dead line through the
   * middle. Sharing only the zł-per-pixel and centring each series on its own
   * mean keeps both readings — relative movement is comparable, and each line
   * still uses its own box.
   */
  span?: number
}) {
  // Called before the early return: hooks cannot sit behind a condition, and a
  // one-point series still has to not crash.
  const gradientId = useId()

  if (values.length < 2) return <div style={{ width, height }} />

  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const span = (fixedSpan || hi - lo) || 1
  // Centred on the series' own middle when the span is shared, so a series that
  // barely moves sits in the middle of its box instead of filling it.
  const mid = (lo + hi) / 2
  const min = fixedSpan ? mid - span / 2 : lo
  const max = min + span
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
