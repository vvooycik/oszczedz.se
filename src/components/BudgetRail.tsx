import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { IconPlus } from '@tabler/icons-react'
import { iconFor } from '@/lib/icons'
import { categoryVar } from '@/theme/tokens'
import { asMinor, currencySymbol, formatMoneyShort } from '@/lib/money'
import { daysLeft, effectiveLimit, shareOf, sortForHome } from '@/lib/budgets'
import { Card } from './ui/Card'
import type { BudgetProgress } from '@/lib/db'

/** Ring geometry, from the handoff. 46px box, r 19.5, 4.5 stroke, round cap. */
const BOX = 46
const R = 19.5
const CIRCUMFERENCE = 2 * Math.PI * R

/** First paint, and every change after it. */
const DRAW_MS = 420
const TWEEN_MS = 260

/**
 * Every item in the rail — card and invitation alike — is this wide.
 *
 * A share of the rail rather than the handoff's fixed 148px, so the same two
 * and a half are visible whatever the width, instead of the count drifting with
 * it. Percentages on a flex child of a scroll container resolve against the
 * **scrollport's content box**, not the scrollable width, so this really is 40%
 * of what you can see.
 *
 * 40 rather than 30 because the card is ~131px tall: a third of the 512px frame
 * came out at 144 and read as a square, and a rail of squares gives the eye
 * nothing to run along. Two and a half items also leaves half a card showing at
 * the edge, which says "scrollable" better than a full one at the fold.
 *
 * The floor only engages below ~300px of usable rail — an iPhone SE in a
 * split view — where 40% stops being enough for "0 of 6 000 zł" to hold one
 * line. It is a net under the narrowest case, not a second opinion on the
 * width.
 */
const ITEM = 'w-[40%] min-w-[120px] flex-none'

/**
 * The ring.
 *
 * Hand-rolled SVG, like every other small mark in this app: there are no axes,
 * no tooltip and no zoom here, so the 189 kB chart chunk would buy nothing —
 * and this one is inside a horizontal scroller with one per card.
 *
 * **The dash offset animates, the arc does not redraw.** `stroke-dasharray` is
 * fixed at the full circumference and only the offset moves, which is what lets
 * a browser interpolate it as a single number: the arc sweeps rather than being
 * re-laid-out per frame.
 *
 * It starts empty on mount and fills to its value once. That is the handoff's
 * 420ms sweep, and it is also what makes the *later* transitions readable — a
 * ring that appeared at its final geometry and then tweened would have two
 * different motions meaning the same thing.
 */
function Ring({
  share,
  colour,
  children,
}: {
  /** Uncapped: 1.27 is a real answer, the ring just cannot draw past full. */
  share: number
  colour: string
  children: React.ReactNode
}) {
  const filled = Math.min(Math.max(share, 0), 1)

  const [drawn, setDrawn] = useState(0)
  // The duration is state, not a ref read during render. A ref flipped inside
  // the effect changes on the very render that also sets the offset, so the
  // entry sweep would run at the *tween's* duration — the ref would already be
  // telling the truth about a transition that had not started yet.
  const [duration, setDuration] = useState(DRAW_MS)
  const first = useRef(true)

  useEffect(() => {
    if (!first.current) {
      setDrawn(filled)
      return
    }
    first.current = false
    // Next frame, so the browser has an empty ring to animate away from —
    // setting the final value in the same commit would simply paint it there.
    const frame = requestAnimationFrame(() => setDrawn(filled))
    const settle = setTimeout(() => setDuration(TWEEN_MS), DRAW_MS)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(settle)
    }
  }, [filled])

  return (
    <span className="relative flex flex-none" style={{ width: BOX, height: BOX }}>
      <svg width={BOX} height={BOX} viewBox={`0 0 ${BOX} ${BOX}`} aria-hidden>
        {/* −90° so the arc starts at twelve o'clock. */}
        <g transform={`rotate(-90 ${BOX / 2} ${BOX / 2})`}>
          <circle
            cx={BOX / 2}
            cy={BOX / 2}
            r={R}
            fill="none"
            stroke="var(--color-track)"
            strokeWidth={4.5}
          />
          <circle
            cx={BOX / 2}
            cy={BOX / 2}
            r={R}
            fill="none"
            stroke={colour}
            strokeWidth={4.5}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - drawn)}
            // `prefers-reduced-motion` is handled globally in index.css, which
            // flattens every duration — the ring then simply appears at its
            // final geometry, which is what the handoff asks for.
            style={{
              transition: `stroke-dashoffset ${duration}ms cubic-bezier(.32,.72,0,1), stroke ${TWEEN_MS}ms ease-out`,
            }}
          />
        </g>
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center"
        style={{ color: colour, transition: `color ${TWEEN_MS}ms ease-out` }}
      >
        {children}
      </span>
    </span>
  )
}

/**
 * One budget: its ring, its share, and what is left of its period.
 *
 * The figure reads **"spent of limit"** rather than what is left, and this is
 * the one place in the app that does. The rail is scanned rather than read, and
 * the ring already answers "how much room is left" as a shape — repeating it as
 * a number would leave nothing saying how big the budget is in the first place.
 *
 * The limit shown is the *effective* one, so a budget carrying a rollover reads
 * against the room it actually has this period.
 *
 * Three lines of text, not four: the days-left sits under the percentage rather
 * than below the figure. A rail card is glanced at, and a fourth stacked line
 * made it as tall as it was wide — which is also what stopped the card reading
 * as a rectangle at any width.
 */
function BudgetCard({ budget }: { budget: BudgetProgress }) {
  const limit = effectiveLimit(budget)
  const share = shareOf(budget)
  const over = budget.spent > limit
  const colour = over ? 'var(--color-expense)' : categoryVar(budget.color)
  const Icon = iconFor(budget.glyph)
  const left = daysLeft(budget)
  // A daily budget is always on its last day, so counting them down says
  // nothing. It reads "today" instead — which is the whole of what its window
  // is, and the one word that fits the ~46px this line shares with the ring.
  const daily = budget.period === 'daily'

  return (
    <Link to={`/budgets/${budget.budget_id}/edit`} className={ITEM}>
      {/* `h-full` because the Link is a stretched flex item: without it the card
          would size to its own content and the dashed tile beside it would be
          the only thing reaching the rail's full height. */}
      <Card className="flex h-full flex-col gap-[11px] px-3.5 pt-[13px] pb-3.5">
        {/* The days-left used to be a fourth line of its own and is now stacked
            under the percentage, in the ~32px of empty height beside the ring
            that nothing else was using. Same four facts, one line shorter. */}
        <div className="flex items-start justify-between gap-2">
          <Ring share={share} colour={colour}>
            <Icon size={19} stroke={2} />
          </Ring>
          <span
            className="flex flex-col items-end"
            title={
              daily
                ? 'Today — a daily budget starts again every morning'
                : left === 0
                  ? 'Last day of the period'
                  : `${left} days left`
            }
          >
            <span
              className="tnum text-meta font-semibold"
              style={{ color: over ? 'var(--color-expense)' : 'var(--color-ink-muted)' }}
            >
              {Math.round(share * 100)}%
            </span>
            {/* Abbreviated because it now shares a line's width with the ring:
                "30 days left" is ~62px against ~46px of usable room at the
                narrowest card. The `title` carries the full phrase. */}
            <span className="tnum mt-0.5 text-micro whitespace-nowrap text-ink-faint">
              {daily ? 'today' : left === 0 ? 'last' : `${left}d`}
            </span>
          </span>
        </div>

        <div className="min-w-0">
          <div className="truncate text-prose font-medium">{budget.name}</div>
          <div
            className="tnum mt-0.5 truncate text-meta-sm"
            style={{
              color: over ? 'var(--color-expense)' : 'var(--color-ink-muted)',
              fontWeight: over ? 500 : 400,
            }}
          >
            {formatMoneyShort(asMinor(budget.spent))} of{' '}
            {formatMoneyShort(asMinor(limit))} {currencySymbol(budget.currency)}
          </div>
        </div>
      </Card>
    </Link>
  )
}

/**
 * The rail: the budgets marked for Home, in the order set on the list screen.
 *
 * The dashed "+ Budget" tile only appears while **fewer than three** cards are
 * shown. Past that the rail's own overflow is the affordance — there is visibly
 * more to the right — and "See all" above it carries the rest, so a permanent
 * tile would only be an invitation competing with a scroll. It is the same width
 * as a card and stretches to the same height, so the row reads as one set of
 * things rather than as cards with a control after them.
 *
 * With no budgets at all the rail is a single full-width invitation instead;
 * `FeedScreen` drops the label row above it in that case, since there is no
 * period to name and nothing to see all of.
 */
export function BudgetRail({ budgets }: { budgets: BudgetProgress[] }) {
  const rail = sortForHome(budgets)

  if (rail.length === 0) {
    return (
      <Link
        to="/budgets/new"
        className="flex h-[88px] flex-col items-center justify-center gap-1.5 rounded-card text-ink-faint"
        style={{ border: '1.5px dashed var(--color-hint)' }}
      >
        <IconPlus size={20} stroke={2} />
        <span className="text-meta">Add a budget</span>
      </Link>
    )
  }

  return (
    <div className="no-scrollbar -mx-4 flex gap-[10px] overflow-x-auto px-4">
      {rail.map((b) => (
        <BudgetCard key={b.budget_id} budget={b} />
      ))}

      {rail.length < 3 && (
        <Link
          to="/budgets/new"
          className={`flex flex-col items-center justify-center gap-1.5 rounded-card text-ink-faint ${ITEM}`}
          style={{ border: '1.5px dashed var(--color-hint)' }}
        >
          <IconPlus size={18} stroke={2} />
          <span className="text-micro">Budget</span>
        </Link>
      )}
    </div>
  )
}
