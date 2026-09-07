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
import {
  addDays,
  daysBetween,
  formatDayShort,
  formatMonthLong,
  formatMonthShort,
  today,
} from './dates'
import type { BudgetProgress, BudgetPeriod } from './db'

export type Verdict = 'over' | 'at-risk' | 'on-track'

/**
 * Where a budget sits relative to its own window.
 *
 * Only a **one-off** can be anywhere but inside it. Every recurring period's
 * bounds are computed *around* the day asked for, so a monthly budget is in its
 * month by construction — which is also why this asks the period first rather
 * than just comparing dates: a row fetched before midnight and read after it
 * would otherwise report a daily budget as finished, and the app would drop it
 * off the rail for the rest of the morning.
 */
export type Phase = 'upcoming' | 'running' | 'finished'

/**
 * What the list groups on: a running budget's verdict, or — for a one-off that
 * is not running — its phase.
 *
 * Phase wins deliberately. The top three groups answer "what needs attention
 * now", and a run that ended last month cannot be acted on however far over it
 * went; its overspend still shows in red on the row, but it does not join a
 * heading that sums what is happening this period.
 */
export type BudgetGroup = Verdict | 'upcoming' | 'finished'

/**
 * Group order on the list, fixed: what needs attention comes before what does
 * not, and what is not running at all comes last. Also the sort key, so a
 * screen never has to spell the order out again.
 */
export const GROUP_RANK: Record<BudgetGroup, number> = {
  over: 0,
  'at-risk': 1,
  'on-track': 2,
  upcoming: 3,
  finished: 4,
}

export const GROUP_LABEL: Record<BudgetGroup, string> = {
  over: 'Over',
  'at-risk': 'At risk',
  'on-track': 'On track',
  upcoming: 'Not started yet',
  finished: 'Finished',
}

/**
 * A daily rate over one or two days says nothing — a single big shop on day one
 * projects to thirty of them. Below this, every budget reads as on track and the
 * projection sentence is withheld rather than guessed.
 *
 * A daily budget is therefore never "at risk", and loses nothing by it: over a
 * one-day period the projection *is* the spend, so anything it could flag,
 * `over` has already caught.
 */
const RATE_SETTLES_ON_DAY = 3

const DAY_MS = 86_400_000

/**
 * A budget's standing over one window: what it was allowed, what a previous
 * window lent it, and what it spent.
 *
 * The three columns `budget_progress` and `budget_history` share, and the
 * reason the arithmetic below is written against them rather than against the
 * progress row. A past period is over its limit by exactly the rule this
 * period is, and a second copy of that comparison for the history strip is how
 * a bar and a header start disagreeing about what "over" means.
 */
export type Standing = {
  limit_amount: number
  rolled_over: number
  spent: number
}

/** The limit the ring, the bar and every percentage are drawn against. */
export const effectiveLimit = (b: Pick<Standing, 'limit_amount' | 'rolled_over'>): number =>
  b.limit_amount + b.rolled_over

/** Spend as a fraction of the effective limit. Uncapped — 1.27 is a real answer. */
export const shareOf = (b: Standing): number => {
  const limit = effectiveLimit(b)
  return limit > 0 ? b.spent / limit : 0
}

/**
 * Over the limit, by the one comparison the whole app makes.
 *
 * The `limit > 0` guard is not decoration: `budget_amount_positive` keeps the
 * stored limit above zero, but a rollover cannot make it smaller and a limit of
 * zero would make every period with a single row read as over.
 */
export const isOver = (b: Standing): boolean => {
  const limit = effectiveLimit(b)
  return limit > 0 && b.spent > limit
}

/**
 * The share of the limit that is booked but has not charged — scheduled rows
 * dated later in this period.
 *
 * Kept out of `shareOf` and out of every verdict, deliberately. `spent` means
 * money that left, and a budget that read as over because of a subscription due
 * in eleven days would be answering a question nobody asked it. This is drawn
 * as a ghost ahead of the real bar instead: it says "and this is already
 * committed" without claiming it happened.
 *
 * Clipped to whatever room is left under the limit, so the ghost can never push
 * the bar past its own track — the same rule the list's `SplitBar` follows.
 */
export const committedShare = (b: BudgetProgress): number => {
  const limit = effectiveLimit(b)
  if (limit <= 0 || b.planned <= 0) return 0
  return Math.max(0, Math.min(b.planned / limit, 1 - Math.min(shareOf(b), 1)))
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
 * Days until a run begins, 0 once it has.
 *
 * `dayOfPeriod` clamps into the period, so a budget that has not started yet
 * reads as day 1 of it and `daysLeft` reports the whole length — true of the
 * run and useless as "left". This is the figure a not-yet-started budget has to
 * show instead.
 */
export const daysUntilStart = (b: BudgetProgress, on: string = today()): number =>
  Math.max(0, daysBetween(on, b.period_start))

/**
 * Days the period still has in it, **today included**.
 *
 * {@link daysLeft} counts the days *after* today, which is what a countdown
 * reads; a rate has to count today as well, because today's spend is already
 * inside `spent` and there is still the rest of today to spend it in. It is
 * also what keeps the last day of a period from dividing by zero.
 */
export const daysRemaining = (b: BudgetProgress, on: string = today()): number =>
  Math.max(1, daysInPeriod(b) - dayOfPeriod(b, on) + 1)

/**
 * What is left, spread evenly over the days that are left: the largest daily
 * spend that still finishes the period inside the limit.
 *
 * The counterpart to {@link projectedSpend}, and the more useful direction of
 * the two — a projection says where the current rate lands, this says which
 * rate lands on the limit exactly. Rounded **down** to the grosz, so spending
 * this much every remaining day can never end the period over: 100 zł across
 * three days is 33,33 a day, not the 33,34 that finishes at 100,02.
 *
 * `planned` is not subtracted, for the same reason it is kept out of every
 * verdict and share — booked is not spent, and a subscription due on the 28th
 * should not quietly shrink what today is allowed.
 *
 * Null when there is nothing honest to say:
 *
 * - the period is not running (nothing to pace, or the figure is already
 *   final);
 * - there is no limit to stay inside, or the limit is already spent — an
 *   allowance cannot be negative, and "0,00 zł a day" is not advice;
 * - the period has a single day left in it, where the answer *is* the amount
 *   left and the sentence would only be saying it a second time. That drops
 *   every daily budget by construction, and the last day of every other one.
 */
export function dailyAllowance(b: BudgetProgress, on: string = today()): number | null {
  if (phaseOf(b, on) !== 'running') return null
  const left = effectiveLimit(b) - b.spent
  if (left <= 0) return null
  const days = daysRemaining(b, on)
  return days < 2 ? null : Math.floor(left / days)
}

/** See {@link Phase}. */
export function phaseOf(b: BudgetProgress, on: string = today()): Phase {
  if (b.period !== 'once') return 'running'
  if (on < b.period_start) return 'upcoming'
  return on < b.period_end ? 'running' : 'finished'
}

/** See {@link BudgetGroup}. */
export function groupOf(b: BudgetProgress, on: string = today()): BudgetGroup {
  const phase = phaseOf(b, on)
  return phase === 'running' ? verdictOf(b, on) : phase
}

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
  // A run that has not started, or has already finished, has no rate to carry
  // forward: before it there is nothing to project from, after it the figure is
  // final and a projection would be a guess about a settled fact.
  if (phaseOf(b, on) !== 'running') return 'on-track'
  if (dayOfPeriod(b, on) < RATE_SETTLES_ON_DAY) return 'on-track'
  return limit > 0 && projectedSpend(b, on) > limit ? 'at-risk' : 'on-track'
}

/* ------------------------------------------------------------------ periods */

/**
 * The four periods that repeat, shortest to longest.
 *
 * `once` is deliberately absent: it is not a fifth answer to "how often", it is
 * the answer *no*, and the editor asks that as its own question one row above.
 * A fifth segment would not fit either — measured at 390px the track has ~63px
 * a segment for a label that needs ~74 — but the reading is the reason.
 */
export const PERIOD_OPTIONS: { key: BudgetPeriod; label: string }[] = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'yearly', label: 'Yearly' },
]

/** The noun for one period, singular: "day", "week", "month", "year", "run". */
export const periodNoun = (period: BudgetPeriod): string =>
  period === 'daily'
    ? 'day'
    : period === 'weekly'
      ? 'week'
      : period === 'yearly'
        ? 'year'
        : period === 'once'
          ? 'run'
          : 'month'

/**
 * The sub-line under the limit figure: "per month".
 *
 * A one-off says **"in total"** instead. "Per run" is grammatical and wrong in
 * the way that matters: the whole point of the period is that there is only one
 * of them, so the limit is not a rate at all — it is the size of the envelope.
 */
export const perPeriod = (period: BudgetPeriod): string =>
  period === 'once' ? 'in total' : `per ${periodNoun(period)}`

/** "Adds unspent zł to next month" — the rollover row's meta. */
export const nextPeriodNoun = periodNoun

/**
 * Whether the period has a start to *choose*.
 *
 * Three of the four do — a day of the month, a weekday, an anniversary — and
 * `resets_on` is that one integer read three ways. A day has none: it begins
 * when it begins. So the editor's "Resets on" row is not a row with one option,
 * it is a row that is not there, and this is the one place that says so.
 */
export const hasResetChoice = (period: BudgetPeriod): boolean =>
  period !== 'daily' && period !== 'once'

/**
 * A one-off's window, as it is read rather than as it is stored: end inclusive,
 * and the month said once when both ends share it.
 *
 * `period_end` is exclusive everywhere else in this file because that is what
 * makes the arithmetic work, but a run that stops on the 26th is picked on the
 * 26th and has to read back as the 26th.
 */
export const runLabel = (b: BudgetProgress): string =>
  runBounds(b.period_start, b.period_end)

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
 * `resets_on` is one integer read three ways — four periods, but a daily one
 * does not read it at all — and this is the only place that knows which. See
 * the migration for why it is one column.
 *
 * The yearly case decodes an ordinal against 2001, a non-leap year, which is
 * exactly how the database encodes it: the anniversary is a month and a day, and
 * a plain day-of-year would walk it forward every February.
 */
export function resetsOnLabel(period: BudgetPeriod, resetsOn: number): string {
  if (period === 'daily') return 'Every day'
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
 *
 * 1 is also the only value a daily budget may hold — the column is unread
 * there, and the CHECK pins it rather than letting a switched-from period leave
 * its own answer behind.
 */
export const defaultResetsOn = (_period: BudgetPeriod): number => 1

/* ------------------------------------------------------------------ history */

/**
 * What one bar of the history strip is called.
 *
 * One label per period, and each is the shortest thing that still identifies
 * the window: a day is its date, a week is the day it opened, a month is its
 * name, a year is its number. A week deliberately does **not** quote both ends
 * — twelve "8 – 14 Sep" labels under twelve 20px bars is a paragraph, and the
 * strip is scanned rather than read. The full range rides in the `title` and on
 * the selected bar's own line, where there is room for it.
 */
export function periodLabel(period: BudgetPeriod, start: string, end: string): string {
  if (period === 'daily') return formatDayShort(start)
  if (period === 'yearly') return start.slice(0, 4)
  if (period === 'monthly') return formatMonthShort(start)
  if (period === 'once') return runBounds(start, end)
  return formatDayShort(start)
}

/**
 * "12 – 26 Sep" — a window with its end read back inclusively.
 *
 * `period_end` is exclusive everywhere the arithmetic touches it, because that
 * is what makes the arithmetic work; a run that stops on the 26th was picked on
 * the 26th and has to read back as the 26th. `runLabel` says the same thing
 * about a `BudgetProgress`; this is the version that takes two dates, so the
 * history strip and the list row cannot drift.
 */
export function runBounds(start: string, end: string): string {
  const last = addDays(end, -1)
  if (start === last) return formatDayShort(last)
  return start.slice(0, 7) === last.slice(0, 7)
    ? `${Number(start.slice(8))} – ${formatDayShort(last)}`
    : `${formatDayShort(start)} – ${formatDayShort(last)}`
}

/** How many of these periods went over. The whole point of the strip. */
export const overCount = (periods: Standing[]): number =>
  periods.filter(isOver).length

/**
 * How much money one full-height bar of the history strip stands for.
 *
 * Two rules, and the second one exists because the first is not enough.
 *
 * **The limit is in the running.** A budget never once broken would otherwise
 * scale to its own biggest week and draw the limit line across the top of every
 * bar, which is the one reading that makes an under-spend look like a near
 * miss.
 *
 * **And a single outlier is clipped rather than allowed to set the scale.** A
 * single heavy period scales every ordinary one to a sliver and buries the
 * limit notch, which is the thing the strip exists to be read against.
 * Measured on the real data: a 200 zł daily budget had one 3 235 zł day —
 * **16.2 times its limit** — which put the notch at 6% of the bar, so fifteen
 * days over out of thirty were on screen and unreadable. So the ceiling stops
 * at `CLIP` times the largest limit in the set, which pins the notch a third of
 * the way up and leaves the ordinary periods the rest of the height.
 *
 * 3 rather than 2.5 or 4, measured against both real budgets: 4 drops the notch
 * to a quarter of the bar, and 2.5 buys nothing for it — it flattens four of
 * the weekly budget's twelve periods where 3 flattens one.
 *
 * Clipping is a lie about scale unless it is *stated*, which is why `clipped`
 * comes back with the peak: a bar past the top loses its rounded cap, so it
 * reads as continuing past the edge rather than as a bar that happens to be
 * full, and the strip's footnote says so in words. The exact figure is on every
 * bar's `title` either way.
 */
const CLIP = 3

export function historyScale(periods: Standing[]): {
  peak: number
  clipped: number
} {
  const ceiling = periods.reduce((most, p) => Math.max(most, effectiveLimit(p)), 0)
  const tallest = periods.reduce((most, p) => Math.max(most, p.spent), 0)
  // Never below the largest limit — that is the first rule — and never above
  // `CLIP` times it, which is the second. `ceiling` is 0 only for a set whose
  // limits are all zero, where there is no notch for an outlier to bury and the
  // spend is all there is to scale by.
  const peak =
    ceiling > 0
      ? Math.max(ceiling, Math.min(tallest, ceiling * CLIP))
      : Math.max(1, tallest)
  return { peak, clipped: periods.filter((p) => p.spent > peak).length }
}

/* -------------------------------------------------------------------- scope */

const plural = (n: number, one: string, many: string): string =>
  `${n} ${n === 1 ? one : many}`

/** "12 – 26 Sep · 4 categories · 3 wallets · rolls over" — the row's third line. */
export function scopeMeta(b: BudgetProgress): string {
  const parts = [
    // A one-off leads with its dates: every other budget's window is implied by
    // its period, and this one's is the thing that had to be chosen.
    ...(b.period === 'once' ? [runLabel(b)] : []),
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
      GROUP_RANK[groupOf(a, on)] - GROUP_RANK[groupOf(b, on)] ||
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

/**
 * Rail order: what the user arranged, with the name as a stable tiebreak.
 *
 * **A finished run leaves the rail on its own**, without the switch moving. The
 * rail is what is happening now; a ring frozen at its final share is a card that
 * will never change again, and it would push a live budget off the end of a
 * scroller that only shows two and a half. It stays on the list, which is where
 * it can be read or deleted. A run that has not started keeps its place — a
 * holiday budget put on Home in August is doing its job in August.
 */
export const sortForHome = (budgets: BudgetProgress[]): BudgetProgress[] =>
  budgets
    .filter((b) => b.show_on_home && phaseOf(b) !== 'finished')
    .sort((a, b) => a.home_order - b.home_order || a.name.localeCompare(b.name))
