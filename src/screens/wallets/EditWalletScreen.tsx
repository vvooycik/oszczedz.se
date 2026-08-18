import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { IconChevronRight } from '@tabler/icons-react'
import { FullScreen } from '@/app/AppShell'
import { useGoBack } from '@/app/useGoBack'
import { Card, Divider } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import {
  useArchiveWallet,
  useUpdateWallet,
  useWalletBalances,
  useWallets,
} from '@/data/queries'
import {
  asMinor,
  currencySymbol,
  formatSignedMoney,
  parseAmount,
  toRawAmount,
} from '@/lib/money'
import { isArchived, labelForWalletType } from '@/lib/wallets'
import { categoryVar } from '@/theme/tokens'
import { AdjustBalanceSheet } from './AdjustBalanceSheet'
import { AmountInput, SettingRow, WalletIdentityCard } from './WalletForm'
import type { WalletType } from '@/lib/db'

/** What the balance row is called per type, matching the sheet it opens. */
const BALANCE_LABEL: Record<WalletType, string> = {
  account: 'Balance',
  savings: 'Balance',
  credit_card: 'Owed',
  loan: 'Outstanding',
}

/**
 * Editing a wallet: its name, its colour, and the one number its type carries.
 *
 * Type is absent by design — see `useUpdateWallet`.
 *
 * **The balance is a row, not a field.** Correcting it is an event that records
 * a transaction rather than an attribute that saves with the form, so it goes
 * through the same sheet the wallet screen opens instead of being a second
 * implementation of the same subtraction here — this one could not offer a
 * card's remaining reading, and the two would drift.
 */
export function EditWalletScreen() {
  const { id } = useParams()
  const goBack = useGoBack('/wallets')
  const navigate = useNavigate()

  const wallets = useWallets()
  const balances = useWalletBalances()
  const update = useUpdateWallet()
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
  const [adjustOpen, setAdjustOpen] = useState(false)
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
    setHydrated(true)
  }, [hydrated, wallet, balances.data])

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
  const isCard = wallet.type === 'credit_card'
  const isLoan = wallet.type === 'loan'
  const archived = isArchived(wallet)

  const parsedLimit = limit.trim() === '' ? null : parseAmount(limit)
  const parsedInstallments =
    installments.trim() === '' ? null : Number(installments.trim())

  const limitBad = limit.trim() !== '' && (parsedLimit === null || parsedLimit <= 0)
  const installmentsBad =
    installments.trim() !== '' &&
    (!Number.isInteger(parsedInstallments) || (parsedInstallments ?? 0) < 1)

  const busy = update.isPending
  const canSave =
    name.trim() !== '' &&
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
            {/* Not a field: this one does not save with the form, it records a
                transaction of its own. The row states where it stands and the
                sheet does the subtraction. */}
            <SettingRow label={BALANCE_LABEL[wallet.type]}>
              <button
                type="button"
                onClick={() => setAdjustOpen(true)}
                className="flex items-center gap-1 active:opacity-70"
              >
                <span className="tnum text-[15px] font-semibold">
                  {formatSignedMoney(asMinor(balance), wallet.currency, { plus: false })}
                </span>
                <IconChevronRight size={17} stroke={2} className="text-ink-dim" />
              </button>
            </SettingRow>
          </Card>

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

        <AdjustBalanceSheet
          wallet={wallet}
          balance={balance}
          open={adjustOpen}
          onClose={() => setAdjustOpen(false)}
        />

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
