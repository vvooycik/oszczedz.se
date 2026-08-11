import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Minus, Plus, Search } from 'lucide-react'
import { Sheet } from '@/components/Sheet'
import { CategoryGlyph } from '@/components/CategoryGlyph'
import { useSetWalletCategories, useWalletCategoryIds } from '@/data/queries'
import { keepFocus } from '@/lib/touch'
import type { Category, CategoryKind } from '@/lib/db'

const KIND_RANK: Record<CategoryKind, number> = {
  expense: 0,
  income: 1,
  transfer: 2,
}

const KIND_LABEL: Record<CategoryKind, string> = {
  expense: 'Expense',
  income: 'Income',
  transfer: 'Transfer',
}

function Row({
  category,
  children,
}: {
  category: Category
  children: React.ReactNode
}) {
  return (
    <div
      className="flex items-center gap-3 py-2.5"
      style={{ borderBottom: '1px solid var(--color-line-soft)' }}
    >
      <CategoryGlyph
        glyph={category.glyph}
        color={category.color}
        size={28}
        dashed={category.kind === 'transfer'}
      />
      <span className="min-w-0 flex-1 truncate text-[14px]">{category.name}</span>
      {/* Expense is the default and goes unlabelled; the other two are worth
          calling out, because a picker tab is what usually tells them apart and
          this list has no tabs. */}
      {category.kind !== 'expense' && (
        <span className="flex-none font-sans text-[10.5px] text-ink-faint">
          {KIND_LABEL[category.kind]}
        </span>
      )}
      {children}
    </div>
  )
}

/** A square control sized for a thumb, not for the 14px text it sits beside. */
function IconButton({
  label,
  onClick,
  disabled,
  accent,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  accent?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      aria-label={label}
      disabled={disabled}
      onMouseDown={keepFocus}
      onClick={onClick}
      className="flex size-8 flex-none items-center justify-center rounded-[4px] disabled:opacity-25"
      style={{
        border: '1px solid var(--color-line)',
        color: accent ? 'var(--color-accent)' : 'var(--color-ink-muted)',
      }}
    >
      {children}
    </button>
  )
}

/**
 * Picks and orders the categories one wallet offers.
 *
 * A single top-down list rather than the four-column grid the add screen draws:
 * the grid is for choosing one of a few at a glance, and this is for arranging
 * fifty-nine. Selected categories float to the top in their own order, and
 * everything else sits below in a searchable pile — so the list is both the
 * membership and the order, with no separate mode to switch into.
 *
 * Order is moved with buttons, not dragged. A drag on iOS means owning pointer
 * capture, autoscroll and the gesture's fight with the sheet's own scrolling,
 * and a set that is realistically five to fifteen rows long does not repay
 * that; two taps move a row one place either way.
 */
export function WalletCategoriesSheet({
  open,
  onClose,
  categories,
  selected,
  onChange,
  onDone,
  walletName,
  busy = false,
  loading = false,
  error = null,
}: {
  open: boolean
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
}) {
  const [query, setQuery] = useState('')

  // What Cancel goes back to. The create screen keeps this state itself and the
  // sheet only closes, so without a snapshot its Cancel would be a second Done —
  // the edits are already in the parent by then.
  const [snapshot, setSnapshot] = useState<string[]>(selected)
  useEffect(() => {
    if (open) setSnapshot(selected)
    // Captured on the open transition only: re-running on every keystroke would
    // make the snapshot chase the edits it exists to undo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const byId = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  )

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
        (a, b) =>
          KIND_RANK[a.kind] - KIND_RANK[b.kind] || a.name.localeCompare(b.name),
      )
  }, [categories, selected, query])

  const move = (index: number, delta: -1 | 1) => {
    const next = [...selected]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target]!, next[index]!]
    onChange(next)
  }

  return (
    <Sheet open={open} onClose={onClose} height="82%" label={`Categories in ${walletName}`}>
      <div className="flex flex-none items-center px-5 pt-3.5">
        <button
          onClick={() => {
            onChange(snapshot)
            onClose()
          }}
          className="text-[13.5px] text-ink-muted"
        >
          Cancel
        </button>
        <span className="flex-1 text-center text-[13.5px]">Categories</span>
        <button
          onClick={onDone}
          disabled={busy || loading}
          className="text-[13.5px] text-accent disabled:opacity-40"
        >
          {busy ? 'Saving…' : 'Done'}
        </button>
      </div>

      {error && (
        <p className="flex-none px-5 pt-2 text-center text-[12px] text-expense">{error}</p>
      )}

      <div className="no-scrollbar flex-1 overflow-y-auto px-5 pt-3 pb-8">
        {loading && (
          <p className="pb-2 text-[12.5px] text-ink-muted">Loading this wallet’s set…</p>
        )}
        <p className="text-[11.5px] leading-[1.5] text-ink-muted">
          {selected.length === 0 ? (
            <>
              Nothing chosen, so {walletName || 'this wallet'} offers every
              category, by name. Pick a few and the picker shows only those, in
              the order you set here.
            </>
          ) : (
            <>
              The picker shows these {selected.length}, in this order. Anything
              already recorded against another category keeps it — this only
              decides what is offered.
            </>
          )}
        </p>

        {chosen.length > 0 && (
          <>
            <div className="kicker pt-5 pb-2 text-ink-muted">In this wallet</div>
            <div className="h-px" style={{ background: 'var(--color-line)' }} />
            {chosen.map((category, index) => (
              <Row key={category.id} category={category}>
                <IconButton
                  label={`Move ${category.name} up`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ChevronUp size={16} strokeWidth={1.5} />
                </IconButton>
                <IconButton
                  label={`Move ${category.name} down`}
                  disabled={index === chosen.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ChevronDown size={16} strokeWidth={1.5} />
                </IconButton>
                <IconButton
                  label={`Remove ${category.name}`}
                  onClick={() => onChange(selected.filter((id) => id !== category.id))}
                >
                  <Minus size={16} strokeWidth={1.5} />
                </IconButton>
              </Row>
            ))}
          </>
        )}

        <div className="kicker pt-5 pb-2 text-ink-muted">
          {chosen.length > 0 ? 'Everything else' : 'All categories'}
        </div>

        <label
          className="mb-1 flex items-center gap-2 rounded-[4px] px-3 py-2"
          style={{ border: '1px solid var(--color-line)' }}
        >
          <Search size={16} strokeWidth={1.5} className="flex-none text-ink-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${rest.length} categories`}
            inputMode="search"
            enterKeyHint="search"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="w-full bg-transparent font-sans text-[13px] outline-none placeholder:text-ink-dim"
          />
        </label>

        {rest.map((category) => (
          <Row key={category.id} category={category}>
            <IconButton
              label={`Add ${category.name}`}
              accent
              // Appended, not inserted: a category added last is the one you
              // just thought of, and it can be walked up from there.
              onClick={() => onChange([...selected, category.id])}
            >
              <Plus size={16} strokeWidth={1.5} />
            </IconButton>
          </Row>
        ))}

        {rest.length === 0 && (
          <p className="pt-4 text-[12.5px] text-ink-muted">
            {query.trim()
              ? `No categories match “${query}”.`
              : 'Every category is in this wallet.'}
          </p>
        )}
      </div>
    </Sheet>
  )
}

/**
 * The same sheet, wired to a wallet that already exists: it loads that wallet's
 * set on open and writes it on Done.
 *
 * Kept apart from the sheet itself so the create screen can use the sheet with
 * nothing to load and nothing to save — a wallet with no id yet has no rows to
 * write, and its set has to ride along with the insert.
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
  // Seeded once, on the render where the set has arrived. After that the sheet
  // owns it, so a background refetch cannot undo an arrangement in progress.
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    if (hydrated || !stored.data) return
    setSelected(stored.data)
    setHydrated(true)
  }, [hydrated, stored.data])

  return (
    <WalletCategoriesSheet
      open
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
      onDone={() => {
        save.mutate({ walletId, categoryIds: selected }, { onSuccess: onClose })
      }}
    />
  )
}
