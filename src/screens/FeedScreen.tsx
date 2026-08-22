import { lazy, Suspense, useCallback, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { IconArrowDownRight, IconArrowUpRight, IconArrowsLeftRight } from '@tabler/icons-react'
import { BudgetRail } from '@/components/BudgetRail'
import { MonthStepper } from '@/components/MonthStepper'
import { sharedMonth, sortForHome } from '@/lib/budgets'
import { TransactionFeed } from '@/components/TransactionFeed'
import { FirstRunSetup } from '@/components/FirstRunSetup'
import { Card } from '@/components/ui/Card'
import { Label, LabelRow } from '@/components/ui/Label'
import { SegmentedTrack } from '@/components/ui/SegmentedTrack'
import { MasterDetail } from '@/app/MasterDetail'
import { FEED_COLUMN_W, isWide, useLayoutMode } from '@/app/layout'
import { useListKeyboard } from '@/app/useListKeyboard'
import { TransactionScreen } from '@/screens/TransactionScreen'
import {
  useBalanceHistory,
  useBudgetProgress,
  useCategories,
  useEarliestTransactionDate,
  useMonthTransactions,
  useWalletBalances,
  useWalletMonthlyNet,
  useWallets,
} from '@/data/queries'
import { asMinor, currencySymbol, formatAmountMoney, formatSigned, formatSignedMoney } from '@/lib/money'
import { addDays, addMonths, formatMonthLabel, startOfMonth, today } from '@/lib/dates'

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

/**
 * The range track and the Compare pill, which travel together.
 *
 * They sit in the wealth card's foot on a phone and at a tablet-landscape's
 * 512px column, and move up into the title row once there is one with room —
 * tablet portrait and desktop. One component either way, because they are one
 * control: Compare is meaningless without knowing what range it compares.
 */
function RangeControls({
  range,
  onRange,
  compare,
  onCompare,
  comparable,
  /** In a card's foot the track takes the slack; in a header it is its own size. */
  fill,
}: {
  range: Range
  onRange: (next: Range) => void
  compare: boolean
  onCompare: (next: boolean) => void
  comparable: boolean
  fill: boolean
}) {
  const on = compare && comparable
  return (
    <>
      <SegmentedTrack
        className={fill ? 'flex-1' : 'flex-none'}
        options={RANGES}
        value={range}
        onChange={onRange}
      />
      {/* Kept mounted but inert on All time: removing it would shift the row
          every time the range changes. */}
      <button
        type="button"
        onClick={() => onCompare(!compare)}
        disabled={!comparable}
        className="flex min-h-[34px] flex-none items-center gap-1.5 rounded-full px-3 text-meta font-medium"
        style={{
          color: on ? 'var(--color-accent)' : 'var(--color-ink-muted)',
          background: on
            ? 'color-mix(in oklab, var(--color-accent) 18%, transparent)'
            : 'transparent',
          opacity: comparable ? 1 : 0.4,
        }}
      >
        <IconArrowsLeftRight size={14} stroke={2} />
        Compare
      </button>
    </>
  )
}

/** One of the two inset readings under the figure on a desktop. */
function StatTile({
  value,
  label,
  colour,
}: {
  value: string
  label: string
  colour?: string
}) {
  return (
    <div className="flex-1 rounded-tile bg-inset px-3 py-2.5">
      <div className="tnum text-field font-semibold" style={{ color: colour }}>
        {value}
      </div>
      <div className="mt-0.5 text-micro text-ink-muted">{label}</div>
    </div>
  )
}

/**
 * Total wealth, its delta, and the balance chart.
 *
 * **`split` is the whole of what the extra width buys here.** Stacked, the
 * chart is the card's own bottom edge and the figure sits above it; split, the
 * chart moves beside the figure and stays flush to the card's bottom *and*
 * right — which is why the right cell is `self-end` rather than centred. Both
 * arrangements are the same two things; only the axis changes.
 *
 * The two stat tiles are desktop-only, and are the one thing on this card that
 * is genuinely new rather than re-laid-out. They fill the room the split
 * creates under a 300px column, and they answer the two questions the figure
 * above cannot: what moved this month, and what is booked but has not charged.
 */
function WealthCard({
  wealth,
  delta,
  label,
  split,
  chart,
  stats,
  controls,
}: {
  wealth: number
  delta: number
  label: string
  split: boolean
  chart: React.ReactNode
  /** `[net this month, booked but not charged]`, or null below desktop. */
  stats: [number, number] | null
  /** The range track, when it lives in the card's foot rather than a header. */
  controls: React.ReactNode | null
}) {
  const up = delta >= 0
  const deltaColour = up ? 'var(--color-income)' : 'var(--color-expense)'

  const head = (
    <>
      <div className="flex items-center gap-2.5">
        <Label>Total wealth</Label>
        {/* The delta rides on a 20% wash of its own colour rather than on a
            neutral chip: the sign is the whole content of the number. */}
        <span
          className="flex items-center gap-[5px] rounded-full px-[9px] py-1 text-meta font-semibold"
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
        style={{
          fontSize: 'var(--text-figure)',
          fontWeight: 600,
          lineHeight: 1,
          letterSpacing: '-.035em',
        }}
      >
        {formatSigned(asMinor(wealth), { plus: false })}
        <span
          className="text-ink-faint"
          style={{ fontSize: 'var(--text-figure-unit)', fontWeight: 500, letterSpacing: 0 }}
        >
          {' '}
          {currencySymbol(CURRENCY)}
        </span>
      </div>
      <div className="mt-1.5 text-meta text-ink-muted">{label}</div>
    </>
  )

  if (split) {
    return (
      <Card className="grid" style={{ gridTemplateColumns: '300px minmax(0, 1fr)' }}>
        <div className="flex flex-col justify-between py-[22px] pl-[22px]">
          <div>{head}</div>
          {stats && (
            <div className="flex gap-2.5 pt-5 pr-[22px]">
              <StatTile
                value={formatSignedMoney(asMinor(stats[0]), CURRENCY, {
                  plus: stats[0] > 0,
                })}
                label="net this month"
                colour={
                  stats[0] === 0
                    ? 'var(--color-ink-muted)'
                    : stats[0] > 0
                      ? 'var(--color-income)'
                      : 'var(--color-expense)'
                }
              />
              <StatTile
                value={formatSignedMoney(asMinor(stats[1]), CURRENCY, {
                  plus: stats[1] > 0,
                })}
                label="booked, not charged"
                colour="var(--color-ink-muted)"
              />
            </div>
          )}
        </div>
        {/* Flush to the card's bottom and right, exactly as it is flush to the
            bottom when stacked. */}
        <div className="min-w-0 self-end">{chart}</div>
      </Card>
    )
  }

  return (
    <Card>
      <div className="px-[18px] pt-[18px]">{head}</div>
      {/* Flush to the card's edges — the chart is the card's own bottom, not
          a picture sitting inside its padding. */}
      <div className="mt-1">{chart}</div>
      {controls && (
        <div className="flex items-center gap-2 px-[14px] pt-1 pb-[14px]">{controls}</div>
      )}
    </Card>
  )
}

export function FeedScreen() {
  const mode = useLayoutMode()
  const wide = isWide(mode)
  const desktop = mode === 'desktop'

  /**
   * The open transaction, which on a wide layout is the route and nowhere else.
   *
   * `/` and `/tx/:id` render this same component, so the param is present or it
   * is not — no state, no lifting, and the back button still means what it
   * always did. Below 1024 there is no param here at all, because `/tx/:id` is
   * its own full-screen route.
   */
  const { id: openId } = useParams()

  const navigate = useNavigate()
  const [range, setRange] = useState<Range>('1Q')
  const [compare, setCompare] = useState(true)

  // The list's month, and deliberately not the chart's range. The chart above
  // reads a *balance*, which is a trailing window ending now; the list reads
  // what happened, which is a page you turn. Tying them together would mean
  // either a chart that can no longer end at today or a list you cannot leave
  // the current month without also rewriting the picture above it.
  const [month, setMonth] = useState(() => startOfMonth(today()))

  const wallets = useWallets()
  const categories = useCategories()
  const balances = useWalletBalances()
  const transactions = useMonthTransactions(month)
  const budgets = useBudgetProgress()
  const firstDay = useEarliestTransactionDate()
  // Only the desktop card has anywhere to put this, and it is a query the home
  // screen otherwise has no use for — so it is asked for only where it is read.
  const nets = useWalletMonthlyNet(desktop)

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
  const current = useBalanceHistory(CURRENCY, window.from, window.chartTo, true, window.to)
  const prior = useBalanceHistory(
    CURRENCY,
    window.priorFrom,
    window.priorTo,
    window.comparable,
  )

  // The rows the arrow keys walk, in the order they are drawn — newest first,
  // and one entry per transfer *pair* would be wrong here only if a pair could
  // straddle a day, which invariant 5 forbids.
  const rowIds = useMemo(
    () =>
      [...(transactions.data ?? [])]
        .sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1))
        .map((t) => t.id),
    [transactions.data],
  )
  const select = useCallback((id: string) => navigate(`/tx/${id}`), [navigate])
  useListKeyboard({
    enabled: wide,
    ids: rowIds,
    selected: openId ?? null,
    onSelect: select,
  })

  const failed = [wallets, categories, balances, transactions, budgets].find(
    (q) => q.error,
  )
  if (failed?.error) {
    return (
      <p className="px-4 py-10 text-value text-expense">
        {failed.error instanceof Error ? failed.error.message : 'Something went wrong'}
      </p>
    )
  }

  if (!wallets.data || !categories.data) {
    return <p className="px-4 py-10 text-value text-ink-muted">Loading…</p>
  }

  if (wallets.data.length === 0 || categories.data.length === 0) {
    return (
      <div className="px-4 py-6 md:px-8">
        <FirstRunSetup />
      </div>
    )
  }

  const mine = (balances.data ?? []).filter((b) => b.currency === CURRENCY)
  const wealth = mine.reduce((sum, b) => sum + (b.balance ?? 0), 0)
  const booked = mine.reduce((sum, b) => sum + (b.planned ?? 0), 0)

  const thisMonth = startOfMonth(today())
  const netThisMonth = (nets.data ?? [])
    .filter((n) => n.month === thisMonth)
    .reduce((sum, n) => sum + (n.net ?? 0), 0)

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
  const delta = lastSettled > 0 ? series[lastSettled]!.balance - series[0]!.balance : 0
  const comparing = compare && window.comparable

  // The chart is taller once it is beside the figure rather than under it: the
  // 130px that reads as a card's foot reads as a sliver in a 300-plus-remainder
  // split, where it has a whole column's height to fill.
  const chartHeight = mode === 'desktop' ? 232 : mode === 'tablet' ? 168 : 130
  const chart = (
    // The fallback reserves exactly what the chart will take, so the card does
    // not resize when the ECharts chunk lands.
    <Suspense fallback={<div className="w-full" style={{ height: chartHeight }} />}>
      <BalanceChart
        current={series}
        prior={prior.data ?? []}
        currency={CURRENCY}
        compare={comparing}
        todayIndex={lastSettled}
        height={chartHeight}
      />
    </Suspense>
  )

  const controls = (
    <RangeControls
      range={range}
      onRange={setRange}
      compare={compare}
      onCompare={setCompare}
      comparable={window.comparable}
      fill
    />
  )

  const wealthCard = (
    <WealthCard
      wealth={wealth}
      delta={delta}
      label={window.label}
      // Beside the figure from tablet portrait up; under it only on a phone.
      split={mode !== 'mobile' && mode !== 'rail'}
      chart={chart}
      stats={desktop ? [netThisMonth, booked] : null}
      controls={mode === 'mobile' || mode === 'rail' ? controls : null}
    />
  )

  const stepper = (
    <MonthStepper month={month} onChange={setMonth} earliest={firstDay.data ?? null} />
  )

  const feed = (
    <TransactionFeed
      transactions={transactions.data ?? []}
      wallets={wallets.data}
      categories={categories.data}
      empty={`Nothing recorded in ${formatMonthLabel(month)}.`}
      selectedId={openId ?? null}
      rowActions={wide}
      alignAmounts={desktop}
    />
  )

  const detail = openId ? (
    <TransactionScreen pane rounded={desktop} onClose={() => navigate('/')} />
  ) : null

  if (wide) {
    const header = (
      <div className="flex items-center gap-3.5">
        <h1 className="text-title-sm font-semibold tracking-[-0.02em]">Home</h1>
        <div className="flex-1" />
        {/* Only where the navigation does not already draw it. The desktop
            sidebar has a Scheduled row; the 76px rail has no room for one. */}
        {mode === 'rail' && (
          <Link to="/scheduled" className="text-meta font-semibold text-accent">
            Scheduled
          </Link>
        )}
        {stepper}
        {desktop && (
          <>
            <span aria-hidden className="h-6 w-px bg-divider" />
            <RangeControls
              range={range}
              onRange={setRange}
              compare={compare}
              onCompare={setCompare}
              comparable={window.comparable}
              fill={false}
            />
          </>
        )}
      </div>
    )

    const master = (
      <div
        className={`no-scrollbar flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto ${
          mode === 'rail' ? 'px-5 pb-5' : ''
        }`}
      >
        {wealthCard}
        {/* Three cards at 512px, and none at all on a desktop — where Budgets
            is a labelled sidebar row carrying its own over-limit badge, and the
            width is better spent on the pane. */}
        {mode === 'rail' && (
          <>
            {rail.length > 0 && (
              <LabelRow
                trailing={
                  <Link to="/budgets" className="text-meta font-semibold text-accent">
                    See all
                  </Link>
                }
              >
                {railMonth ? `Budgets · ${railMonth}` : 'Budgets'}
              </LabelRow>
            )}
            <BudgetRail budgets={budgets.data ?? []} columns={3} />
          </>
        )}
        {feed}
      </div>
    )

    // At `rail` the header belongs to the feed column — the pane is the page's
    // other half and has a header of its own. At `desktop` it spans both, which
    // is what lets the range track sit beside the title.
    return mode === 'rail' ? (
      <MasterDetail
        mode={mode}
        masterWidth={FEED_COLUMN_W}
        empty="Pick a row to see it here"
        master={
          <>
            <div className="flex-none px-5 pt-[18px] pb-3">{header}</div>
            {master}
          </>
        }
        detail={detail}
      />
    ) : (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex-none px-7 pt-5 pb-3.5">{header}</div>
        <MasterDetail
          mode={mode}
          className="px-7 pb-7"
          empty="Pick a row to see it here"
          master={master}
          detail={detail}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-[14px] px-4 pt-2.5 md:gap-4 md:px-8 md:pt-1">
      {/* A phone's home screen has no title row to put anything in — the total
          wealth card is the heading. A tablet has the room, so the range track
          moves up out of the card's foot and the screen gets a name. */}
      {mode === 'tablet' && (
        <div className="flex items-center gap-3 px-1">
          <h1 className="flex-1 text-title-sm font-semibold tracking-[-0.02em]">Home</h1>
          <RangeControls
            range={range}
            onRange={setRange}
            compare={compare}
            onCompare={setCompare}
            comparable={window.comparable}
            fill={false}
          />
        </div>
      )}

      {wealthCard}

      {/* The label row is dropped entirely when nothing is on the rail: there
          is no period to name and nothing to see all of, so the rail is one
          invitation rather than a heading over an empty scroller. */}
      {rail.length > 0 && (
        <div className="-mb-1.5">
          <LabelRow
            trailing={
              <Link to="/budgets" className="text-meta font-semibold text-accent">
                See all
              </Link>
            }
          >
            {railMonth ? `Budgets · ${railMonth}` : 'Budgets'}
          </LabelRow>
        </div>
      )}
      <BudgetRail
        budgets={budgets.data ?? []}
        // Four fixed cards instead of a scroller: at 770px they fit, and a
        // scroller that never scrolls is a gesture that does nothing.
        columns={mode === 'tablet' ? 4 : undefined}
      />

      {/* The feed is what happened, and only that.

          Planned rows used to sit above it under an "Upcoming" heading, which
          put two different tenses in one scroll: a list you read to remember
          what you did, opening with things you have not done. They live on
          `/scheduled` now, and this is the way in — the same shape as the "See
          all" over the budget rail, because it is the same idea.

          **Always drawn.** It was briefly conditional on there being a
          schedule, by analogy with the budget label row, and that was wrong for
          the one case it most needed to be right about: a transaction dated
          ahead **by hand** belongs to no rule, so the link to the only screen
          that shows it was hidden by the fact that it existed on its own.
          Conditioning on planned rows instead would just be a second query on
          the home screen to decide whether to draw a word — and the screen
          behind it is worth reaching anyway, since it is where a schedule gets
          made.

          The word shortened from "Scheduled transactions" to "Scheduled" when
          the stepper took the left of this row: two controls on one 358px line
          is exactly enough, and the month name beside it already establishes
          that the row is about *when*. */}
      <div className="-mb-1.5 flex items-center justify-between px-1">
        {stepper}
        <Link to="/scheduled" className="text-meta font-semibold text-accent">
          Scheduled
        </Link>
      </div>

      {feed}
    </div>
  )
}
