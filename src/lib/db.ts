/**
 * Domain aliases over the generated database types.
 *
 * `database.types.ts` is generated (`npm run db:types`) and gets overwritten
 * wholesale, so nothing hand-written may live there. Import app-facing types
 * from here instead — this file is the seam that survives regeneration.
 */
import type { Enums, Tables, TablesInsert } from './database.types'

export type Wallet = Tables<'wallets'>
export type Category = Tables<'categories'>
export type Tag = Tables<'tags'>
export type Transaction = Tables<'transactions'>
export type Budget = Tables<'budgets'>

// Views. Derived, never stored — see the balance invariant.
export type WalletBalance = Tables<'wallet_balances'>
export type MonthlyCategoryTotal = Tables<'monthly_category_totals'>

export type TransactionInsert = TablesInsert<'transactions'>
export type WalletInsert = TablesInsert<'wallets'>
export type CategoryInsert = TablesInsert<'categories'>

export type WalletType = Enums<'wallet_type'>
export type CategoryKind = Enums<'category_kind'>
export type BudgetPeriod = Enums<'budget_period'>
