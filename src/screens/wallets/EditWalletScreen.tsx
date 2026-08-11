import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { X } from 'lucide-react'
import { FullScreen } from '@/app/AppShell'
import { useGoBack } from '@/app/useGoBack'
import { CategoryGlyph } from '@/components/CategoryGlyph'
import {
  useAdjustBalance,
  useArchiveWallet,
  useUpdateWallet,
  useWalletBalances,
  useWallets,
} from '@/data/queries'
import { today } from '@/lib/dates'
import { asMinor, currencySymbol, formatSigned, parseAmount, toRawAmount } from '@/lib/money'
import { keepFocus } from '@/lib/touch'
import { glyphForWalletType, isArchived, labelForWalletType } from '@/lib/wallets'
import { CATEGORY_COLORS, categoryVar } from '@/theme/tokens'
import type { WalletType } from '@/lib/db'

/**
 * What the balance field means per type — the same three readings the create
 * screen uses, so a number typed here means what it meant there. Debt is held as
 * a negative balance, and nobody types a minus to say what they owe.
 */
const BALANCE_LABEL: Record<WalletType, { label: string; debt: boolean }> = {
  account: { label: 'Balance now', debt: false },
  savings: { label: 'Balance now', debt: false },
  credit_card: { label: 'Owed now', debt: true },
  loan: { label: 'Outstanding now', debt: true },
}

/**
 * Editing a wallet: its name, its colour, the one number its type carries, and
 * a way to say what it is really worth.
 *
 * Type is absent by design — see `useUpdateWallet`.
 */
export function EditWalletScreen() {
  const { id } = useParams()
  const goBack = useGoBack('/wallets')
  const navigate = useNavigate()

  const wallets = useWallets()
  const balances = useWalletBalances()
  const update = useUpdateWallet()
  const adjust = useAdjustBalance()
  const archive = useArchiveWallet()

  const wallet = useMemo(
    () => (wallets.data ?? []).find((w) => w.id === id),
    [wallets.data, id],
  )

  const balance = useMemo(() => {
    if (!wallet) return 0
    const row = (balances.data ?? []).find((b) => b.wallet_id === wallet.id)
    return row?.balance ?? wallet.starting_balance
  }, [balances.data, wallet])

  const [name, setName] = useState('')
  const [color, setColor] = useState('slate')
  const [limit, setLimit] = useState('')
  const [installments, setInstallments] = useState('')
  const [target, setTarget] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [archiveError, setArchiveError] = useState<string | null>(null)

  // Seeded once, on the render where the wallet and its balance have both
  // arrived. After that the form owns its fields, so a background refetch cannot
  // reach in and undo what has been typed.
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    if (hydrated || !wallet || !balances.data) return
    setName(wallet.name)
    setColor(wallet.color_scheme)
    setLimit(wallet.credit_limit === null ? '' : toRawAmount(asMinor(wallet.credit_limit)))
    setInstallments(
      wallet.installment_count === null ? '' : String(wallet.installment_count),
    )
    // Pre-filled with what the wallet is worth right now, so the field reads as
    // "correct this" rather than "enter a delta" — and leaving it alone records
    // nothing, because the difference is zero.
    //
    // `toRawAmount` is never signed, which is right for a debt wallet (the field
    // asks what is owed and negates it back). An *overdrawn account* is the case
    // that needs the minus put back: without it the field would read −123,45 as
    // +123,45 and offer to record an adjustment of twice the balance.
    const raw = toRawAmount(asMinor(balance))
    setTarget(!BALANCE_LABEL[wallet.type].debt && balance < 0 ? `-${raw}` : raw)
    setHydrated(true)
  }, [hydrated, wallet, balances.data, balance])

  if (!wallet || !hydrated) {
    return (
      <FullScreen>
        <p className="px-5 py-10 text-[13px] text-ink-muted">
          {wallets.data && !wallet ? 'That wallet no longer exists.' : 'Loading…'}
        </p>
      </FullScreen>
    )
  }

  const symbol = currencySymbol(wallet.currency)
  const spec = BALANCE_LABEL[wallet.type]
  const isCard = wallet.type === 'credit_card'
  const isLoan = wallet.type === 'loan'
  const archived = isArchived(wallet)

  const parsedTarget = target.trim() === '' ? null : parseAmount(target)
  const parsedLimit = limit.trim() === '' ? null : parseAmount(limit)
  const parsedInstallments =
    installments.trim() === '' ? null : Number(installments.trim())

  const targetBad = target.trim() !== '' && parsedTarget === null
  const limitBad = limit.trim() !== '' && (parsedLimit === null || parsedLimit <= 0)
  const installmentsBad =
    installments.trim() !== '' &&
    (!Number.isInteger(parsedInstallments) || (parsedInstallments ?? 0) < 1)

  // The typed figure read back as a signed balance, then the gap to close.
  const wanted =
    parsedTarget === null
      ? null
      : spec.debt
        ? -Math.abs(parsedTarget)
        : parsedTarget
  const delta = wanted === null ? 0 : wanted - balance

  const busy = update.isPending || adjust.isPending
  const canSave =
    name.trim() !== '' &&
    !targetBad &&
    !limitBad &&
    !installmentsBad &&
    (!isCard || (parsedLimit !== null && parsedLimit > 0)) &&
    !busy

  const save = async () => {
    if (!canSave) return
    setError(null)

    try {
      await update.mutateAsync({
        id: wallet.id,
        name,
        color_scheme: color,
        // Left exactly as found off-type: the CHECK constraints tie both columns
        // to the type, and the type is not moving, so there is nothing to
        // reconcile — but nulling them blindly would break a card.
        credit_limit: isCard
          ? parsedLimit
          : wallet.credit_limit === null
            ? null
            : asMinor(wallet.credit_limit),
        installment_count: isLoan ? parsedInstallments : wallet.installment_count,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the wallet')
      return
    }

    // Second write, and it can fail on its own. The rename already landed, so
    // saying "could not save" here would be false — name what actually did not
    // happen and leave the field alone so it can be tried again.
    if (delta !== 0) {
      try {
        await adjust.mutateAsync({
          walletId: wallet.id,
          delta: asMinor(delta),
          date: today(),
        })
      } catch (err) {
        setError(
          err instanceof Error
            ? `Saved the wallet, but the balance adjustment failed: ${err.message}`
            : 'Saved the wallet, but the balance adjustment failed.',
        )
        return
      }
    }

    navigate(`/wallets/${wallet.id}`, { replace: true })
  }

  return (
    <FullScreen>
      <div
        className="flex h-full flex-col"
        style={{ '--color-accent': categoryVar(color) } as React.CSSProperties}
      >
        <header className="flex flex-none items-center gap-3 px-5 pt-3 pb-3">
          <button onClick={goBack} aria-label="Close" className="text-ink-muted">
            <X size={22} strokeWidth={1.5} />
          </button>
          <div className="flex-1 text-center font-sans text-[14px] text-ink-muted">
            Edit wallet
          </div>
          <button
            onClick={save}
            disabled={!canSave}
            className="text-[13.5px] text-accent disabled:opacity-40"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </header>

        <div
          className="no-scrollbar flex-1 overflow-y-auto px-5"
          style={{ paddingBottom: 'calc(32px + env(safe-area-inset-bottom, 0px))' }}
        >
          <div className="flex flex-col items-center gap-3 pt-1 pb-5">
            <CategoryGlyph
              glyph={glyphForWalletType(wallet.type)}
              color={color}
              size={64}
            />
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Wallet name"
              aria-label="Wallet name"
              className="w-full bg-transparent pb-1.5 text-center text-[22px] outline-none placeholder:text-ink-dim"
              style={{ borderBottom: '1px solid var(--color-line-soft)' }}
            />
            {/* Stated rather than offered: changing it is a data-model
                question, not a preference. */}
            <span className="font-sans text-[11.5px] text-ink-faint">
              {labelForWalletType(wallet.type)} · type cannot be changed
            </span>
          </div>

          <div className="kicker pb-2.5 text-ink-muted">Colour</div>
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
                    border: `2px solid ${active ? 'var(--color-bg)' : 'transparent'}`,
                    boxShadow: active ? `0 0 0 1.5px var(--color-${slot})` : 'none',
                  }}
                />
              )
            })}
          </div>

          <div className="mt-5 h-px" style={{ background: 'var(--color-line)' }} />

          {isCard && (
            <Field
              label="Credit limit"
              hint="What the card allows."
              value={limit}
              unit={symbol}
              invalid={limitBad}
              onChange={setLimit}
            />
          )}

          {isLoan && (
            <Field
              label="Settlements"
              hint="How many instalments the loan runs to. Every transfer into this wallet counts as one paid."
              value={installments}
              unit="×"
              numeric
              invalid={installmentsBad}
              onChange={setInstallments}
            />
          )}

          <Field
            label={spec.label}
            hint="Correct this to what the wallet is really worth. Nothing is overwritten — the difference is recorded as a transaction dated today."
            value={target}
            unit={symbol}
            invalid={targetBad}
            onChange={setTarget}
          />

          {delta !== 0 && (
            <p className="pt-3 text-[12px] leading-[1.5] text-ink-muted">
              Saving records a{' '}
              <span
                className="tnum"
                style={{
                  color: delta > 0 ? 'var(--color-income)' : 'var(--color-expense)',
                }}
              >
                {formatSigned(asMinor(delta))} {symbol}
              </span>{' '}
              adjustment dated today, under “Balance adjustment”. It is an
              ordinary transaction — recategorise or delete it like any other.
            </p>
          )}

          {error && <p className="pt-4 text-[12.5px] text-expense">{error}</p>}

          <div className="mt-7 h-px" style={{ background: 'var(--color-line)' }} />

          {/* Archiving is not deleting, and the copy has to say so — the history
              is exactly what makes a closed wallet worth keeping. */}
          <div className="pt-4">
            <div className="text-[14.5px]">
              {archived ? 'Closed wallet' : 'Close this wallet'}
            </div>
            <p className="pt-1.5 text-[11.5px] leading-[1.5] text-ink-muted">
              {archived ? (
                <>
                  Hidden from the list and from the entry form. Everything it ever
                  recorded still counts — reopen it to use it again.
                </>
              ) : balance === 0 ? (
                <>
                  For an account you have closed or a loan you have paid off. It
                  leaves the list and the entry form; every transaction it holds
                  stays exactly where it is, so past balances and charts do not
                  move.
                </>
              ) : (
                <>
                  Only a wallet at zero can be closed. Move the remaining{' '}
                  <span className="tnum">
                    {formatSigned(asMinor(balance), { plus: false })} {symbol}
                  </span>{' '}
                  out with a transfer first — hiding a wallet that still holds
                  money would take it out of sight but leave it in your total.
                </>
              )}
            </p>

            {archiveError && (
              <p className="pt-2.5 text-[12px] text-expense">{archiveError}</p>
            )}

            <button
              onClick={() => {
                setArchiveError(null)
                archive.mutate(
                  { walletId: wallet.id, archived },
                  {
                    onSuccess: () => navigate('/wallets', { replace: true }),
                    onError: (err) =>
                      setArchiveError(
                        err instanceof Error ? err.message : 'Could not do that',
                      ),
                  },
                )
              }}
              disabled={archive.isPending || (!archived && balance !== 0)}
              className="mt-3 w-full rounded-[4px] py-[11px] text-[13.5px] disabled:opacity-40"
              style={{
                border: `1px solid ${archived ? 'var(--color-line)' : 'var(--color-line)'}`,
                color: archived ? 'var(--color-accent)' : 'var(--color-ink-muted)',
              }}
            >
              {archive.isPending
                ? 'Working…'
                : archived
                  ? 'Reopen wallet'
                  : 'Close wallet'}
            </button>
          </div>
        </div>
      </div>
    </FullScreen>
  )
}

/** A labelled row with a right-aligned figure, matching the create screen. */
function Field({
  label,
  hint,
  value,
  unit,
  invalid,
  numeric = false,
  onChange,
}: {
  label: string
  hint: string
  value: string
  unit: string
  invalid: boolean
  numeric?: boolean
  onChange: (next: string) => void
}) {
  return (
    <div className="pt-4">
      <div
        className="flex items-baseline gap-3 pb-2"
        style={{
          borderBottom: `1px solid ${invalid ? 'var(--color-expense)' : 'var(--color-line-soft)'}`,
        }}
      >
        <span className="flex-1 text-[14.5px]">{label}</span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode={numeric ? 'numeric' : 'decimal'}
          placeholder={numeric ? '—' : '0,00'}
          aria-label={label}
          className="tnum w-32 bg-transparent text-right text-[19px] outline-none placeholder:text-ink-dim"
        />
        <span className="font-sans text-[13px] text-ink-faint">{unit}</span>
      </div>
      <p className="pt-1.5 text-[11.5px] leading-[1.5] text-ink-muted">{hint}</p>
    </div>
  )
}
