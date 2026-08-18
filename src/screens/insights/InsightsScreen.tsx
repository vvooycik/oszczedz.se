import { useMemo, useState } from 'react'
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import { SegmentedTrack } from '@/components/ui/SegmentedTrack'
import {
  useBalanceHistory,
  useCategories,
  useCategoryPeriodTotals,
  useEarliestTransactionDate,
  useMonthlyCashFlow,
  useSpendingPace,
  useWalletBalances,
  useWalletMonthlyNet,
  useWallets,
} from '@/data/queries'
import {
  bucketFlow,
  PERIODS,
  periodEnd,
  periodLabel,
  periodStart,
  periodStep,
  type Period,
} from '@/lib/insights'
import { BalancesCard } from './BalancesCard'
import { CashFlowCard } from './CashFlowCard'
import { CategoriesCard } from './CategoriesCard'
import { PaceCard } from './PaceCard'

// Charts are per-currency in v1 — no FX conversion (invariant 8). The handoff's
// currency picker is deliberately not built: there is one currency to pick.
const CURRENCY = 'PLN'

/**
 * Four blocks, one scroll: pace, cash flow, categories, balances.
 *
 * In that order because the first question is always "am I fine right now" and
 * the rest is context. **One control at the top owns the period for all four**,
 * so the answers always describe the same window — the handoff is explicit that
 * no block carries its own range switch, and it is right: four independent
 * pickers is four chances for the screen to contradict itself.
 *
 * The period is calendar-aligned and steppable — see `src/lib/insights.ts` for
 * why that differs from the feed's trailing windows, and why there is no All
 * time here.
 *
 * Nothing on this screen uses ECharts. The blocks are hand-rolled SVG, which is
 * the same call `Sparkline` makes for the same reason: no axis engine, no zoom
 * and — by the handoff's own decision — no tooltips on the first pass, so a
 * 189 kB chart chunk would be the entire cost with none of the benefit.
 */
export function InsightsScreen() {
  const [period, setPeriod] = useState<Period>('1M')
  /** Steps back from the period containing today. Never negative. */
  const [offset, setOffset] = useState(0)

  const start = periodStart(period, offset)
  const end = periodEnd(period, offset)
  const step = periodStep(period)

  const wallets = useWallets()
  const categories = useCategories()
  const balances = useWalletBalances()
  const nets = useWalletMonthlyNet()
  const pace = useSpendingPace(CURRENCY, start, step)
  const cats = useCategoryPeriodTotals(CURRENCY, start, step)
  const flow = useMonthlyCashFlow(CURRENCY)
  const history = useBalanceHistory(CURRENCY, start, end)
  const firstDay = useEarliestTransactionDate()

  const buckets = useMemo(
    () => bucketFlow(flow.data ?? [], period, offset, firstDay.data ?? null),
    [flow.data, period, offset, firstDay.data],
  )

  const failed = [wallets, categories, balances, pace, cats, flow].find((q) => q.error)
  if (failed?.error) {
    return (
      <p className="px-4 py-10 text-[13px] text-expense">
        {failed.error instanceof Error ? failed.error.message : 'Something went wrong'}
      </p>
    )
  }

  return (
    <div className="flex flex-col">
      {/* Sticky inside AppShell's scrolling <main>.
          
          The pull-up is load-bearing. `<main>` carries `--safe-top` as padding,
          and a sticky element's offsets are measured against the *scrollport* —
          which is the padding box, above that padding. So `top: 0` alone parks
          the header 12px down and leaves a band of bare scrollport over it,
          through which rows visibly slide. Pulling the header up by the inset
          and padding its content back down by the same amount puts its opaque
          edge at the true top with nothing changed below it.

          The gradient's transparent tail is the other half: content should pass
          under the control and fade, not stop against a hard line. */}
      <div
        className="sticky top-0 z-10 px-4 pb-3"
        style={{
          marginTop: 'calc(var(--safe-top) * -1)',
          paddingTop: 'calc(var(--safe-top) + 4px)',
          background:
            'linear-gradient(180deg, var(--color-bg) 76%, transparent 100%)',
        }}
      >
        <h1 className="px-1 pb-2.5 text-[22px] font-semibold tracking-[-0.02em]">
          Insight
        </h1>
        <div className="flex items-center gap-2">
          <SegmentedTrack
            className="flex-1"
            options={PERIODS}
            value={period}
            onChange={(next) => {
              // The offsets do not correspond across grains — three steps back
              // is March as a month and 2023 as a year — so changing the grain
              // returns to the present rather than landing somewhere arbitrary.
              setPeriod(next)
              setOffset(0)
            }}
          />
          <div className="flex flex-none items-center gap-0.5 rounded-full bg-inset p-[3px] px-1">
            <Step
              label="Previous period"
              onClick={() => setOffset((o) => o + 1)}
            >
              <IconChevronLeft size={16} stroke={2} />
            </Step>
            <span className="px-1 text-[12.5px] font-semibold whitespace-nowrap">
              {periodLabel(period, offset)}
            </span>
            {/* Dead at the present: there is nothing after now to look at. */}
            <Step
              label="Next period"
              disabled={offset === 0}
              onClick={() => setOffset((o) => Math.max(0, o - 1))}
            >
              <IconChevronRight size={16} stroke={2} />
            </Step>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-[22px] px-4 pt-1">
        <PaceCard
          points={pace.data ?? []}
          period={period}
          offset={offset}
          currency={CURRENCY}
          loading={pace.isPending}
        />

        <CashFlowCard
          buckets={buckets}
          currency={CURRENCY}
          loading={flow.isPending}
        />

        <CategoriesCard
          totals={cats.data ?? []}
          categories={categories.data ?? []}
          period={period}
          offset={offset}
          currency={CURRENCY}
          loading={cats.isPending || categories.isPending}
        />

        <BalancesCard
          wallets={wallets.data ?? []}
          balances={balances.data ?? []}
          nets={nets.data ?? []}
          history={history.data ?? []}
          currency={CURRENCY}
          periodLabel={periodLabel(period, offset)}
        />
      </div>
    </div>
  )
}

/** One chevron of the period stepper, at a 26px touch target. */
function Step({
  children,
  label,
  disabled = false,
  onClick,
}: {
  children: React.ReactNode
  label: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-[26px] items-center justify-center rounded-full disabled:opacity-30"
      style={{ color: 'var(--color-ink-muted)' }}
    >
      {children}
    </button>
  )
}
