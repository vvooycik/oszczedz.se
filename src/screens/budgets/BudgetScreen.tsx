import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { IconChevronLeft, IconChevronRight, IconClock, IconPencil } from '@tabler/icons-react'
import { FullScreen } from '@/app/AppShell'
import { useGoBack } from '@/app/useGoBack'
import { useTheme } from '@/theme/ThemeProvider'
import { TransactionFeed } from '@/components/TransactionFeed'
import { Card, CardRow } from '@/components/ui/Card'
import { colourFieldStyle } from '@/components/ui/ColourField'
import { Label, LabelRow } from '@/components/ui/Label'
import { ActionTile } from '@/components/ui/Button'
import {
  BUDGET_FEED_LIMIT,
  useBudgetHistory,
  useBudgetProgress,
  useBudgetTransactions,
  useCategories,
  useWallets,
} from '@/data/queries'
import {
  dayOfPeriod,
  daysInPeriod,
  daysLeft,
  daysUntilStart,
  effectiveLimit,
  historyScale,
  isOver,
  overCount,
  periodLabel,
  periodNoun,
  phaseOf,
  runBounds,
  scopeMeta,
  shareOf,
} from '@/lib/budgets'
import { asMinor, currencySymbol, formatAmount, formatAmountMoney } from '@/lib/money'
import { iconFor } from '@/lib/icons'
import { categoryVar } from '@/theme/tokens'
import { BudgetHistoryStrip } from './BudgetHistoryStrip'
import type { BudgetPeriod } from '@/lib/db'

/**
 * How far back the strip looks, per period.
 *
 * Not one number, because a period is not one length. Twelve months is a year
 * and reads as one; twelve days is a fortnight and answers nothing, while
 * thirty is a month of them and is the shape a daily budget actually has. Six
 * years is as far back as any of this data goes.
 *
 * A one-off has exactly one window and `budget_history` returns it whatever is
 * asked for — the strip is dropped for that period rather than drawn with a
 * single bar in it.
 */
const HISTORY_PERIODS: Record<BudgetPeriod, number> = {
  daily: 30,
  weekly: 12,
  monthly: 12,
  yearly: 6,
  once: 1,
}

/** "the last 12 weeks" — the strip's own description of itself. */
const spanLabel = (period: BudgetPeriod, count: number): string =>
  `the last ${count} ${periodNoun(period)}${count === 1 ? '' : 's'}`

/**
 * The bar under the figure. The budget's hue, expense red past the limit, and a
 * ghost segment for what is booked but has not charged.
 */
function FieldBar({
  share,
  committed,
  colour,
}: {
  share: number
  committed: number
  colour: string
}) {
  return (
    <div
      className="mt-4 flex h-2 gap-px overflow-hidden rounded-full"
      style={{ background: 'var(--field-block)' }}
    >
      <div
        className="h-2 rounded-full"
        style={{ width: `${Math.min(share, 1) * 100}%`, background: colour }}
      />
      {committed > 0 && (
        <div
          className="h-2 rounded-full"
          style={{ width: `${committed * 100}%`, background: colour, opacity: 0.35 }}
        />
      )}
    </div>
  )
}

/**
 * One budget: what it has spent this period, how the periods before it went,
 * and every row that counted.
 *
 * ## What this screen replaced
 *
 * A tap on a budget — from the list or from the Home rail — used to open the
 * *editor*, because until now the editor was the only thing there was to do
 * with a budget. That is the wrong answer to the most common question by a wide
 * margin: the reason to touch a budget is almost always to find out what is
 * inside the figure, and the reason to edit one is a decision taken maybe twice
 * a year. The pencil in the header is where editing went.
 *
 * ## The strip and the feed are one control
 *
 * The history strip selects the period, and the feed below it is that period's
 * rows. Nothing else on the screen carries a window, so there is exactly one
 * answer at a time to "which weeks are we talking about" — and "how often do I
 * go over" and "what did I buy that week" are one tap apart rather than two
 * screens.
 *
 * ## Which figures come from where
 *
 * The header reads the **selected history row**, never `budget_progress`, even
 * when the two describe the same period. They agree by construction — the
 * newest history window is clamped at `today + 1` exactly as `spent` is, and
 * that is verified against the live database — and reading one of them means
 * the header cannot quote this week's spend over last week's dates. The
 * progress row is still what supplies the budget's *identity*: its name,
 * colour, glyph, scope counts, and the `planned` figure, which is a fact about
 * now rather than about a window.
 */
export function BudgetScreen({ wide = false }: { wide?: boolean } = {}) {
  const { id } = useParams()
  const goBack = useGoBack('/budgets')
  const navigate = useNavigate()
  const { resolvedMode } = useTheme()

  const progress = useBudgetProgress()
  const wallets = useWallets()
  const categories = useCategories()

  const budget = useMemo(
    () => (progress.data ?? []).find((b) => b.budget_id === id),
    [progress.data, id],
  )

  const history = useBudgetHistory(
    budget ? id : undefined,
    budget ? HISTORY_PERIODS[budget.period] : 12,
  )
  const periods = history.data ?? []

  /**
   * Which bar is open, as a `period_start`.
   *
   * A date rather than an index, so a refetch that adds a period at the right
   * — the calendar rolling over while the screen is open — does not silently
   * slide the selection onto its neighbour. `null` means "the current one",
   * which is also what an unknown date falls back to.
   */
  const [picked, setPicked] = useState<string | null>(null)
  const selected =
    periods.find((p) => p.period_start === picked) ?? periods[periods.length - 1]
  // By date rather than by identity: `selected` is a reference out of the same
  // array today, and a memo or a structural-sharing refetch that stops making
  // it one would silently move the planned figure onto a past window.
  const isCurrent =
    selected != null && selected.period_start === periods[periods.length - 1]?.period_start

  const feed = useBudgetTransactions(id, selected?.period_start, selected?.period_end)

  if (!budget) {
    return (
      <FullScreen pane={wide}>
        <p className="px-4 py-10 text-value text-ink-muted">
          {progress.data ? 'That budget no longer exists.' : 'Loading…'}
        </p>
      </FullScreen>
    )
  }

  const Icon = iconFor(budget.glyph)
  const hue = categoryVar(budget.color)
  const pad = wide ? 'px-7' : 'px-4'

  // Everything the header quotes, from the selected window alone.
  const limit = selected ? effectiveLimit(selected) : effectiveLimit(budget)
  const spent = selected?.spent ?? budget.spent
  const share = selected ? shareOf(selected) : shareOf(budget)
  const over = selected ? isOver(selected) : isOver(budget)
  // Planned belongs to *now*, so it is drawn only on the period containing it.
  const planned = isCurrent ? budget.planned : 0
  const committed =
    limit > 0 && planned > 0
      ? Math.max(0, Math.min(planned / limit, 1 - Math.min(share, 1)))
      : 0

  const windowLabel = selected
    ? runBounds(selected.period_start, selected.period_end)
    : runBounds(budget.period_start, budget.period_end)
  const heading = selected
    ? periodLabel(budget.period, selected.period_start, selected.period_end)
    : windowLabel

  const wentOver = overCount(periods)
  // Stated rather than left to the flat-topped bar alone: clipping is a lie
  // about scale unless the screen says out loud that it is happening.
  const { clipped } = historyScale(periods)
  const phase = phaseOf(budget)

  return (
    <FullScreen pane={wide} style={colourFieldStyle(budget.color, resolvedMode)}>
      {/* No lane reserved at the foot: unlike the wallet screen this one has no
          button floating over its feed, so the last row ends where the screen
          does. */}
      <div className="no-scrollbar flex-1 overflow-y-auto pb-6">
        <div className={`mx-auto w-full max-w-[820px] ${pad} pb-5`}>
          <header className="flex items-center gap-3 pt-1 pb-4">
            <ActionTile label="Back" onField onClick={goBack}>
              <IconChevronLeft size={20} stroke={2} />
            </ActionTile>
            <h1
              className="min-w-0 flex-1 truncate text-heading font-semibold tracking-[-0.01em]"
              style={{ color: 'var(--field-ink)' }}
            >
              {budget.name}
            </h1>
            <ActionTile
              label="Edit budget"
              onField
              onClick={() => navigate(`/budgets/${budget.budget_id}/edit`)}
            >
              <IconPencil size={19} stroke={2} />
            </ActionTile>
          </header>

          <div className="flex items-center gap-3">
            <span
              className="flex size-[34px] flex-none items-center justify-center rounded-tile-sm"
              style={{ background: 'var(--field-scrim)', color: 'var(--field-ink)' }}
            >
              <Icon size={19} stroke={2} />
            </span>
            <Label>{heading}</Label>
            {/* The full window beside the heading, because the heading is an
                abbreviation of it — "Aug" is a month and "8" is a week that
                opened on the 8th, and neither says which days it holds. A
                one-off's heading already *is* its run, so it is not repeated. */}
            {heading !== windowLabel && (
              <span className="tnum truncate text-meta text-ink-muted">
                {windowLabel}
              </span>
            )}
          </div>

          <div
            className="tnum mt-2.5"
            style={{
              fontSize: 'var(--text-figure)',
              fontWeight: 600,
              lineHeight: 1,
              letterSpacing: '-0.035em',
              color: over ? 'var(--color-expense)' : undefined,
            }}
          >
            {formatAmount(asMinor(spent))}
            <span
              className="text-ink-faint"
              style={{
                fontSize: 'var(--text-figure-unit)',
                fontWeight: 500,
                letterSpacing: 0,
              }}
            >
              {' '}
              {currencySymbol(budget.currency)}
            </span>
          </div>

          <FieldBar
            share={share}
            committed={committed}
            colour={over ? 'var(--color-expense)' : hue}
          />

          <div className="tnum mt-2 flex items-baseline justify-between text-meta text-ink-muted">
            <span>
              {Math.round(share * 100)}% of{' '}
              {formatAmountMoney(asMinor(limit), budget.currency)}
            </span>
            <span style={{ color: over ? 'var(--color-expense)' : undefined }}>
              {over
                ? `${formatAmountMoney(asMinor(spent - limit), budget.currency)} over`
                : `${formatAmountMoney(asMinor(limit - spent), budget.currency)} left`}
            </span>
          </div>

          {/* The elapsed line is about *this* period and nothing else: a window
              that closed in July has no days left, and quoting "day 7 of 7"
              under it would be the one element on the screen still counting.
              A daily budget has no finer grain than a day to measure an elapsed
              fraction with (invariant 3), so it says nothing either. */}
          {isCurrent && budget.period !== 'daily' && (
            <div className="tnum mt-1 text-meta text-ink-faint">
              {phase === 'upcoming'
                ? `starts in ${daysUntilStart(budget)} day${
                    daysUntilStart(budget) === 1 ? '' : 's'
                  }`
                : phase === 'finished'
                  ? 'this run has ended'
                  : `day ${dayOfPeriod(budget)} of ${daysInPeriod(budget)} · ${daysLeft(
                      budget,
                    )} left`}
            </div>
          )}

          {planned !== 0 && (
            <div className="tnum mt-2 flex items-center gap-1.5 text-meta text-ink-muted">
              <IconClock size={13} stroke={2} className="text-ink-dim" />
              {formatAmountMoney(asMinor(planned), budget.currency)} booked for later
              in this {periodNoun(budget.period)}
            </div>
          )}
        </div>

        <div className={`flex flex-col gap-[14px] ${pad} mx-auto w-full max-w-[820px]`}>
          {/* ----------------------------------------------------- history */}
          {/* Dropped for a one-off, which has exactly one window: a strip of a
              single bar is a chart of nothing, and "over in 0 of the last 1
              run" is a sentence no one needs. */}
          {budget.period !== 'once' && periods.length > 1 && (
            <div className="flex flex-col gap-2">
              <LabelRow
                trailing={
                  <span
                    className="tnum text-meta font-semibold"
                    style={{
                      color: wentOver
                        ? 'var(--color-expense)'
                        : 'var(--color-ink-muted)',
                    }}
                  >
                    {wentOver === 0
                      ? 'never over'
                      : `over ${wentOver} of ${periods.length}`}
                  </span>
                }
              >
                {spanLabel(budget.period, periods.length)}
              </LabelRow>
              <Card className="px-4 pt-4 pb-3">
                <BudgetHistoryStrip
                  periods={periods}
                  period={budget.period}
                  colour={hue}
                  selected={selected?.period_start ?? ''}
                  onSelect={setPicked}
                />
                <p className="mt-3 text-meta-sm leading-[1.5] text-ink-faint">
                  Tap a {periodNoun(budget.period)} to read it. The line across each
                  bar is that {periodNoun(budget.period)}’s limit
                  {budget.rollover ? ', rollover included' : ''}.{' '}
                  {clipped > 0 && (
                    <>
                      {clipped === 1 ? 'One ' : `${clipped} `}
                      {periodNoun(budget.period)}
                      {clipped === 1 ? ' runs' : 's run'} past the top of the
                      scale and {clipped === 1 ? 'is' : 'are'} cut off flat, so
                      one heavy {periodNoun(budget.period)} cannot flatten the
                      rest — tap for the figure.{' '}
                    </>
                  )}
                  Periods before the first transaction on record are left out — an
                  empty bar there would be the edge of the data, not a quiet{' '}
                  {periodNoun(budget.period)}.
                </p>
              </Card>
            </div>
          )}

          {/* ------------------------------------------------------- scope */}
          <Card>
            <CardRow
              onClick={() => navigate(`/budgets/${budget.budget_id}/edit`)}
              className="cursor-pointer"
            >
              <span className="flex-1 text-row font-medium">What counts</span>
              <span className="truncate text-value text-ink-muted">
                {scopeMeta(budget)}
              </span>
              <IconChevronRight size={18} stroke={2} className="text-ink-dim" />
            </CardRow>
          </Card>

          {/* -------------------------------------------------------- feed */}
          <LabelRow
            trailing={
              feed.data ? (
                <span className="tnum text-meta text-ink-muted">
                  {feed.data.total} row{feed.data.total === 1 ? '' : 's'}
                  {feed.data.total > BUDGET_FEED_LIMIT
                    ? ` · newest ${BUDGET_FEED_LIMIT} shown`
                    : ''}
                </span>
              ) : undefined
            }
          >
            {windowLabel}
          </LabelRow>

          {feed.data ? (
            <TransactionFeed
              transactions={feed.data.rows}
              wallets={wallets.data ?? []}
              categories={categories.data ?? []}
              empty="Nothing counted against this budget in that period."
            />
          ) : (
            <p className="py-8 text-center text-value text-ink-muted">
              {feed.error ? 'Could not load transactions.' : 'Loading…'}
            </p>
          )}
        </div>
      </div>
    </FullScreen>
  )
}
