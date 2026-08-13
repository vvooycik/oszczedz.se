import { useEffect, useMemo, useRef, useState } from 'react'
import { IconCheck, IconGripVertical, IconSearch } from '@tabler/icons-react'
import { FullScreen } from '@/app/AppShell'
import { CategoryGlyph } from '@/components/CategoryGlyph'
import { Card, Divider } from '@/components/ui/Card'
import { Label } from '@/components/ui/Label'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { useSetWalletCategories, useWalletCategoryIds } from '@/data/queries'
import { keepFocus } from '@/lib/touch'
import { reorder, useDragOrder } from './useDragOrder'
import type { Category, CategoryKind } from '@/lib/db'

const KIND_RANK: Record<CategoryKind, number> = { expense: 0, income: 1, transfer: 2 }
const KIND_LABEL: Record<CategoryKind, string> = {
  expense: 'Expense',
  income: 'Income',
  transfer: 'Transfer',
}

/**
 * Every chosen row is this tall, and `useDragOrder` needs the number to turn a
 * finger's travel into a target index without measuring anything mid-gesture.
 * 36px tile + 13px padding top and bottom + the 1px divider.
 */
const ROW_HEIGHT = 63

function CategoryRow({
  category,
  selected,
  onToggle,
}: {
  category: Category
  selected: boolean
  onToggle: () => void
}) {
  return (
    <>
      <CategoryGlyph
        glyph={category.glyph}
        color={category.color}
        size={36}
        dashed={category.kind === 'transfer'}
      />
      <span className="min-w-0 flex-1 truncate text-[15px] font-medium">
        {category.name}
      </span>
      {/* Expense is the default and goes unlabelled; the other two are worth
          calling out, because a picker tab is what usually tells them apart and
          this list has no tabs. */}
      {category.kind !== 'expense' && (
        <span className="flex-none text-[11px] text-ink-dim">
          {KIND_LABEL[category.kind]}
        </span>
      )}
      <button
        type="button"
        aria-label={`${selected ? 'Remove' : 'Add'} ${category.name}`}
        aria-pressed={selected}
        onMouseDown={keepFocus}
        onClick={onToggle}
        className="relative flex size-[22px] flex-none items-center justify-center rounded-[7px] after:absolute after:-inset-[11px] after:content-['']"
        style={
          selected
            ? { background: 'var(--color-accent)', color: 'var(--color-accent-fg)' }
            : { border: '1.5px solid var(--color-ink-dim)' }
        }
      >
        {selected && <IconCheck size={14} stroke={2.5} />}
      </button>
    </>
  )
}

/**
 * Picks and orders the categories one wallet offers.
 *
 * A single top-down list rather than the four-column grid the add screen draws:
 * the grid is for choosing one of a few at a glance, and this is for arranging
 * fifty-nine. Chosen categories float to the top in their own order, and
 * everything else sits below in a searchable pile — so the list is both the
 * membership and the order, with no separate mode to switch into.
 *
 * A full-screen route rather than a bottom sheet. That is what makes the drag
 * affordable: inside a sheet the vertical axis was already claimed twice over,
 * by the sheet's own scroll and by its drag-to-dismiss.
 */
export function WalletCategoriesSheet({
  onClose,
  categories,
  selected,
  onChange,
  onDone,
  walletName,
  busy = false,
  loading = false,
  error = null,
  overlay = false,
}: {
  onClose: () => void
  categories: Category[]
  /** Ordered category ids. The array *is* the order. */
  selected: string[]
  onChange: (next: string[]) => void
  onDone: () => void
  walletName: string
  busy?: boolean
  /** The set is still being fetched; there is nothing meaningful to save yet. */
  loading?: boolean
  error?: string | null
  /** Presented over the screen that opened it, rather than replacing it. */
  overlay?: boolean
}) {
  const [query, setQuery] = useState('')
  const scroller = useRef<HTMLDivElement>(null)

  const byId = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])

  // An id can outlive its category — deleted from settings while this wallet
  // still lists it. Dropping it here keeps the list rendering; the row is
  // already gone from the database by cascade.
  const chosen = useMemo(
    () => selected.map((id) => byId.get(id)).filter((c): c is Category => Boolean(c)),
    [selected, byId],
  )

  const rest = useMemo(() => {
    const q = query.trim().toLowerCase()
    return categories
      .filter((c) => !selected.includes(c.id))
      .filter((c) => (q ? c.name.toLowerCase().includes(q) : true))
      .sort(
        (a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind] || a.name.localeCompare(b.name),
      )
  }, [categories, selected, query])

  const { drag, handleProps, shiftFor } = useDragOrder({
    count: chosen.length,
    rowHeight: ROW_HEIGHT,
    scroller,
    onDrop: (from, to) => onChange(reorder(selected, from, to)),
  })

  return (
    <FullScreen overlay={overlay}>
      <ScreenHeader
        title="Categories"
        onClose={onClose}
        actions={
          <button
            type="button"
            onClick={onDone}
            disabled={busy || loading}
            className="px-1 text-[14px] font-semibold text-accent disabled:opacity-40"
          >
            {busy ? 'Saving…' : 'Done'}
          </button>
        }
      />

      {error && (
        <p className="flex-none px-4 pt-2 text-center text-[12.5px] text-expense">
          {error}
        </p>
      )}

      <div
        ref={scroller}
        className="no-scrollbar flex flex-1 flex-col gap-[14px] overflow-y-auto px-4 pt-2 pb-10"
      >
        <p className="px-1 text-[12.5px] leading-[1.5] text-ink-muted">
          {selected.length === 0 ? (
            <>
              Nothing chosen, so {walletName || 'this wallet'} offers every category,
              by name. Pick a few and the picker shows only those, in the order you
              set here.
            </>
          ) : (
            <>
              The picker shows these {selected.length}, in this order. Anything
              already recorded against another category keeps it — this only decides
              what is offered.
            </>
          )}
        </p>

        {chosen.length > 0 && (
          <section className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between px-1">
              <Label>In this wallet · drag to order</Label>
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-[12.5px] font-semibold text-accent"
              >
                Clear
              </button>
            </div>
            <Card>
              {chosen.map((category, index) => {
                const lifted = drag?.from === index
                return (
                  <div
                    key={category.id}
                    // The carried row rides above the others and keeps its
                    // shadow; the rest slide with a transition so the gap opens
                    // rather than snapping.
                    style={{
                      transform: `translateY(${shiftFor(index)}px)`,
                      transition: lifted ? 'none' : 'transform 120ms ease-out',
                      position: 'relative',
                      zIndex: lifted ? 2 : 1,
                      background: lifted ? 'var(--color-inset)' : undefined,
                      boxShadow: lifted ? 'var(--shadow-drag)' : undefined,
                      borderRadius: lifted ? 12 : undefined,
                    }}
                  >
                    {index > 0 && <Divider inset={64} />}
                    <div className="flex items-center gap-[10px] px-4 py-[13px]">
                      <span
                        {...handleProps(index)}
                        aria-label={`Reorder ${category.name}`}
                        className="-my-3 flex flex-none cursor-grab items-center py-3 text-ink-dim active:cursor-grabbing"
                      >
                        <IconGripVertical size={18} stroke={2} />
                      </span>
                      <CategoryRow
                        category={category}
                        selected
                        onToggle={() =>
                          onChange(selected.filter((id) => id !== category.id))
                        }
                      />
                    </div>
                  </div>
                )
              })}
            </Card>
          </section>
        )}

        <section className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between px-1">
            <Label>{chosen.length > 0 ? 'Everything else' : 'All categories'}</Label>
            {rest.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([...selected, ...rest.map((c) => c.id)])}
                className="text-[12.5px] font-semibold text-accent"
              >
                Select all
              </button>
            )}
          </div>

          <label className="flex h-11 flex-none items-center gap-2 rounded-full bg-inset px-4">
            <IconSearch size={18} stroke={2} className="flex-none text-ink-dim" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${rest.length} categories`}
              inputMode="search"
              enterKeyHint="search"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="w-full bg-transparent text-[16px] outline-none placeholder:text-ink-faint"
            />
          </label>

          {rest.length > 0 ? (
            <Card>
              {rest.map((category, index) => (
                <div key={category.id}>
                  {index > 0 && <Divider inset={64} />}
                  <div className="flex items-center gap-[10px] px-4 py-[13px]">
                    {/* A spacer where the grip sits on a chosen row, so the two
                        lists line up and a row does not jump sideways the moment
                        it is picked. */}
                    <span className="w-[18px] flex-none" />
                    <CategoryRow
                      category={category}
                      selected={false}
                      // Appended, not inserted: a category added last is the one
                      // you just thought of, and it can be dragged up from there.
                      onToggle={() => onChange([...selected, category.id])}
                    />
                  </div>
                </div>
              ))}
            </Card>
          ) : (
            <p className="px-1 pt-1 text-[12.5px] text-ink-muted">
              {query.trim()
                ? `No categories match “${query}”.`
                : 'Every category is in this wallet.'}
            </p>
          )}
        </section>

        {loading && (
          <p className="px-1 text-[12.5px] text-ink-muted">Loading this wallet’s set…</p>
        )}
      </div>
    </FullScreen>
  )
}

/**
 * The same screen, wired to a wallet that already exists: it loads that wallet's
 * set on open and writes it on Done.
 *
 * Kept apart from the screen itself so the create flow can use it with nothing
 * to load and nothing to save — a wallet with no id yet has no rows to write,
 * and its set has to ride along with the insert.
 */
export function WalletCategoriesEditor({
  walletId,
  walletName,
  categories,
  onClose,
}: {
  walletId: string
  walletName: string
  categories: Category[]
  onClose: () => void
}) {
  const stored = useWalletCategoryIds(walletId)
  const save = useSetWalletCategories()

  const [selected, setSelected] = useState<string[]>([])
  // Seeded once, on the render where the set has arrived. After that the screen
  // owns it, so a background refetch cannot undo an arrangement in progress.
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    if (hydrated || !stored.data) return
    setSelected(stored.data)
    setHydrated(true)
  }, [hydrated, stored.data])

  return (
    <WalletCategoriesSheet
      onClose={onClose}
      categories={categories}
      selected={selected}
      onChange={setSelected}
      walletName={walletName}
      busy={save.isPending}
      loading={!hydrated}
      error={
        save.error instanceof Error
          ? save.error.message
          : stored.error
            ? 'Could not load this wallet’s categories.'
            : null
      }
      overlay
      onDone={() => {
        save.mutate({ walletId, categoryIds: selected }, { onSuccess: onClose })
      }}
    />
  )
}
