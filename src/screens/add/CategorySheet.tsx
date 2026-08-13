import { useMemo, useState } from 'react'
import { IconSearch } from '@tabler/icons-react'
import { Sheet } from '@/components/Sheet'
import { CategoryGlyph } from '@/components/CategoryGlyph'
import { Divider } from '@/components/ui/Card'
import { Label } from '@/components/ui/Label'
import { Button } from '@/components/ui/Button'
import { SegmentedTrack } from '@/components/ui/SegmentedTrack'
import { useCategoryUsage } from '@/data/queries'
import { keepFocus } from '@/lib/touch'
import type { Category, CategoryKind } from '@/lib/db'

const TABS: { key: CategoryKind; label: string }[] = [
  { key: 'expense', label: 'Expenses' },
  { key: 'income', label: 'Income' },
  { key: 'transfer', label: 'Transfer' },
]

const KIND_HEADING: Record<CategoryKind, string> = {
  expense: 'All expenses',
  income: 'All income',
  transfer: 'All transfers',
}

/** How many tiles the "Most used" grid holds — one row of four. */
const MOST_USED = 4

/**
 * Category picker, as a bottom drawer over the entry screen. Opens automatically
 * when the add flow starts, so the first decision is what the money was for
 * rather than how much.
 *
 * Two ways in, because there are two ways people look for a category. **Most
 * used** is a four-column grid of the ones actually reached for — derived from
 * real transaction counts, not a hand-kept list — and it is where the tap
 * usually lands. Everything else is a flat, scannable list underneath with its
 * count beside it, which is what a name search needs to land in.
 *
 * The footer commits rather than the tile: tapping a tile *selects*, and the
 * button says which category is about to be used. That extra tap buys the
 * chance to see the name spelled out before the drawer closes — worth it when
 * fifty-nine categories share ten colours and a handful of glyphs.
 */
export function CategorySheet({
  open,
  onClose,
  categories,
  onPick,
  selectedId,
  allowTransfer = true,
}: {
  open: boolean
  onClose: () => void
  categories: Category[]
  onPick: (category: Category) => void
  /** The row's current category, so the drawer opens on what is already chosen. */
  selectedId?: string | null
  /**
   * Off while **editing**. Picking a transfer category turns the form into a
   * transfer, and a transfer is a pair created by `create_transfer` — an
   * existing single row cannot become one by changing its category.
   */
  allowTransfer?: boolean
}) {
  const usage = useCategoryUsage()

  const current = categories.find((c) => c.id === selectedId)
  const [kind, setKind] = useState<CategoryKind>(current?.kind ?? 'expense')
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<Category | null>(current ?? null)

  const inKind = useMemo(
    () => categories.filter((c) => c.kind === kind),
    [categories, kind],
  )

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? inKind.filter((c) => c.name.toLowerCase().includes(q)) : inKind
  }, [inKind, query])

  // Top four by real transaction count. Hidden while searching — a search is
  // already the narrow path, and a shortcut row above it would just repeat
  // whatever the list is showing.
  const mostUsed = useMemo(() => {
    if (query.trim() || !usage.data) return []
    return [...inKind]
      .sort((a, b) => (usage.data![b.id] ?? 0) - (usage.data![a.id] ?? 0))
      .slice(0, MOST_USED)
      .filter((c) => (usage.data![c.id] ?? 0) > 0)
  }, [inKind, usage.data, query])

  const blocked = kind === 'transfer' && !allowTransfer

  return (
    <Sheet open={open} onClose={onClose} height="76%" label="Choose a category">
      <div className="flex flex-none items-center gap-3 px-4 pt-1 pb-3">
        <h2 className="flex-1 text-[19px] font-semibold tracking-[-0.01em]">Category</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-[13px] font-medium text-ink-muted"
        >
          Cancel
        </button>
      </div>

      <div className="flex flex-none flex-col gap-2.5 px-4">
        <label className="flex h-11 items-center gap-2 rounded-full bg-inset px-4">
          <IconSearch size={18} stroke={2} className="flex-none text-ink-dim" />
          {/* Left as a plain text field: `type="search"` drags WebKit's own
              rounded chrome and clear button in with it, and the search return
              key comes from enterKeyHint either way. */}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${inKind.length} categories`}
            inputMode="search"
            enterKeyHint="search"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="w-full bg-transparent text-[14.5px] outline-none placeholder:text-ink-faint"
          />
        </label>

        <SegmentedTrack options={TABS} value={kind} onChange={setKind} />
      </div>

      {kind === 'transfer' && (
        <p className="flex-none px-4 pt-3 text-[12.5px] leading-[1.5] text-ink-muted">
          {allowTransfer
            ? 'Moving money between your own wallets. Picking one of these asks for a second wallet, and records both sides at once.'
            : 'A transfer is a pair of rows created together, so an existing transaction cannot be turned into one. Delete it and add the transfer instead.'}
        </p>
      )}

      <div className="no-scrollbar flex-1 overflow-y-auto px-4 pt-4 pb-28">
        {mostUsed.length > 0 && (
          <>
            <Label>Most used</Label>
            <div className="mt-2.5 mb-5 grid grid-cols-4 gap-x-2 gap-y-3">
              {mostUsed.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  disabled={blocked}
                  // Otherwise the first tap after a search is spent dismissing
                  // the keyboard and never reaches the button. See `keepFocus`.
                  onMouseDown={keepFocus}
                  onClick={() => setPicked(category)}
                  className="flex flex-col items-center gap-2 disabled:opacity-40"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  <CategoryGlyph
                    glyph={category.glyph}
                    color={category.color}
                    size={52}
                    dashed={category.kind === 'transfer'}
                    selected={picked?.id === category.id}
                  />
                  <span className="line-clamp-2 w-full text-center text-[11px] leading-tight">
                    {category.name}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        <Label>{query.trim() ? 'Matching' : KIND_HEADING[kind]}</Label>

        <div className="mt-1.5">
          {shown.map((category, index) => (
            <div key={category.id}>
              {index > 0 && <Divider inset={51} />}
              <button
                type="button"
                disabled={blocked}
                onMouseDown={keepFocus}
                onClick={() => setPicked(category)}
                className="flex w-full items-center gap-[13px] py-[9px] text-left disabled:opacity-40"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                <CategoryGlyph
                  glyph={category.glyph}
                  color={category.color}
                  size={38}
                  dashed={category.kind === 'transfer'}
                  selected={picked?.id === category.id}
                />
                <span className="min-w-0 flex-1 truncate text-[15px] font-medium">
                  {category.name}
                </span>
                <span className="tnum flex-none text-[12px] text-ink-dim">
                  {usage.data?.[category.id] ?? 0}
                </span>
              </button>
            </div>
          ))}
        </div>

        {shown.length === 0 && (
          <p className="pt-6 text-center text-[12.5px] text-ink-muted">
            {query.trim()
              ? `No categories match “${query}”.`
              : 'Nothing in this kind yet.'}
          </p>
        )}
      </div>

      {/* Over a fade to the drawer's own surface, so the list runs under it
          rather than stopping at a hard edge. */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 px-4 pt-8 pb-4"
        style={{
          background:
            'linear-gradient(to bottom, transparent, var(--color-card) 45%, var(--color-card))',
        }}
      >
        <Button
          className="pointer-events-auto"
          disabled={!picked || blocked}
          onClick={() => picked && onPick(picked)}
        >
          {picked ? `Use ${picked.name}` : 'Pick a category'}
        </Button>
      </div>
    </Sheet>
  )
}
