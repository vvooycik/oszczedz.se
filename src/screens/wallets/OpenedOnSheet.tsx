import { useEffect, useState } from 'react'
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import { Sheet } from '@/components/Sheet'
import { Label } from '@/components/ui/Label'
import { keepFocus } from '@/lib/touch'
import {
  addMonths,
  calendarGrid,
  formatMonthLong,
  fromISODate,
  startOfMonth,
  today,
  WEEKDAY_INITIALS,
} from '@/lib/dates'

/**
 * The day a wallet's starting balance enters the record.
 *
 * A third calendar rather than a fourth prop on one of the other two, and that
 * is a debt worth naming: the entry screen's `DateSheet` and the budget run's
 * `RunDateSheet` already draw this grid. This one has a **ceiling** where one
 * has a floor and neither has both, and it is the only one whose answer can be
 * *no date at all* — so parameterising either would have meant a component with
 * a floor, a ceiling, an optional null and two sets of quick buttons, which is
 * three screens' worth of behaviour in one file. Extracting the shared grid is
 * the real fix and is a change to make deliberately, across all three.
 *
 * **Days after today refuse the tap**, drawn dim rather than left out — a month
 * with a hole in it stops reading as a calendar. The ceiling is not in the
 * database (a wallet may honestly open whenever it likes) but in the screen:
 * `wallet_balances` is a balance *now* and takes no date, so a wallet opening
 * next week would count in today's total while the chart still showed nothing
 * there. One of the two would be lying until the day arrived.
 */
export function OpenedOnSheet({
  open,
  onClose,
  title,
  value,
  onPick,
}: {
  open: boolean
  onClose: () => void
  /** "Opened on" for most types, "Taken on" for a loan. */
  title: string
  /** Null means "from before my records begin". */
  value: string | null
  onPick: (iso: string | null) => void
}) {
  const now = today()
  const [month, setMonth] = useState(() => startOfMonth(value ?? now))

  // Follows the value only while closed, so opening always lands on the month
  // the row is about without dragging the grid out from under a finger.
  useEffect(() => {
    if (!open) setMonth(startOfMonth(value ?? now))
  }, [open, value, now])

  const cells = calendarGrid(month)

  const commit = (iso: string | null) => {
    onPick(iso)
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} height="62%" label={title}>
      <div className="no-scrollbar flex flex-1 flex-col overflow-y-auto px-4 pb-8">
        <Label>{title}</Label>

        <div className="mt-3 flex items-center justify-between">
          <button
            type="button"
            onMouseDown={keepFocus}
            onClick={() => setMonth((m) => startOfMonth(addMonths(m, -1)))}
            aria-label="Previous month"
            className="text-ink-muted"
          >
            <IconChevronLeft size={20} stroke={2} />
          </button>
          <div className="text-row font-semibold">
            {formatMonthLong(month)} {fromISODate(month).getFullYear()}
          </div>
          <button
            type="button"
            onMouseDown={keepFocus}
            onClick={() => setMonth((m) => startOfMonth(addMonths(m, 1)))}
            aria-label="Next month"
            className="text-ink-muted"
          >
            <IconChevronRight size={20} stroke={2} />
          </button>
        </div>

        <div className="grid grid-cols-7 pt-4 text-center">
          {WEEKDAY_INITIALS.map((d, i) => (
            <span key={i} className="text-badge text-ink-dim">
              {d}
            </span>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-y-1 pt-2">
          {cells.map((iso, i) =>
            iso === null ? (
              <span key={`pad-${i}`} />
            ) : (
              <button
                key={iso}
                type="button"
                disabled={iso > now}
                onMouseDown={keepFocus}
                onClick={() => commit(iso)}
                className="tnum mx-auto flex size-9 items-center justify-center rounded-full text-value disabled:opacity-30"
                style={
                  iso === value
                    ? {
                        background: 'var(--color-accent)',
                        color: 'var(--color-accent-fg)',
                        fontWeight: 600,
                      }
                    : iso === now
                      ? { color: 'var(--color-ink)', fontWeight: 500 }
                      : { color: 'var(--color-ink-muted)' }
                }
              >
                {Number(iso.slice(8))}
              </button>
            ),
          )}
        </div>

        <div className="mt-auto flex gap-2.5 pt-5">
          <button
            type="button"
            onMouseDown={keepFocus}
            onClick={() => commit(now)}
            className="flex-1 rounded-field bg-inset py-3 text-value font-medium"
          >
            Today
          </button>
          {/* Null, not a date: the imported wallets held their opening balance
              before the first row of the import, so there is no day for it to
              arrive on. */}
          <button
            type="button"
            onMouseDown={keepFocus}
            onClick={() => commit(null)}
            className="flex-1 rounded-field bg-inset py-3 text-value font-medium"
            style={value === null ? { color: 'var(--color-accent)' } : undefined}
          >
            Before my records
          </button>
        </div>
      </div>
    </Sheet>
  )
}
