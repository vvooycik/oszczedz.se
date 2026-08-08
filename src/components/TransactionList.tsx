import { asMinor, formatMoney } from '@/lib/money'
import type { Category, Transaction, Wallet } from '@/lib/db'

export function TransactionList({
  transactions,
  wallets,
  categories,
}: {
  transactions: Transaction[]
  wallets: Wallet[]
  categories: Category[]
}) {
  const walletById = new Map(wallets.map((w) => [w.id, w]))
  const categoryById = new Map(categories.map((c) => [c.id, c]))

  if (transactions.length === 0) {
    return <p className="text-sm text-ink-muted">No transactions yet.</p>
  }

  return (
    <ul className="divide-y divide-border">
      {transactions.map((t) => {
        const wallet = walletById.get(t.wallet_id)
        const category = categoryById.get(t.category_id)
        const income = t.amount > 0

        return (
          <li key={t.id} className="flex items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate">
                {category?.name ?? 'Uncategorised'}
                {t.transfer_id && (
                  <span className="ml-2 rounded bg-surface-raised px-1.5 py-0.5 text-xs text-ink-muted">
                    transfer
                  </span>
                )}
              </p>
              <p className="truncate text-xs text-ink-muted">
                {t.date} · {wallet?.name ?? '—'}
                {t.note ? ` · ${t.note}` : ''}
              </p>
            </div>
            {/* The sign is the encoding; colour only reinforces it. */}
            <span
              className={`shrink-0 tabular-nums ${income ? 'text-income' : 'text-expense'}`}
            >
              {income ? '+' : ''}
              {formatMoney(asMinor(t.amount), wallet?.currency ?? 'PLN')}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
