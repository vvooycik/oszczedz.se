import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { ADJUSTMENT_CATEGORY } from '@/lib/adjustments'
import { asMinor, type Minor } from '@/lib/money'
import type {
  BudgetProgress,
  Category,
  CategoryKind,
  CategoryUsage,
  LoanProgress,
  MonthlyCategoryTotal,
  Tag,
  Transaction,
  Wallet,
  WalletBalance,
  WalletMonthlyNet,
  WalletType,
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
 * One wallet's recent rows, for its detail screen.
 *
 * **Both legs of every transfer come back, not just this wallet's.** The feed
 * collapses a pair into one "source → target" line, and it can only do that with
 * the pair in hand; given one leg it falls back to drawing a bare category row,
 * which on a loan — where every single row is a repayment transfer — would be
 * the whole screen saying nothing about where the money came from.
 *
 * So: the wallet's own rows first, then the siblings, fetched by the
 * `transfer_id`s the first query turned up. `neq` keeps the second query to the
 * far legs only, since this wallet's side is already in hand. Two round trips
 * rather than one, because PostgREST cannot express "or its transfer sibling" as
 * a single filter.
 *
 * The sibling rows are appended rather than merged in date order on purpose:
 * `collapseTransfers` emits each pair at the position of the first leg it sees,
 * and this wallet's rows all come first, so the feed's ordering stays the one
 * the wallet was queried in.
 */
export const useWalletTransactions = (walletId: string | undefined, limit = 100) =>
  useQuery({
    queryKey: ['transactions', 'wallet', walletId, limit],
    enabled: Boolean(walletId),
    queryFn: async (): Promise<Transaction[]> => {
      const rows = unwrap<Transaction[]>(
        await supabase
          .from('transactions')
          .select('*')
          .eq('wallet_id', walletId!)
          .order('date', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(limit),
      )

      const transferIds = [
        ...new Set(
          rows.map((r) => r.transfer_id).filter((id): id is string => Boolean(id)),
        ),
      ]
      if (transferIds.length === 0) return rows

      const siblings = unwrap<Transaction[]>(
        await supabase
          .from('transactions')
          .select('*')
          .in('transfer_id', transferIds)
          .neq('wallet_id', walletId!),
      )
      return [...rows, ...siblings]
    },
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

/**
 * Installments repaid per loan, so the client can show how many are left.
 *
 * Counted in Postgres over every transfer leg that ever landed on the wallet —
 * not derivable from the feed, which is the most recent 100 rows across all
 * wallets and would undercount a loan the moment it fell off the end.
 */
export const useLoanProgress = () =>
  useQuery({
    queryKey: ['loan_progress'],
    queryFn: async (): Promise<LoanProgress[]> =>
      unwrap(await supabase.from('loan_progress').select('*')),
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
  // A repayment is a transfer leg, so the installments left move with any
  // transaction write — including the delete that puts one back.
  ['loan_progress'],
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

export type NewTransfer = {
  source_wallet_id: string
  target_wallet_id: string
  /** Positive magnitudes. `create_transfer` applies the signs. */
  source_amount: Minor
  target_amount: Minor
  date: string
  category_id: string
  note: string | null
}

/**
 * Creates both legs of a transfer in one statement (invariant 5).
 *
 * Everything worth enforcing is enforced in `create_transfer`, not here: two
 * different wallets, positive magnitudes, and legs that balance unless the
 * wallets hold different currencies. The form checks the same things to keep the
 * Save button honest, but the function is the boundary — a bad pair raises there
 * rather than landing half-written.
 *
 * No tag support, deliberately. The function returns the transfer's id, not the
 * two transaction ids, so attaching tags would mean a second query to find the
 * legs and a decision about which leg wears them — for a pairing that the feed
 * already collapses into one line.
 */
export const useCreateTransfer = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (transfer: NewTransfer) => {
      const { error } = await supabase.rpc('create_transfer', {
        p_source_wallet_id: transfer.source_wallet_id,
        p_target_wallet_id: transfer.target_wallet_id,
        p_source_amount: asMinor(transfer.source_amount),
        p_target_amount: asMinor(transfer.target_amount),
        p_date: transfer.date,
        p_category_id: transfer.category_id,
        p_note: transfer.note ?? undefined,
      })
      if (error) throw error
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

/* ------------------------------------------------------------------ wallets */

export type WalletDraft = {
  name: string
  type: WalletType
  color_scheme: string
  glyph: string
  /**
   * Signed, like every other amount: negative is money owed. A card's debt and
   * a loan's outstanding total are both negative opening balances, which is what
   * makes them fall out of the same balance derivation as an account.
   */
  starting_balance: Minor
  /** Positive minor units. Credit cards only — null everywhere else. */
  credit_limit: Minor | null
  /** Loans only. Informational; nothing computes against it. */
  installment_count: number | null
}

export const useCreateWallet = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (draft: WalletDraft) => {
      const inserted = unwrap<{ id: string }>(
        await supabase
          .from('wallets')
          .insert({
            name: draft.name.trim(),
            type: draft.type,
            glyph: draft.glyph,
            color_scheme: draft.color_scheme,
            starting_balance: asMinor(draft.starting_balance),
            // Both CHECK constraints are two-way: `credit_limit` must be present
            // on a card and absent on everything else, and the loan columns must
            // be null off a loan. Nulling here rather than trusting the form is
            // what keeps a type switch from carrying a stale field into the
            // insert and failing on the constraint.
            credit_limit: draft.type === 'credit_card' ? draft.credit_limit : null,
            installment_count:
              draft.type === 'loan' ? draft.installment_count : null,
          })
          // `currency` is left to its column default (PLN). One currency is what
          // the app filters on today; adding a picker is a separate change.
          .select('id')
          .single(),
      )
      return inserted.id
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wallets'] })
      // A wallet with an opening balance moves total wealth and the balance
      // history the moment it exists, with no transaction involved.
      invalidateDerived(qc)
    },
  })
}

/** The columns an existing wallet may change. Type is not among them. */
export type WalletEdit = {
  id: string
  name: string
  color_scheme: string
  /** Cards only; ignored for every other type. */
  credit_limit: Minor | null
  /** Loans only; ignored for every other type. */
  installment_count: number | null
}

/**
 * Renames and re-tints a wallet, and adjusts the two type-specific numbers.
 *
 * **`type` is deliberately not editable.** Changing it would have to move
 * `credit_limit` and the loan columns across two CHECK constraints, decide what
 * an account's balance means once it is a card, and re-answer the loan
 * installment count — for a change that is almost always a mistake at creation
 * rather than a real event. Deleting and re-making the wallet is the honest
 * path, and it makes what happens to the transactions an explicit question.
 */
export const useUpdateWallet = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (edit: WalletEdit) => {
      const { error } = await supabase
        .from('wallets')
        .update({
          name: edit.name.trim(),
          color_scheme: edit.color_scheme,
          credit_limit: edit.credit_limit,
          installment_count: edit.installment_count,
        })
        .eq('id', edit.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wallets'] })
      // The name and colour are read straight off the wallet row by the feed and
      // the charts, and `installment_count` is a column of `loan_progress`.
      invalidateDerived(qc)
    },
  })
}

/**
 * Retires a wallet, or brings one back.
 *
 * Through the functions rather than an `update` on `archived_at`, because the
 * zero-balance rule has to hold whatever the client believes: the browser holds
 * an anon key and RLS would happily let it write the column directly. The form
 * checks the same thing to keep the button honest, but `archive_wallet` is the
 * boundary — see the migration.
 */
export const useArchiveWallet = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ walletId, archived }: { walletId: string; archived: boolean }) => {
      const { error } = archived
        ? await supabase.rpc('restore_wallet', { p_wallet_id: walletId })
        : await supabase.rpc('archive_wallet', { p_wallet_id: walletId })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wallets'] })
      invalidateDerived(qc)
    },
  })
}

/** What a reconciliation lands under, per direction. Names repeat across kinds
 *  here exactly as they already do in the imported data ("Gifts", "Other").
 *  Shared with the feed, which recognises the row by this name — see
 *  `src/lib/adjustments.ts`. */
const ADJUSTMENT = ADJUSTMENT_CATEGORY

/**
 * Moves a wallet to a stated balance by **recording the difference**, never by
 * writing the balance down.
 *
 * Balances are derived (invariant 2), so "set this wallet to 5 000" can only
 * mean "something happened that I did not record". The honest form of that is a
 * transaction dated today for the gap — which leaves every past day reading
 * exactly as it did, where editing `starting_balance` would silently restate the
 * whole history and move a chart the user was not looking at.
 *
 * It needs a category, because `category_id` is not null and no transaction is
 * meaningless. One is found or created per direction — income when money
 * appeared, expense when it went missing — so the adjustment is visible as its
 * own slice in a breakdown rather than hidden inside a real category. It is an
 * ordinary transaction afterwards: re-categorise, re-date or delete it like any
 * other.
 */
export const useAdjustBalance = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      walletId,
      delta,
      date,
    }: {
      walletId: string
      delta: Minor
      date: string
    }) => {
      const kind: CategoryKind = delta > 0 ? 'income' : 'expense'

      const found = unwrap<{ id: string }[]>(
        await supabase
          .from('categories')
          .select('id')
          .eq('name', ADJUSTMENT)
          .eq('kind', kind)
          .limit(1),
      )

      const categoryId =
        found[0]?.id ??
        unwrap<{ id: string }>(
          await supabase
            .from('categories')
            .insert({
              name: ADJUSTMENT,
              kind,
              glyph: 'sigma',
              color: 'slate',
            })
            .select('id')
            .single(),
        ).id

      const { error } = await supabase.from('transactions').insert({
        wallet_id: walletId,
        category_id: categoryId,
        amount: asMinor(delta),
        date,
        note: 'Balance adjustment',
      })
      if (error) throw error
    },
    onSuccess: () => {
      invalidateDerived(qc)
      // A first adjustment creates the category it lands in.
      qc.invalidateQueries({ queryKey: ['categories'] })
      qc.invalidateQueries({ queryKey: ['category_usage'] })
    },
  })
}

/* ------------------------------------------------- wallet ↔ category sets */

/**
 * The categories one wallet offers, in the order the picker should show them.
 *
 * **An empty result means every category is allowed**, not that none are — the
 * join table is a filter you opt into, and most wallets never need one. Callers
 * have to treat `[]` as "no opinion"; there is no way to express "this wallet
 * offers nothing", and nothing would want to.
 *
 * Ordered by `position` alone. The client always writes dense positions from
 * zero, so ties do not arise from this app; ordering by an embedded
 * `categories(name)` as a tiebreak is deliberately not attempted, because
 * supabase-js's `referencedTable` orders the *embedded* rows, not the parents,
 * and would read as a guarantee it does not give.
 */
export const useWalletCategoryIds = (walletId: string | undefined) =>
  useQuery({
    queryKey: ['wallet_categories', walletId],
    enabled: Boolean(walletId),
    queryFn: async (): Promise<string[]> => {
      const rows = unwrap<{ category_id: string }[]>(
        await supabase
          .from('wallet_categories')
          .select('category_id')
          .eq('wallet_id', walletId!)
          .order('position'),
      )
      return rows.map((r) => r.category_id)
    },
  })

/**
 * Replaces a wallet's category set with `categoryIds`, positioned by their order
 * in the array.
 *
 * Upsert first, delete second, deliberately. The join row is the only record of
 * a membership, so a failure between the two halves has to leave a category
 * offered that shouldn't be — a stale entry in a picker — rather than silently
 * dropping a set the user spent time arranging. Doing it the other way round
 * inverts which of those two you get.
 *
 * The primary key is (wallet_id, category_id), so the upsert's default conflict
 * target is already the right one: re-saving the same set only rewrites
 * `position`.
 */
export const useSetWalletCategories = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      walletId,
      categoryIds,
    }: {
      walletId: string
      categoryIds: string[]
    }) => {
      if (categoryIds.length) {
        const { error } = await supabase.from('wallet_categories').upsert(
          categoryIds.map((category_id, position) => ({
            wallet_id: walletId,
            category_id,
            position,
          })),
        )
        if (error) throw error
      }

      // Clearing the set entirely is a real choice — it puts the wallet back on
      // "every category", which is what a wallet with no opinion looks like.
      let removals = supabase
        .from('wallet_categories')
        .delete()
        .eq('wallet_id', walletId)
      if (categoryIds.length) {
        // Quoted: PostgREST splits the list on commas, and a bare uuid is fine
        // today, but quoting is what keeps that from depending on the id format.
        removals = removals.not(
          'category_id',
          'in',
          `(${categoryIds.map((id) => `"${id}"`).join(',')})`,
        )
      }
      const { error } = await removals
      if (error) throw error
    },
    onSuccess: (_result, { walletId }) => {
      qc.invalidateQueries({ queryKey: ['wallet_categories', walletId] })
    },
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
