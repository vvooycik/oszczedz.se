import { useState } from 'react'
import { parseAmount } from '@/lib/money'
import { useAddTransaction } from '@/data/queries'
import type { Category, Wallet } from '@/lib/db'

const today = () => new Date().toLocaleDateString('sv-SE') // 'YYYY-MM-DD', local

export function AddTransactionForm({
  wallets,
  categories,
}: {
  wallets: Wallet[]
  categories: Category[]
}) {
  const add = useAddTransaction()
  const [walletId, setWalletId] = useState(wallets[0]?.id ?? '')
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today())
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Category kind is UX guidance only — it decides the default sign here, but
  // the amount the user types always wins.
  const kind = categories.find((c) => c.id === categoryId)?.kind

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const parsed = parseAmount(amount)
    if (parsed === null || parsed === 0) {
      setError('Enter an amount like 12,34')
      return
    }

    // Sign is the source of truth for direction. An expense category with a
    // bare "50" means -50; typing "-50" or "+50" explicitly overrides.
    const explicitSign = /^[+-]/.test(amount.trim())
    const signed =
      explicitSign || kind !== 'expense'
        ? parsed
        : (-Math.abs(parsed) as typeof parsed)

    try {
      await add.mutateAsync({
        wallet_id: walletId,
        category_id: categoryId,
        amount: signed,
        date,
        note: note.trim() || null,
      })
      setAmount('')
      setNote('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
    }
  }

  const field =
    'w-full rounded-lg border border-border bg-surface-raised px-3 py-2'

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="flex gap-2">
        <input
          inputMode="decimal"
          placeholder="0,00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className={`${field} text-lg tabular-nums`}
        />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className={field}
        />
      </div>

      <div className="flex gap-2">
        <select
          value={walletId}
          onChange={(e) => setWalletId(e.target.value)}
          className={field}
        >
          {wallets.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className={field}
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <input
        placeholder="Note (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className={field}
      />

      {error && <p className="text-sm text-expense">{error}</p>}

      <button
        type="submit"
        disabled={add.isPending}
        className="w-full rounded-lg bg-scheme-indigo py-2.5 font-medium disabled:opacity-50"
      >
        {add.isPending ? 'Saving…' : 'Add transaction'}
      </button>
    </form>
  )
}
