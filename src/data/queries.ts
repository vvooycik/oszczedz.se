import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { asMinor, type Minor } from '@/lib/money'
import type {
  BudgetProgress,
  Category,
  CategoryKind,
  CategoryUsage,
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

/**
 * Transaction count per category, keyed by id.
 *
 * Aggregated in Postgres — the settings screen shows a count on every row, and
 * the alternative is pulling 5000 transactions to the phone to group them. View
 * columns come back nullable (no non-null proof through an aggregate), so both
 * sides of the pair are guarded here rather than at every call site.
 */
export const useCategoryUsage = () =>
  useQuery({
    queryKey: ['category_usage'],
    queryFn: async (): Promise<Record<string, number>> => {
      const rows = unwrap<CategoryUsage[]>(
        await supabase.from('category_usage').select('*'),
      )
      const counts: Record<string, number> = {}
      for (const row of rows) {
        if (row.category_id) counts[row.category_id] = row.transaction_count ?? 0
      }
      return counts
    },
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

/**
 * The first day with any activity — the left edge of the All time range.
 *
 * Its own query rather than a `min()` over the feed's rows: that list is the
 * most recent 100, so the earliest date in it is a couple of months back, not
 * the start of the history.
 */
export const useEarliestTransactionDate = () =>
  useQuery({
    queryKey: ['transactions', 'earliest'],
    queryFn: async (): Promise<string | null> => {
      const rows = unwrap<{ date: string }[]>(
        await supabase
          .from('transactions')
          .select('date')
          .order('date', { ascending: true })
          .limit(1),
      )
      return rows[0]?.date ?? null
    },
  })

/**
 * The wallet the last entry landed in — what a new entry should start on.
 *
 * Ordered by `created_at`, not `date`: what matters is the wallet you were just
 * working in, and a backdated entry is still the one you last logged.
 *
 * **`amount desc` is what resolves a transfer to its target.** Both legs are
 * inserted by one statement inside `create_transfer`, so `default now()` gives
 * them an identical `created_at` and neither wins on time alone. Invariant 5
 * makes the source negative and the target positive, so sorting the tie by
 * amount puts the destination first and a single row is the answer — no second
 * query, and no leg matching here to drift from that invariant.
 */
export const useLastUsedWallet = () =>
  useQuery({
    queryKey: ['transactions', 'last_used_wallet'],
    queryFn: async (): Promise<string | null> => {
      const rows = unwrap<{ wallet_id: string }[]>(
        await supabase
          .from('transactions')
          .select('wallet_id')
          .order('created_at', { ascending: false })
          .order('amount', { ascending: false })
          .limit(1),
      )
      return rows[0]?.wallet_id ?? null
    },
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
export const useBalanceHistory = (
  currency: string,
  from: string,
  to: string,
  enabled = true,
) =>
  useQuery({
    queryKey: ['balance_history', currency, from, to],
    enabled,
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

export type TransactionEdit = NewTransaction & { id: string; tag_ids: string[] }

/**
 * Edits an existing transaction in place.
 *
 * Tags are reconciled as a diff rather than deleted-and-reinserted: the join
 * table is the only place a tag membership lives, and a failure between the two
 * halves of a wipe-and-rewrite would silently strip the transaction's tags.
 *
 * Deliberately reachable only for ordinary rows. A transfer's two legs have to
 * stay consistent — same amount both ways when the currencies match, and both
 * pointing at the same pair of wallets — which is `create_transfer`'s job, not
 * a column update on one side of it.
 */
export const useUpdateTransaction = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (tx: TransactionEdit) => {
      const { error } = await supabase
        .from('transactions')
        .update({
          wallet_id: tx.wallet_id,
          category_id: tx.category_id,
          amount: asMinor(tx.amount),
          date: tx.date,
          note: tx.note,
        })
        .eq('id', tx.id)
      if (error) throw error

      const current = unwrap<{ tag_id: string }[]>(
        await supabase
          .from('transaction_tags')
          .select('tag_id')
          .eq('transaction_id', tx.id),
      ).map((r) => r.tag_id)

      const removed = current.filter((id) => !tx.tag_ids.includes(id))
      const added = tx.tag_ids.filter((id) => !current.includes(id))

      if (removed.length) {
        const { error: delError } = await supabase
          .from('transaction_tags')
          .delete()
          .eq('transaction_id', tx.id)
          .in('tag_id', removed)
        if (delError) throw delError
      }
      if (added.length) {
        const { error: insError } = await supabase
          .from('transaction_tags')
          .insert(added.map((tag_id) => ({ transaction_id: tx.id, tag_id })))
        if (insError) throw insError
      }
    },
    onSuccess: (_result, tx) => {
      invalidateDerived(qc)
      qc.invalidateQueries({ queryKey: ['transaction_tags', tx.id] })
    },
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

/* --------------------------------------------------------------- categories */

/**
 * A category's name, glyph, colour and kind all appear inside the pre-aggregated
 * chart views, so a rename or a recolour has to reach further than ['categories'].
 */
const invalidateCategories = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ['categories'] })
  qc.invalidateQueries({ queryKey: ['category_usage'] })
  invalidateDerived(qc)
}

export type CategoryDraft = {
  /** `'new'` when creating — the database assigns the real id. */
  id: string
  name: string
  kind: CategoryKind
  glyph: string
  color: string
}

export const useUpsertCategory = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (draft: CategoryDraft) => {
      // Only these four columns are ever user-set; user_id defaults to auth.uid().
      const fields = {
        name: draft.name.trim(),
        kind: draft.kind,
        glyph: draft.glyph,
        color: draft.color,
      }
      const { error } =
        draft.id === 'new'
          ? await supabase.from('categories').insert(fields)
          : await supabase.from('categories').update(fields).eq('id', draft.id)
      if (error) throw error
    },
    onSuccess: () => invalidateCategories(qc),
  })
}

/**
 * Reassignment and deletion are one RPC: done as two calls from here, a failure
 * between them would leave transactions pointing at a category that is gone.
 * `reassignTo` may be null only when nothing uses the category.
 */
export const useDeleteCategory = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, reassignTo }: { id: string; reassignTo: string | null }) => {
      const { error } = await supabase.rpc('delete_category', {
        p_category_id: id,
        // Omitted rather than null: the argument has a SQL default, so the
        // generated type declares it optional.
        p_reassign_to: reassignTo ?? undefined,
      })
      if (error) throw error
    },
    onSuccess: () => invalidateCategories(qc),
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
