import { useId } from 'react'
import { IconTrendingDown, IconTrendingUp } from '@tabler/icons-react'
import { Card } from '@/components/ui/Card'
import { LabelRow } from '@/components/ui/Label'
import { asMinor, currencySymbol, formatAmount, formatAmountMoney } from '@/lib/money'
import {
  comparisonNoun,
  elapsedDays,
  isCurrentPeriod,
  periodDays,
  periodNoun,
  verdict,
  type Period,
} from '@/lib/insights'
import type { PacePoint } from '@/lib/db'

const W = 326
const H = 122
/** Room under the plot for the three day labels. */
const AXIS = 14
const PAD = 8

/**
 * Am I spending faster than usual?
 *
 * Cumulative spend through the period, solid, against the median of the six
 * comparable periods, dashed, with a dotted linear tail to the period's end.
 * Everything here is one server-side answer (`spending_pace`) — the median is
 * not something to ship seven daily series home to compute.
 *
 * **Painted by verdict, not by the accent.** Over the usual takes the expense
 * colour and under it takes income, the same reasoning `BalanceChart` gives for
 * the sign owning the total-wealth line: what the number *means* is worth more
 * on this card than what theme the app is wearing. The tone is judgement rather
 * than direction, so the bigger number is the red one — see `verdict`.
 *
 * Hand-rolled SVG rather than ECharts. There is no axis engine to want here, no
 * zoom and — by the handoff's own decision — no tooltip on the first pass, and
 * pulling the 189 kB chart chunk onto this tab to draw three polylines would be
 * the whole budget for none of the benefit.
 */
export function PaceCard({
  points,
  period,
  offset,
  currency,
  loading,
}: {
  points: PacePoint[]
  period: Period
  offset: number
  currency: string
  loading: boolean
}) {
  const gradientId = useId()

  const days = periodDays(period, offset)
  const elapsed = elapsedDays(period, offset)
  const running = isCurrentPeriod(offset)
  const noun = periodNoun(period, offset)
  // "a typical year", not "a typical 2026" — see `comparisonNoun`.
  const versus = comparisonNoun(period, offset)

  // The last point that actually happened. `spent` is null past today, which is
  // what makes the solid line stop rather than fall to zero.
  const done = points.filter((p) => p.spent !== null)
  const spent = done.length ? done[done.length - 1]!.spent! : 0
  const typicalEnd = points.length ? (points[points.length - 1]!.typical ?? 0) : 0
  const typicalNow = done.length ? (done[done.length - 1]!.typical ?? 0) : 0

  const perDay = elapsed > 0 ? Math.round(spent / elapsed) : 0
  const typicalPerDay = days > 0 ? Math.round(typicalEnd / days) : 0
  // Deliberately linear, and the handoff says so: no forecasting beyond the tail.
  const projected = running ? perDay * days : spent

  const call = verdict(spent, typicalNow)

  /**
   * Two comparisons, and they are allowed to disagree.
   *
   * The chip reads *now* — spend to date against the median's spend to the same
   * day. The sentence reads *the finish* — a linear projection against the
   * median's whole period. A month whose spending is usually back-loaded is
   * genuinely on pace today and genuinely lands under the usual total, because
   * a straight line cannot know about the back half. Colouring the sentence
   * with the chip's verdict is what would make that read as a bug.
   */
  const toneOf = (t: typeof call): string =>
    t?.tone === 'over'
      ? 'var(--color-expense)'
      : t?.tone === 'under'
        ? 'var(--color-income)'
        : 'var(--color-ink-muted)'

  const tone = toneOf(call)
  const landing = verdict(projected, typicalEnd)

  // The line itself never goes ink-muted: "on pace" is a quiet verdict, not a
  // reason to draw the subject of the card in the colour of its caption.
  const lineColour = call && call.tone !== 'level' ? tone : 'var(--color-ink)'

  // The plot's y extent covers everything drawn, projection included — a tail
  // that runs off the top would be the one part of the card you cannot read.
  const ceiling = Math.max(spent, typicalEnd, projected, 1)

  const xOf = (day: number) =>
    PAD + ((day - 1) / Math.max(1, days - 1)) * (W - PAD * 2)
  const yOf = (value: number) =>
    H - AXIS - (value / ceiling) * (H - AXIS - PAD)

  const line = (rows: { day: number; value: number }[]) =>
    rows.map((r) => `${xOf(r.day).toFixed(1)},${yOf(r.value).toFixed(1)}`).join(' ')

  const actual = line(done.map((p) => ({ day: p.day_index, value: p.spent! })))
  const median = line(
    points.map((p) => ({ day: p.day_index, value: p.typical ?? 0 })),
  )

  const tipX = done.length ? xOf(done[done.length - 1]!.day_index) : xOf(1)
  const tipY = yOf(spent)

  return (
    <section className="flex flex-col gap-2">
      <LabelRow
        trailing={
          <span className="tnum text-meta-sm text-ink-muted">
            {running ? `Day ${elapsed} of ${days}` : `${days} days`}
          </span>
        }
      >
        Pace
      </LabelRow>

      <Card className="px-[18px] pt-[18px] pb-3.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div
              className="tnum"
              style={{ fontSize: 'var(--text-stat)', fontWeight: 600, lineHeight: 1, letterSpacing: '-.035em' }}
            >
              {formatAmount(asMinor(spent))}
              <span
                className="text-ink-faint"
                style={{ fontSize: 'var(--text-stat-unit)', fontWeight: 500, letterSpacing: 0 }}
              >
                {' '}
                {currencySymbol(currency)}
              </span>
            </div>
            <div className="mt-1.5 text-value text-ink-muted">
              {running ? `spent so far in ${noun}` : `spent in ${noun}`}
            </div>
          </div>

          {/* The chip states the verdict, not the number — the number is already
              the biggest thing on the card. */}
          {call && (
            <span
              className="flex flex-none items-center gap-[5px] rounded-full px-2.5 py-[5px] text-meta font-semibold"
              style={{
                color: tone,
                background:
                  call.tone === 'level'
                    ? 'var(--color-inset)'
                    : `color-mix(in oklab, ${tone} 20%, transparent)`,
              }}
            >
              {call.tone === 'over' ? (
                <IconTrendingUp size={14} stroke={2} />
              ) : call.tone === 'under' ? (
                <IconTrendingDown size={14} stroke={2} />
              ) : null}
              <span className="tnum">
                {call.tone === 'level'
                  ? 'On pace'
                  : `${Math.round(Math.abs(call.pct) * 100)}% ${call.tone === 'over' ? 'fast' : 'slow'}`}
              </span>
            </span>
          )}
        </div>

        {loading ? (
          <div className="mt-3.5 w-full" style={{ aspectRatio: `${W} / ${H}` }} />
        ) : (
          /* Uniform scaling, not a stretched viewBox: `preserveAspectRatio:
             none` would widen every stroke with the card and turn the end dot
             into an ellipse. Width drives, height follows the ratio. */
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="mt-3.5 block w-full"
            style={{ height: 'auto' }}
            aria-hidden="true"
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={lineColour} stopOpacity="0.26" />
                <stop offset="1" stopColor={lineColour} stopOpacity="0" />
              </linearGradient>
            </defs>

            <line
              x1={PAD}
              y1={H - AXIS}
              x2={W - PAD}
              y2={H - AXIS}
              stroke="var(--color-divider)"
              strokeWidth="1"
            />

            {/* Usual for this period. Dashed, and behind the solid line. */}
            {median && (
              <polyline
                fill="none"
                stroke="var(--color-ink-dim)"
                strokeWidth="1.6"
                strokeDasharray="3 5"
                strokeLinecap="round"
                points={median}
              />
            )}

            {actual && done.length > 1 && (
              <>
                <path
                  fill={`url(#${gradientId})`}
                  d={`M${actual.split(' ').join(' L')} L${tipX.toFixed(1)},${H - AXIS} L${xOf(1).toFixed(1)},${H - AXIS} Z`}
                />
                <polyline
                  fill="none"
                  stroke={lineColour}
                  strokeWidth="2.4"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  points={actual}
                />
              </>
            )}

            {/* Where the period lands at today's rate. Dotted, because it has
                not happened — and absent entirely on a period that is over. */}
            {running && done.length > 1 && (
              <polyline
                fill="none"
                stroke={lineColour}
                strokeWidth="2"
                strokeDasharray="2 5"
                strokeLinecap="round"
                strokeOpacity="0.7"
                points={`${tipX.toFixed(1)},${tipY.toFixed(1)} ${xOf(days).toFixed(1)},${yOf(projected).toFixed(1)}`}
              />
            )}

            {done.length > 0 && (
              <circle
                cx={tipX}
                cy={tipY}
                r="4.5"
                fill="var(--color-card)"
                stroke="var(--color-ink)"
                strokeWidth="2.5"
              />
            )}
          </svg>
        )}

        {/* Outside the SVG so the labels keep the app's type size rather than
            scaling with the plot. */}
        <div className="tnum mt-1 flex justify-between px-2 text-badge text-ink-dim">
          <span>1</span>
          {running && <span className="font-semibold text-ink-muted">{elapsed}</span>}
          <span>{days}</span>
        </div>

        <div className="mt-3 flex gap-2.5">
          <Stat value={formatAmountMoney(asMinor(perDay), currency)} label="per day now" />
          <Stat
            value={formatAmountMoney(asMinor(typicalPerDay), currency)}
            // "usual for August" and "usual for Q3" name themselves; only the
            // year needs the article, which is why this is not one template.
            label={`usual for ${period === '1Y' ? 'a year' : versus}`}
            muted
          />
        </div>

        {running && typicalEnd > 0 && (
          <p className="mt-2.5 text-meta leading-[1.5] text-ink-muted">
            At this rate you finish around{' '}
            <span className="tnum font-semibold text-ink">
              {formatAmountMoney(asMinor(projected), currency)}
            </span>
            , about{' '}
            <span className="tnum font-semibold" style={{ color: toneOf(landing) }}>
              {formatAmountMoney(asMinor(Math.abs(projected - typicalEnd)), currency)}
            </span>{' '}
            {projected >= typicalEnd ? 'over' : 'under'} a typical {versus}.
          </p>
        )}
      </Card>
    </section>
  )
}

/** One of the two figures under the chart. */
function Stat({
  value,
  label,
  muted = false,
}: {
  value: string
  label: string
  muted?: boolean
}) {
  return (
    <div className="flex-1 rounded-[14px] bg-inset px-3 py-2.5">
      <div
        className="tnum text-field font-semibold"
        style={muted ? { color: 'var(--color-ink-muted)' } : undefined}
      >
        {value}
      </div>
      <div className="mt-0.5 text-micro text-ink-muted">{label}</div>
    </div>
  )
}
