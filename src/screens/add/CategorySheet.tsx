import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Sheet } from '@/components/Sheet'
import { CategoryGlyph } from '@/components/CategoryGlyph'
import type { Category, CategoryKind } from '@/lib/db'

const TABS: { key: CategoryKind; label: string }[] = [
  { key: 'expense', label: 'Expenses' },
  { key: 'income', label: 'Income' },
  { key: 'transfer', label: 'Transfer' },
]

/**
 * Category picker. Opens automatically when the add flow starts, so the first
 * decision is what the money was for rather than how much.
 *
 * Four columns: dense enough to hold 20+ categories without scrolling, with
 * search as the pressure valve past that.
 */
export function CategorySheet({
  open,
  onClose,
  categories,
  onPick,
}: {
  open: boolean
  onClose: () => void
  categories: Category[]
  onPick: (category: Category) => void
}) {
  const [kind, setKind] = useState<CategoryKind>('expense')
  const [query, setQuery] = useState('')

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return categories
      .filter((c) => c.kind === kind)
      .filter((c) => (q ? c.name.toLowerCase().includes(q) : true))
  }, [categories, kind, query])

  return (
    <Sheet open={open} onClose={onClose} label="Choose a category">
      <div className="flex gap-2 px-5 pt-4 font-sans">
        {TABS.map((tab) => {
          const active = tab.key === kind
          return (
            <button
              key={tab.key}
              onClick={() => setKind(tab.key)}
              className="rounded-[3px] px-3 py-[5px] text-[11.5px]"
              style={{
                border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-line)'}`,
                color: active ? 'var(--color-accent)' : 'var(--color-ink-muted)',
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      <label
        className="mx-5 mt-3 flex items-center gap-2 rounded-[4px] px-3 py-2"
        style={{ border: '1px solid var(--color-line)' }}
      >
        <Search size={16} strokeWidth={1.5} className="flex-none text-ink-faint" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${categories.filter((c) => c.kind === kind).length} categories`}
          className="w-full bg-transparent font-sans text-[13px] outline-none placeholder:text-ink-dim"
        />
      </label>

      {kind === 'transfer' && (
        <p className="mx-5 mt-3 text-[11.5px] leading-[1.5] text-ink-muted">
          Moving money between your own wallets needs both sides, so it is not a
          single entry — a dedicated transfer flow is still to come.
        </p>
      )}

      <div className="no-scrollbar mt-3 flex-1 overflow-y-auto px-5 pb-8">
        <div className="grid grid-cols-4 gap-x-2 gap-y-4">
          {shown.map((category) => (
            <button
              key={category.id}
              disabled={kind === 'transfer'}
              onClick={() => onPick(category)}
              className="flex flex-col items-center gap-1.5 disabled:opacity-40"
            >
              <CategoryGlyph glyph={category.glyph} color={category.color} />
              <span className="line-clamp-1 w-full text-center text-[11px] leading-tight">
                {category.name}
              </span>
            </button>
          ))}
        </div>

        {shown.length === 0 && kind !== 'transfer' && (
          <p className="pt-6 text-center text-[12.5px] text-ink-muted">
            No categories match “{query}”.
          </p>
        )}
      </div>
    </Sheet>
  )
}
