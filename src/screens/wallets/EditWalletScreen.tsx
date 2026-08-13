import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { FullScreen } from '@/app/AppShell'
import { useGoBack } from '@/app/useGoBack'
import { Card, Divider } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import {
  useAdjustBalance,
  useArchiveWallet,
  useUpdateWallet,
  useWalletBalances,
  useWallets,
} from '@/data/queries'
import { today } from '@/lib/dates'
import {
  asMinor,
  currencySymbol,
  formatSignedMoney,
  parseAmount,
  toRawAmount,
} from '@/lib/money'
import { isArchived, labelForWalletType } from '@/lib/wallets'
import { categoryVar } from '@/theme/tokens'
import { AmountInput, SettingRow, WalletIdentityCard } from './WalletForm'
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
  const [glyph, setGlyph] = useState<string | null>(null)
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
    setGlyph(wallet.glyph)
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
        <p className="px-4 py-10 text-[13px] text-ink-muted">
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
        glyph,
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
        <ScreenHeader title="Edit wallet" onClose={goBack} />

        <div className="no-scrollbar flex flex-1 flex-col gap-[14px] overflow-y-auto px-4 pt-2 pb-6">
          <WalletIdentityCard
            name={name}
            onName={setName}
            glyph={glyph}
            onGlyph={setGlyph}
            colour={color}
            onColour={setColor}
            type={wallet.type}
          />

          <Card>
            {/* Stated rather than offered: moving a type would have to carry
                `credit_limit` and the loan columns across two CHECK constraints,
                re-answer what an account's balance means once it is a card, and
                invent an installment count — for a change that is nearly always
                a mistake made at creation rather than an event. */}
            <SettingRow label="Type">
              <span className="text-[13px] text-ink-muted">
                {labelForWalletType(wallet.type)} · fixed
              </span>
            </SettingRow>

            {isCard && (
              <>
                <Divider inset={16} />
                <SettingRow label="Credit limit" invalid={limitBad}>
                  <AmountInput
                    label="Credit limit"
                    value={limit}
                    onChange={setLimit}
                    unit={symbol}
                    invalid={limitBad}
                  />
                </SettingRow>
              </>
            )}

            {isLoan && (
              <>
                <Divider inset={16} />
                <SettingRow label="Settlements" invalid={installmentsBad}>
                  <AmountInput
                    label="Number of settlements"
                    value={installments}
                    onChange={setInstallments}
                    invalid={installmentsBad}
                    placeholder="—"
                    unit="×"
                    numeric
                  />
                </SettingRow>
              </>
            )}

            <Divider inset={16} />
            <SettingRow label={spec.label} invalid={targetBad}>
              <AmountInput
                label={spec.label}
                value={target}
                onChange={setTarget}
                unit={symbol}
                invalid={targetBad}
              />
            </SettingRow>
          </Card>

          <p className="px-1 text-[12.5px] leading-[1.5] text-ink-muted">
            {delta !== 0 ? (
              <>
                Saving records a{' '}
                <span
                  className="tnum font-semibold"
                  style={{
                    color: delta > 0 ? 'var(--color-income)' : 'var(--color-expense)',
                  }}
                >
                  {formatSignedMoney(asMinor(delta), wallet.currency)}
                </span>{' '}
                adjustment dated today, under “Balance adjustment”. It is an
                ordinary transaction — recategorise or delete it like any other.
              </>
            ) : (
              <>
                Correct the balance to what the wallet is really worth. Nothing is
                overwritten — the difference is recorded as a transaction dated
                today.
              </>
            )}
          </p>

          {error && <p className="px-1 text-[12.5px] text-expense">{error}</p>}

          {/* Archiving is not deleting, and the copy has to say so — the history
              is exactly what makes a closed wallet worth keeping. */}
          <Card className="p-[18px]">
            <div className="text-[15px] font-medium">
              {archived ? 'Closed wallet' : 'Close this wallet'}
            </div>
            <p className="pt-1.5 text-[12.5px] leading-[1.5] text-ink-muted">
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
                    {formatSignedMoney(asMinor(balance), wallet.currency, {
                      plus: false,
                    })}
                  </span>{' '}
                  out with a transfer first — hiding a wallet that still holds
                  money would take it out of sight but leave it in your total.
                </>
              )}
            </p>

            {archiveError && (
              <p className="pt-2.5 text-[12.5px] text-expense">{archiveError}</p>
            )}

            <Button
              variant="secondary"
              className="mt-3.5"
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
            >
              {archive.isPending
                ? 'Working…'
                : archived
                  ? 'Reopen wallet'
                  : 'Close wallet'}
            </Button>
          </Card>
        </div>

        <div className="flex flex-none gap-2.5 px-4 pt-2 pb-[max(env(safe-area-inset-bottom,0px),16px)]">
          <Button variant="secondary" full={false} className="w-24" onClick={goBack}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={save} disabled={!canSave}>
            {busy ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>
    </FullScreen>
  )
}
