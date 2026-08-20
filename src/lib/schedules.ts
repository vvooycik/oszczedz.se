/**
 * The vocabulary of the future, in one place.
 *
 * Three words that are near-synonyms in English and must not become synonyms
 * here:
 *
 * - **settled** — a transaction dated today or earlier. It happened. This is
 *   the only thing balances, budgets and charts count, and the database says it
 *   once, in the `settled_transactions` view.
 * - **planned** — a transaction dated after today. A real row with a real id:
 *   it can be opened, edited and deleted. It just is not true yet.
 * - **schedule** — the recurrence rule. It is not a transaction; it *makes*
 *   transactions, out to a horizon, and they are planned until their day comes.
 *
 * Nothing here re-derives an occurrence date the database already stored. What
 * it does compute is the *next* one, for a list row that has to say when a
 * subscription charges next — and it counts from the anchor exactly the way
 * `schedule_occurrences` does, because stepping from the previous date is how a
 * monthly on the 31st slides to the 28th and never comes back.
 */
import { addDays, fromISODate, toISODate, today } from './dates'
import type { Schedule, ScheduleFrequency, Transaction } from './db'

/**
 * How far ahead `materialise_schedules` writes rows.
 *
 * Four months covers the home chart's one-month forecast several times over,
 * so the dotted tail is never short, and a monthly subscription is four rows —
 * the horizon is cheap because occurrences are sparse, not because it is
 * conservative.
 */
export const HORIZON_DAYS = 120

/** Dated after today, so it has not happened. */
export const isPlanned = (tx: Transaction, on: string = today()): boolean =>
  tx.date > on

export const FREQUENCY_OPTIONS: { key: ScheduleFrequency; label: string }[] = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'yearly', label: 'Yearly' },
]

/** Singular and plural of the unit, for "every 2 weeks". */
const UNIT: Record<ScheduleFrequency, [string, string]> = {
  daily: ['day', 'days'],
  weekly: ['week', 'weeks'],
  monthly: ['month', 'months'],
  yearly: ['year', 'years'],
}

const ORDINALS = ['th', 'st', 'nd', 'rd']

/** 1st, 2nd, 3rd, 4th … 11th, 21st. */
export function ordinal(n: number): string {
  const rem = n % 100
  return `${n}${ORDINALS[(rem - 20) % 10] ?? ORDINALS[rem] ?? ORDINALS[0]}`
}

const WEEKDAY = new Intl.DateTimeFormat('en-GB', { weekday: 'long' })
const MONTH_DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long' })

/**
 * "Every month on the 14th", "Every 2 weeks on Tuesday".
 *
 * The positional part is read back off the anchor rather than stored anywhere,
 * which is the whole reason a schedule has no `resets_on` the way a budget
 * does: an occurrence is counted off from a known start, so the start already
 * says which day of the month or week it lands on.
 */
export function cadenceLabel(
  frequency: ScheduleFrequency,
  everyN: number,
  anchor: string,
): string {
  const [one, many] = UNIT[frequency]
  const unit = everyN === 1 ? `Every ${one}` : `Every ${everyN} ${many}`
  const date = fromISODate(anchor)

  switch (frequency) {
    case 'daily':
      return unit
    case 'weekly':
      return `${unit} on ${WEEKDAY.format(date)}`
    case 'monthly':
      return `${unit} on the ${ordinal(date.getDate())}`
    case 'yearly':
      return `${unit} on ${MONTH_DAY.format(date)}`
  }
}

/**
 * The next occurrence strictly after `on`, or null once the rule has ended.
 *
 * Counted from the anchor — `anchor + n·step` — never stepped from the previous
 * result. A monthly anchored on the 31st therefore reads 31 Jan, 28 Feb, 31
 * Mar; stepping would clamp in February and charge on the 28th for the rest of
 * its life. That is not a hypothetical: it is what the first version of the SQL
 * generator did, and this function has to agree with the rows that generator
 * writes or the list would name a date the feed does not show.
 */
export function nextOccurrence(
  schedule: Pick<Schedule, 'frequency' | 'every_n' | 'anchor' | 'ends_on'>,
  on: string = today(),
): string | null {
  const { frequency, anchor, ends_on } = schedule
  const step = Math.max(1, schedule.every_n)

  if (anchor > on) return ends_on && anchor > ends_on ? null : anchor

  const at = (n: number): string => {
    const d = fromISODate(anchor)
    switch (frequency) {
      case 'daily':
        d.setDate(d.getDate() + n * step)
        break
      case 'weekly':
        d.setDate(d.getDate() + n * step * 7)
        break
      case 'monthly':
      case 'yearly': {
        // setMonth overflows a short month forward — 31 Jan + 1 month becomes
        // 2 March — so the day is clamped by hand to the target month's length,
        // which is what Postgres's date + interval does.
        const day = d.getDate()
        const months = frequency === 'yearly' ? n * step * 12 : n * step
        d.setDate(1)
        d.setMonth(d.getMonth() + months)
        d.setDate(Math.min(day, daysInMonthOf(d)))
        break
      }
    }
    return toISODate(d)
  }

  // The gap between occurrences is at least a day, so an upper bound on how
  // many have passed is the number of days elapsed — then walk forward from the
  // estimate rather than from zero.
  let n = estimateSteps(frequency, step, anchor, on)
  while (n > 0 && at(n - 1) > on) n--
  while (at(n) <= on) n++

  const next = at(n)
  return ends_on && next > ends_on ? null : next
}

const daysInMonthOf = (d: Date): number =>
  new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()

function estimateSteps(
  frequency: ScheduleFrequency,
  step: number,
  anchor: string,
  on: string,
): number {
  const from = fromISODate(anchor)
  const to = fromISODate(on)
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000)

  switch (frequency) {
    case 'daily':
      return Math.max(0, Math.floor(days / step))
    case 'weekly':
      return Math.max(0, Math.floor(days / (7 * step)))
    case 'monthly':
      return Math.max(
        0,
        Math.floor(
          ((to.getFullYear() - from.getFullYear()) * 12 +
            (to.getMonth() - from.getMonth())) /
            step,
        ),
      )
    case 'yearly':
      return Math.max(0, Math.floor((to.getFullYear() - from.getFullYear()) / step))
  }
}

/** Has the rule run out? Its last occurrence is behind us. */
export const hasEnded = (
  schedule: Pick<Schedule, 'frequency' | 'every_n' | 'anchor' | 'ends_on'>,
  on: string = today(),
): boolean => schedule.ends_on != null && nextOccurrence(schedule, on) === null

/**
 * A schedule sorts by when it next charges, so the list reads as a queue.
 * Rules with nothing left go last rather than being hidden — they are still
 * a record of what was set up.
 */
export function sortByNext(schedules: Schedule[], on: string = today()): Schedule[] {
  return [...schedules].sort((a, b) => {
    const na = nextOccurrence(a, on)
    const nb = nextOccurrence(b, on)
    if (na === nb) return a.name.localeCompare(b.name)
    if (na === null) return 1
    if (nb === null) return -1
    return na < nb ? -1 : 1
  })
}

/**
 * The end of the Upcoming list.
 *
 * **Six weeks, and thirty days is exactly the wrong number.** A monthly rule's
 * gap is 28 to 31 days, so for most of its cycle its next charge sits just
 * outside a thirty-day window — which means creating a subscription and finding
 * Upcoming empty, the one moment it most needs to show something. Caught by
 * running the real sequence against the real data: a monthly anchored today put
 * its next occurrence 31 days out and the list came back blank.
 *
 * Forty-five always contains the next occurrence of any monthly rule and
 * usually just the one, so the list stays a queue rather than becoming the four
 * months of rows the horizon actually holds.
 */
export const upcomingHorizon = (on: string = today()): string => addDays(on, 45)
