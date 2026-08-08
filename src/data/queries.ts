import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { asMinor, type Minor } from '@/lib/money'
import type {
  Category,
  MonthlyCategoryTotal,
  Transaction,
  Wallet,
  WalletBalance,
} from '@/lib/db'

const unwrap = <T>({ data, error }: { data: T | null; error: unknown }): T => {
  if (error) throw error
  return data as T
}

export const useWallets = () =>
  useQuery({
    queryKey: ['wallets'],
    queryFn: async (): Promise<Wallet[]> =>
      unwrap(await supabase.from('wallets').select('*').order('created_at')),
  })

export const useCategories = () =>
  useQuery({
    queryKey: ['categories'],
    queryFn: async (): Promise<Category[]> =>
      unwrap(await supabase.from('categories').select('*').order('name')),
  })

export const useWalletBalances = () =>
  useQuery({
    queryKey: ['wallet_balances'],
    queryFn: async (): Promise<WalletBalance[]> =>
      unwrap(await supabase.from('wallet_balances').select('*')),
  })

/** Recent raw rows — for the list only. Charts must use aggregate views. */
export const useRecentTransactions = (limit = 50) =>
  useQuery({
    queryKey: ['transactions', 'recent', limit],
    queryFn: async (): Promise<Transaction[]> =>
      unwrap(
        await supabase
          .from('transactions')
          .select('*')
          .order('date', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(limit),
      ),
  })

/**
 * Pre-aggregated in Postgres. The phone fetches one row per
 * month/category/currency, never the underlying transactions.
 */
export const useMonthlyTotals = (currency: string) =>
  useQuery({
    queryKey: ['monthly_category_totals', currency],
    queryFn: async (): Promise<MonthlyCategoryTotal[]> =>
      unwrap(
        await supabase
          .from('monthly_category_totals')
          .select('*')
          .eq('currency', currency)
          .order('month'),
      ),
  })

export type NewTransaction = {
  wallet_id: string
  category_id: string
  amount: Minor
  date: string
  note: string | null
}

export const useAddTransaction = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (tx: NewTransaction) => {
      const { error } = await supabase.from('transactions').insert({
        wallet_id: tx.wallet_id,
        category_id: tx.category_id,
        amount: asMinor(tx.amount),
        date: tx.date,
        note: tx.note,
      })
      if (error) throw error
    },
    onSuccess: () => {
      // Balances and aggregates are derived, so both have to be refetched.
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['wallet_balances'] })
      qc.invalidateQueries({ queryKey: ['monthly_category_totals'] })
    },
  })
}
