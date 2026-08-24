import { useEffect, useState } from 'react'
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import { Sheet } from '@/components/Sheet'
import { Label } from '@/components/ui/Label'
import { keepFocus } from '@/lib/touch'
import {
  addDays,
  addMonths,
  calendarGrid,
  formatMonthLong,
  fromISODate,
  startOfMonth,
  today,
  WEEKDAY_INITIALS,
} from '@/lib/dates'

/** Quick lengths offered when the end of a run is being picked, in days. */
const RUNS = [7, 14, 30]

/**
 * One end of a one-off budget's run.
 *
 * The same calendar the entry screen's date sheet draws, and deliberately not
 * that component: this one has a floor (an end cannot precede its start), no
 * Yesterday/Today shortcuts — a budget's run is almost never a day either side
 * of now — and quick lengths instead, because "a fortnight from the start" is
 * how a trip is actually decided.
 *
 * Days before `min` are drawn dim and refuse the tap rather than being left
 * out: a month with a hole in it stops reading as a calendar, and the
 * unavailable half of the grid is what says where the floor is.
 *
 * The visible month follows `value` while the drawer is **closed**, so opening
 * it always lands on the date it is about. Following it while open would drag
 * the calendar out from under a finger that just tapped the 1st of a month it
 * had paged to.
 */
export function RunDateSheet({
  open,
  onClose,
  which,
  value,
  min,
  onPick,
}: {
  open: boolean
  onClose: () => void
  which: 'start' | 'end'
  value: string
  /** Earliest day this end may take — the run's start, when picking its end. */
  min?: string
  onPick: (iso: string) => void
}) {
  const [month, setMonth] = useState(() => startOfMonth(value))

  useEffect(() => {
    if (!open) setMonth(startOfMonth(value))
  }, [open, value])

  const cells = calendarGrid(month)
  const now = today()

  const commit = (iso: string) => {
    onPick(iso)
    onClose()
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      height="62%"
      label={which === 'start' ? 'Starts on' : 'Ends on'}
    >
      <div className="no-scrollbar flex flex-1 flex-col overflow-y-auto px-4 pb-8">
        <Label>{which === 'start' ? 'Starts on' : 'Ends on'}</Label>

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
                disabled={Boolean(min) && iso < min!}
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
          {which === 'start'
            ? [
                { label: 'Today', iso: now },
                { label: 'Next month', iso: startOfMonth(addMonths(now, 1)) },
              ].map((quick) => (
                <button
                  key={quick.label}
                  type="button"
                  onMouseDown={keepFocus}
                  onClick={() => commit(quick.iso)}
                  className="flex-1 rounded-field bg-inset py-3 text-value font-medium"
                >
                  {quick.label}
                </button>
              ))
            : RUNS.map((days) => (
                <button
                  key={days}
                  type="button"
                  onMouseDown={keepFocus}
                  // Counted from the start and inclusive of it, so "7 days"
                  // really is seven days of spending rather than eight.
                  onClick={() => commit(addDays(min ?? now, days - 1))}
                  className="flex-1 rounded-field bg-inset py-3 text-value font-medium"
                >
                  {days} days
                </button>
              ))}
        </div>
      </div>
    </Sheet>
  )
}
