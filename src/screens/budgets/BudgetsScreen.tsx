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
  committedShare,
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

// The soonest reset, as a phrase. Zero used to read "Last day", which is true
// of a month on its 31st and permanently true once a daily budget joins the
// list — where it sounds like an alarm about something that happens every
// morning. "Resets today" is the same fact without the urgency.
const daysChip = (days: number): string =>
  days === 0 ? 'Resets today' : `${days} day${days === 1 ? '' : 's'}`

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
  const committed = committedShare(budget)
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
      className="flex items-center gap-[13px] px-4 py-[13px] hover:bg-press active:bg-press"
    >
      <Tile color={hue} size={40}>
        <Icon size={20} stroke={2} />
      </Tile>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-row font-medium">{budget.name}</span>
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
            className="tnum ml-auto flex-none text-row font-semibold whitespace-nowrap"
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
          {/* Spend, then what is already booked behind it at a third of the
              ink. The ghost is never counted in the verdict or the percentage —
              a subscription due in eleven days has not been spent — it just
              stops the bar from being a surprise when it does charge. */}
          <span className="flex h-1 gap-px overflow-hidden rounded-full bg-track">
            <span
              className="h-1 rounded-full"
              style={{
                width: `${Math.min(share, 1) * 100}%`,
                background: over ? 'var(--color-expense)' : hue,
              }}
            />
            {committed > 0 && (
              <span
                className="h-1 rounded-full"
                style={{ width: `${committed * 100}%`, background: hue, opacity: 0.35 }}
              />
            )}
          </span>
          <span
            className="tnum text-micro font-semibold whitespace-nowrap"
            style={{ color: ink ?? 'var(--color-ink-muted)' }}
          >
            {Math.round(share * 100)}% of {formatMoneyShort(asMinor(limit))}
          </span>

          {/* Thinner and ink-dim throughout: time is the reference the spend is
              read against, never the subject, and it takes no verdict colour of
              its own — the period passes at the same rate whatever the budget
              is doing.

              Absent on a daily budget, both cells together so the grid keeps its
              pairs. "day 1 of 1" under a permanently full bar would read as a
              period that has run out, when what it means is that the app has no
              finer grain than a day (invariant 3) and so nothing to measure the
              elapsed fraction of one with. */}
          {budget.period !== 'daily' && (
            <>
              <span className="h-[3px] rounded-full bg-track">
                <span
                  className="block h-[3px] rounded-full"
                  style={{
                    width: `${(day / days) * 100}%`,
                    background: 'var(--color-ink-dim)',
                  }}
                />
              </span>
              <span className="tnum text-kicker whitespace-nowrap text-ink-faint">
                day {day} of {days}
              </span>
            </>
          )}
        </div>

        <div className="mt-[3px] truncate text-meta-sm text-ink-faint">
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

  /**
   * Whether the wide layout runs two columns at all.
   *
   * The second column exists for exactly one thing: putting **Over** beside
   * **At risk**, which are the two short groups and the two a reader compares.
   * With only one of them present there is nothing to put beside anything, and
   * the grid stops being a layout and becomes a hole — a list of budgets in the
   * left half of a 1080px page with the right half empty. So the columns are
   * conditional on both being there, and every group spans when they are not.
   *
   * On track is not part of the test: it is nearly always the longest group and
   * always spans, so its presence says nothing about whether a second column
   * would be filled.
   */
  const paired = useMemo(() => {
    const present = new Set(grouped.map((g) => g.verdict))
    return present.has('over') && present.has('at-risk')
  }, [grouped])

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
      <h1 className="flex-1 text-title-sm font-semibold tracking-[-.02em]">Budgets</h1>
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
      <div className="flex flex-col gap-[14px] px-4 pt-2.5 md:px-8">
        {header}
        <p className="px-1 text-value text-expense">
          {error instanceof Error ? error.message : 'Something went wrong'}
        </p>
      </div>
    )
  }

  return (
    /* One column on a phone and a tablet, two from 1024 — where a budget list
       is a set of small independent groups and a single column would run them
       down the middle of a wide window with a hand's width of ground either
       side. `auto-rows-min` keeps Over and At risk at their own heights rather
       than stretching the shorter to match. */
    <div className="flex flex-col gap-[14px] px-4 pt-2.5 md:px-8 lg:grid lg:auto-rows-min lg:grid-cols-2 lg:gap-4">
      <div className="lg:col-span-2">{header}</div>

      {budgets.length === 0 ? (
        <button
          type="button"
          onClick={() => navigate('/budgets/new')}
          className="flex flex-col items-center justify-center gap-2 rounded-card py-10 text-ink-faint lg:col-span-2"
          style={{ border: '1.5px dashed var(--color-hint)' }}
        >
          <IconPlus size={22} stroke={2} />
          <span className="text-value">Add a budget</span>
          <span className="max-w-[260px] px-4 text-center text-meta-sm leading-[1.5]">
            A limit per period, over the categories and wallets you point it at.
          </span>
        </button>
      ) : (
        <>
          {/* ------------------------------------------------ period summary */}
          {/* Spans both columns, and splits inside them: the figure and the bar
              are two readings of one thing, so at this width they sit side by
              side rather than stacked with a full card's width of empty ground
              beside each. */}
          <Card className="p-[18px] lg:col-span-2 lg:grid lg:grid-cols-[320px_minmax(0,1fr)] lg:items-center lg:gap-7">
            <div>
            <div className="flex items-start justify-between gap-3">
              <Label>
                {sharedMonth(budgets)
                  ? `Budgeted in ${sharedMonth(budgets)}`
                  : 'Budgeted now'}
              </Label>
              <span
                className="flex flex-none items-center gap-[5px] rounded-full px-[9px] py-1 text-meta font-semibold text-ink-muted"
                style={{ background: 'var(--color-tile)' }}
              >
                <IconClock size={13} stroke={2} />
                <span className="tnum">{daysChip(nextReset)}</span>
              </span>
            </div>

            <div
              className="tnum mt-2"
              style={{ fontSize: 'var(--text-stat-sm)', fontWeight: 600, lineHeight: 1, letterSpacing: '-.035em' }}
            >
              {formatAmount(asMinor(totalSpent))}
              <span
                className="text-ink-faint"
                style={{ fontSize: 'var(--text-stat-sm-unit)', fontWeight: 500, letterSpacing: 0 }}
              >
                {' '}
                {currencySymbol(CURRENCY)}
              </span>
            </div>
            <div className="mt-1 text-meta text-ink-muted">
              of {formatAmountMoney(asMinor(totalLimit), CURRENCY)} across{' '}
              {budgets.length} budget{budgets.length === 1 ? '' : 's'}
            </div>
            </div>

            <div className="lg:mt-0">
            <SplitBar budgets={ordered} total={totalLimit} />

            <div
              className="mt-2 flex items-baseline justify-between text-meta"
              style={{ color: totalOver ? 'var(--color-expense)' : 'var(--color-ink-muted)' }}
            >
              <span className="tnum">{used}% used</span>
              <span className="tnum">
                {totalOver
                  ? `${formatAmountMoney(asMinor(totalSpent - totalLimit), CURRENCY)} over`
                  : `${formatAmountMoney(asMinor(totalLimit - totalSpent), CURRENCY)} left`}
              </span>
            </div>
            </div>
          </Card>

          {/* ------------------------------------------------------- groups */}
          {grouped.map(({ verdict, rows }) => {
            const overspend = rows.reduce(
              (sum, b) => sum + Math.max(0, b.spent - effectiveLimit(b)),
              0,
            )
            return (
              <section
                key={verdict}
                className={`flex flex-col gap-2 ${
                  // Over and At risk take a column each — but only when both are
                  // there to fill one. On track always spans: it is nearly always
                  // the longest group, and a column of ten rows beside a column of
                  // one is a page with a hole in it.
                  verdict === 'on-track' || !paired ? 'lg:col-span-2' : ''
                }`}
              >
                <div className="flex items-baseline justify-between px-1">
                  <Label tone={verdict === 'over' ? 'var(--color-expense)' : undefined}>
                    {VERDICT_LABEL[verdict]}
                  </Label>
                  <span
                    className="text-meta"
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

          <p className="px-1 text-meta leading-[1.5] text-ink-muted lg:col-span-2 lg:max-w-[620px]">
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
