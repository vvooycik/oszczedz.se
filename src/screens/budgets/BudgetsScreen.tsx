import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router'
import { IconArrowsSort, IconClock, IconHome, IconPlus } from '@tabler/icons-react'
import { ActionTile } from '@/components/ui/Button'
import { Card, Divider } from '@/components/ui/Card'
import { Label } from '@/components/ui/Label'
import { Tile } from '@/components/ui/Tile'
import { useBudgetProgress } from '@/data/queries'
import {
  dayOfPeriod,
  daysInPeriod,
  daysLeft,
  effectiveLimit,
  scopeMeta,
  sharedMonth,
  shareOf,
  sortForList,
  VERDICT_LABEL,
  verdictOf,
  type Verdict,
} from '@/lib/budgets'
import {
  asMinor,
  currencySymbol,
  formatAmount,
  formatAmountMoney,
  formatMoneyShort,
} from '@/lib/money'
import { iconFor } from '@/lib/icons'
import { categoryVar } from '@/theme/tokens'
import type { BudgetProgress } from '@/lib/db'

const CURRENCY = 'PLN'

const GROUPS: Verdict[] = ['over', 'at-risk', 'on-track']

const daysChip = (days: number): string =>
  days === 0 ? 'Last day' : `${days} day${days === 1 ? '' : 's'}`

/**
 * One segment per budget, sized by its share of the *total* limit, with the
 * unspent remainder as track.
 *
 * A budget over its limit contributes its limit rather than its spend, so the
 * bar can never exceed its own track — the overage is a number, and the foot row
 * is where it is stated. A bar that grew past its container would be the only
 * thing on the screen that could lie about scale.
 */
function SplitBar({ budgets, total }: { budgets: BudgetProgress[]; total: number }) {
  return (
    <div className="mt-3.5 flex h-2.5 gap-[3px]">
      {budgets.map((b) => {
        const counted = Math.min(b.spent, effectiveLimit(b))
        const width = total > 0 ? Math.max(0, counted / total) * 100 : 0
        if (width <= 0) return null
        return (
          <span
            key={b.budget_id}
            className="rounded-full"
            style={{ width: `${width}%`, background: categoryVar(b.color) }}
          />
        )
      })}
      <span className="flex-1 rounded-full bg-track" />
    </div>
  )
}

function BudgetRow({ budget }: { budget: BudgetProgress }) {
  const limit = effectiveLimit(budget)
  const share = shareOf(budget)
  const over = budget.spent > limit
  const day = dayOfPeriod(budget)
  const days = daysInPeriod(budget)
  const hue = categoryVar(budget.color)
  const Icon = iconFor(budget.glyph)
  const ink = over ? 'var(--color-expense)' : undefined

  return (
    <Link
      // No budget detail screen exists yet (the handoff leaves it out), so the
      // row opens the one thing there is to do with a budget. When a detail
      // screen lands this is the tap that moves to it.
      to={`/budgets/${budget.budget_id}/edit`}
      className="flex items-center gap-[13px] px-4 py-[13px] active:bg-press"
    >
      <Tile color={hue} size={40}>
        <Icon size={20} stroke={2} />
      </Tile>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[15px] font-medium">{budget.name}</span>
            {budget.show_on_home && (
              <IconHome
                size={13}
                stroke={2}
                className="flex-none text-ink-dim"
                aria-label="On the Home rail"
              />
            )}
          </span>
          <span
            className="tnum ml-auto flex-none text-[15px] font-semibold whitespace-nowrap"
            style={{ color: ink }}
          >
            {formatAmountMoney(asMinor(budget.spent), budget.currency)}
          </span>
        </div>

        {/*
          Two bars, one grid.
          `1fr auto` is what makes them comparable at all: the reading column
          sizes to the wider of the two labels and both tracks inherit the same
          `1fr`, so the bars start and end at exactly the same x. Laid out as two
          flex rows they would differ by however much "day 20 of 31" and "127% of
          12 000" differ in width, and two bars of unequal length are worse than
          one bar — they invite a comparison the geometry cannot support.

          The lower bar is how far through the period today is. Read together
          they are the *verdict* in visual form: spend ahead of time is what "at
          risk" means, so a row whose top bar has outrun its bottom one is a row
          the grouping above has already moved.
        */}
        <div className="mt-[7px] grid grid-cols-[1fr_auto] items-center gap-x-2.5 gap-y-[5px]">
          <span className="h-1 rounded-full bg-track">
            <span
              className="block h-1 rounded-full"
              style={{
                width: `${Math.min(share, 1) * 100}%`,
                background: over ? 'var(--color-expense)' : hue,
              }}
            />
          </span>
          <span
            className="tnum text-[11.5px] font-semibold whitespace-nowrap"
            style={{ color: ink ?? 'var(--color-ink-muted)' }}
          >
            {Math.round(share * 100)}% of {formatMoneyShort(asMinor(limit))}
          </span>

          {/* Thinner and ink-dim throughout: time is the reference the spend is
              read against, never the subject, and it takes no verdict colour of
              its own — the period passes at the same rate whatever the budget
              is doing. */}
          <span className="h-[3px] rounded-full bg-track">
            <span
              className="block h-[3px] rounded-full"
              style={{
                width: `${(day / days) * 100}%`,
                background: 'var(--color-ink-dim)',
              }}
            />
          </span>
          <span className="tnum text-[11px] whitespace-nowrap text-ink-faint">
            day {day} of {days}
          </span>
        </div>

        <div className="mt-[3px] truncate text-[12px] text-ink-faint">
          {scopeMeta(budget)}
        </div>
      </div>
    </Link>
  )
}

export function BudgetsScreen() {
  const navigate = useNavigate()
  const { data, error } = useBudgetProgress()

  const budgets = useMemo(
    () => (data ?? []).filter((b) => b.currency === CURRENCY),
    [data],
  )

  const ordered = useMemo(() => sortForList(budgets), [budgets])

  const grouped = useMemo(() => {
    const buckets = new Map<Verdict, BudgetProgress[]>()
    for (const budget of ordered) {
      const verdict = verdictOf(budget)
      const bucket = buckets.get(verdict)
      if (bucket) bucket.push(budget)
      else buckets.set(verdict, [budget])
    }
    // Empty groups are omitted entirely, label row included.
    return GROUPS.flatMap((verdict) => {
      const rows = buckets.get(verdict)
      return rows ? [{ verdict, rows }] : []
    })
  }, [ordered])

  const totalLimit = budgets.reduce((sum, b) => sum + effectiveLimit(b), 0)
  const totalSpent = budgets.reduce((sum, b) => sum + b.spent, 0)
  const totalOver = totalSpent > totalLimit
  const used = totalLimit > 0 ? Math.round((totalSpent / totalLimit) * 100) : 0
  // The soonest reset, which is what "days" means once budgets can disagree
  // about where their period ends.
  const nextReset = budgets.length
    ? Math.min(...budgets.map((b) => daysLeft(b)))
    : 0

  const header = (
    <div className="flex items-center gap-2 px-1">
      <h1 className="flex-1 text-[28px] font-semibold tracking-[-.02em]">Budgets</h1>
      {budgets.length > 0 && (
        <ActionTile label="Home rail order" onClick={() => navigate('/budgets/order')}>
          <IconArrowsSort size={20} stroke={2} />
        </ActionTile>
      )}
      <ActionTile label="New budget" onClick={() => navigate('/budgets/new')}>
        <IconPlus size={20} stroke={2} />
      </ActionTile>
    </div>
  )

  if (error) {
    return (
      <div className="flex flex-col gap-[14px] px-4 pt-2.5">
        {header}
        <p className="px-1 text-[13px] text-expense">
          {error instanceof Error ? error.message : 'Something went wrong'}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-[14px] px-4 pt-2.5">
      {header}

      {budgets.length === 0 ? (
        <button
          type="button"
          onClick={() => navigate('/budgets/new')}
          className="flex flex-col items-center justify-center gap-2 rounded-card py-10 text-ink-faint"
          style={{ border: '1.5px dashed var(--color-hint)' }}
        >
          <IconPlus size={22} stroke={2} />
          <span className="text-[13px]">Add a budget</span>
          <span className="max-w-[260px] px-4 text-center text-[12px] leading-[1.5]">
            A limit per period, over the categories and wallets you point it at.
          </span>
        </button>
      ) : (
        <>
          {/* ------------------------------------------------ period summary */}
          <Card className="p-[18px]">
            <div className="flex items-start justify-between gap-3">
              <Label>
                {sharedMonth(budgets)
                  ? `Budgeted in ${sharedMonth(budgets)}`
                  : 'Budgeted now'}
              </Label>
              <span
                className="flex flex-none items-center gap-[5px] rounded-full px-[9px] py-1 text-[12.5px] font-semibold text-ink-muted"
                style={{ background: 'var(--color-tile)' }}
              >
                <IconClock size={13} stroke={2} />
                <span className="tnum">{daysChip(nextReset)}</span>
              </span>
            </div>

            <div
              className="tnum mt-2"
              style={{ fontSize: 30, fontWeight: 600, lineHeight: 1.05, letterSpacing: '-.03em' }}
            >
              {formatAmount(asMinor(totalSpent))}
              <span
                className="text-ink-faint"
                style={{ fontSize: 17, fontWeight: 500, letterSpacing: 0 }}
              >
                {' '}
                {currencySymbol(CURRENCY)}
              </span>
            </div>
            <div className="mt-1 text-[12.5px] text-ink-muted">
              of {formatAmountMoney(asMinor(totalLimit), CURRENCY)} across{' '}
              {budgets.length} budget{budgets.length === 1 ? '' : 's'}
            </div>

            <SplitBar budgets={ordered} total={totalLimit} />

            <div
              className="mt-2 flex items-baseline justify-between text-[12.5px]"
              style={{ color: totalOver ? 'var(--color-expense)' : 'var(--color-ink-muted)' }}
            >
              <span className="tnum">{used}% used</span>
              <span className="tnum">
                {totalOver
                  ? `${formatAmountMoney(asMinor(totalSpent - totalLimit), CURRENCY)} over`
                  : `${formatAmountMoney(asMinor(totalLimit - totalSpent), CURRENCY)} left`}
              </span>
            </div>
          </Card>

          {/* ------------------------------------------------------- groups */}
          {grouped.map(({ verdict, rows }) => {
            const overspend = rows.reduce(
              (sum, b) => sum + Math.max(0, b.spent - effectiveLimit(b)),
              0,
            )
            return (
              <section key={verdict} className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between px-1">
                  <Label tone={verdict === 'over' ? 'var(--color-expense)' : undefined}>
                    {VERDICT_LABEL[verdict]}
                  </Label>
                  <span
                    className="text-[12.5px]"
                    style={{
                      color:
                        verdict === 'over'
                          ? 'var(--color-expense)'
                          : 'var(--color-ink-muted)',
                    }}
                  >
                    {verdict === 'over' ? (
                      <span className="tnum">
                        −{formatAmountMoney(asMinor(overspend), CURRENCY)}
                      </span>
                    ) : verdict === 'at-risk' ? (
                      'on pace to overspend'
                    ) : (
                      `${rows.length} budget${rows.length === 1 ? '' : 's'}`
                    )}
                  </span>
                </div>
                <Card>
                  {rows.map((budget, index) => (
                    <div key={budget.budget_id}>
                      {index > 0 && <Divider />}
                      <BudgetRow budget={budget} />
                    </div>
                  ))}
                </Card>
              </section>
            )
          })}

          <p className="px-1 text-[12.5px] leading-[1.5] text-ink-muted">
            “At risk” is today’s daily rate carried to the end of the period — a
            straight line, so a period that always spends late will say it and be
            wrong. Nothing is at risk before its third day, where a single big
            shop would project thirty of them.
          </p>
        </>
      )}
    </div>
  )
}
