import { Link } from 'react-router'
import { Plus } from 'lucide-react'
import { iconFor } from '@/lib/icons'
import { categoryVar } from '@/theme/tokens'
import { asMinor, formatMoneyShort } from '@/lib/money'
import type { BudgetProgress } from '@/lib/db'

const SIZE = 62
const RADIUS = 29
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/**
 * Horizontally scrolling ring per budget: how much of the limit is spent, the
 * category glyph inside, and what is left underneath.
 *
 * Over-budget rings fill completely and switch to the expense colour — the ring
 * cannot show more than a full turn, so the number carries the overage.
 */
function BudgetRing({ budget }: { budget: BudgetProgress }) {
  const spent = budget.spent ?? 0
  const limit = budget.limit_amount ?? 0
  const over = limit > 0 && spent > limit
  const fraction = limit > 0 ? Math.min(spent / limit, 1) : 0

  const Icon = iconFor(budget.glyph)
  const color = over ? 'var(--color-expense)' : categoryVar(budget.color)
  const remaining = limit - spent

  return (
    <Link to="/budgets" className="flex w-[66px] flex-none flex-col items-center gap-[7px]">
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="block">
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="var(--color-track)"
            strokeWidth={2.5}
          />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={color}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeDasharray={`${fraction * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          />
        </svg>
        <span
          className="absolute inset-0 flex items-center justify-center"
          style={{ color: categoryVar(budget.color) }}
        >
          <Icon size={22} strokeWidth={1.5} />
        </span>
      </div>
      <div className="text-center text-[11px] leading-[1.3] text-ink/80">
        <span className="line-clamp-1">{budget.name}</span>
        <span
          className="tnum block text-[10.5px]"
          style={{ color: over ? 'var(--color-expense)' : 'var(--color-ink-muted)' }}
        >
          {over
            ? `${formatMoneyShort(asMinor(spent - limit))} over`
            : `${formatMoneyShort(asMinor(remaining))} left`}
        </span>
      </div>
    </Link>
  )
}

export function BudgetRail({ budgets }: { budgets: BudgetProgress[] }) {
  return (
    <div className="no-scrollbar flex gap-[14px] overflow-x-auto px-5 pt-3.5 pb-2">
      {budgets.map((b) => (
        <BudgetRing key={b.budget_id} budget={b} />
      ))}

      <Link to="/budgets" className="flex w-[66px] flex-none flex-col items-center gap-[7px]">
        <span
          className="flex items-center justify-center rounded-full text-ink-muted"
          style={{
            width: SIZE,
            height: SIZE,
            border: '1.5px dashed var(--color-ink-dim)',
          }}
        >
          <Plus size={22} strokeWidth={1.5} />
        </span>
        <span className="text-center text-[11px] leading-[1.3] text-ink-muted">
          Set a budget
        </span>
      </Link>
    </div>
  )
}
