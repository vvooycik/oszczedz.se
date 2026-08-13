import { Link } from 'react-router'
import { IconPlus } from '@tabler/icons-react'
import { iconFor } from '@/lib/icons'
import { categoryVar } from '@/theme/tokens'
import { asMinor, formatMoney } from '@/lib/money'
import { Card } from './ui/Card'
import { Tile } from './ui/Tile'
import type { BudgetProgress } from '@/lib/db'

/**
 * Horizontally scrolling card per budget: the category's mark, how far through
 * the limit it is, and what is left.
 *
 * It used to be a ring. A ring reads as a gauge, which is the wrong instrument
 * for a number that is mostly "somewhere in the middle" — and it had nowhere to
 * put the name and the remainder except underneath, at 10.5px. The card gives
 * both a line of their own and turns the fraction into a bar, which is easier
 * to compare across four budgets sitting side by side.
 *
 * Over-budget bars fill completely and switch to the expense colour — a bar
 * cannot show more than full, so the number carries the overage.
 */
function BudgetCard({ budget }: { budget: BudgetProgress }) {
  const spent = budget.spent ?? 0
  const limit = budget.limit_amount ?? 0
  const over = limit > 0 && spent > limit
  const fraction = limit > 0 ? Math.min(spent / limit, 1) : 0

  const Icon = iconFor(budget.glyph)
  const hue = categoryVar(budget.color)
  const bar = over ? 'var(--color-expense)' : hue

  return (
    <Link to="/budgets" className="flex-none">
      <Card className="flex w-[132px] flex-col gap-[9px] px-[14px] py-3">
        <div className="flex items-center justify-between">
          <Tile color={hue} size={28}>
            <Icon size={15} stroke={2} />
          </Tile>
          <span className="tnum text-[12px] font-semibold text-ink-muted">
            {limit > 0 ? `${Math.round((spent / limit) * 100)}%` : '—'}
          </span>
        </div>

        <div className="min-w-0">
          <div className="truncate text-[13px] font-medium">{budget.name}</div>
          <div
            className="tnum mt-px truncate text-[12px]"
            style={{ color: over ? 'var(--color-expense)' : 'var(--color-ink-muted)' }}
          >
            {over
              ? `${formatMoney(asMinor(spent - limit), budget.currency ?? 'PLN')} over`
              : `${formatMoney(asMinor(limit - spent), budget.currency ?? 'PLN')} left`}
          </div>
        </div>

        <div className="h-1 rounded-full bg-track">
          <div
            className="h-1 rounded-full"
            style={{ width: `${fraction * 100}%`, background: bar }}
          />
        </div>
      </Card>
    </Link>
  )
}

export function BudgetRail({ budgets }: { budgets: BudgetProgress[] }) {
  return (
    <div className="no-scrollbar -mx-4 flex gap-[10px] overflow-x-auto px-4">
      {budgets.map((b) => (
        <BudgetCard key={b.budget_id} budget={b} />
      ))}

      {/* Dashed rather than a card: it is an invitation, not a thing that
          exists yet, and the dash is this design's mark for exactly that. */}
      <Link
        to="/budgets"
        className="flex w-[88px] flex-none flex-col items-center justify-center gap-1.5 rounded-card text-ink-faint"
        style={{ border: '1.5px dashed var(--color-hint)' }}
      >
        <IconPlus size={18} stroke={2} />
        <span className="text-[11.5px]">Budget</span>
      </Link>
    </div>
  )
}
