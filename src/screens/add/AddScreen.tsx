import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { useGoBack } from '@/app/useGoBack'
import { useKeyboardInset } from '@/app/useKeyboardInset'
import { useTextFieldFocused } from '@/app/useTextFieldFocused'
import {
  IconArrowBarToDown,
  IconArrowsLeftRight,
  IconArrowsUpDown,
  IconCalendar,
  IconChevronRight,
  IconPencil,
  IconPlus,
  IconSelector,
  IconTag,
  IconWallet,
} from '@tabler/icons-react'
import { FullScreen } from '@/app/AppShell'
import { Button } from '@/components/ui/Button'
import { colourFieldStyle } from '@/components/ui/ColourField'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { Tile } from '@/components/ui/Tile'
import { useTheme } from '@/theme/ThemeProvider'
import { iconFor } from '@/lib/icons'
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
  const { resolvedMode } = useTheme()

  /**
   * The system keyboard and the calculator keypad must never be up together.
   *
   * Typing a note, a received amount, or a category search raises iOS's own
   * keyboard over the keypad — two keyboards fighting for the same 330px, with
   * Save buried under both.
   *
   * Two signals, and they are not interchangeable. **Focus decides whether the
   * keypad is drawn**, because it is what the app can be sure of. The visual
   * viewport was the first attempt and is the more principled answer in theory —
   * it knows where the keyboard actually is — but it did not reliably report one
   * in the installed standalone app, and the keypad stayed put.
   *
   * `useKeyboardInset` still earns its place: it is the only thing that can say
   * *how far up* to lift Save, and being wrong there costs a nudge rather than
   * the whole behaviour.
   */
  const typing = useTextFieldFocused()
  const keyboard = useKeyboardInset()
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
        <p className="px-4 py-10 text-[13px] text-ink-muted">
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
        <div className="px-4 py-10">
          <p className="text-[14px] leading-[1.55] text-ink-muted">
            Transfers are edited as a pair, and that flow does not exist yet.
            Delete this one and enter it again.
          </p>
          <Button variant="secondary" className="mt-4" onClick={goBack}>
            Back
          </Button>
        </div>
      </FullScreen>
    )
  }

  return (
    <FullScreen style={colourFieldStyle(category?.color, resolvedMode)}>
      {/* The chosen category owns the accent for this whole screen — the field
          behind it, the hero tile, the commit button — and gold until something
          is picked.

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
        <ScreenHeader
          onField
          onClose={goBack}
          title={editing ? 'Edit transaction' : 'Add transaction'}
        />

        <div className="no-scrollbar flex-1 overflow-y-auto px-4">
          {/* ------------------------------------------------------ the hero */}
          <div className="flex flex-col items-center pt-2 pb-5">
            <button
              type="button"
              onClick={() => setCatOpen(true)}
              aria-label="Choose a category"
              className="active:opacity-80"
            >
              {category ? (
                <Tile color={categoryVar(category.color)} size={64} variant="solid">
                  <Icon64 category={category} />
                </Tile>
              ) : (
                <span
                  className="flex size-16 items-center justify-center rounded-card"
                  style={{ border: '1.5px dashed var(--color-dash)' }}
                >
                  <IconPlus size={26} stroke={2} className="text-ink-dim" />
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setCatOpen(true)}
              className="mt-3 flex items-center gap-1 text-[15px] font-semibold"
              style={{ color: category ? 'var(--field-ink)' : 'var(--color-ink-dim)' }}
            >
              {category?.name ?? 'Choose a category'}
              <IconChevronRight size={16} stroke={2} className="opacity-50" />
            </button>

            {/* The working behind the figure. Its height is reserved even when
                empty, so starting a sum does not shove the amount down the
                screen, and it is clipped rather than wrapped — an unusually long
                tape loses its left end, which is the part already folded in. */}
            <div className="tnum mt-4 h-4 w-full overflow-hidden text-center text-[12.5px] whitespace-nowrap text-ink-muted">
              {tape}
            </div>

            <div
              className="tnum mt-1 flex items-end justify-center"
              style={{
                fontSize: 52,
                fontWeight: 600,
                lineHeight: 1,
                letterSpacing: '-.04em',
                color: figure === null ? 'var(--color-ink-dim)' : signColor,
              }}
            >
              {figure ?? '0,00'}
              <span
                className="text-ink-faint"
                style={{ fontSize: 22, fontWeight: 500, letterSpacing: 0 }}
              >
                &nbsp;{currencySymbol(sourceWallet?.currency ?? 'PLN')}
              </span>
            </div>

            {/* A transfer has no sign to choose: direction is which wallet is
                which, and `create_transfer` applies the signs itself. */}
            {isTransfer ? (
              <span className="mt-3 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium"
                style={{ background: 'var(--field-scrim)', color: 'var(--field-ink)' }}
              >
                <IconArrowsLeftRight size={14} stroke={2} />
                Transfer
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setNegative((s) => !s)}
                aria-label={negative ? 'Switch to income' : 'Switch to expense'}
                className="mt-3 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold"
                style={{
                  background: `color-mix(in oklab, ${signColor} 18%, transparent)`,
                  color: signColor,
                }}
              >
                {negative ? '−' : '+'} {negative ? 'Expense' : 'Income'}
              </button>
            )}
          </div>

          {/* --------------------------------------------------- the fields */}
          <div
            className="rounded-card"
            style={{ background: 'var(--field-block)' }}
          >
            <FieldRow icon={<IconWallet size={18} stroke={2} />}>
              {isTransfer && <span className="text-[12px] text-ink-muted">From</span>}
              <select
                value={walletId}
                onChange={(e) => pickSource(e.target.value)}
                className="flex-1 appearance-none bg-transparent text-[15px] outline-none"
                style={{ color: 'var(--field-ink)' }}
              >
                {selectable.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
              <IconSelector size={17} stroke={2} className="flex-none text-ink-dim" />
            </FieldRow>

            {isTransfer && (
              <>
                <FieldDivider />
                <FieldRow icon={<IconArrowBarToDown size={18} stroke={2} />}>
                  <span className="text-[12px] text-ink-muted">To</span>
                  <select
                    value={targetWalletId}
                    onChange={(e) => pickTarget(e.target.value)}
                    className="flex-1 appearance-none bg-transparent text-[15px] outline-none"
                    style={{ color: 'var(--field-ink)' }}
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
                    type="button"
                    onClick={() => {
                      setWalletId(targetWalletId)
                      setTargetWalletId(walletId)
                    }}
                    aria-label="Swap wallets"
                    className="flex size-8 flex-none items-center justify-center rounded-[10px]"
                    style={{ background: 'var(--field-scrim)', color: 'var(--field-ink)' }}
                  >
                    <IconArrowsUpDown size={15} stroke={2} />
                  </button>
                </FieldRow>
              </>
            )}

            {crossCurrency && (
              <>
                <FieldDivider />
                <FieldRow icon={null}>
                  <span className="flex-1 text-[13.5px]">
                    Amount received
                    <span className="block pt-0.5 text-[11.5px] leading-[1.4] text-ink-muted">
                      {sourceWallet!.currency} → {targetWallet!.currency}, so each
                      leg carries its own figure
                    </span>
                  </span>
                  <input
                    value={targetAmount}
                    onChange={(e) => setTargetAmount(e.target.value)}
                    inputMode="decimal"
                    placeholder="0,00"
                    aria-label="Amount received"
                    className="tnum w-24 bg-transparent text-right text-[16px] font-semibold outline-none placeholder:text-ink-faint"
                    style={{
                      color: targetAmountBad ? 'var(--color-expense)' : 'var(--field-ink)',
                    }}
                  />
                  <span className="text-[12.5px] text-ink-faint">
                    {currencySymbol(targetWallet!.currency)}
                  </span>
                </FieldRow>
              </>
            )}

            <FieldDivider />
            <FieldRow icon={<IconCalendar size={18} stroke={2} />}>
              <button
                type="button"
                onClick={() => setDateOpen(true)}
                className="flex-1 text-left text-[15px]"
                style={{ color: 'var(--field-ink)' }}
              >
                {relativeDayLabel(date)}
              </button>
              <button
                type="button"
                onClick={() => setDate(addDays(today(), -1))}
                className="flex-none rounded-full px-3 py-1.5 text-[12px]"
                style={{ background: 'var(--field-scrim)', color: 'var(--field-ink)' }}
              >
                Yesterday
              </button>
            </FieldRow>

            <FieldDivider />
            <FieldRow icon={<IconPencil size={18} stroke={2} />}>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Write a note"
                className="flex-1 bg-transparent text-[16px] outline-none placeholder:text-ink-faint"
                style={{ color: 'var(--field-ink)' }}
              />
            </FieldRow>

            {/* Tags are off for transfers: `create_transfer` returns the pair's
                id rather than the two rows', so there is nothing to attach them
                to without a second lookup and a choice of which leg wears them. */}
            {!isTransfer && (tags.data ?? []).length > 0 && (
              <>
                <FieldDivider />
                <FieldRow icon={<IconTag size={18} stroke={2} />}>
                  <div className="no-scrollbar flex flex-1 gap-[7px] overflow-x-auto">
                    {(tags.data ?? []).map((tag) => {
                      const on = tagIds.includes(tag.id)
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() =>
                            setTagIds((ids) =>
                              ids.includes(tag.id)
                                ? ids.filter((i) => i !== tag.id)
                                : [...ids, tag.id],
                            )
                          }
                          className="flex-none rounded-full px-3 py-1.5 text-[12px]"
                          style={
                            on
                              ? {
                                  background: 'var(--color-accent)',
                                  color: 'var(--color-accent-fg)',
                                }
                              : {
                                  background: 'var(--field-scrim)',
                                  color: 'var(--field-ink)',
                                }
                          }
                        >
                          {tag.name}
                        </button>
                      )
                    })}
                  </div>
                </FieldRow>
              </>
            )}
          </div>

          {error && <p className="pt-3 text-[12.5px] text-expense">{error}</p>}
          {savedCount > 0 && !error && (
            <p className="pt-3 text-[12.5px] text-ink-muted">
              Saved {savedCount} — wallet and date kept
            </p>
          )}
        </div>

        {/* -------------------------------------------------- keypad + save */}
        <div
          className="flex-none px-4 pt-3"
          style={{
            // Sits *on* the system keyboard rather than behind it, so Save
            // stays reachable while a note is being typed. The frame's height
            // does not shrink for the keyboard by design, so this is the only
            // way the footer clears it.
            marginBottom: keyboard,
            paddingBottom: keyboard
              ? 12
              : 'calc(12px + env(safe-area-inset-bottom, 0px))',
          }}
        >
          {/* Functional update: a captured entry drops digits on fast taps. */}
          {!typing && (
            <Keypad op={entry.op} onKey={(key) => setEntry((s) => applyKey(s, key))} />
          )}

          <div className={`flex gap-2 ${typing ? '' : 'mt-2.5'}`}>
            {/* Chained entry is an adding idea; there is no second row to edit. */}
            {!editing && (
              <button
                type="button"
                disabled={!canSave || busy}
                onClick={() => save(true)}
                className="flex-1 rounded-field py-[15px] text-[14.5px] font-semibold transition-transform duration-[90ms] active:scale-[.98] disabled:opacity-40"
                style={{ background: 'var(--field-key)', color: 'var(--field-ink)' }}
              >
                Save &amp; add another
              </button>
            )}
            {/* Category-coloured, not accent: the whole screen is themed by the
                category, and a commit button in a different colour would be the
                one thing on it that is not. */}
            <Button
              className="flex-1"
              tone={category ? categoryVar(category.color) : undefined}
              disabled={!canSave || busy}
              onClick={() => save(false)}
            >
              {busy ? 'Saving…' : editing ? 'Save changes' : 'Save'}
            </Button>
          </div>
        </div>

        <CategorySheet
          open={catOpen}
          onClose={() => setCatOpen(false)}
          categories={pickable}
          selectedId={category?.id}
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

/** A row inside the entry screen's field block, with its 34px glyph column. */
function FieldRow({
  icon,
  children,
}: {
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-[13px]">
      <span className="flex w-[26px] flex-none justify-center text-ink-muted">
        {icon}
      </span>
      {children}
    </div>
  )
}

/** Inset past the glyph column, on the field's own divider rather than the ink one. */
function FieldDivider() {
  return <div className="ml-[57px] h-px" style={{ background: 'var(--field-divider)' }} />
}

/** The hero tile's glyph, at the one size that needs it. */
function Icon64({ category }: { category: Category }) {
  const Glyph = iconFor(category.kind === 'transfer' ? 'arrow-left-right' : category.glyph)
  return <Glyph size={28} stroke={2} />
}
