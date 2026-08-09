/**
 * Tiny trend line for a wallet row. Deliberately hand-rolled SVG rather than a
 * chart instance: at 120×22 with no axes, ticks or tooltip, a full charting
 * engine costs far more than the mark is worth, and there would be one per row.
 */
export function Sparkline({
  values,
  color,
  width = 120,
  height = 22,
}: {
  values: number[]
  color: string
  width?: number
  height?: number
}) {
  if (values.length < 2) return <div style={{ width, height }} />

  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const pad = 3

  const points = values
    .map((v, i) => {
      // Inset on all four sides: without it the first and last points sit on the
      // viewBox edge, where half the stroke is clipped and the line reads as
      // running off the row rather than ending in it.
      const x = pad + (i / (values.length - 1)) * (width - pad * 2)
      const y = height - pad - ((v - min) / span) * (height - pad * 2)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className="block flex-none"
      aria-hidden="true"
    >
      <polyline fill="none" stroke={color} strokeWidth={1.5} points={points} />
    </svg>
  )
}
