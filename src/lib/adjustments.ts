/**
 * Balance adjustments — the row recorded when a wallet is told what it is really
 * worth.
 *
 * Balances are derived (invariant 2), so "set this to 5 000" can only be stored
 * as a transaction for the gap. That row is real money movement and belongs in
 * the ledger, but it is not a purchase, so the feed draws it quietly — the same
 * reading transfers get.
 *
 * **The category name is the marker**, which is the honest limitation to know
 * about: rename the category and the row stops being drawn as an adjustment.
 * That is tolerable because renaming it is a deliberate act that says "treat
 * this as a normal category", and the alternative — a column on `transactions`,
 * or a reserved id in settings — is a schema concept for a presentational
 * distinction. The constant lives here so the code that *writes* adjustments and
 * the code that *recognises* them cannot drift to different strings.
 */
import type { Category } from './db'

export const ADJUSTMENT_CATEGORY = 'Balance adjustment'

export const isAdjustment = (category: Category | undefined): boolean =>
  category?.name === ADJUSTMENT_CATEGORY
