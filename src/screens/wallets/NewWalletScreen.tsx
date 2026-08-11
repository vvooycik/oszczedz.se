import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ChevronRight, X } from 'lucide-react'
import { FullScreen } from '@/app/AppShell'
import { useGoBack } from '@/app/useGoBack'
import { CategoryGlyph } from '@/components/CategoryGlyph'
import {
  useCategories,
  useCreateWallet,
  useSetWalletCategories,
} from '@/data/queries'
import { WalletCategoriesSheet } from './WalletCategoriesSheet'
import { iconFor } from '@/lib/icons'
// The same map the wallets list draws its row marks from, so the type a wallet
// is created as and the icon it is later recognised by cannot drift apart.
import { WALLET_TYPES as TYPES } from '@/lib/wallets'
import { asMinor, parseAmount } from '@/lib/money'
import { keepFocus } from '@/lib/touch'
import { CATEGORY_COLORS, categoryVar } from '@/theme/tokens'
import type { WalletType } from '@/lib/db'

/**
 * One balance field, three meanings.
 *
 * Every type opens somewhere, and the difference between them is a label and a
 * sign — not a separate field. A card and a loan are debt, so what is typed is
 * negated on the way in; an account takes what is typed, including a minus for
 * one that is overdrawn.
 */
const BALANCE: Record<
  WalletType,
  { label: string; hint: string; debt: boolean; required: boolean }
> = {
  account: {
    label: 'Opening balance',
    hint: 'What is in it today. Blank starts from zero.',
    debt: false,
    required: false,
  },
  savings: {
    label: 'Opening balance',
    hint: 'What is in it today. Blank starts from zero.',
    debt: false,
    required: false,
  },
  credit_card: {
    label: 'Owed right now',
    hint: 'Held as a negative balance, the way the card actually sits. Blank means nothing is owed yet.',
    debt: true,
    required: false,
  },
  loan: {
    label: 'Total to repay',
    hint: 'The whole outstanding amount. It opens negative and each repayment moves it back towards zero.',
    debt: true,
    required: true,
  },
}

/** A labelled row with a right-aligned figure, matching the entry screen. */
function AmountField({
  label,
  hint,
  value,
  invalid,
  onChange,
}: {
  label: string
  hint: string
  value: string
  invalid: boolean
  onChange: (next: string) => void
}) {
  return (
    <div className="pt-4">
      <div
        className="flex items-baseline gap-3 pb-2"
        style={{ borderBottom: `1px solid ${invalid ? 'var(--color-expense)' : 'var(--color-line-soft)'}` }}
      >
        <span className="flex-1 text-[14.5px]">{label}</span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          // `decimal` rather than `numeric`: iOS shows the separator key, and
          // amounts are typed with one.
          inputMode="decimal"
          placeholder="0,00"
          aria-label={label}
          className="tnum w-32 bg-transparent text-right text-[19px] outline-none placeholder:text-ink-dim"
        />
        <span className="font-sans text-[13px] text-ink-faint">zł</span>
      </div>
      <p className="pt-1.5 text-[11.5px] leading-[1.5] text-ink-muted">{hint}</p>
    </div>
  )
}

export function NewWalletScreen() {
  const goBack = useGoBack('/wallets')
  const navigate = useNavigate()
  const create = useCreateWallet()
  const setCategories = useSetWalletCategories()
  const categories = useCategories()

  const [type, setType] = useState<WalletType>('account')
  const [name, setName] = useState('')
  const [color, setColor] = useState<string>('slate')
  const [balance, setBalance] = useState('')
  const [limit, setLimit] = useState('')
  const [installments, setInstallments] = useState('')
  const [categoryIds, setCategoryIds] = useState<string[]>([])
  const [catOpen, setCatOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Set once the wallet row exists. From then on Save must not run again — the
  // insert has no key to be idempotent on, so a retry would make a second
  // wallet rather than finish the first.
  const [created, setCreated] = useState(false)

  const spec = BALANCE[type]
  const glyph = TYPES.find((t) => t.key === type)!.glyph
  const isCard = type === 'credit_card'
  const isLoan = type === 'loan'

  // Blank is a valid empty field, not a parse failure — only a non-empty string
  // that will not parse is worth marking red.
  const parsedBalance = balance.trim() === '' ? null : parseAmount(balance)
  const parsedLimit = limit.trim() === '' ? null : parseAmount(limit)
  const parsedInstallments =
    installments.trim() === '' ? null : Number(installments.trim())

  const balanceBad = balance.trim() !== '' && parsedBalance === null
  const limitBad = limit.trim() !== '' && (parsedLimit === null || parsedLimit <= 0)
  const installmentsBad =
    installments.trim() !== '' &&
    (!Number.isInteger(parsedInstallments) || (parsedInstallments ?? 0) < 1)

  const canSave =
    name.trim() !== '' &&
    !balanceBad &&
    !limitBad &&
    !installmentsBad &&
    // A card without a limit has nothing to show "remaining" against, and the
    // DB rejects it outright — the CHECK ties the column to the type.
    (!isCard || (parsedLimit !== null && parsedLimit > 0)) &&
    // A loan whose total is unknown is a wallet stuck at zero: the balance is
    // the debt, so there is nothing to repay against.
    (!isLoan || (parsedBalance !== null && parsedBalance !== 0)) &&
    !create.isPending &&
    !setCategories.isPending &&
    !created

  const save = async () => {
    if (!canSave) return
    setError(null)

    const magnitude = Math.abs(parsedBalance ?? 0)
    const opening = spec.debt ? -magnitude : (parsedBalance ?? 0)

    let walletId: string
    try {
      walletId = await create.mutateAsync({
        name,
        type,
        color_scheme: color,
        glyph,
        starting_balance: asMinor(opening),
        credit_limit: isCard ? parsedLimit : null,
        installment_count: isLoan ? parsedInstallments : null,
      })
      setCreated(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the wallet')
      return
    }

    // The wallet exists from here on. The category set is a second write against
    // a row that is already committed, so its failure cannot be reported as
    // "could not create the wallet" — and retrying Save would create a second
    // one. Say what actually happened and send them to the list, where the same
    // sheet is one tap away.
    if (categoryIds.length) {
      try {
        await setCategories.mutateAsync({ walletId, categoryIds })
      } catch {
        setError(
          `${name.trim()} was created, but its categories did not save. Open it from Wallets to set them.`,
        )
        return
      }
    }

    navigate('/wallets', { replace: true })
  }

  return (
    <FullScreen>
      {/* The chosen colour owns the accent for this screen, the way the entry
          screen takes its accent from the category — so Save, the selected type
          and the swatch all agree before the wallet exists.

          Overrides --color-accent, not --c-accent: a custom property's var()
          references resolve against the element that declares it. */}
      <div
        className="flex h-full flex-col"
        style={{ '--color-accent': categoryVar(color) } as React.CSSProperties}
      >
        <header className="flex flex-none items-center gap-3 px-5 pt-3 pb-3">
          <button onClick={goBack} aria-label="Close" className="text-ink-muted">
            <X size={22} strokeWidth={1.5} />
          </button>
          <div className="flex-1 text-center font-sans text-[14px] text-ink-muted">
            New wallet
          </div>
          {/* Save lives in the header, not a pinned footer: every field here
              raises the keyboard, and a footer would spend the whole form
              hidden behind it. */}
          <button
            onClick={save}
            disabled={!canSave}
            className="text-[13.5px] text-accent disabled:opacity-40"
          >
            {create.isPending ? 'Saving…' : 'Save'}
          </button>
        </header>

        <div
          className="no-scrollbar flex-1 overflow-y-auto px-5"
          style={{ paddingBottom: 'calc(32px + env(safe-area-inset-bottom, 0px))' }}
        >
          <div className="flex flex-col items-center gap-3 pt-1 pb-5">
            <CategoryGlyph glyph={glyph} color={color} size={64} />
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Wallet name"
              aria-label="Wallet name"
              className="w-full bg-transparent pb-1.5 text-center text-[22px] outline-none placeholder:text-ink-dim"
              style={{ borderBottom: '1px solid var(--color-line-soft)' }}
            />
          </div>

          <div className="kicker pb-2 text-ink-muted">Type</div>
          <div className="grid grid-cols-2 gap-2">
            {TYPES.map((option) => {
              const active = type === option.key
              const Icon = iconFor(option.glyph)
              return (
                <button
                  key={option.key}
                  // The name field above is usually focused; without this the
                  // tap only dismisses the keyboard. See `keepFocus`.
                  onMouseDown={keepFocus}
                  onClick={() => setType(option.key)}
                  className="flex items-start gap-2.5 rounded-[4px] px-3 py-2.5 text-left"
                  style={{
                    border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-line)'}`,
                  }}
                >
                  <Icon
                    size={17}
                    strokeWidth={1.5}
                    className="mt-px flex-none"
                    style={{
                      color: active ? 'var(--color-accent)' : 'var(--color-ink-faint)',
                    }}
                  />
                  <span className="min-w-0">
                    <span
                      className="block text-[14px]"
                      style={{ color: active ? 'var(--color-accent)' : undefined }}
                    >
                      {option.label}
                    </span>
                    <span className="block pt-0.5 font-sans text-[11px] leading-[1.35] text-ink-faint">
                      {option.blurb}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>

          <div className="kicker pt-5 pb-2.5 text-ink-muted">Colour</div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
            {CATEGORY_COLORS.map((slot) => {
              const active = color === slot
              return (
                <button
                  key={slot}
                  aria-label={slot}
                  onMouseDown={keepFocus}
                  onClick={() => setColor(slot)}
                  className="flex-none rounded-full"
                  style={{
                    width: active ? 26 : 20,
                    height: active ? 26 : 20,
                    background: `var(--color-${slot})`,
                    // A ground-coloured ring holds the swatch off its own halo,
                    // so the selected one reads as larger, not just bolder.
                    border: `2px solid ${active ? 'var(--color-bg)' : 'transparent'}`,
                    boxShadow: active ? `0 0 0 1.5px var(--color-${slot})` : 'none',
                  }}
                />
              )
            })}
          </div>

          <div className="mt-5 h-px" style={{ background: 'var(--color-line)' }} />

          {isCard && (
            <AmountField
              label="Credit limit"
              hint="What the card allows. The list shows the headroom left, not the debt."
              value={limit}
              invalid={limitBad}
              onChange={setLimit}
            />
          )}

          <AmountField
            label={spec.label}
            hint={spec.hint}
            value={balance}
            invalid={balanceBad}
            onChange={setBalance}
          />

          {isLoan && (
            <div className="pt-4">
              <div
                className="flex items-baseline gap-3 pb-2"
                style={{
                  borderBottom: `1px solid ${installmentsBad ? 'var(--color-expense)' : 'var(--color-line-soft)'}`,
                }}
              >
                <span className="flex-1 text-[14.5px]">Settlements</span>
                <input
                  value={installments}
                  onChange={(e) => setInstallments(e.target.value)}
                  inputMode="numeric"
                  placeholder="—"
                  aria-label="Number of settlements"
                  className="tnum w-32 bg-transparent text-right text-[19px] outline-none placeholder:text-ink-dim"
                />
                <span className="font-sans text-[13px] text-ink-faint">×</span>
              </div>
              <p className="pt-1.5 text-[11.5px] leading-[1.5] text-ink-muted">
                How many instalments the loan is spread over. Every transfer into
                this wallet counts as one paid, and the wallets list counts down
                what is left.
              </p>
            </div>
          )}

          <div className="kicker pt-6 pb-2 text-ink-muted">Categories</div>
          <button
            onMouseDown={keepFocus}
            onClick={() => setCatOpen(true)}
            className="flex w-full items-center gap-3 py-1 text-left"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[14.5px]">
                {categoryIds.length === 0
                  ? 'Every category'
                  : `${categoryIds.length} chosen`}
              </span>
              <span className="block pt-1 text-[11.5px] leading-[1.5] text-ink-muted">
                {categoryIds.length === 0
                  ? 'Narrow the picker down to what this wallet is actually for, and put them in the order you want to see them.'
                  : 'Shown in this order when adding a transaction here.'}
              </span>
            </span>
            <ChevronRight size={18} strokeWidth={1.5} className="flex-none text-ink-dim" />
          </button>

          {error && <p className="pt-4 text-[12.5px] text-expense">{error}</p>}

          <p className="pt-6 text-[11.5px] leading-[1.5] text-ink-muted">
            Balances are never stored — this is only where the wallet starts.
            Everything after it comes from its transactions.
          </p>
        </div>

        {/* Buffered, not saved: there is no wallet to attach rows to until Save
            runs, so the set rides along with the insert. */}
        <WalletCategoriesSheet
          open={catOpen}
          onClose={() => setCatOpen(false)}
          categories={categories.data ?? []}
          selected={categoryIds}
          onChange={setCategoryIds}
          onDone={() => setCatOpen(false)}
          walletName={name.trim() || 'this wallet'}
        />
      </div>
    </FullScreen>
  )
}
