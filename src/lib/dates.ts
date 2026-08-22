/**
 * Date helpers for `transactions.date`, which is a DATE — a calendar day, with
 * no time and no zone. Everything here treats 'YYYY-MM-DD' as a plain label and
 * never converts through UTC, because that is what shifts a purchase into the
 * previous day for anyone east of Greenwich.
 *
 * Numbers are formatted pl-PL (spaces, decimal comma); dates are formatted
 * en-GB, matching the design's copy.
 */

/** Local calendar day as 'YYYY-MM-DD'. 'sv-SE' yields exactly that shape. */
export const toISODate = (d: Date): string => d.toLocaleDateString('sv-SE')

export const today = (): string => toISODate(new Date())

/** Parses 'YYYY-MM-DD' into a local Date at midnight — no UTC round-trip. */
export function fromISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1)
}

export function addDays(iso: string, days: number): string {
  const d = fromISODate(iso)
  d.setDate(d.getDate() + days)
  return toISODate(d)
}

export function addMonths(iso: string, months: number): string {
  const d = fromISODate(iso)
  d.setMonth(d.getMonth() + months)
  return toISODate(d)
}

export const startOfMonth = (iso: string): string => `${iso.slice(0, 7)}-01`

/**
 * Earlier / later of two 'YYYY-MM-DD' days.
 *
 * They sort lexically, so there is no parsing in it — which is exactly why it
 * got written twice, once in `queries.ts` and once on the transaction screen,
 * within a week. Three words is not too small to share when the alternative is
 * two of them.
 */
export const minDay = (a: string, b: string): string => (a < b ? a : b)
export const maxDay = (a: string, b: string): string => (a > b ? a : b)

/** Last calendar day of the month `iso` falls in — day 0 of the next month. */
export function endOfMonth(iso: string): string {
  const d = fromISODate(iso)
  return toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0))
}

const fmt = (opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-GB', opts)

const dayHeaderFmt = fmt({ weekday: 'long', day: 'numeric', month: 'long' })
const fullDateFmt = fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const dayShortFmt = fmt({ day: 'numeric', month: 'short' })
const monthShortFmt = fmt({ month: 'short', year: '2-digit' })
const monthLongFmt = fmt({ month: 'long' })
const monthYearFmt = fmt({ month: 'long', year: 'numeric' })

/** "Friday 7 August" — the feed's day separator. */
export const formatDayHeader = (iso: string): string =>
  dayHeaderFmt.format(fromISODate(iso))

/** "Thursday, 6 August 2026" — the detail screen. */
export const formatFullDate = (iso: string): string =>
  fullDateFmt.format(fromISODate(iso))

/**
 * "21 Aug" — the Date column of the wallet pane's table.
 *
 * No year and no weekday: the table is one month at a time, so the year is
 * already established by the stepper above it and the weekday is the thing a
 * day *header* carries when there is no column to put a date in.
 */
export const formatDayShort = (iso: string): string =>
  dayShortFmt.format(fromISODate(iso))

/** "Aug '26" — chart axes. */
export const formatMonthShort = (iso: string): string =>
  monthShortFmt.format(fromISODate(iso))

/** "August" — budget period labels. */
export const formatMonthLong = (iso: string): string =>
  monthLongFmt.format(fromISODate(iso))

/**
 * "August" this year, "August 2025" in any other — the feed's month stepper.
 *
 * The year is dropped for the current one because that is where the reader
 * almost always is, and a heading that says the obvious out loud makes the two
 * or three characters that actually matter harder to find. Stepping back past
 * January brings it in, which is exactly when it starts carrying information.
 */
export const formatMonthLabel = (iso: string): string =>
  iso.slice(0, 4) === today().slice(0, 4)
    ? formatMonthLong(iso)
    : monthYearFmt.format(fromISODate(iso))

/**
 * Relative label the add screen shows instead of a bare date.
 *
 * "Tomorrow" earns its place now that a date can legitimately be in the future:
 * without it the one nearby future day reads as a full date while both nearby
 * past days read as words, which makes picking it feel like a mistake.
 */
export function relativeDayLabel(iso: string): string {
  if (iso === today()) return 'Today'
  if (iso === addDays(today(), -1)) return 'Yesterday'
  if (iso === addDays(today(), 1)) return 'Tomorrow'
  return formatDayHeader(iso)
}

/** Monday-first weekday index (0 = Monday), for the calendar grid. */
export const mondayFirstIndex = (d: Date): number => (d.getDay() + 6) % 7

/** Days of the month `iso` falls in, padded to whole Monday-start weeks. */
export function calendarGrid(iso: string): (string | null)[] {
  const first = fromISODate(startOfMonth(iso))
  const daysInMonth = new Date(
    first.getFullYear(),
    first.getMonth() + 1,
    0,
  ).getDate()

  const lead = mondayFirstIndex(first)
  const cells: (string | null)[] = Array(lead).fill(null)
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(toISODate(new Date(first.getFullYear(), first.getMonth(), day)))
  }
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

export const WEEKDAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
