import { useMemo, useState } from 'react'
import { IconChevronDown, IconChevronUp } from '@tabler/icons-react'
import { Card, Divider } from '@/components/ui/Card'
import { LabelRow } from '@/components/ui/Label'
import { Tile } from '@/components/ui/Tile'
import { iconFor } from '@/lib/icons'
import { asMinor, formatAmountMoney } from '@/lib/money'
import { medianOf, periodNoun, verdict, type Period, type Tone } from '@/lib/insights'
import { categoryVar } from '@/theme/tokens'
import type { Category, CategoryPeriodTotal } from '@/lib/db'

/** The handoff shows four rows before the link; the rest expand in place. */
const PREVIEW = 4

const toneColour: Record<Tone, string> = {
  over: 'var(--color-expense)',
  under: 'var(--color-income)',
  level: 'var(--color-ink-muted)',
}

type Row = {
  id: string
  name: string
  color: string | null
  glyph: string | null
  spent: number
  share: number
  call: ReturnType<typeof verdict>
}

/**
 * Where the money went, and whether that is unusual.
 *
 * **The delta colour is judgement, not direction.** Over the median is red and
 * under it is green, which is the reverse of what a signed number would suggest
 * and exactly what the handoff asks for — on a spending list, more is worse. A
 * category within ±10% gets no colour at all, because a category that moved 3%
 * has not moved.
 *
 * The median comes from `category_period_totals`, which returns the selected
 * period and the six before it in one call. **A category absent from a prior
 * period counts as zero, not as a missing sample** — that is filled in here
 * rather than in SQL, where it would take a cross join of every category
 * against every period. Skipping it would be wrong in the direction that
 * flatters: a category you only started buying last month would compare itself
 * against its own single data point and always read as normal.
 */
export function CategoriesCard({
  totals,
  categories,
  period,
  offset,
  currency,
  loading,
}: {
  totals: CategoryPeriodTotal[]
  categories: Category[]
  period: Period
  offset: number
  currency: string
  loading: boolean
}) {
  const [expanded, setExpanded] = useState(false)

  const rows = useMemo<Row[]>(() => {
    const byId = new Map(categories.map((c) => [c.id, c]))

    // period_index 0 is the selected period; 1..6 are what it is judged against.
    const current = new Map<string, number>()
    const history = new Map<string, number[]>()
    const priorPeriods = new Set<number>()

    for (const row of totals) {
      if (row.period_index === 0) {
        current.set(row.category_id, row.spent)
        continue
      }
      priorPeriods.add(row.period_index)
      const seen = history.get(row.category_id) ?? []
      seen.push(row.spent)
      history.set(row.category_id, seen)
    }

    const priorCount = priorPeriods.size
    const total = [...current.values()].reduce((sum, v) => sum + v, 0)

    return [...current.entries()]
      .map(([id, spent]) => {
        const category = byId.get(id)
        // Pad with zeros for every prior period the category is missing from.
        const seen = history.get(id) ?? []
        const samples = [
          ...seen,
          ...Array(Math.max(0, priorCount - seen.length)).fill(0),
        ]
        return {
          id,
          name: category?.name ?? 'Uncategorised',
          color: category?.color ?? null,
          glyph: category?.glyph ?? null,
          spent,
          share: total > 0 ? spent / total : 0,
          call: verdict(spent, medianOf(samples)),
        }
      })
      .sort((a, b) => b.spent - a.spent)
  }, [totals, categories])

  const shown = expanded ? rows : rows.slice(0, PREVIEW)

  return (
    <section className="flex flex-col gap-2">
      <LabelRow
        trailing={
          <span className="text-meta-sm text-ink-muted">
            vs typical {periodNoun(period, offset)}
          </span>
        }
      >
        Categories
      </LabelRow>

      <Card className="py-1.5">
        {loading ? (
          <p className="px-4 py-8 text-center text-value text-ink-muted">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-value text-ink-muted">
            Nothing spent in this period.
          </p>
        ) : (
          shown.map((row, i) => (
            <div key={row.id}>
              {i > 0 && <Divider />}
              <CategoryRow row={row} currency={currency} />
            </div>
          ))
        )}
      </Card>

      {/* Expands in place rather than linking out: there is no category detail
          screen to send this to, and inventing one is its own piece of work. */}
      {rows.length > PREVIEW && (
        <button
          type="button"
          onClick={() => setExpanded((s) => !s)}
          className="flex items-center justify-center gap-1.5 py-0.5 text-meta font-semibold text-accent"
        >
          {expanded ? 'Show fewer' : `All ${rows.length} categories`}
          {expanded ? (
            <IconChevronUp size={15} stroke={2} />
          ) : (
            <IconChevronDown size={15} stroke={2} />
          )}
        </button>
      )}
    </section>
  )
}

function CategoryRow({ row, currency }: { row: Row; currency: string }) {
  const Glyph = iconFor(row.glyph)
  const hue = categoryVar(row.color)

  return (
    <div className="flex items-center gap-[13px] px-4 py-[11px]">
      <Tile color={hue} size={36}>
        <Glyph size={19} stroke={2} />
      </Tile>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2.5">
          <span className="truncate text-action font-medium">{row.name}</span>
          <span className="tnum flex-none text-action font-semibold">
            {formatAmountMoney(asMinor(row.spent), currency)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-1 flex-1 rounded-full bg-track">
            <span
              className="block h-1 rounded-full"
              style={{ width: `${Math.round(row.share * 100)}%`, background: hue }}
            />
          </span>
          <span
            className="tnum flex-none text-micro font-semibold whitespace-nowrap"
            style={{ color: row.call ? toneColour[row.call.tone] : 'var(--color-ink-dim)' }}
          >
            {!row.call
              ? 'new'
              : row.call.tone === 'level'
                ? '±0%'
                : `${row.call.pct > 0 ? '+' : '−'}${Math.round(Math.abs(row.call.pct) * 100)}%`}
          </span>
        </div>
      </div>
    </div>
  )
}
