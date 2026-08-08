import { asMinor, formatMoney } from '@/lib/money'
import type { Wallet, WalletBalance } from '@/lib/db'

export function WalletStrip({
  wallets,
  balances,
}: {
  wallets: Wallet[]
  balances: WalletBalance[]
}) {
  const balanceOf = new Map(balances.map((b) => [b.wallet_id, b.balance]))

  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {wallets.map((w) => {
        const balance = balanceOf.get(w.id) ?? w.starting_balance

        // A credit card reads better as headroom than as a big negative number.
        const isCard = w.type === 'credit_card' && w.credit_limit !== null
        const shown = isCard ? w.credit_limit! + balance : balance

        return (
          <div
            key={w.id}
            className="min-w-36 shrink-0 rounded-xl border border-border bg-surface-raised p-3"
            style={{ borderLeftColor: `var(--color-scheme-${w.color_scheme})`, borderLeftWidth: 3 }}
          >
            <p className="truncate text-xs text-ink-muted">{w.name}</p>
            <p className="mt-1 tabular-nums">
              {formatMoney(asMinor(shown), w.currency)}
            </p>
            {isCard && <p className="text-xs text-ink-muted">remaining</p>}
          </div>
        )
      })}
    </div>
  )
}
