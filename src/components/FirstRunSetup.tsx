import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * Categories and wallets belong to a user, so they cannot be seeded in a
 * migration. This creates a usable starting set on first run; proper CRUD
 * replaces it in the next milestone.
 */
const STARTER_CATEGORIES = [
  { name: 'Groceries', kind: 'expense', glyph: 'basket', color: 'green' },
  { name: 'Eating out', kind: 'expense', glyph: 'utensils', color: 'amber' },
  { name: 'Transport', kind: 'expense', glyph: 'bus', color: 'teal' },
  { name: 'Bills', kind: 'expense', glyph: 'receipt', color: 'rose' },
  { name: 'Salary', kind: 'income', glyph: 'wallet', color: 'indigo' },
  { name: 'Transfer', kind: 'transfer', glyph: 'arrows', color: 'violet' },
] as const

export function FirstRunSetup() {
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      const { error: wErr } = await supabase.from('wallets').insert({
        name: 'Main account',
        type: 'account',
        glyph: 'bank',
        color_scheme: 'indigo',
        currency: 'PLN',
        starting_balance: 0,
      })
      if (wErr) throw wErr

      const { error: cErr } = await supabase
        .from('categories')
        .insert(STARTER_CATEGORIES.map((c) => ({ ...c })))
      if (cErr) throw cErr

      await qc.invalidateQueries()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface-raised p-4">
      <h2 className="font-medium">Nothing here yet</h2>
      <p className="mt-1 text-sm text-ink-muted">
        Create a PLN account and a handful of starter categories so you can add
        a transaction.
      </p>
      {error && <p className="mt-2 text-sm text-expense">{error}</p>}
      <button
        onClick={run}
        disabled={busy}
        className="mt-3 rounded-lg bg-scheme-indigo px-4 py-2 font-medium disabled:opacity-50"
      >
        {busy ? 'Creating…' : 'Set up'}
      </button>
    </div>
  )
}
