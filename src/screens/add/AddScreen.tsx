import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { useGoBack } from '@/app/useGoBack'
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpDown,
  Calendar,
  ChevronRight,
  Pencil,
  Tag,
  Wallet,
  X,
} from 'lucide-react'
import { FullScreen } from '@/app/AppShell'
import { CategoryGlyph } from '@/components/CategoryGlyph'
import { CategorySheet } from './CategorySheet'
import { DateSheet } from './DateSheet'
import {
  applyKey,
  EMPTY_ENTRY,
  entryDisplay,
  entryFrom,
  entryTape,
  entryValue,
  Keypad,
} from './Keypad'
import {
  useAddTransaction,
  useCategories,
  useCreateTransfer,
  useLastUsedWallet,
  useTags,
  useTransaction,
  useTransactionTags,
  useUpdateTransaction,
  useWalletCategoryIds,
  useWallets,
} from '@/data/queries'
import { asMinor, currencySymbol, parseAmount } from '@/lib/money'
import { addDays, relativeDayLabel, today } from '@/lib/dates'
import { activeWallets, isArchived } from '@/lib/wallets'
import { categoryVar } from '@/theme/tokens'
import type { Category } from '@/lib/db'

/**
 * Entry form, in both directions: `/add` starts empty, `/tx/:id/edit` starts
 * from an existing row.
 *
 * One component rather than two, because every field is the same field — the
 * only real differences are where the initial values come from and whether
 * saving appends or overwrites. A separate edit screen would be this file with
 * the mutation swapped, and would drift.
 */
export function AddScreen() {
  const { id: editId } = useParams()
  const editing = Boolean(editId)

  const goBack = useGoBack()
  const wallets = useWallets()
  const categories = useCategories()
  const tags = useTags()
  const add = useAddTransaction()
  const transfer = useCreateTransfer()
  const update = useUpdateTransaction()
  const existing = useTransaction(editId)
  const existingTags = useTransactionTags(editId)
  const lastWallet = useLastUsedWallet()

  const [entry, setEntry] = useState(EMPTY_ENTRY)
  const [negative, setNegative] = useState(true)
  const [category, setCategory] = useState<Category | null>(null)
  const [walletId, setWalletId] = useState('')
  // Transfers only: where the money lands. `walletId` is the source.
  const [targetWalletId, setTargetWalletId] = useState('')
  // Transfers across currencies only, where the two legs are independent
  // amounts. Plain text rather than a second keypad — see the field below.
  const [targetAmount, setTargetAmount] = useState('')
  const [date, setDate] = useState(today())
  const [note, setNote] = useState('')
  const [tagIds, setTagIds] = useState<string[]>([])

  // Adding, the picker opens on entry: the first decision is what the money
  // went on. Editing, everything is already chosen.
  const [catOpen, setCatOpen] = useState(!editing)
  const [dateOpen, setDateOpen] = useState(false)
  const [savedCount, setSavedCount] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // Filled from the row once, on the render where every piece of it has
  // arrived; after that the form owns its own state and a refetch must not
  // reach in and undo what has been typed.
  const [hydrated, setHydrated] = useState(!editing)
  const row = existing.data

  useEffect(() => {
    if (hydrated || !row || !existingTags.data || !categories.data) return
    setEntry(entryFrom(asMinor(row.amount)))
    setNegative(row.amount < 0)
    setCategory(categories.data.find((c) => c.id === row.category_id) ?? null)
    setWalletId(row.wallet_id)
    setDate(row.date)
    setNote(row.note ?? '')
    setTagIds(existingTags.data)
    setHydrated(true)
  }, [hydrated, row, existingTags.data, categories.data])

  useEffect(() => {
    // Editing already has a wallet; defaulting before hydration would only
    // flash the wrong name.
    if (editing || walletId || !wallets.data?.length) return
    // Wait for the answer rather than showing the first wallet and swapping it
    // out a moment later — a select that changes under the thumb is worse than
    // one that arrives a beat late. An error settles the query too, and falls
    // through to the same fallback as a first-ever entry.
    if (lastWallet.isPending) return

    // `?? null` also covers the error case, where the query settles with no data.
    const last = lastWallet.data ?? null
    // A wallet can be deleted out from under the answer; fall back rather than
    // setting the select to an id it has no option for.
    // An archived wallet must not become the default, even if it was genuinely
    // the last one used before it was closed.
    const open = activeWallets(wallets.data)
    if (!open.length) return
    const known = last !== null && open.some((w) => w.id === last)
    setWalletId(known ? last : open[0]!.id)
  }, [editing, wallets.data, walletId, lastWallet.isPending, lastWallet.data])

  /**
   * The category's kind is what puts the form in transfer mode.
   *
   * Not a separate toggle: "moving money between my own wallets" is already one
   * of the three kinds a category has, and a mode switch beside the picker would
   * be a second way to say the same thing that could disagree with it.
   *
   * Declared here, above the handlers and the effect that read it — a `const` in
   * the same scope is in its temporal dead zone until this line, and a
   * dependency array is evaluated during render, not after it.
   */
  const isTransfer = category?.kind === 'transfer'

  /**
   * Wallets this form may point at: the open ones, plus whichever the row being
   * edited already uses.
   *
   * That second half matters — a wallet can be archived after a transaction was
   * recorded in it, and dropping it from the options would silently reset the
   * select to a different wallet and move the row on save.
   */
  const selectable = useMemo(() => {
    const all = wallets.data ?? []
    const open = activeWallets(all)
    const current = all.find((w) => w.id === walletId)
    return current && isArchived(current) ? [...open, current] : open
  }, [wallets.data, walletId])

  /**
   * The two wallets can never be the same, and the way that is kept true is by
   * **swapping rather than refusing**.
   *
   * Picking the other side's wallet is not a mistake — it is almost always "I
   * had these the wrong way round". Disabling the matching option would leave
   * the user to undo their own selection first; swapping does what they meant,
   * and cannot produce an invalid pair because the two were already different.
   */
  const pickSource = (next: string) => {
    if (next === targetWalletId) setTargetWalletId(walletId)
    setWalletId(next)
  }

  const pickTarget = (next: string) => {
    if (next === walletId) setWalletId(targetWalletId)
    setTargetWalletId(next)
  }

  // Seed the far side the moment the form becomes a transfer, so the pair starts
  // valid rather than starting empty and failing on Save.
  useEffect(() => {
    if (!isTransfer) return
    // Open wallets only: a transfer must land somewhere you can still use.
    const list = activeWallets(wallets.data ?? [])
    if (targetWalletId && targetWalletId !== walletId) return
    const other = list.find((w) => w.id !== walletId)
    if (other) setTargetWalletId(other.id)
  }, [isTransfer, wallets.data, walletId, targetWalletId])

  const walletCategoryIds = useWalletCategoryIds(walletId || undefined)

  /**
   * What the picker offers, for the wallet currently selected.
   *
   * An empty set means the wallet has no opinion, so everything shows in name
   * order — the behaviour before per-wallet sets existed. A non-empty one both
   * filters and sorts: the array from the database *is* the order, and the
   * sheet preserves whatever order it is handed.
   *
   * The category already on the transaction is kept regardless. It is legal —
   * the database accepts any category on any wallet, the set is only a picker
   * filter — and dropping it would mean opening the picker while editing and
   * not finding the choice the row currently has.
   */
  const pickable = useMemo(() => {
    const all = categories.data ?? []
    const ids = walletCategoryIds.data
    if (!ids?.length) return all

    const rank = new Map(ids.map((id, i) => [id, i]))
    const offered = all
      .filter((c) => rank.has(c.id))
      .sort((a, b) => rank.get(a.id)! - rank.get(b.id)!)

    return category && !rank.has(category.id) ? [...offered, category] : offered
  }, [categories.data, walletCategoryIds.data, category])

  const sourceWallet = (wallets.data ?? []).find((w) => w.id === walletId)
  const targetWallet = (wallets.data ?? []).find((w) => w.id === targetWalletId)
  // Invariant 7: legs may differ only when the wallets hold different
  // currencies. Every wallet is PLN today, so this is a guard against a future
  // one rather than a path that fires.
  const crossCurrency =
    isTransfer &&
    Boolean(sourceWallet && targetWallet) &&
    sourceWallet!.currency !== targetWallet!.currency

  const signColor = negative ? 'var(--color-expense)' : 'var(--color-income)'
  // The pad's running total, with anything half-typed folded in. It is what the
  // big figure shows, so what is on screen is always what Save would store.
  const parsed = entryValue(entry)
  const figure = entryDisplay(entry)
  const tape = entryTape(entry)

  const parsedTarget = targetAmount.trim() === '' ? null : parseAmount(targetAmount)
  const targetAmountBad =
    crossCurrency && (parsedTarget === null || parsedTarget <= 0)

  const canSave =
    parsed !== null &&
    parsed !== 0 &&
    Boolean(category) &&
    Boolean(walletId) &&
    // The RPC raises on both of these; checking them here is what keeps Save
    // from being an invitation to read a Postgres error message.
    (!isTransfer || (Boolean(targetWalletId) && targetWalletId !== walletId)) &&
    !targetAmountBad

  const busy = add.isPending || update.isPending || transfer.isPending

  const save = async (again: boolean) => {
    if (!canSave || !category) return
    setError(null)
    const fields = {
      wallet_id: walletId,
      category_id: category.id,
      amount: (negative ? -Math.abs(parsed!) : Math.abs(parsed!)) as typeof parsed,
      date,
      note: note.trim() || null,
      tag_ids: tagIds,
    }

    try {
      if (editing) {
        await update.mutateAsync({ ...fields, id: editId! })
        goBack()
        return
      }

      if (isTransfer) {
        const magnitude = Math.abs(parsed!)
        await transfer.mutateAsync({
          source_wallet_id: walletId,
          target_wallet_id: targetWalletId,
          source_amount: asMinor(magnitude),
          // Same currency means the legs must balance, and the function raises
          // if they do not — so the one figure is sent twice rather than asking
          // for it twice.
          target_amount: asMinor(crossCurrency ? parsedTarget! : magnitude),
          date,
          category_id: category.id,
          note: note.trim() || null,
        })
      } else {
        await add.mutateAsync(fields)
      }

      if (!again) {
        goBack()
        return
      }
      // Chained entry: keep wallet and date, drop what is specific to the item
      // just saved, and reopen the picker for the next one.
      setSavedCount((n) => n + 1)
      setEntry(EMPTY_ENTRY)
      setTargetAmount('')
      setNote('')
      setTagIds([])
      setCategory(null)
      setCatOpen(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
    }
  }

  if (editing && !hydrated) {
    return (
      <FullScreen>
        <p className="px-5 py-10 text-[13px] text-ink-muted">
          {existing.error ? 'Could not load this transaction.' : 'Loading…'}
        </p>
      </FullScreen>
    )
  }

  // A transfer is two rows that have to stay in step; changing one leg's wallet
  // or amount from here would quietly unbalance the pair. The detail screen
  // does not offer the pencil for one, so this is only reachable by URL.
  if (editing && row?.transfer_id) {
    return (
      <FullScreen>
        <div className="px-5 py-10">
          <p className="text-[13px] leading-[1.55] text-ink-muted">
            Transfers are edited as a pair, and that flow does not exist yet.
            Delete this one and enter it again.
          </p>
          <button
            onClick={goBack}
            className="mt-4 rounded-[4px] px-4 py-2 text-[13.5px] text-ink-muted"
            style={{ border: '1px solid var(--color-line)' }}
          >
            Back
          </button>
        </div>
      </FullScreen>
    )
  }

  return (
    <FullScreen>
      {/* The chosen category owns the accent for this whole screen; gold until
          something is picked.

          This overrides --color-accent, not --c-accent: a custom property's
          var() references resolve against the element that *declares* it, so
          redefining --c-accent here would never reach --color-accent up on
          :root. Overriding the token itself is what actually cascades. */}
      <div
        className="flex h-full flex-col"
        style={
          category
            ? ({ '--color-accent': categoryVar(category.color) } as React.CSSProperties)
            : undefined
        }
      >
        <header className="flex flex-none items-center gap-3 px-5 pt-3 pb-3">
          <button onClick={goBack} aria-label="Close" className="text-ink-muted">
            <X size={22} strokeWidth={1.5} />
          </button>
          <div className="flex-1 text-center font-sans text-[14px] text-ink-muted">
            {editing ? 'Edit transaction' : 'Add transaction'}
          </div>
          <span className="w-[22px]" />
        </header>

        <div className="no-scrollbar flex-1 overflow-y-auto px-5">
          {/* The working behind the figure below. Its height is reserved even
              when empty, so starting a sum does not shove the amount down the
              screen, and it is clipped rather than wrapped — an unusually long
              tape loses its left end, which is the part already folded in. */}
          <div className="tnum h-4 overflow-hidden pr-6 text-right font-sans text-[12px] whitespace-nowrap text-ink-faint">
            {tape}
          </div>
          <div
            className="flex items-end gap-2.5 pb-2.5"
            style={{ borderBottom: '1px solid var(--color-line)' }}
          >
            {/* A transfer has no sign to choose: direction is which wallet is
                which, and `create_transfer` applies the signs itself. */}
            {isTransfer ? (
              <span
                className="flex size-9 flex-none items-center justify-center rounded-[4px] text-ink-muted"
                style={{ border: '1px dashed var(--color-line)' }}
              >
                <ArrowLeftRight size={16} strokeWidth={1.5} />
              </span>
            ) : (
              <button
                onClick={() => setNegative((s) => !s)}
                aria-label={negative ? 'Expense' : 'Income'}
                className="tnum flex size-9 flex-none items-center justify-center rounded-[4px] text-[19px]"
                style={{ border: '1px solid var(--color-line)', color: signColor }}
              >
                {negative ? '−' : '+'}
              </button>
            )}
            <div
              className="tnum flex-1 text-right"
              style={{
                fontSize: 42,
                lineHeight: 1,
                letterSpacing: '-.02em',
                color: figure === null ? undefined : signColor,
                opacity: figure === null ? 0.3 : 1,
              }}
            >
              {figure ?? '0,00'}
            </div>
            <span className="pb-1.5 font-sans text-[14px] text-ink-faint">zł</span>
          </div>

          <button
            onClick={() => setCatOpen(true)}
            className="flex w-full items-center gap-3 py-3.5 text-left"
            style={{ borderBottom: '1px solid var(--color-line-soft)' }}
          >
            {category ? (
              <CategoryGlyph glyph={category.glyph} color={category.color} />
            ) : (
              <span
                className="size-[34px] flex-none rounded-full"
                style={{ border: '1px solid var(--color-line)' }}
              />
            )}
            <span
              className="flex-1 text-[15px]"
              style={{ color: category ? 'var(--color-accent)' : 'var(--color-ink-dim)' }}
            >
              {category?.name ?? 'Choose a category'}
            </span>
            <ChevronRight size={18} strokeWidth={1.5} className="text-ink-dim" />
          </button>

          <div
            className="flex items-center gap-3 py-3.5"
            style={{ borderBottom: '1px solid var(--color-line-soft)' }}
          >
            <Wallet size={18} strokeWidth={1.5} className="w-[34px] flex-none text-ink-faint" />
            {isTransfer && (
              <span className="font-sans text-[11.5px] text-ink-faint">From</span>
            )}
            <select
              value={walletId}
              onChange={(e) => pickSource(e.target.value)}
              className="flex-1 bg-transparent text-[15px] outline-none"
            >
              {selectable.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>

          {isTransfer && (
            <div
              className="flex items-center gap-3 py-3.5"
              style={{ borderBottom: '1px solid var(--color-line-soft)' }}
            >
              <ArrowDownToLine
                size={18}
                strokeWidth={1.5}
                className="w-[34px] flex-none text-ink-faint"
              />
              <span className="font-sans text-[11.5px] text-ink-faint">To</span>
              <select
                value={targetWalletId}
                onChange={(e) => pickTarget(e.target.value)}
                className="flex-1 bg-transparent text-[15px] outline-none"
              >
                {selectable.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
              {/* Swapping is the common correction, and it cannot produce an
                  invalid pair — the two are already different. */}
              <button
                onClick={() => {
                  setWalletId(targetWalletId)
                  setTargetWalletId(walletId)
                }}
                aria-label="Swap wallets"
                className="flex-none rounded-[3px] px-2 py-1.5 text-ink-muted"
                style={{ border: '1px solid var(--color-line)' }}
              >
                <ArrowUpDown size={15} strokeWidth={1.5} />
              </button>
            </div>
          )}

          {crossCurrency && (
            <div
              className="flex items-center gap-3 py-3.5"
              style={{ borderBottom: '1px solid var(--color-line-soft)' }}
            >
              <span className="w-[34px] flex-none" />
              <span className="flex-1 text-[13.5px]">
                Amount received
                <span className="block pt-0.5 font-sans text-[11px] leading-[1.4] text-ink-faint">
                  {sourceWallet!.currency} → {targetWallet!.currency}, so each leg
                  carries its own figure
                </span>
              </span>
              <input
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
                inputMode="decimal"
                placeholder="0,00"
                aria-label="Amount received"
                className="tnum w-28 bg-transparent text-right text-[17px] outline-none placeholder:text-ink-dim"
                style={{
                  color: targetAmountBad ? 'var(--color-expense)' : undefined,
                }}
              />
              <span className="font-sans text-[12px] text-ink-faint">
                {currencySymbol(targetWallet!.currency)}
              </span>
            </div>
          )}

          <div
            className="flex items-center gap-3 py-3.5"
            style={{ borderBottom: '1px solid var(--color-line-soft)' }}
          >
            <Calendar size={18} strokeWidth={1.5} className="w-[34px] flex-none text-ink-faint" />
            <button onClick={() => setDateOpen(true)} className="flex-1 text-left text-[15px]">
              {relativeDayLabel(date)}
            </button>
            <button
              onClick={() => setDate(addDays(today(), -1))}
              className="rounded-[3px] px-2.5 py-[5px] font-sans text-[11.5px] text-ink-muted"
              style={{ border: '1px dashed var(--color-ink-dim)' }}
            >
              Yesterday
            </button>
          </div>

          <div
            className="flex items-center gap-3 py-3.5"
            style={{ borderBottom: '1px solid var(--color-line-soft)' }}
          >
            <Pencil size={18} strokeWidth={1.5} className="w-[34px] flex-none text-ink-faint" />
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Write a note"
              className="flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-dim"
            />
          </div>

          {/* Tags are off for transfers: `create_transfer` returns the pair's id
              rather than the two rows', so there is nothing to attach them to
              without a second lookup and a choice of which leg wears them. */}
          {!isTransfer && (tags.data ?? []).length > 0 && (
            <div className="flex items-center gap-3 py-3.5">
              <Tag size={18} strokeWidth={1.5} className="w-[34px] flex-none text-ink-faint" />
              <div className="no-scrollbar flex flex-1 gap-[7px] overflow-x-auto">
                {(tags.data ?? []).map((tag) => {
                  const on = tagIds.includes(tag.id)
                  return (
                    <button
                      key={tag.id}
                      onClick={() =>
                        setTagIds((ids) =>
                          ids.includes(tag.id)
                            ? ids.filter((i) => i !== tag.id)
                            : [...ids, tag.id],
                        )
                      }
                      className="flex-none rounded-[3px] px-2.5 py-1.5 font-sans text-[11.5px]"
                      style={{
                        border: `1px solid ${on ? 'var(--color-accent)' : 'var(--color-line)'}`,
                        color: on ? 'var(--color-accent)' : 'var(--color-ink-muted)',
                      }}
                    >
                      {tag.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {error && <p className="py-2 text-[12.5px] text-expense">{error}</p>}
          {savedCount > 0 && !error && (
            <p className="py-2 text-[12.5px] text-ink-muted">
              Saved {savedCount} — wallet and date kept
            </p>
          )}
        </div>

        <div
          className="flex-none px-5 pt-2.5"
          style={{
            borderTop: '1px solid var(--color-line-soft)',
            paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
          }}
        >
          {/* Functional update: a captured entry drops digits on fast taps. */}
          <Keypad op={entry.op} onKey={(key) => setEntry((s) => applyKey(s, key))} />

          <div className="mt-2.5 flex gap-2">
            {/* Chained entry is an adding idea; there is no second row to edit. */}
            {!editing && (
              <button
                disabled={!canSave || busy}
                onClick={() => save(true)}
                className="flex-1 rounded-[4px] py-2.5 text-[13.5px] disabled:opacity-40"
                style={{ border: '1px solid var(--color-line)', color: 'var(--color-ink-muted)' }}
              >
                Save &amp; add another
              </button>
            )}
            <button
              disabled={!canSave || busy}
              onClick={() => save(false)}
              className="flex-1 rounded-[4px] py-2.5 text-[13.5px] text-accent disabled:opacity-40"
              style={{ border: '1px solid var(--color-accent)' }}
            >
              {busy ? 'Saving…' : editing ? 'Save changes' : 'Save'}
            </button>
          </div>
        </div>

        <CategorySheet
          open={catOpen}
          onClose={() => setCatOpen(false)}
          categories={pickable}
          allowTransfer={!editing}
          onPick={(picked) => {
            setCategory(picked)
            setNegative(picked.kind !== 'income')
            setCatOpen(false)
          }}
        />
        <DateSheet
          open={dateOpen}
          onClose={() => setDateOpen(false)}
          value={date}
          onPick={setDate}
        />
      </div>
    </FullScreen>
  )
}
