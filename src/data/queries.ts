import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { asMinor, type Minor } from '@/lib/money'
import type {
  BudgetProgress,
  Category,
  MonthlyCategoryTotal,
  Tag,
  Transaction,
  Wallet,
  WalletBalance,
  WalletMonthlyNet,
} from '@/lib/db'

const unwrap = <T>({ data, error }: { data: T | null; error: unknown }): T => {
  if (error) throw error
  return data as T
}

/* --------------------------------------------------------------- reference */

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

export const useTags = () =>
  useQuery({
    queryKey: ['tags'],
    queryFn: async (): Promise<Tag[]> =>
      unwrap(await supabase.from('tags').select('*').order('name')),
  })

export const useWalletBalances = () =>
  useQuery({
    queryKey: ['wallet_balances'],
    queryFn: async (): Promise<WalletBalance[]> =>
      unwrap(await supabase.from('wallet_balances').select('*')),
  })

/* ------------------------------------------------------------ transactions */

/**
 * Recent rows for the feed. Reference data (wallets, categories) is joined
 * client-side from its own cached query rather than embedded here — there are a
 * handful of each, so re-sending their names on every page of transactions
 * would cost more than it saves.
 */
export const useRecentTransactions = (limit = 100) =>
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

export const useTransaction = (id: string | undefined) =>
  useQuery({
    queryKey: ['transactions', 'one', id],
    enabled: Boolean(id),
    queryFn: async (): Promise<Transaction> =>
      unwrap(
        await supabase.from('transactions').select('*').eq('id', id!).single(),
      ),
  })

/** Both legs of a transfer, for the detail screen's two-leg display. */
export const useTransferLegs = (transferId: string | null | undefined) =>
  useQuery({
    queryKey: ['transactions', 'transfer', transferId],
    enabled: Boolean(transferId),
    queryFn: async (): Promise<Transaction[]> =>
      unwrap(
        await supabase
          .from('transactions')
          .select('*')
          .eq('transfer_id', transferId!)
          .order('amount'),
      ),
  })

/* ---------------------------------------------------------------- charting */

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

/** Running total wealth per day. Aggregated in Postgres, one row per day. */
export const useBalanceHistory = (currency: string, from: string, to: string) =>
  useQuery({
    queryKey: ['balance_history', currency, from, to],
    queryFn: async (): Promise<{ day: string; balance: number }[]> =>
      unwrap(
        await supabase.rpc('balance_history', {
          p_currency: currency,
          p_from: from,
          p_to: to,
        }),
      ),
  })

export const useBudgetProgress = () =>
  useQuery({
    queryKey: ['budget_progress'],
    queryFn: async (): Promise<BudgetProgress[]> =>
      unwrap(await supabase.from('budget_progress').select('*').order('name')),
  })

export const useWalletMonthlyNet = () =>
  useQuery({
    queryKey: ['wallet_monthly_net'],
    queryFn: async (): Promise<WalletMonthlyNet[]> =>
      unwrap(await supabase.from('wallet_monthly_net').select('*').order('month')),
  })

/* --------------------------------------------------------------- mutations */

/** Everything derived from transactions, refetched after any write. */
const DERIVED_KEYS = [
  ['transactions'],
  ['wallet_balances'],
  ['monthly_category_totals'],
  ['balance_history'],
  ['budget_progress'],
  ['wallet_monthly_net'],
]

const invalidateDerived = (qc: ReturnType<typeof useQueryClient>) => {
  for (const key of DERIVED_KEYS) qc.invalidateQueries({ queryKey: key })
}

export type NewTransaction = {
  wallet_id: string
  category_id: string
  amount: Minor
  date: string
  note: string | null
  tag_ids?: string[]
}

export const useAddTransaction = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (tx: NewTransaction) => {
      const inserted = unwrap<{ id: string }>(
        await supabase
          .from('transactions')
          .insert({
            wallet_id: tx.wallet_id,
            category_id: tx.category_id,
            amount: asMinor(tx.amount),
            date: tx.date,
            note: tx.note,
          })
          .select('id')
          .single(),
      )

      if (tx.tag_ids?.length) {
        const { error } = await supabase.from('transaction_tags').insert(
          tx.tag_ids.map((tag_id) => ({
            transaction_id: inserted.id,
            tag_id,
          })),
        )
        if (error) throw error
      }
      return inserted.id
    },
    onSuccess: () => invalidateDerived(qc),
  })
}

export const useDeleteTransaction = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (tx: Transaction) => {
      // Transfers are a pair and must go together, or a balance silently skews.
      const { error } = tx.transfer_id
        ? await supabase.rpc('delete_transfer', { p_transfer_id: tx.transfer_id })
        : await supabase.from('transactions').delete().eq('id', tx.id)
      if (error) throw error
    },
    onSuccess: () => invalidateDerived(qc),
  })
}

/** Tags attached to one transaction. */
export const useTransactionTags = (transactionId: string | undefined) =>
  useQuery({
    queryKey: ['transaction_tags', transactionId],
    enabled: Boolean(transactionId),
    queryFn: async (): Promise<string[]> => {
      const rows = unwrap(
        await supabase
          .from('transaction_tags')
          .select('tag_id')
          .eq('transaction_id', transactionId!),
      )
      return rows.map((r) => r.tag_id)
    },
  })
