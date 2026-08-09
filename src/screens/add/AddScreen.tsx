import { useEffect, useState } from 'react'
import { useGoBack } from '@/app/useGoBack'
import { Calendar, ChevronRight, Pencil, Tag, Wallet, X } from 'lucide-react'
import { FullScreen } from '@/app/AppShell'
import { CategoryGlyph } from '@/components/CategoryGlyph'
import { CategorySheet } from './CategorySheet'
import { DateSheet } from './DateSheet'
import { applyKey, displayAmount, Keypad } from './Keypad'
import { useAddTransaction, useCategories, useTags, useWallets } from '@/data/queries'
import { parseAmount } from '@/lib/money'
import { addDays, relativeDayLabel, today } from '@/lib/dates'
import { categoryVar } from '@/theme/tokens'
import type { Category } from '@/lib/db'

export function AddScreen() {
  const goBack = useGoBack()
  const wallets = useWallets()
  const categories = useCategories()
  const tags = useTags()
  const add = useAddTransaction()

  const [amount, setAmount] = useState('')
  const [negative, setNegative] = useState(true)
  const [category, setCategory] = useState<Category | null>(null)
  const [walletId, setWalletId] = useState('')
  const [date, setDate] = useState(today())
  const [note, setNote] = useState('')
  const [tagIds, setTagIds] = useState<string[]>([])

  // The picker opens on entry: the first decision is what the money went on.
  const [catOpen, setCatOpen] = useState(true)
  const [dateOpen, setDateOpen] = useState(false)
  const [savedCount, setSavedCount] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!walletId && wallets.data?.length) setWalletId(wallets.data[0]!.id)
  }, [wallets.data, walletId])

  const signColor = negative ? 'var(--color-expense)' : 'var(--color-income)'
  const parsed = parseAmount(amount)
  const canSave = parsed !== null && parsed !== 0 && Boolean(category) && Boolean(walletId)

  const save = async (again: boolean) => {
    if (!canSave || !category) return
    setError(null)
    try {
      await add.mutateAsync({
        wallet_id: walletId,
        category_id: category.id,
        amount: (negative ? -Math.abs(parsed!) : Math.abs(parsed!)) as typeof parsed,
        date,
        note: note.trim() || null,
        tag_ids: tagIds,
      })

      if (!again) {
        goBack()
        return
      }
      // Chained entry: keep wallet and date, drop what is specific to the item
      // just saved, and reopen the picker for the next one.
      setSavedCount((n) => n + 1)
      setAmount('')
      setNote('')
      setTagIds([])
      setCategory(null)
      setCatOpen(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
    }
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
            Add transaction
          </div>
          <span className="w-[22px]" />
        </header>

        <div className="no-scrollbar flex-1 overflow-y-auto px-5">
          <div
            className="flex items-end gap-2.5 pb-2.5"
            style={{ borderBottom: '1px solid var(--color-line)' }}
          >
            <button
              onClick={() => setNegative((s) => !s)}
              aria-label={negative ? 'Expense' : 'Income'}
              className="tnum flex size-9 flex-none items-center justify-center rounded-[4px] text-[19px]"
              style={{ border: '1px solid var(--color-line)', color: signColor }}
            >
              {negative ? '−' : '+'}
            </button>
            <div
              className="tnum flex-1 text-right"
              style={{
                fontSize: 42,
                lineHeight: 1,
                letterSpacing: '-.02em',
                color: amount === '' ? undefined : signColor,
                opacity: amount === '' ? 0.3 : 1,
              }}
            >
              {amount === '' ? '0,00' : displayAmount(amount)}
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
            <select
              value={walletId}
              onChange={(e) => setWalletId(e.target.value)}
              className="flex-1 bg-transparent text-[15px] outline-none"
            >
              {(wallets.data ?? []).map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>

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

          {(tags.data ?? []).length > 0 && (
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
          {/* Functional update: a captured `amount` drops digits on fast taps. */}
          <Keypad onKey={(key) => setAmount((current) => applyKey(current, key))} />

          <div className="mt-2.5 flex gap-2">
            <button
              disabled={!canSave || add.isPending}
              onClick={() => save(true)}
              className="flex-1 rounded-[4px] py-2.5 text-[13.5px] disabled:opacity-40"
              style={{ border: '1px solid var(--color-line)', color: 'var(--color-ink-muted)' }}
            >
              Save &amp; add another
            </button>
            <button
              disabled={!canSave || add.isPending}
              onClick={() => save(false)}
              className="flex-1 rounded-[4px] py-2.5 text-[13.5px] text-accent disabled:opacity-40"
              style={{ border: '1px solid var(--color-accent)' }}
            >
              {add.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

        <CategorySheet
          open={catOpen}
          onClose={() => setCatOpen(false)}
          categories={categories.data ?? []}
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
