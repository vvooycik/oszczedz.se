/**
 * Domain aliases over the generated database types.
 *
 * `database.types.ts` is generated (`npm run db:types`) and gets overwritten
 * wholesale, so nothing hand-written may live there. Import app-facing types
 * from here instead — this file is the seam that survives regeneration.
 */
import type { Database, Enums, Tables, TablesInsert } from './database.types'

export type Wallet = Tables<'wallets'>
export type Category = Tables<'categories'>
export type Tag = Tables<'tags'>
export type Transaction = Tables<'transactions'>
export type Budget = Tables<'budgets'>

// Views. Derived, never stored — see the balance invariant.
export type WalletBalance = Tables<'wallet_balances'>
export type MonthlyCategoryTotal = Tables<'monthly_category_totals'>
export type MonthlyCashFlow = Tables<'monthly_cash_flow'>
export type BudgetProgress = Tables<'budget_progress'>
export type WalletMonthlyNet = Tables<'wallet_monthly_net'>
export type CategoryUsage = Tables<'category_usage'>
export type LoanProgress = Tables<'loan_progress'>
export type UserSettings = Tables<'user_settings'>

/* --------------------------------------------------------------- RPC rows */

/**
 * The row type of a `returns table (...)` function.
 *
 * The generator emits these as non-nullable, because a function signature says
 * nothing about which columns can come back null — the same blind spot that
 * makes *view* columns nullable, in the opposite direction. Where a function
 * really can return a null, say so here rather than letting the call site find
 * out.
 */
type RpcRow<Name extends keyof Database['public']['Functions']> =
  Database['public']['Functions'][Name]['Returns'] extends readonly (infer Row)[]
    ? Row
    : never

/**
 * `spent` is null for every day of the period that has not happened yet, which
 * is exactly what makes the pace line stop at today rather than fall to zero.
 */
export type PacePoint = Omit<RpcRow<'spending_pace'>, 'spent'> & {
  spent: number | null
}

export type CategoryPeriodTotal = RpcRow<'category_period_totals'>

export type TransactionInsert = TablesInsert<'transactions'>
export type WalletInsert = TablesInsert<'wallets'>
export type CategoryInsert = TablesInsert<'categories'>

export type WalletType = Enums<'wallet_type'>
export type CategoryKind = Enums<'category_kind'>
export type BudgetPeriod = Enums<'budget_period'>
