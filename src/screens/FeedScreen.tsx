import { lazy, Suspense, useMemo, useState } from 'react'
import { BudgetRail } from '@/components/BudgetRail'
import { TransactionFeed } from '@/components/TransactionFeed'
import { FirstRunSetup } from '@/components/FirstRunSetup'
import {
  useBalanceHistory,
  useBudgetProgress,
  useCategories,
  useEarliestTransactionDate,
  useRecentTransactions,
  useWalletBalances,
  useWallets,
} from '@/data/queries'
import { asMinor, formatAmount, formatSigned } from '@/lib/money'
import { addDays, addMonths, today } from '@/lib/dates'

// Charts are per-currency in v1 — no FX conversion.
const CURRENCY = 'PLN'

// ECharts is the largest dependency by far. Splitting it keeps it off the login
// path and out of the first paint; the feed renders and the chart fills in.
const BalanceChart = lazy(() =>
  import('@/charts/BalanceChart').then((m) => ({ default: m.BalanceChart })),
)

type Range = '7D' | '1M' | '1Y' | 'ALL'

/** The short codes read as units; the whole history does not, so it gets words. */
const RANGE_LABEL: Record<Range, string> = {
  '7D': '7D',
  '1M': '1M',
  '1Y': '1Y',
  ALL: 'All time',
}

/**
 * A range and the comparable window immediately before it, so "compare" always
 * means the same span rather than a fixed year.
 */
function rangeFor(range: Range, earliest: string) {
  const to = today()
  const from =
    range === '7D'
      ? addDays(to, -6)
      : range === '1M'
        ? addMonths(to, -1)
        : range === '1Y'
          ? addMonths(to, -12)
          : earliest

  const spanDays = Math.max(
    1,
    Math.round(
      (new Date(to).getTime() - new Date(from).getTime()) / 86_400_000,
    ),
  )
  return {
    from,
    to,
    priorFrom: addDays(from, -spanDays - 1),
    priorTo: addDays(from, -1),
    // Nothing precedes the first transaction, so the window before All time is
    // flat at the opening balance for its whole length — a straight ghost line
    // across the chart, and a thousand rows fetched to draw it.
    comparable: range !== 'ALL',
    label:
      range === '7D'
        ? 'vs previous 7 days'
        : range === '1M'
          ? 'vs previous month'
          : range === '1Y'
            ? 'vs 12 months ago'
            : 'since the start',
  }
}

export function FeedScreen() {
  const [range, setRange] = useState<Range>('1Y')
  const [compare, setCompare] = useState(true)

  const wallets = useWallets()
  const categories = useCategories()
  const balances = useWalletBalances()
  const transactions = useRecentTransactions()
  const budgets = useBudgetProgress()
  const firstDay = useEarliestTransactionDate()

  // Falls back to a year while the query is in flight, so All time opens on
  // something rather than collapsing to a single day.
  const earliest = firstDay.data ?? addMonths(today(), -12)

  const window = useMemo(() => rangeFor(range, earliest), [range, earliest])

  const current = useBalanceHistory(CURRENCY, window.from, window.to)
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
      <p className="px-5 py-10 text-[13px] text-expense">
        {failed.error instanceof Error ? failed.error.message : 'Something went wrong'}
      </p>
    )
  }

  if (!wallets.data || !categories.data) {
    return <p className="px-5 py-10 text-[13px] text-ink-muted">Loading…</p>
  }

  if (wallets.data.length === 0 || categories.data.length === 0) {
    return (
      <div className="px-5 py-6">
        <FirstRunSetup />
      </div>
    )
  }

  const wealth = (balances.data ?? [])
    .filter((b) => b.currency === CURRENCY)
    .reduce((sum, b) => sum + (b.balance ?? 0), 0)

  const series = current.data ?? []
  const delta =
    series.length > 1 ? series[series.length - 1]!.balance - series[0]!.balance : 0

  return (
    <>
      <BudgetRail budgets={budgets.data ?? []} />

      <div className="mx-5 h-px" style={{ background: 'var(--color-line)' }} />

      <section className="px-5 pt-4">
        <div className="kicker text-ink-muted">Total wealth</div>
        <div
          className="tnum mt-2 font-normal"
          style={{ fontSize: 44, lineHeight: 1.1, letterSpacing: '-.02em' }}
        >
          {formatSigned(asMinor(wealth), { plus: false })}
        </div>
        <div className="mt-[7px] flex items-baseline gap-3.5 text-[12.5px]">
          <span
            className="tnum"
            style={{
              color: delta >= 0 ? 'var(--color-income)' : 'var(--color-expense)',
            }}
          >
            {delta >= 0 ? '↑' : '↓'} {formatAmount(asMinor(delta))}
          </span>
          <span className="text-ink-muted">{window.label}</span>
        </div>
      </section>

      <div className="mt-2.5">
        <Suspense fallback={<div className="h-44 w-full" />}>
          <BalanceChart
            current={series}
            prior={prior.data ?? []}
            currency={CURRENCY}
            compare={compare && window.comparable}
          />
        </Suspense>
      </div>

      <div className="flex gap-[7px] px-5 pt-3 font-sans">
        {(['7D', '1M', '1Y', 'ALL'] as Range[]).map((r) => {
          const active = r === range
          return (
            <button
              key={r}
              onClick={() => setRange(r)}
              className="rounded-[3px] px-3 py-[5px] text-[11.5px]"
              style={{
                border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-line)'}`,
                color: active ? 'var(--color-accent)' : 'var(--color-ink-muted)',
              }}
            >
              {RANGE_LABEL[r]}
            </button>
          )
        })}
        {/* Kept mounted but inert on All time: removing it would shift the row
            every time the range changes. */}
        <button
          onClick={() => setCompare((c) => !c)}
          disabled={!window.comparable}
          className="ml-auto rounded-[3px] px-3 py-[5px] text-[11.5px]"
          style={{
            border: `1px solid ${
              compare && window.comparable ? 'var(--color-accent)' : 'var(--color-line)'
            }`,
            color:
              compare && window.comparable
                ? 'var(--color-accent)'
                : 'var(--color-ink-muted)',
            opacity: window.comparable ? 1 : 0.4,
          }}
        >
          Compare {compare && window.comparable ? '✓' : ''}
        </button>
      </div>

      <TransactionFeed
        transactions={transactions.data ?? []}
        wallets={wallets.data}
        categories={categories.data}
      />
    </>
  )
}
