import { Sheet } from '@/components/Sheet'
import { Label } from '@/components/ui/Label'
import { keepFocus } from '@/lib/touch'
import {
  daysInMonth,
  WEEKDAYS,
  yearlyDate,
  yearlyResetsOn,
} from '@/lib/budgets'
import type { BudgetPeriod } from '@/lib/db'

const MONTHS = Array.from({ length: 12 }, (_, m) =>
  new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(new Date(2001, m, 1)),
)

/** A cell in either grid: same size, same selected treatment. */
function Cell({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onMouseDown={keepFocus}
      onClick={onClick}
      className="tnum flex h-11 w-full items-center justify-center rounded-tile text-[14.5px]"
      style={{
        fontWeight: active ? 600 : 500,
        background: active ? 'var(--color-accent)' : 'var(--color-inset)',
        color: active ? 'var(--color-accent-fg)' : 'var(--color-ink-muted)',
      }}
    >
      {label}
    </button>
  )
}

/**
 * Where a period starts: a day of the month, a weekday, or an anniversary.
 *
 * One integer behind all three (see `resetsOnLabel` and the migration), so this
 * drawer's whole job is to be the right keyboard for whichever reading is
 * live — and never to leave a value the CHECK constraint would refuse.
 *
 * **Grids, not the handoff's wheel.** A wheel is an iOS picker imitated in the
 * DOM: it needs momentum, snapping and a hit area the size of one row, and it
 * shows three of thirty-one options at a time. A 7-column grid of days shows
 * all of them, matches the calendar grid the date sheet already draws, and is
 * one tap from anywhere.
 *
 * The monthly grid stops at 28 with a note, rather than offering 29–31 and
 * clamping quietly: the database *does* clamp, but a budget that says "resets
 * on the 31st" and runs to the 28th in February is a surprise worth not
 * building. Someone who wants month-end can still say so — the row below sets
 * it, and the note explains what it will do.
 */
export function ResetsOnSheet({
  open,
  onClose,
  period,
  value,
  onChange,
}: {
  open: boolean
  onClose: () => void
  period: BudgetPeriod
  value: number
  onChange: (next: number) => void
}) {
  const commit = (next: number) => {
    onChange(next)
    onClose()
  }

  const anniversary = period === 'yearly' ? yearlyDate(value) : null

  return (
    <Sheet
      open={open}
      onClose={onClose}
      height={period === 'monthly' ? '62%' : period === 'yearly' ? '62%' : '46%'}
      label="Resets on"
    >
      <div className="no-scrollbar flex-1 overflow-y-auto px-4 pb-8">
        <Label>Resets on</Label>

        {period === 'weekly' && (
          <div className="mt-3 flex flex-col gap-2">
            {/* Monday first, though the stored encoding is Sunday-first to match
                `extract(dow)` — the list is for reading, the number is for the
                database, and they do not have to agree on where a week starts. */}
            {[1, 2, 3, 4, 5, 6, 0].map((day) => (
              <button
                key={day}
                type="button"
                aria-pressed={value === day}
                onMouseDown={keepFocus}
                onClick={() => commit(day)}
                className="flex items-center rounded-field px-4 py-3 text-left text-[15px]"
                style={{
                  fontWeight: value === day ? 600 : 500,
                  background:
                    value === day ? 'var(--color-accent)' : 'var(--color-inset)',
                  color:
                    value === day ? 'var(--color-accent-fg)' : 'var(--color-ink)',
                }}
              >
                Every {WEEKDAYS[day]}
              </button>
            ))}
          </div>
        )}

        {period === 'monthly' && (
          <>
            <div className="mt-3 grid grid-cols-7 gap-2">
              {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                <Cell
                  key={day}
                  label={String(day)}
                  active={value === day}
                  onClick={() => commit(day)}
                />
              ))}
            </div>
            <div className="mt-3">
              <Cell
                label="Last day of the month"
                active={value > 28}
                onClick={() => commit(31)}
              />
            </div>
            <p className="mt-3 px-1 text-[12.5px] leading-[1.5] text-ink-muted">
              Days past the 28th are only offered as “last day”, because February
              has to clamp somewhere and a budget that silently moved would be
              worse than one that says where it lands.
            </p>
          </>
        )}

        {period === 'yearly' && anniversary && (
          <>
            <div className="mt-3 grid grid-cols-4 gap-2">
              {MONTHS.map((label, month) => (
                <Cell
                  key={label}
                  label={label}
                  active={anniversary.month === month}
                  onClick={() =>
                    // The day is carried across and clamped by the encoder, so
                    // moving 31 January to February lands on the 28th rather
                    // than on a date the reference year does not have.
                    onChange(yearlyResetsOn(month, anniversary.day))
                  }
                />
              ))}
            </div>

            <div className="mt-3 grid grid-cols-7 gap-2">
              {Array.from(
                { length: daysInMonth(anniversary.month) },
                (_, i) => i + 1,
              ).map((day) => (
                <Cell
                  key={day}
                  label={String(day)}
                  active={anniversary.day === day}
                  onClick={() => commit(yearlyResetsOn(anniversary.month, day))}
                />
              ))}
            </div>

            <p className="mt-3 px-1 text-[12.5px] leading-[1.5] text-ink-muted">
              Stored as a month and a day against a non-leap year, so the
              anniversary never drifts. 29 February is not offered for the same
              reason.
            </p>
          </>
        )}
      </div>
    </Sheet>
  )
}
