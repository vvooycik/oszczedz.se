import { useState } from 'react'
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import { Sheet } from '@/components/Sheet'
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

export function DateSheet({
  open,
  onClose,
  value,
  onPick,
}: {
  open: boolean
  onClose: () => void
  value: string
  onPick: (iso: string) => void
}) {
  const [month, setMonth] = useState(() => startOfMonth(value))
  const cells = calendarGrid(month)
  const now = today()

  return (
    <Sheet open={open} onClose={onClose} height="56%" label="Choose a date">
      <div className="flex items-center justify-between px-4 pt-2">
        <button
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
          onClick={() => setMonth((m) => startOfMonth(addMonths(m, 1)))}
          aria-label="Next month"
          className="text-ink-muted"
        >
          <IconChevronRight size={20} stroke={2} />
        </button>
      </div>

      <div className="grid grid-cols-7 px-4 pt-4 text-center">
        {WEEKDAY_INITIALS.map((d, i) => (
          <span key={i} className="text-badge text-ink-dim">
            {d}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-1 px-4 pt-2">
        {cells.map((iso, i) =>
          iso === null ? (
            <span key={`pad-${i}`} />
          ) : (
            <button
              key={iso}
              onClick={() => {
                onPick(iso)
                onClose()
              }}
              className="tnum mx-auto flex size-9 items-center justify-center rounded-full text-value"
              style={
                iso === value
                  ? { background: 'var(--color-accent)', color: 'var(--color-accent-fg)', fontWeight: 600 }
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

      <div className="mt-auto flex gap-2.5 px-4 pb-8">
        {[
          { label: 'Yesterday', iso: addDays(now, -1) },
          { label: 'Today', iso: now },
        ].map((quick) => (
          <button
            key={quick.label}
            onClick={() => {
              onPick(quick.iso)
              onClose()
            }}
            className="flex-1 rounded-field bg-inset py-3 text-value font-medium"
          >
            {quick.label}
          </button>
        ))}
      </div>
    </Sheet>
  )
}
