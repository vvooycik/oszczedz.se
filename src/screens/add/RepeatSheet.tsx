import { Sheet } from '@/components/Sheet'
import { Label } from '@/components/ui/Label'
import { keepFocus } from '@/lib/touch'
import { cadenceLabel, FREQUENCY_OPTIONS } from '@/lib/schedules'
import { relativeDayLabel } from '@/lib/dates'
import type { ScheduleFrequency } from '@/lib/db'

export type Repeat = { frequency: ScheduleFrequency; everyN: number } | null

/** Every N units. Beyond twelve the sentence stops being one anybody says. */
const EVERY_N = [1, 2, 3, 4, 6, 12]

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
 * How often this entry repeats — or Never, which is the ordinary case and the
 * way back out.
 *
 * **Nothing positional is asked for here.** Which day of the month, which
 * weekday, which date in the year: all of that is already on the form, as the
 * transaction's own date, and a schedule's occurrences are counted off from
 * that anchor. Asking again would be a second control saying the same thing,
 * and two controls that can disagree is exactly what the transfer flow avoids
 * by making the category's kind the mode switch.
 *
 * So the sentence at the bottom is not a summary, it is the whole answer:
 * change the date on the form and it moves with it.
 */
export function RepeatSheet({
  open,
  onClose,
  value,
  anchor,
  onChange,
}: {
  open: boolean
  onClose: () => void
  value: Repeat
  /** The transaction's date — where the recurrence is counted from. */
  anchor: string
  onChange: (repeat: Repeat) => void
}) {
  const frequency = value?.frequency ?? 'monthly'
  const everyN = value?.everyN ?? 1

  return (
    <Sheet open={open} onClose={onClose} height="62%" label="How often it repeats">
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <Label className="px-1">Repeats</Label>
        <div className="mt-2 grid grid-cols-5 gap-2">
          <Cell
            label="Never"
            active={value === null}
            onClick={() => onChange(null)}
          />
          {FREQUENCY_OPTIONS.map((option) => (
            <Cell
              key={option.key}
              label={option.label}
              active={value !== null && frequency === option.key}
              onClick={() => onChange({ frequency: option.key, everyN })}
            />
          ))}
        </div>

        {value !== null && (
          <>
            <Label className="mt-6 px-1">Every</Label>
            <div className="mt-2 grid grid-cols-6 gap-2">
              {EVERY_N.map((n) => (
                <Cell
                  key={n}
                  label={String(n)}
                  active={everyN === n}
                  onClick={() => onChange({ frequency, everyN: n })}
                />
              ))}
            </div>

            {/* The anchor is the form's date, so this line changes when that
                does — which is the point of not asking for it twice. */}
            <p className="mt-6 rounded-card bg-inset px-4 py-3 text-[13.5px] leading-[1.5] text-ink-muted">
              <span className="font-medium text-ink">
                {cadenceLabel(frequency, everyN, anchor)}
              </span>
              , from {relativeDayLabel(anchor).toLowerCase()}. Each one appears
              as a planned transaction before it charges, and counts for nothing
              until its day.
            </p>
          </>
        )}
      </div>

      <div className="px-4 pb-8">
        <button
          type="button"
          onMouseDown={keepFocus}
          onClick={onClose}
          className="w-full rounded-field bg-inset py-3.5 text-[15px] font-semibold"
        >
          Done
        </button>
      </div>
    </Sheet>
  )
}
