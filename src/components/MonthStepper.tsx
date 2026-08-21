import type { ReactNode } from 'react'
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import { addMonths, formatMonthLabel, startOfMonth, today } from '@/lib/dates'

/**
 * One 30px round tap target. Icon-only, so it carries an `aria-label` and the
 * chevron is hidden from the reader — and its own `text-` size, because
 * index.css floors a bare `button` at 16px for the iOS zoom rule and an
 * unstated size here would set the icon's line box a pixel and a half too tall.
 */
function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full bg-inset text-value text-ink-muted active:bg-press disabled:opacity-35"
    >
      {children}
    </button>
  )
}

/**
 * `‹ August ›` — which month the list below it is showing.
 *
 * Shared by the home feed and the wallet detail screen, which page through
 * their transactions the same way and must not drift into two slightly
 * different controls.
 *
 * **The month name is the section heading**, which is why it is 15px ink rather
 * than the uppercase `Label` those rows used to carry. "Recent" was true of a
 * rolling window and is a lie the moment the reader steps back to March; the
 * month is both the heading and the control, so there is one row and not two.
 *
 * Two widths, because the two screens have different room. Home shares its row
 * with the `/scheduled` link, so the stepper is a compact cluster on the left
 * and the label holds a minimum width — otherwise the right chevron walks
 * sideways between "May" and "September". The wallet screen has nothing else on
 * that line, so it takes `spread`: the chevrons go to the two edges and the
 * month centres between them, which is the shape the control wants when it is
 * allowed to have it. Nothing else differs — same bounds, same labels, one
 * component.
 *
 * **Both bounds are real rather than decorative, and the component owns them**
 * so two callers cannot disagree about where the history ends. Forward stops at
 * the current month, because these lists are settled rows only and every month
 * past this one is empty by construction (invariant 3b — what is coming lives
 * on `/scheduled`). Back stops at the month of the first activity the caller
 * knows about: the whole history on the home screen, this wallet's own first
 * month on its detail screen. `null` means the caller does not know yet, which
 * disables the chevron for a beat rather than offering a step whose destination
 * has not arrived — stepping into a wall of empty months is a worse answer than
 * a chevron that will not press.
 */
export function MonthStepper({
  month,
  onChange,
  earliest,
  spread = false,
}: {
  /** The first of the month being shown, 'YYYY-MM-01'. */
  month: string
  onChange: (next: string) => void
  /** Any day in the earliest month with activity, or null while unknown. */
  earliest: string | null
  /** Take the whole row: chevrons at the edges, month centred between them. */
  spread?: boolean
}) {
  const floor = earliest ? startOfMonth(earliest) : null

  return (
    <div
      className={
        spread
          ? 'flex w-full items-center justify-between'
          : 'flex items-center gap-1'
      }
    >
      <StepButton
        label="Previous month"
        disabled={floor == null || month <= floor}
        onClick={() => onChange(addMonths(month, -1))}
      >
        <IconChevronLeft size={17} stroke={2} aria-hidden />
      </StepButton>
      <span
        className={`text-center text-row font-semibold ${
          spread ? 'flex-1' : 'min-w-[92px]'
        }`}
      >
        {formatMonthLabel(month)}
      </span>
      <StepButton
        label="Next month"
        disabled={month >= startOfMonth(today())}
        onClick={() => onChange(addMonths(month, 1))}
      >
        <IconChevronRight size={17} stroke={2} aria-hidden />
      </StepButton>
    </div>
  )
}
