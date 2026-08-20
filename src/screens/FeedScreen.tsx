import { lazy, Suspense, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { IconArrowDownRight, IconArrowUpRight, IconArrowsLeftRight } from '@tabler/icons-react'
import { BudgetRail } from '@/components/BudgetRail'
import { sharedMonth, sortForHome } from '@/lib/budgets'
import { TransactionFeed } from '@/components/TransactionFeed'
import { FirstRunSetup } from '@/components/FirstRunSetup'
import { Card } from '@/components/ui/Card'
import { Label, LabelRow } from '@/components/ui/Label'
import { SegmentedTrack } from '@/components/ui/SegmentedTrack'
import {
  useBalanceHistory,
  useBudgetProgress,
  useCategories,
  useEarliestTransactionDate,
  useRecentTransactions,
  useSchedules,
  useWalletBalances,
  useWallets,
} from '@/data/queries'
import { asMinor, currencySymbol, formatAmountMoney, formatSigned } from '@/lib/money'
import { addDays, addMonths, today } from '@/lib/dates'

// Charts are per-currency in v1 — no FX conversion.
const CURRENCY = 'PLN'

// ECharts is the largest dependency by far. Splitting it keeps it off the login
// path and out of the first paint; the feed renders and the chart fills in.
const BalanceChart = lazy(() =>
  import('@/charts/BalanceChart').then((m) => ({ default: m.BalanceChart })),
)

type Range = '1M' | '1Q' | '1Y' | 'ALL'

/**
 * 7D is gone and 1Q is new. A week was never a useful window on *total wealth* —
 * it is a balance, not a spend, and a week of it is a flat line — while the gap
 * between a month and a year was the one people actually wanted.
 */
const RANGES: { key: Range; label: string }[] = [
  { key: '1M', label: '1M' },
  { key: '1Q', label: '1Q' },
  { key: '1Y', label: '1Y' },
  { key: 'ALL', label: 'All' },
]

/**
 * Every range draws a fixed month of forecast past today, so 1M shows two
 * months and 1Q shows four with the last one dotted.
 *
 * Fixed rather than proportional to the range on purpose: the tail means "what
 * is already booked", and that is a quantity of *future*, not a fraction of
 * whatever window happens to be selected. A month scaled to 1Y would be four
 * months of mostly nothing; scaled to 1M it would be a week and barely visible.
 */
const FORECAST_MONTHS = 1

/**
 * A range and the comparable window immediately before it, so "compare" always
 * means the same span rather than a fixed year.
 *
 * `to` is where the *record* ends and every measurement is taken; `chartTo`
 * is where the picture ends. Keeping them apart is what stops the forecast
 * leaking into the delta chip and into the prior-period span.
 */
function rangeFor(range: Range, earliest: string) {
  const to = today()
  const from =
    range === '1M'
      ? addMonths(to, -1)
      : range === '1Q'
        ? addMonths(to, -3)
        : range === '1Y'
          ? addMonths(to, -12)
          : earliest

  const spanDays = Math.max(
    1,
    Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000),
  )
  return {
    from,
    to,
    chartTo: addMonths(to, FORECAST_MONTHS),
    priorFrom: addDays(from, -spanDays - 1),
    priorTo: addDays(from, -1),
    // Nothing precedes the first transaction, so the window before All time is
    // flat at the opening balance for its whole length — a straight ghost line
    // across the chart, and a thousand rows fetched to draw it.
    comparable: range !== 'ALL',
    label:
      range === '1M'
        ? 'vs previous month'
        : range === '1Q'
          ? 'vs previous quarter'
          : range === '1Y'
            ? 'vs 12 months ago'
            : 'since the start',
  }
}

export function FeedScreen() {
  const [range, setRange] = useState<Range>('1Q')
  const [compare, setCompare] = useState(true)

  const wallets = useWallets()
  const categories = useCategories()
  const balances = useWalletBalances()
  const transactions = useRecentTransactions()
  const schedules = useSchedules()
  const budgets = useBudgetProgress()
  const firstDay = useEarliestTransactionDate()

  // Falls back to a year while the query is in flight, so All time opens on
  // something rather than collapsing to a single day.
  const earliest = firstDay.data ?? addMonths(today(), -12)

  const window = useMemo(() => rangeFor(range, earliest), [range, earliest])

  // Runs a month past today. `balance_history` counts planned rows the same way
  // it counts settled ones, so the tail is the same running total continued —
  // and `today()` is pinned as the anchor because the thinning counts back from
  // the far end, which at a long range drops today from the series entirely.
  // Measured: over the full history at 60 points the step is 18 days, and
  // without the anchor today is simply not in the result.
  const current = useBalanceHistory(
    CURRENCY,
    window.from,
    window.chartTo,
    true,
    window.to,
  )
  const prior = useBalanceHistory(
    CURRENCY,
    window.priorFrom,
    window.priorTo,
    window.comparable,
  )

  const failed = [wallets, categories, balances, transactions, budgets].find(
    (q) => q.error,
  )
  if (failed?.error) {
    return (
      <p className="px-4 py-10 text-[13px] text-expense">
        {failed.error instanceof Error ? failed.error.message : 'Something went wrong'}
      </p>
    )
  }

  if (!wallets.data || !categories.data) {
    return <p className="px-4 py-10 text-[13px] text-ink-muted">Loading…</p>
  }

  if (wallets.data.length === 0 || categories.data.length === 0) {
    return (
      <div className="px-4 py-6">
        <FirstRunSetup />
      </div>
    )
  }

  const wealth = (balances.data ?? [])
    .filter((b) => b.currency === CURRENCY)
    .reduce((sum, b) => sum + (b.balance ?? 0), 0)

  const rail = sortForHome(budgets.data ?? [])
  // Named only when every budget on the rail really is in that month.
  const railMonth = sharedMonth(rail)
  const series = current.data ?? []

  // Where the record stops and the booking starts. -1 means the series is all
  // settled, which is what a phone with no schedules and no planned rows sees.
  const todayIndex = series.findIndex((p) => p.day >= window.to)
  const lastSettled = todayIndex < 0 ? series.length - 1 : todayIndex

  // Over the settled span only. The chip says what happened; letting a
  // subscription four weeks out move it would be the chart reporting the future
  // as though it were the past.
  const delta =
    lastSettled > 0 ? series[lastSettled]!.balance - series[0]!.balance : 0
  const up = delta >= 0
  const deltaColour = up ? 'var(--color-income)' : 'var(--color-expense)'
  const comparing = compare && window.comparable

  return (
    <div className="flex flex-col gap-[14px] px-4 pt-2.5">
      <Card>
        <div className="px-[18px] pt-[18px]">
          <div className="flex items-center justify-between">
            <Label>Total wealth</Label>
            {/* The delta rides on a 20% wash of its own colour rather than on a
                neutral chip: the sign is the whole content of the number. */}
            <span
              className="flex items-center gap-[5px] rounded-full px-[9px] py-1 text-[12.5px] font-semibold"
              style={{
                color: deltaColour,
                background: `color-mix(in oklab, ${deltaColour} 20%, transparent)`,
              }}
            >
              {up ? (
                <IconArrowUpRight size={13} stroke={2} />
              ) : (
                <IconArrowDownRight size={13} stroke={2} />
              )}
              <span className="tnum">{formatAmountMoney(asMinor(delta), CURRENCY)}</span>
            </span>
          </div>
          <div
            className="tnum mt-2.5"
            style={{ fontSize: 42, fontWeight: 600, lineHeight: 1, letterSpacing: '-.035em' }}
          >
            {formatSigned(asMinor(wealth), { plus: false })}
            <span
              className="text-ink-faint"
              style={{ fontSize: 19, fontWeight: 500, letterSpacing: 0 }}
            >
              {' '}
              {currencySymbol(CURRENCY)}
            </span>
          </div>
          <div className="mt-1.5 text-[12.5px] text-ink-muted">{window.label}</div>
        </div>

        {/* Flush to the card's edges — the chart is the card's own bottom, not
            a picture sitting inside its padding. */}
        <div className="mt-1">
          <Suspense fallback={<div className="h-[130px] w-full" />}>
            <BalanceChart
              current={series}
              prior={prior.data ?? []}
              currency={CURRENCY}
              compare={comparing}
              todayIndex={lastSettled}
            />
          </Suspense>
        </div>

        <div className="flex items-center gap-2 px-[14px] pt-1 pb-[14px]">
          <SegmentedTrack
            className="flex-1"
            options={RANGES}
            value={range}
            onChange={setRange}
          />
          {/* Kept mounted but inert on All time: removing it would shift the row
              every time the range changes. */}
          <button
            type="button"
            onClick={() => setCompare((c) => !c)}
            disabled={!window.comparable}
            className="flex min-h-[34px] flex-none items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium"
            style={{
              color: comparing ? 'var(--color-accent)' : 'var(--color-ink-muted)',
              background: comparing
                ? 'color-mix(in oklab, var(--color-accent) 18%, transparent)'
                : 'transparent',
              opacity: window.comparable ? 1 : 0.4,
            }}
          >
            <IconArrowsLeftRight size={14} stroke={2} />
            Compare
          </button>
        </div>
      </Card>

      {/* The label row is dropped entirely when nothing is on the rail: there
          is no period to name and nothing to see all of, so the rail is one
          invitation rather than a heading over an empty scroller. */}
      {rail.length > 0 && (
        <div className="-mb-1.5">
          <LabelRow
            trailing={
              <Link to="/budgets" className="text-[12.5px] font-semibold text-accent">
                See all
              </Link>
            }
          >
            {railMonth ? `Budgets · ${railMonth}` : 'Budgets'}
          </LabelRow>
        </div>
      )}
      <BudgetRail budgets={budgets.data ?? []} />

      {/* The feed is what happened, and only that.

          Planned rows used to sit above it under an "Upcoming" heading, which
          put two different tenses in one scroll: a list you read to remember
          what you did, opening with things you have not done. They live on
          `/scheduled` now, and this is the way in — the same shape as the "See
          all" over the budget rail, because it is the same idea.

          Shown only when something is actually scheduled, which is also what
          the budget label row does. With no rules and nothing planned the home
          screen is exactly what it was before any of this existed, and the More
          screen is still the way in. */}
      {(schedules.data ?? []).length > 0 && (
        <div className="-mb-1.5">
          <LabelRow
            trailing={
              <Link to="/scheduled" className="text-[12.5px] font-semibold text-accent">
                Scheduled transactions
              </Link>
            }
          >
            Recent
          </LabelRow>
        </div>
      )}

      <TransactionFeed
        transactions={transactions.data ?? []}
        wallets={wallets.data}
        categories={categories.data}
      />
    </div>
  )
}
