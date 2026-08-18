/**
 * Period maths for the Insight tab.
 *
 * All of it is pure, so the screen stays about layout and the awkward parts —
 * calendar alignment, medians, what counts as "over" — are readable in one
 * place.
 *
 * **Periods here are calendar-aligned, unlike the feed's.** `FeedScreen` reads a
 * *balance*, so a trailing thirty days is exactly right there: a balance has no
 * period, and "the last month" is a window you slide. This screen reads a
 * *period*, and every sentence in the design depends on that — "day 18 of 31",
 * "usual for August", "vs typical August" are meaningless against a window that
 * started on the 19th of last month. So 1M is a calendar month, 1Q a calendar
 * quarter, 1Y a calendar year, and the stepper moves between them.
 *
 * There is no All time. It has no comparable period to sit against and no end to
 * project towards, so the Pace block would half-answer on it; the lifetime view
 * already lives on the Home chart.
 */
import { fromISODate, toISODate } from './dates'

export type Period = '1M' | '1Q' | '1Y'

export const PERIODS: { key: Period; label: string }[] = [
  { key: '1M', label: '1M' },
  { key: '1Q', label: '1Q' },
  { key: '1Y', label: '1Y' },
]

/**
 * The interval the RPCs step by.
 *
 * An interval rather than a day count, and that is what makes the comparison
 * calendar-correct: the six months before August are July, June, May, April,
 * March and February, not six 31-day windows drifting backwards through the
 * year. Postgres parses these strings directly.
 */
export const periodStep = (period: Period): string =>
  period === '1M' ? '1 month' : period === '1Q' ? '3 months' : '1 year';

/**
 * The first day of the period `offset` steps before the one containing today.
 * `offset` is zero for the current period and counts backwards.
 */
export function periodStart(period: Period, offset: number): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()

  if (period === '1Y') return toISODate(new Date(y - offset, 0, 1))
  if (period === '1Q') {
    // Quarter index from the month, then stepped back three months at a time.
    const q = Math.floor(m / 3) - offset
    return toISODate(new Date(y + Math.floor(q / 4), (((q % 4) + 4) % 4) * 3, 1))
  }
  return toISODate(new Date(y, m - offset, 1))
}

/** The last day of that period — the day before the next one begins. */
export function periodEnd(period: Period, offset: number): string {
  const next = fromISODate(periodStart(period, offset - 1))
  next.setDate(next.getDate() - 1)
  return toISODate(next)
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** "August 2026" / "Q3 2026" / "2026" — what the stepper reads. */
export function periodLabel(period: Period, offset: number): string {
  const d = fromISODate(periodStart(period, offset))
  if (period === '1Y') return String(d.getFullYear())
  if (period === '1Q') return `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

/** The bare period name, for copy like "usual for August". */
export function periodNoun(period: Period, offset: number): string {
  const d = fromISODate(periodStart(period, offset))
  if (period === '1Y') return String(d.getFullYear())
  if (period === '1Q') return `Q${Math.floor(d.getMonth() / 3) + 1}`
  return MONTHS[d.getMonth()]!
}

/**
 * What the period is called when it is being *compared* to.
 *
 * A month and a quarter name themselves — "usual for August", "a typical Q3" —
 * but a year does not: "a typical 2026" is nonsense, because the thing 2026 is
 * being compared against is the other years, not itself.
 */
export const comparisonNoun = (period: Period, offset: number): string =>
  period === '1Y' ? 'year' : periodNoun(period, offset)

/**
 * The short form the cash-flow bars are labelled with.
 *
 * A quarter carries its year and a month does not: six months never repeat a
 * name, six quarters do — "Q3" twice in one axis would be two different years
 * looking identical.
 */
export function periodShort(period: Period, offset: number): string {
  const d = fromISODate(periodStart(period, offset))
  if (period === '1Y') return String(d.getFullYear())
  if (period === '1Q')
    return `Q${Math.floor(d.getMonth() / 3) + 1} ’${String(d.getFullYear()).slice(2)}`
  return MONTHS[d.getMonth()]!.slice(0, 3)
}

/** Days in the period — the pace chart's x extent. */
export const periodDays = (period: Period, offset: number): number =>
  Math.round(
    (fromISODate(periodEnd(period, offset)).getTime() -
      fromISODate(periodStart(period, offset)).getTime()) /
      86_400_000,
  ) + 1

/** How far into the period today is, clamped to it. Zero for a past period. */
export function elapsedDays(period: Period, offset: number): number {
  if (offset > 0) return periodDays(period, offset)
  const start = fromISODate(periodStart(period, 0))
  const now = fromISODate(toISODate(new Date()))
  return Math.min(
    periodDays(period, 0),
    Math.round((now.getTime() - start.getTime()) / 86_400_000) + 1,
  )
}

/** Is the period still running? Only then is a projection worth drawing. */
export const isCurrentPeriod = (offset: number): boolean => offset === 0

/* ------------------------------------------------------------------ verdict */

/**
 * The band inside which a difference is not worth a colour.
 *
 * The handoff sets it for the category deltas — "within ±10% is grey" — and the
 * pace chip reuses it rather than inventing a second threshold. One number, so
 * a category and the period it sits in cannot disagree about what counts as
 * normal.
 */
export const LEVEL_BAND = 0.1

export type Tone = 'over' | 'under' | 'level'

/**
 * How `actual` compares to `typical`, as a signed fraction and a judgement.
 *
 * **The tone is judgement, not direction.** Spending more than usual is `over`
 * and takes the expense colour; spending less is `under` and takes the income
 * one. That is the opposite of what the raw sign would suggest — a bigger number
 * is worse here — and it is why this returns a tone rather than leaving the
 * caller to colour by `pct > 0`.
 *
 * `typical` of zero has no ratio to give, so it returns null rather than an
 * infinity that every caller would have to guard.
 */
export function verdict(actual: number, typical: number): { pct: number; tone: Tone } | null {
  if (!typical) return null
  const pct = (actual - typical) / typical
  return {
    pct,
    tone: Math.abs(pct) < LEVEL_BAND ? 'level' : pct > 0 ? 'over' : 'under',
  }
}

/** Median of a list, even-length taking the mean of the middle pair. */
export function medianOf(values: number[]): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2
    ? sorted[mid]!
    : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2)
}

/* ---------------------------------------------------------------- cash flow */

export type FlowBucket = {
  /** ISO first day of the bucket — its identity and its sort key. */
  start: string
  label: string
  inflow: number
  outflow: number
  net: number
  /** The period the screen is currently showing, drawn as an outline. */
  selected: boolean
  /** Still running, so the bars are partial and should not be read as final. */
  partial: boolean
  /**
   * The records do not cover this period, so its zero means "not known", not
   * "nothing happened".
   */
  unrecorded: boolean
}

/**
 * `monthly_cash_flow` rolled into the six periods ending at the selected one.
 *
 * Months are the grain the view stores and quarters and years are sums of
 * months, so this is addition rather than a third round trip. A period with no
 * transactions at all still gets a bucket — an empty column is information, and
 * dropping it would silently compress the axis.
 *
 * `earliest` separates the two kinds of empty. Six years back from 2026 reaches
 * 2020, and the records start in October 2023: those columns are not quiet
 * years, they are years the app knows nothing about. Marking them lets the card
 * keep the axis honest while leaving them out of any average — the same
 * distinction `spending_pace` draws in SQL for its median.
 */
export function bucketFlow(
  rows: { month: string | null; inflow: number | null; outflow: number | null }[],
  period: Period,
  offset: number,
  earliest: string | null,
  count = 6,
): FlowBucket[] {
  const buckets: FlowBucket[] = []
  const todayStart = periodStart(period, 0)

  for (let i = count - 1; i >= 0; i--) {
    const at = offset + i
    const start = periodStart(period, at)
    const end = periodEnd(period, at)

    let inflow = 0
    let outflow = 0
    for (const row of rows) {
      if (!row.month || row.month < start || row.month > end) continue
      inflow += row.inflow ?? 0
      outflow += row.outflow ?? 0
    }

    buckets.push({
      start,
      label: periodShort(period, at),
      inflow,
      outflow,
      net: inflow - outflow,
      selected: i === 0,
      partial: start === todayStart,
      // Fully covered, or not counted. A period the records only half reach
      // reads as a cheap one for the same reason a missing one reads as free.
      unrecorded: earliest !== null && start < earliest,
    })
  }
  return buckets
}
