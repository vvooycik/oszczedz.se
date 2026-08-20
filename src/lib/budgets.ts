/**
 * Everything a budget means once the database has answered what it *is*.
 *
 * `budget_progress` returns facts — a limit, a rollover, a period's bounds, the
 * spend inside it. Verdict, share, projection and days left are arithmetic over
 * those, they change with no write behind them, and the rail recomputes them per
 * frame while a ring animates. So they live here, pure, rather than as columns
 * that would be stale the moment the clock moved.
 *
 * The one rule worth stating out loud: **the effective limit is the only limit
 * anything on screen uses.** A budget with a rollover has more room this period
 * than its own `amount` says, and a ring drawn against the stored figure would
 * disagree with the header sitting above it.
 */
import { formatMonthLong, fromISODate, today } from './dates'
import type { BudgetProgress, BudgetPeriod } from './db'

export type Verdict = 'over' | 'at-risk' | 'on-track'

/**
 * Group order on the list, fixed: what needs attention comes before what does
 * not. Also the sort key, so a screen never has to spell the order out again.
 */
export const VERDICT_RANK: Record<Verdict, number> = {
  over: 0,
  'at-risk': 1,
  'on-track': 2,
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  over: 'Over',
  'at-risk': 'At risk',
  'on-track': 'On track',
}

/**
 * A daily rate over one or two days says nothing — a single big shop on day one
 * projects to thirty of them. Below this, every budget reads as on track and the
 * projection sentence is withheld rather than guessed.
 */
const RATE_SETTLES_ON_DAY = 3

const DAY_MS = 86_400_000

const daysBetween = (from: string, to: string): number =>
  Math.round((fromISODate(to).getTime() - fromISODate(from).getTime()) / DAY_MS)

/** The limit the ring, the bar and every percentage are drawn against. */
export const effectiveLimit = (b: BudgetProgress): number =>
  b.limit_amount + b.rolled_over

/** Spend as a fraction of the effective limit. Uncapped — 1.27 is a real answer. */
export const shareOf = (b: BudgetProgress): number => {
  const limit = effectiveLimit(b)
  return limit > 0 ? b.spent / limit : 0
}

/** `period_end` is exclusive, so this is the count of days the period holds. */
export const daysInPeriod = (b: BudgetProgress): number =>
  Math.max(1, daysBetween(b.period_start, b.period_end))

/**
 * Which day of the period today is, 1-based and clamped into the period.
 *
 * The clamp matters for a budget whose row was fetched before midnight and read
 * after it: one day out of range would otherwise make the projection divide by
 * a number the period does not contain.
 */
export function dayOfPeriod(b: BudgetProgress, on: string = today()): number {
  const elapsed = daysBetween(b.period_start, on) + 1
  return Math.min(daysInPeriod(b), Math.max(1, elapsed))
}

/** Days after today, so the last day of a period reads "0 days left". */
export const daysLeft = (b: BudgetProgress, on: string = today()): number =>
  Math.max(0, daysInPeriod(b) - dayOfPeriod(b, on))

/**
 * Spend at the end of the period if the current daily rate holds.
 *
 * A straight line, and deliberately so — it cannot know that a month usually
 * spends late, which is why the list groups on it but the copy never states it
 * as a fact.
 */
export const projectedSpend = (b: BudgetProgress, on: string = today()): number =>
  Math.round((b.spent / dayOfPeriod(b, on)) * daysInPeriod(b))

export function verdictOf(b: BudgetProgress, on: string = today()): Verdict {
  const limit = effectiveLimit(b)
  if (limit > 0 && b.spent > limit) return 'over'
  if (dayOfPeriod(b, on) < RATE_SETTLES_ON_DAY) return 'on-track'
  return limit > 0 && projectedSpend(b, on) > limit ? 'at-risk' : 'on-track'
}

/* ------------------------------------------------------------------ periods */

export const PERIOD_OPTIONS: { key: BudgetPeriod; label: string }[] = [
  { key: 'monthly', label: 'Monthly' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'yearly', label: 'Yearly' },
]

/** The sub-line under the limit figure: "per month". */
export const perPeriod = (period: BudgetPeriod): string =>
  period === 'weekly' ? 'per week' : period === 'yearly' ? 'per year' : 'per month'

/** "Adds unspent zł to next month" — the rollover row's meta. */
export const nextPeriodNoun = (period: BudgetPeriod): string =>
  period === 'weekly' ? 'week' : period === 'yearly' ? 'year' : 'month'

/** Sunday-first, because `resets_on` for a weekly budget is `getDay()`. */
export const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

const ordinal = (n: number): string => {
  const rest = n % 100
  if (rest >= 11 && rest <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
}

/**
 * `resets_on` is one integer read three ways, and this is the only place that
 * knows which — see the migration for why it is one column.
 *
 * The yearly case decodes an ordinal against 2001, a non-leap year, which is
 * exactly how the database encodes it: the anniversary is a month and a day, and
 * a plain day-of-year would walk it forward every February.
 */
export function resetsOnLabel(period: BudgetPeriod, resetsOn: number): string {
  if (period === 'weekly') return WEEKDAYS[resetsOn % 7] ?? 'Sunday'
  if (period === 'yearly') {
    const { month, day } = yearlyDate(resetsOn)
    return anniversaryFmt.format(new Date(2001, month, day))
  }
  return ordinal(Math.min(Math.max(resetsOn, 1), 31))
}

const anniversaryFmt = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
})

/**
 * The month/day a yearly `resets_on` stands for, and back again.
 *
 * 2001 is the reference year on both sides of the wire — the migration decodes
 * the same ordinal the same way. Any non-leap year would do; what matters is
 * that it is *fixed*, so 29 February is unrepresentable rather than sliding.
 */
export function yearlyDate(resetsOn: number): { month: number; day: number } {
  const d = new Date(2001, 0, 1)
  d.setDate(d.getDate() + (Math.min(Math.max(resetsOn, 1), 365) - 1))
  return { month: d.getMonth(), day: d.getDate() }
}

export function yearlyResetsOn(month: number, day: number): number {
  const start = new Date(2001, 0, 1).getTime()
  const picked = new Date(2001, month, Math.min(day, daysInMonth(month))).getTime()
  return Math.round((picked - start) / DAY_MS) + 1
}

/** Days in `month` of the reference year — February is always 28 here. */
export const daysInMonth = (month: number): number =>
  new Date(2001, month + 1, 0).getDate()

/**
 * What `resets_on` becomes when the period changes.
 *
 * It cannot simply be carried across: the CHECK constraint reads the column
 * against the period, so a monthly budget resetting on the 25th would be
 * rejected the moment it became weekly. Clamping into the new range would
 * invent an answer nobody asked for — the 25th is not "Saturday" — so the row
 * goes back to the period's own beginning: the 1st, Monday, 1 January.
 *
 * Monday rather than Sunday even though the encoding is Sunday-first, because
 * the app's calendar grid is Monday-first everywhere else.
 */
export const defaultResetsOn = (_period: BudgetPeriod): number => 1

/* -------------------------------------------------------------------- scope */

const plural = (n: number, one: string, many: string): string =>
  `${n} ${n === 1 ? one : many}`

/** "4 categories · 3 wallets · rolls over" — the list row's third line. */
export function scopeMeta(b: BudgetProgress): string {
  const parts = [
    b.category_count === 0
      ? 'every category'
      : plural(b.category_count, 'category', 'categories'),
    // Zero wallets is the `'all'` state of the handoff's model: a budget opts
    // into a set, and having no opinion is the common case.
    b.wallet_count === 0 ? 'all wallets' : plural(b.wallet_count, 'wallet', 'wallets'),
  ]
  if (b.rollover) parts.push('rolls over')
  return parts.join(' · ')
}

/**
 * List order: by verdict group, then by share of limit descending inside it.
 *
 * Not by size. A 200 zł budget at 140% needs looking at before a 3 000 zł one at
 * 60%, and the share is what says so.
 */
export function sortForList(
  budgets: BudgetProgress[],
  on: string = today(),
): BudgetProgress[] {
  return [...budgets].sort(
    (a, b) =>
      VERDICT_RANK[verdictOf(a, on)] - VERDICT_RANK[verdictOf(b, on)] ||
      shareOf(b) - shareOf(a),
  )
}

/**
 * The calendar month every budget is inside, or null when they are not all in
 * one.
 *
 * The handoff assumes a single shared month, and with every budget monthly and
 * resetting on the 1st that is exactly what it is. It stops being true the
 * moment a payday budget resets on the 25th or a yearly one joins the list —
 * those genuinely are different windows, and a heading naming one month over a
 * figure summing several would be quietly wrong. Both the list's summary card
 * and the Home rail's label row ask this before naming anything.
 */
export function sharedMonth(budgets: BudgetProgress[]): string | null {
  const first = budgets[0]
  if (!first) return null
  const month = first.period_start.slice(0, 7)
  const agreed = budgets.every(
    (b) => b.period === 'monthly' && b.period_start.slice(0, 7) === month,
  )
  return agreed ? formatMonthLong(first.period_start) : null
}

/** Rail order: what the user arranged, with the name as a stable tiebreak. */
export const sortForHome = (budgets: BudgetProgress[]): BudgetProgress[] =>
  budgets
    .filter((b) => b.show_on_home)
    .sort((a, b) => a.home_order - b.home_order || a.name.localeCompare(b.name))
