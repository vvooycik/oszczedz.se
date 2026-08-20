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
export type Schedule = Tables<'schedules'>

// Views. Derived, never stored — see the balance invariant.
export type MonthlyCategoryTotal = Tables<'monthly_category_totals'>
export type MonthlyCashFlow = Tables<'monthly_cash_flow'>
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

/**
 * `wallet_balances` was a view and is now a function, so its row arrives through
 * the RPC side.
 *
 * The move is what lets the phone say which day it is. Settled and planned are
 * split on a calendar day the way `transactions.date` is (invariant 3), and
 * `current_date` is the *server's* day in UTC — so between local midnight and
 * 02:00 a transaction entered for today would read as planned and the balance
 * would silently refuse to move. Every column is coalesced in SQL, so the
 * generator's non-nullable guess is right here.
 */
export type WalletBalance = RpcRow<'wallet_balances'>

/**
 * `budget_progress` was a view and is now a function, so its row comes from the
 * RPC side. Every column is coalesced in SQL — there is no aggregate here that
 * can hand back a null — which is the rare case where the generator's
 * non-nullable guess is simply right.
 */
export type BudgetProgress = RpcRow<'budget_progress'>

export type TransactionInsert = TablesInsert<'transactions'>
export type WalletInsert = TablesInsert<'wallets'>
export type CategoryInsert = TablesInsert<'categories'>
export type ScheduleInsert = TablesInsert<'schedules'>

export type WalletType = Enums<'wallet_type'>
export type CategoryKind = Enums<'category_kind'>
export type BudgetPeriod = Enums<'budget_period'>
export type ScheduleFrequency = Enums<'schedule_frequency'>
