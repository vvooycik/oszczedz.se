import { useState } from 'react'
import { Sheet } from '@/components/Sheet'
import { Button } from '@/components/ui/Button'
import { Label } from '@/components/ui/Label'
import { SegmentedTrack } from '@/components/ui/SegmentedTrack'
import { useAdjustBalance } from '@/data/queries'
import { today } from '@/lib/dates'
import {
  asMinor,
  currencySymbol,
  formatSignedMoney,
  parseAmount,
  toRawAmount,
} from '@/lib/money'
import type { Wallet } from '@/lib/db'

/**
 * What the field asks for, per wallet type.
 *
 * `debt` wallets are held as a negative balance and nobody types a minus to say
 * what they owe, so the figure comes in unsigned and is negated. An account is
 * signed, because an overdrawn one is a real thing to type.
 */
const READINGS = {
  account: { label: 'Balance now', debt: false },
  savings: { label: 'Balance now', debt: false },
  credit_card: { label: 'Owed now', debt: true },
  loan: { label: 'Outstanding now', debt: true },
} as const

/** The two ways a credit card's standing is quoted. */
type CardReading = 'remaining' | 'owed'

/**
 * "The wallet really holds this much" — stated as a figure, stored as the gap.
 *
 * Invariant 2 leaves no other shape: balances are derived, so there is no
 * balance to overwrite. What "it should say 5 000" actually means is that
 * something happened which was never recorded, and the honest form of that is a
 * transaction dated today for the difference. This sheet exists so that
 * difference is the app's arithmetic rather than the user's — the whole point
 * is to type what the bank says and not work out the delta by hand.
 *
 * **A credit card is asked the question its bank answers.** Statements quote
 * what is left to spend, not what is owed, and the two are one subtraction
 * apart (`remaining = credit_limit + balance`, and balance is negative). The
 * screen behind this sheet leads with *Owed*, so both readings are offered and
 * the segment says which one is being typed; defaulting to remaining without
 * saying so would silently disagree with the figure above it.
 */
export function AdjustBalanceSheet({
  wallet,
  balance,
  open,
  onClose,
}: {
  wallet: Wallet
  balance: number
  open: boolean
  onClose: () => void
}) {
  const adjust = useAdjustBalance()
  const symbol = currencySymbol(wallet.currency)

  // The mutation outlives the drawer — this component stays mounted so the
  // drawer can animate out — so a failed attempt would still be on screen the
  // next time it opens. Cleared on the way out, never during render.
  const close = () => {
    adjust.reset()
    onClose()
  }

  // A card without a limit has no remaining to quote, so there is nothing to
  // switch between and the segment is not drawn.
  const limit = wallet.type === 'credit_card' ? wallet.credit_limit : null
  const quotesRemaining = limit !== null

  const [reading, setReading] = useState<CardReading>('remaining')
  const asRemaining = quotesRemaining && reading === 'remaining'

  /** The wallet's present standing, in whichever reading is being typed. */
  const current = asRemaining
    ? limit! + balance
    : READINGS[wallet.type].debt
      ? Math.abs(balance)
      : balance

  const [value, setValue] = useState('')

  /**
   * The field is re-seeded on every opening, and whenever the segment moves.
   *
   * Adjusted during render rather than in an effect — the alternative writes the
   * field a frame late, which on the reading switch means one paint showing the
   * *other* quote. Keyed on open-plus-reading and not on the balance itself, so
   * a background refetch cannot reach in and overwrite what has been typed.
   */
  const signature = open ? String(asRemaining) : null
  const [seededFor, setSeededFor] = useState<string | null>(null)
  if (seededFor !== signature) {
    setSeededFor(signature)
    if (signature !== null) setValue(seed(current))
  }

  const parsed = value.trim() === '' ? null : parseAmount(value)
  const bad = value.trim() !== '' && parsed === null

  /** The typed figure read back as a signed balance, and then the gap to close. */
  const wanted =
    parsed === null
      ? null
      : asRemaining
        ? parsed - limit!
        : READINGS[wallet.type].debt
          ? -Math.abs(parsed)
          : parsed

  const delta = wanted === null ? 0 : wanted - balance

  const label = asRemaining ? 'Remaining now' : READINGS[wallet.type].label

  const record = () => {
    if (delta === 0 || bad || adjust.isPending) return
    adjust.mutate(
      { walletId: wallet.id, delta: asMinor(delta), date: today() },
      { onSuccess: onClose },
    )
  }

  return (
    <Sheet open={open} onClose={close} height="64%" label="Adjust balance">
      <div className="flex min-h-0 flex-1 flex-col px-4 pb-[max(env(safe-area-inset-bottom,0px),16px)]">
        <Label>Adjust balance</Label>

        {quotesRemaining && (
          <SegmentedTrack
            className="mt-3"
            options={[
              { key: 'remaining', label: 'Remaining' },
              { key: 'owed', label: 'Owed' },
            ]}
            value={reading}
            onChange={setReading}
          />
        )}

        <div className="no-scrollbar mt-4 flex-1 overflow-y-auto">
          <div className="rounded-card bg-inset px-4 py-3.5">
            <span className="text-[12.5px] text-ink-muted">{label}</span>
            <div className="mt-1 flex items-baseline gap-2">
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onFocus={(e) => e.currentTarget.select()}
                // `decimal`, not `numeric`: iOS only shows the separator key for
                // the former, and this is money.
                inputMode="decimal"
                placeholder="0,00"
                aria-label={label}
                className="tnum min-w-0 flex-1 bg-transparent text-[30px] font-semibold outline-none placeholder:text-ink-faint"
                style={{
                  letterSpacing: '-0.03em',
                  color: bad ? 'var(--color-expense)' : undefined,
                }}
              />
              <span className="text-[15px] font-medium text-ink-faint">{symbol}</span>
            </div>
          </div>

          <p className="px-1 pt-3.5 text-[12.5px] leading-[1.55] text-ink-muted">
            {bad ? (
              <>That is not an amount.</>
            ) : delta === 0 ? (
              <>
                Type what the wallet is really worth. Nothing is overwritten —
                balances are always derived, so the difference is recorded as a
                transaction dated today.
              </>
            ) : (
              <>
                Records a{' '}
                <span
                  className="tnum font-semibold"
                  style={{
                    color: delta > 0 ? 'var(--color-income)' : 'var(--color-expense)',
                  }}
                >
                  {formatSignedMoney(asMinor(delta), wallet.currency)}
                </span>{' '}
                transaction dated today, under “Balance adjustment”. It is an
                ordinary transaction afterwards — recategorise, re-date or delete
                it like any other.
              </>
            )}
          </p>

          {adjust.isError && (
            <p className="px-1 pt-2.5 text-[12.5px] text-expense">
              {adjust.error instanceof Error
                ? adjust.error.message
                : 'Could not record the adjustment.'}
            </p>
          )}
        </div>

        <div className="flex flex-none gap-2.5 pt-3">
          <Button variant="secondary" full={false} className="w-24" onClick={close}>
            Cancel
          </Button>
          <Button
            className="flex-1"
            onClick={record}
            disabled={bad || delta === 0 || adjust.isPending}
          >
            {adjust.isPending ? 'Recording…' : 'Record adjustment'}
          </Button>
        </div>
      </div>
    </Sheet>
  )
}

/**
 * The field starts on the figure it is correcting, so it reads as "fix this"
 * rather than "enter a delta" — and leaving it alone records nothing, because
 * the difference is zero.
 *
 * `toRawAmount` is unsigned, which is right for a debt wallet; the minus is put
 * back here for the readings that can legitimately go negative (an overdrawn
 * account, a card past its limit).
 */
function seed(amount: number): string {
  const raw = toRawAmount(asMinor(Math.abs(amount)))
  return amount < 0 ? `-${raw}` : raw
}
