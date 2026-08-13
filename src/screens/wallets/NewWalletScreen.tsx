import { useState } from 'react'
import { useNavigate } from 'react-router'
import { IconChevronRight, IconSelector } from '@tabler/icons-react'
import { FullScreen } from '@/app/AppShell'
import { useGoBack } from '@/app/useGoBack'
import { Card, Divider } from '@/components/ui/Card'
import { Label } from '@/components/ui/Label'
import { Button } from '@/components/ui/Button'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { useCategories, useCreateWallet, useSetWalletCategories } from '@/data/queries'
import { WalletCategoriesSheet } from './WalletCategoriesSheet'
import { AmountInput, SettingRow, TypeSheet, WalletIdentityCard } from './WalletForm'
import { labelForWalletType } from '@/lib/wallets'
import { asMinor, parseAmount } from '@/lib/money'
import { keepFocus } from '@/lib/touch'
import { categoryVar } from '@/theme/tokens'
import type { WalletType } from '@/lib/db'

/**
 * One balance field, three meanings.
 *
 * Every type opens somewhere, and the difference between them is a label and a
 * sign — not a separate field. A card and a loan are debt, so what is typed is
 * negated on the way in; an account takes what is typed, including a minus for
 * one that is overdrawn.
 */
const BALANCE: Record<WalletType, { label: string; hint: string; debt: boolean }> = {
  account: {
    label: 'Opening balance',
    hint: 'What is in it today. Blank starts from zero.',
    debt: false,
  },
  savings: {
    label: 'Opening balance',
    hint: 'What is in it today. Blank starts from zero.',
    debt: false,
  },
  credit_card: {
    label: 'Owed right now',
    hint: 'Held as a negative balance, the way the card actually sits. Blank means nothing is owed yet.',
    debt: true,
  },
  loan: {
    label: 'Total to repay',
    hint: 'The whole outstanding amount. It opens negative and each repayment moves it back towards zero.',
    debt: true,
  },
}

export function NewWalletScreen() {
  const goBack = useGoBack('/wallets')
  const navigate = useNavigate()
  const create = useCreateWallet()
  const setCategories = useSetWalletCategories()
  const categories = useCategories()

  const [type, setType] = useState<WalletType>('account')
  const [name, setName] = useState('')
  const [colour, setColour] = useState<string>('slate')
  const [glyph, setGlyph] = useState<string | null>(null)
  const [balance, setBalance] = useState('')
  const [limit, setLimit] = useState('')
  const [installments, setInstallments] = useState('')
  const [categoryIds, setCategoryIds] = useState<string[]>([])
  const [catOpen, setCatOpen] = useState(false)
  const [typeOpen, setTypeOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Set once the wallet row exists. From then on Save must not run again — the
  // insert has no key to be idempotent on, so a retry would make a second
  // wallet rather than finish the first.
  const [created, setCreated] = useState(false)

  const spec = BALANCE[type]
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
        color_scheme: colour,
        // Null when untouched, so the wallets list falls back to the type's
        // mark rather than freezing whatever the type happened to be at
        // creation. See `walletGlyph`.
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
    // screen is one tap away.
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

  if (catOpen) {
    // Buffered, not saved: there is no wallet to attach rows to until Save runs,
    // so the set rides along with the insert.
    return (
      <WalletCategoriesSheet
        onClose={() => setCatOpen(false)}
        categories={categories.data ?? []}
        selected={categoryIds}
        onChange={setCategoryIds}
        onDone={() => setCatOpen(false)}
        walletName={name.trim() || 'this wallet'}
      />
    )
  }

  return (
    <FullScreen>
      {/* The chosen colour owns the accent for this screen, the way the entry
          screen takes its accent from the category — so the swatch ring and the
          commit button agree before the wallet exists.

          Overrides --color-accent, not --c-accent: a custom property's var()
          references resolve against the element that declares it. */}
      <div
        className="flex h-full flex-col"
        style={{ '--color-accent': categoryVar(colour) } as React.CSSProperties}
      >
        <ScreenHeader title="New wallet" onClose={goBack} />

        <div className="no-scrollbar flex flex-1 flex-col gap-[14px] overflow-y-auto px-4 pt-2 pb-6">
          <WalletIdentityCard
            name={name}
            onName={setName}
            glyph={glyph}
            onGlyph={setGlyph}
            colour={colour}
            onColour={setColour}
            type={type}
          />

          <Card>
            <SettingRow label="Type">
              <button
                type="button"
                onMouseDown={keepFocus}
                onClick={() => setTypeOpen(true)}
                className="flex items-center gap-1.5 text-[13px] text-ink-muted"
              >
                {labelForWalletType(type)}
                <IconSelector size={17} stroke={2} className="text-ink-dim" />
              </button>
            </SettingRow>

            {isCard && (
              <>
                <Divider inset={16} />
                <SettingRow label="Credit limit" invalid={limitBad}>
                  <AmountInput
                    label="Credit limit"
                    value={limit}
                    onChange={setLimit}
                    invalid={limitBad}
                  />
                </SettingRow>
              </>
            )}

            <Divider inset={16} />
            <SettingRow label={spec.label} invalid={balanceBad}>
              <AmountInput
                label={spec.label}
                value={balance}
                onChange={setBalance}
                invalid={balanceBad}
              />
            </SettingRow>

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
          </Card>

          <p className="px-1 text-[12.5px] leading-[1.5] text-ink-muted">{spec.hint}</p>

          <section className="flex flex-col gap-2">
            <Label className="px-1">Categories</Label>
            <Card>
              <button
                type="button"
                onMouseDown={keepFocus}
                onClick={() => setCatOpen(true)}
                className="flex w-full items-center gap-3 px-4 py-[13px] text-left active:bg-press"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium">
                    {categoryIds.length === 0
                      ? 'Every category'
                      : `${categoryIds.length} chosen`}
                  </span>
                  <span className="mt-px block text-[12.5px] leading-[1.4] text-ink-muted">
                    {categoryIds.length === 0
                      ? 'Narrow the picker to what this wallet is for, in the order you want it.'
                      : 'Shown in this order when adding a transaction here.'}
                  </span>
                </span>
                <IconChevronRight size={18} stroke={2} className="flex-none text-ink-dim" />
              </button>
            </Card>
          </section>

          {error && <p className="px-1 text-[12.5px] text-expense">{error}</p>}

          <p className="px-1 text-[12.5px] leading-[1.5] text-ink-muted">
            Balances are never stored — this is only where the wallet starts.
            Everything after it comes from its transactions.
          </p>
        </div>

        <div className="flex flex-none gap-2.5 px-4 pt-2 pb-[max(env(safe-area-inset-bottom,0px),16px)]">
          <Button variant="secondary" full={false} className="w-24" onClick={goBack}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={save} disabled={!canSave}>
            {create.isPending ? 'Creating…' : 'Create wallet'}
          </Button>
        </div>

        <TypeSheet
          open={typeOpen}
          onClose={() => setTypeOpen(false)}
          value={type}
          onChange={setType}
        />
      </div>
    </FullScreen>
  )
}
