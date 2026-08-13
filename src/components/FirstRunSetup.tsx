import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * Categories and wallets belong to a user, so they cannot be seeded in a
 * migration. This creates a usable starting set on first run; proper CRUD
 * replaces it once the wallets and budgets screens can create their own.
 *
 * Colours are palette slot names and glyphs are Lucide icon names — both are
 * looked up at render, so a typo here shows as a fallback rather than a crash.
 */
const STARTER_CATEGORIES = [
  { name: 'Groceries', kind: 'expense', glyph: 'shopping-basket', color: 'moss' },
  { name: 'Eating out', kind: 'expense', glyph: 'utensils', color: 'ochre' },
  { name: 'Transport', kind: 'expense', glyph: 'bus', color: 'slate' },
  { name: 'Bills', kind: 'expense', glyph: 'receipt', color: 'terracotta' },
  { name: 'Home', kind: 'expense', glyph: 'house', color: 'plum' },
  { name: 'Health', kind: 'expense', glyph: 'heart-pulse', color: 'terracotta' },
  { name: 'Salary', kind: 'income', glyph: 'banknote', color: 'teal' },
  { name: 'Gifts', kind: 'income', glyph: 'gift', color: 'moss' },
  { name: 'Transfer', kind: 'transfer', glyph: 'arrow-left-right', color: 'slate' },
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
        glyph: 'wallet',
        color_scheme: 'teal',
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
    <div className="rounded-card p-4" style={{ border: '1px solid var(--color-divider)' }}>
      <h2 className="text-[16px]">Nothing here yet</h2>
      <p className="mt-1.5 text-[13px] leading-[1.55] text-ink-muted">
        Create a PLN account and a handful of starter categories so you can add a
        transaction.
      </p>
      {error && <p className="mt-2 text-[12.5px] text-expense">{error}</p>}
      <button
        onClick={run}
        disabled={busy}
        className="mt-4 rounded-field px-4 py-2 text-[13.5px] text-accent disabled:opacity-50"
        style={{ border: '1px solid var(--color-accent)' }}
      >
        {busy ? 'Creating…' : 'Set up'}
      </button>
    </div>
  )
}
