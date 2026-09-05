import { useEffect, useRef } from 'react'
import { effectiveLimit, historyScale, isOver, runBounds } from '@/lib/budgets'
import { asMinor, formatMoneyShort } from '@/lib/money'
import type { BudgetPeriod, BudgetPeriodRow } from '@/lib/db'

/**
 * The periods behind this one, oldest on the left, as a strip of bars you can
 * tap.
 *
 * ## Why it is a control and not a picture
 *
 * The question this screen exists to answer — "how often do I go over" — is
 * answered by the shape of the strip, and the question that follows it every
 * time is "what happened *that* week". Making the bars the period selector puts
 * the second answer one tap from the first, and it saves the screen a stepper
 * it would otherwise need anyway: the feed below has to be about *some* window,
 * and a strip plus a stepper would be two controls arguing over which.
 *
 * ## Hand-rolled, like every other small mark here
 *
 * No axis, no tooltip, no zoom, one bar per period at 26px: the 189 kB ECharts
 * chunk would be the whole cost for none of the benefit — the same call
 * `Sparkline` and the six-month history bars make. Plain elements rather than
 * SVG, so every colour goes in as a `var()` and the strip re-tints itself on a
 * mode change for free.
 *
 * ## The limit is a notch per bar, not a rule across the strip
 *
 * One line would be right only while every period shares a limit, which stops
 * being true the moment `rollover` is on — a week that inherited 30 zł of
 * headroom genuinely had a higher ceiling than the one before it. With rollover
 * off, which is the common case, the notches line up and read as that rule
 * anyway.
 */
const BAR_W = 26
const GAP = 6
const BAR_H = 78

export function BudgetHistoryStrip({
  periods,
  period,
  colour,
  selected,
  onSelect,
}: {
  /** Oldest first, ending with the period containing today. */
  periods: BudgetPeriodRow[]
  period: BudgetPeriod
  /** The budget's own hue; a period over its limit takes expense red instead. */
  colour: string
  /** `period_start` of the selected bar. */
  selected: string
  onSelect: (start: string) => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const { peak } = historyScale(periods)

  // Open at the right-hand end, which is now: the strip reads backwards from
  // the period the screen is already about, so arriving at its left edge would
  // put a year-old week under a header quoting this one. `scrollLeft` rather
  // than `scrollIntoView`, which scrolls every ancestor including the page.
  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [periods.length])

  return (
    /* The scroller **is** the flex row, which is not a shortcut: with a plain
       block flex container nested inside it, that inner box takes the
       scrollport's width rather than its content's, the buttons overflow *it*,
       and the scroller's own trailing `px-4` never enters the scrollable
       overflow — so the last bar ends flush against the card's right edge. Same
       arrangement `BudgetRail` uses, for the same reason. */
    <div
      ref={scroller}
      className="no-scrollbar -mx-4 flex overflow-x-auto px-4"
      style={{ gap: GAP }}
    >
      {periods.map((p) => {
        const limit = effectiveLimit(p)
        const over = isOver(p)
        const chosen = p.period_start === selected
        // See `historyScale`: the peak is never below the largest limit and
        // never more than three times it, so the notch always has room to be
        // read and one runaway period cannot flatten the other twenty-nine.
        const past = p.spent > peak
        const height = Math.max(2, Math.min(1, p.spent / peak) * BAR_H)
        const notch = Math.min(1, limit / peak) * BAR_H

        return (
          <button
            key={p.period_start}
            type="button"
            onClick={() => onSelect(p.period_start)}
            aria-pressed={chosen}
            title={`${runBounds(p.period_start, p.period_end)} · ${formatMoneyShort(
              asMinor(p.spent),
            )} of ${formatMoneyShort(asMinor(limit))} · ${p.txns} transaction${
              p.txns === 1 ? '' : 's'
            }`}
            className="flex flex-none flex-col items-stretch"
            style={{ width: BAR_W }}
          >
            {/* The bar's own well, so an empty period is still something a
                finger can find — a 2px stub is not. */}
            <span
              className="relative flex flex-col justify-end rounded-[5px]"
              style={{
                height: BAR_H,
                background: chosen ? 'var(--color-track)' : 'transparent',
              }}
            >
              <span
                style={{
                  height,
                  background: over ? 'var(--color-expense)' : colour,
                  // A bar past the top of the scale loses its rounded cap, so
                  // it reads as continuing past the edge rather than as one
                  // that happens to be full. Its exact figure is in the
                  // `title`, and the footnote says clipping is happening.
                  borderRadius: past ? '0 0 5px 5px' : 5,
                  // An unselected bar steps back rather than changing colour:
                  // the hue is already carrying "over or not" and cannot also
                  // carry "chosen".
                  opacity: chosen ? 1 : 0.42,
                }}
              />
              {/* This period's ceiling, drawn over the bar so an overspend
                  reads as the bar having passed it. */}
              <span
                className="absolute inset-x-0"
                style={{
                  bottom: notch,
                  height: 1.5,
                  background: 'var(--color-ink-dim)',
                  opacity: chosen ? 0.9 : 0.35,
                }}
              />
            </span>

            <span
              className={`tnum truncate pt-1.5 text-center text-micro ${
                chosen ? 'font-semibold text-ink' : 'text-ink-faint'
              }`}
            >
              {shortLabel(period, p.period_start)}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * The label under one bar: the shortest thing that still tells the bars apart.
 *
 * A day and a week are both identified by the day they open on, because a
 * 26px cell holds two digits and not a date. That is legible only because the
 * selected period's full range is spelled out in the header above the strip and
 * every bar carries it in its `title` — the row is scanned, not read.
 */
function shortLabel(period: BudgetPeriod, start: string): string {
  if (period === 'yearly') return start.slice(0, 4)
  if (period === 'monthly') return MONTHS[Number(start.slice(5, 7)) - 1] ?? ''
  return String(Number(start.slice(8)))
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]
