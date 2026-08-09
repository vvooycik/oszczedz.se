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

const fmt = (opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-GB', opts)

const dayHeaderFmt = fmt({ weekday: 'long', day: 'numeric', month: 'long' })
const fullDateFmt = fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const monthShortFmt = fmt({ month: 'short', year: '2-digit' })
const monthLongFmt = fmt({ month: 'long' })

/** "Friday 7 August" — the feed's day separator. */
export const formatDayHeader = (iso: string): string =>
  dayHeaderFmt.format(fromISODate(iso))

/** "Thursday, 6 August 2026" — the detail screen. */
export const formatFullDate = (iso: string): string =>
  fullDateFmt.format(fromISODate(iso))

/** "Aug '26" — chart axes. */
export const formatMonthShort = (iso: string): string =>
  monthShortFmt.format(fromISODate(iso))

/** "August" — budget period labels. */
export const formatMonthLong = (iso: string): string =>
  monthLongFmt.format(fromISODate(iso))

/** Relative label the add screen shows instead of a bare date. */
export function relativeDayLabel(iso: string): string {
  if (iso === today()) return 'Today'
  if (iso === addDays(today(), -1)) return 'Yesterday'
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
