import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Sheet } from '@/components/Sheet'
import { CategoryGlyph } from '@/components/CategoryGlyph'
import { Pill } from '@/components/Pill'
import { keepFocus } from '@/lib/touch'
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
  allowTransfer = true,
}: {
  open: boolean
  onClose: () => void
  categories: Category[]
  onPick: (category: Category) => void
  /**
   * Off while **editing**. Picking a transfer category turns the form into a
   * transfer, and a transfer is a pair created by `create_transfer` — an
   * existing single row cannot become one by changing its category.
   */
  allowTransfer?: boolean
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
      <div className="flex gap-2 px-5 pt-4">
        {TABS.map((tab) => (
          <Pill key={tab.key} active={tab.key === kind} onClick={() => setKind(tab.key)}>
            {tab.label}
          </Pill>
        ))}
      </div>

      <label
        className="mx-5 mt-3 flex items-center gap-2 rounded-[4px] px-3 py-2"
        style={{ border: '1px solid var(--color-line)' }}
      >
        <Search size={16} strokeWidth={1.5} className="flex-none text-ink-faint" />
        {/* Left as a plain text field: `type="search"` drags WebKit's own rounded
            chrome and clear button in with it, and the search return key comes
            from enterKeyHint either way. */}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${categories.filter((c) => c.kind === kind).length} categories`}
          inputMode="search"
          enterKeyHint="search"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="w-full bg-transparent font-sans text-[13px] outline-none placeholder:text-ink-dim"
        />
      </label>

      {kind === 'transfer' && (
        <p className="mx-5 mt-3 text-[11.5px] leading-[1.5] text-ink-muted">
          {allowTransfer
            ? 'Moving money between your own wallets. Picking one of these asks for a second wallet, and records both sides at once.'
            : 'A transfer is a pair of rows created together, so an existing transaction cannot be turned into one. Delete it and add the transfer instead.'}
        </p>
      )}

      <div className="no-scrollbar mt-3 flex-1 overflow-y-auto px-5 pb-8">
        <div className="grid grid-cols-4 gap-x-2 gap-y-4">
          {shown.map((category) => (
            <button
              key={category.id}
              disabled={kind === 'transfer' && !allowTransfer}
              // Otherwise the first tap after a search is spent dismissing the
              // keyboard and never reaches the button. See `keepFocus`.
              onMouseDown={keepFocus}
              onClick={() => onPick(category)}
              className="flex flex-col items-center gap-1.5 disabled:opacity-40"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <CategoryGlyph glyph={category.glyph} color={category.color} />
              <span className="line-clamp-1 w-full text-center text-[11px] leading-tight">
                {category.name}
              </span>
            </button>
          ))}
        </div>

        {shown.length === 0 && (
          <p className="pt-6 text-center text-[12.5px] text-ink-muted">
            No categories match “{query}”.
          </p>
        )}
      </div>
    </Sheet>
  )
}
