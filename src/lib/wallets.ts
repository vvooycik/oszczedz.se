/**
 * What each wallet type is called and what it looks like.
 *
 * The icon comes from the **type**, not from the row's `glyph` column. That
 * column is free text and the legacy import wrote `'wallet'` into all seven, so
 * reading it would draw the same mark on an account, a savings account, a credit
 * card and a loan — the one distinction the icon exists to make. The create
 * screen writes the type's glyph into the column so the two agree for anything
 * made in the app; the list does not depend on that having happened.
 */
import type { LoanProgress, Wallet, WalletMonthlyNet, WalletType } from './db'

export const WALLET_TYPES: {
  key: WalletType
  label: string
  glyph: string
  blurb: string
}[] = [
  { key: 'account', label: 'Account', glyph: 'wallet', blurb: 'Everyday money' },
  { key: 'savings', label: 'Savings', glyph: 'piggy-bank', blurb: 'Money set aside' },
  {
    key: 'credit_card',
    label: 'Credit card',
    glyph: 'credit-card',
    blurb: 'Spent against a limit',
  },
  { key: 'loan', label: 'Loan', glyph: 'landmark', blurb: 'Repaid over time' },
]

const BY_TYPE = new Map(WALLET_TYPES.map((t) => [t.key, t]))

/** Falls back to the plain wallet mark for a type the map has not caught up to. */
export const glyphForWalletType = (type: WalletType): string =>
  BY_TYPE.get(type)?.glyph ?? 'wallet'

export const labelForWalletType = (type: WalletType): string =>
  BY_TYPE.get(type)?.label ?? 'Wallet'

/**
 * Archived wallets stay in `useWallets` — the feed still has to resolve the name
 * on a two-year-old transaction — so hiding them is each screen's own job, and
 * this is the one place that decides what "hidden" means.
 */
export const isArchived = (wallet: Wallet): boolean => wallet.archived_at !== null

/** Wallets you can still put money into: the pickers and the list want these. */
export const activeWallets = (wallets: Wallet[]): Wallet[] =>
  wallets.filter((w) => !isArchived(w))

/**
 * Running balance per month, for a sparkline.
 *
 * Accumulated here rather than materialised per day per wallet in Postgres —
 * `wallet_monthly_net` is deliberately net movement, and a month is as fine as
 * a 120px mark can show. Drawn small on the list and wide on the detail screen
 * from this one series.
 */
export function balanceHistory(
  wallet: Wallet,
  nets: WalletMonthlyNet[],
): number[] {
  const mine = nets
    .filter((n) => n.wallet_id === wallet.id && n.month)
    .sort((a, b) => (a.month! < b.month! ? -1 : 1))

  let running = wallet.starting_balance
  const points = [running]
  for (const n of mine) {
    running += n.net ?? 0
    points.push(running)
  }
  return points
}

/**
 * How far through a loan is, in both the ways it can be told.
 *
 * Installments are the better story when the loan knows how many it runs to.
 * When it does not — every imported loan, since nothing ever set the column —
 * the money still says it: the wallet opened at the total to repay and climbs
 * towards zero, so the share already cleared is a real fraction rather than a
 * stand-in. Only a loan opened at zero has neither, and `progress` is null there
 * so the caller can fall back to a plain trend line.
 *
 * Shared rather than computed per screen: the list and the detail page draw the
 * same bar at different sizes, and two copies of this would drift.
 */
export function loanStanding(
  wallet: Wallet,
  balance: number,
  loan: LoanProgress | undefined,
) {
  const total = loan?.installment_count ?? null
  const paid = loan?.paid_count ?? 0
  // Overpaying past the plan floors at zero rather than going negative — the
  // count that matters is how many are left, and that is none.
  const left = Math.max(0, (total ?? 0) - paid)

  const origin = Math.abs(wallet.starting_balance)
  const repaid = Math.max(0, origin - Math.abs(Math.min(balance, 0)))

  const progress =
    wallet.type !== 'loan'
      ? null
      : total !== null && total > 0
        ? Math.min(1, paid / total)
        : origin > 0
          ? Math.min(1, repaid / origin)
          : null

  return { total, paid, left, origin, repaid, progress }
}
