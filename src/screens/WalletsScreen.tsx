import { useMemo } from 'react'
import { Link } from 'react-router'
import { Sparkline } from '@/components/Sparkline'
import {
  useLoanProgress,
  useWalletBalances,
  useWalletMonthlyNet,
  useWallets,
} from '@/data/queries'
import { asMinor, currencySymbol, formatAmount, formatSigned } from '@/lib/money'
import { categoryVar } from '@/theme/tokens'
import { iconFor } from '@/lib/icons'
import {
  activeWallets,
  balanceHistory,
  glyphForWalletType,
  isArchived,
  loanStanding,
} from '@/lib/wallets'
import { startOfMonth, today } from '@/lib/dates'
import type { LoanProgress, Wallet, WalletMonthlyNet } from '@/lib/db'

const CURRENCY = 'PLN'
/** "zł". Taken from Intl rather than hardcoded, so an unknown code degrades to
 *  its own name instead of rendering nothing. */
const SYMBOL = currencySymbol(CURRENCY)

const SECTIONS = [
  { key: 'accounts', label: 'Accounts', types: ['account'] },
  { key: 'savings', label: 'Savings', types: ['savings'] },
  { key: 'debt', label: 'Debt', types: ['credit_card', 'loan'] },
] as const

function WalletRow({
  wallet,
  balance,
  nets,
  loan,
}: {
  wallet: Wallet
  balance: number
  nets: WalletMonthlyNet[]
  loan: LoanProgress | undefined
}) {
  const color = categoryVar(wallet.color_scheme)
  const Icon = iconFor(glyphForWalletType(wallet.type))
  const isCard = wallet.type === 'credit_card' && wallet.credit_limit !== null

  const {
    total,
    left,
    origin,
    repaid,
    progress: loanProgress,
  } = loanStanding(wallet, balance, loan)

  const thisMonth = startOfMonth(today())
  const monthNet = nets
    .filter((n) => n.wallet_id === wallet.id && n.month === thisMonth)
    .reduce((s, n) => s + (n.net ?? 0), 0)
  const yearNet = nets
    .filter(
      (n) =>
        n.wallet_id === wallet.id && n.month?.slice(0, 4) === today().slice(0, 4),
    )
    .reduce((s, n) => s + (n.net ?? 0), 0)

  const [delta, deltaLabel] =
    monthNet !== 0 ? [monthNet, 'this month'] : [yearNet, 'this year']

  return (
    // The whole row opens the wallet. Its categories moved onto that screen when
    // it arrived — the row tap is worth more as "show me this wallet" than as a
    // shortcut to one setting.
    <Link
      to={`/wallets/${wallet.id}`}
      className="flex w-full gap-3 py-3.5 text-left"
      style={{ borderBottom: '1px solid var(--color-line-soft)' }}
    >
      {/* Replaces the coloured rule that used to sit here. The rule said only
          what the section heading already did; the type mark is the thing a
          glance actually wants, and it keeps the wallet's tint. */}
      {/* `items-center` against a span that stretches to the row's full height,
          so the mark sits level with the row rather than with its first line —
          the rows are two lines tall and unequal, so aligning to the top left it
          drifting up on every one of them. */}
      <span
        className="flex w-[26px] flex-none items-center justify-center"
        style={{ color }}
      >
        <Icon size={22} strokeWidth={1.5} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <div className="truncate text-[15px]">{wallet.name}</div>
          {isCard ? (
            <div className="flex-none text-right">
              <div className="flex items-baseline justify-end gap-1">
                <span className="tnum text-[14.5px]">
                  {formatAmount(asMinor(wallet.credit_limit! + balance))}
                </span>
                <span className="font-sans text-[11px] text-ink-faint">{SYMBOL}</span>
              </div>
              <div className="text-[11px] text-ink-faint">remaining</div>
            </div>
          ) : (
            <div className="flex flex-none items-baseline gap-1">
              <span
                className="tnum text-[14.5px]"
                style={{ color: balance < 0 ? 'var(--color-expense)' : undefined }}
              >
                {formatSigned(asMinor(balance), { plus: false })}
              </span>
              {/* Faint and outside the tnum: the figure stays the thing being
                  read down the column, the symbol only says what it is. */}
              <span className="font-sans text-[11px] text-ink-faint">{SYMBOL}</span>
            </div>
          )}
        </div>

        {isCard ? (
          <>
            {/* Utilisation, not a trend: a card's story is how much headroom
                is left, which a sparkline of the balance does not show. */}
            <div
              className="mt-2 h-[3px] rounded-[2px]"
              style={{ background: 'var(--color-track)' }}
            >
              <div
                className="h-[3px] rounded-[2px]"
                style={{
                  width: `${Math.min(100, (Math.abs(Math.min(balance, 0)) / wallet.credit_limit!) * 100)}%`,
                  background: 'var(--color-expense)',
                }}
              />
            </div>
            <div className="tnum mt-[5px] text-[11.5px] text-ink-faint">
              {formatSigned(asMinor(balance), { plus: false })} of{' '}
              {formatAmount(asMinor(wallet.credit_limit!))} {SYMBOL} limit
            </div>
          </>
        ) : loanProgress !== null ? (
          <>
            {/* Repayment as progress, the same shape the card uses for
                utilisation — but filled the other way round. A card's bar grows
                as it gets worse; a loan's grows as it gets better, so it takes
                the income colour. */}
            <div
              className="mt-2 h-[3px] rounded-[2px]"
              style={{ background: 'var(--color-track)' }}
            >
              <div
                className="h-[3px] rounded-[2px]"
                style={{
                  width: `${loanProgress * 100}%`,
                  background: 'var(--color-income)',
                }}
              />
            </div>
            <div className="tnum mt-[5px] text-[11.5px] text-ink-faint">
              {total !== null ? (
                left === 0 ? (
                  <>All {total} settlements paid</>
                ) : (
                  <>
                    {left} of {total} settlement{total === 1 ? '' : 's'} left
                  </>
                )
              ) : (
                <>
                  {formatAmount(asMinor(repaid))} of{' '}
                  {formatAmount(asMinor(origin))} {SYMBOL} repaid
                </>
              )}
            </div>
          </>
        ) : (
          <div className="mt-1 flex items-end justify-between gap-3">
            <div
              className="tnum text-[11.5px]"
              style={{
                color:
                  delta === 0
                    ? 'var(--color-ink-faint)'
                    : delta > 0
                      ? 'var(--color-income)'
                      : 'var(--color-expense)',
              }}
            >
              {delta === 0
                ? 'No movement yet'
                : `${delta > 0 ? '↑' : '↓'} ${formatAmount(asMinor(delta))} ${SYMBOL} ${deltaLabel}`}
            </div>
            <Sparkline values={balanceHistory(wallet, nets)} />
          </div>
        )}
      </div>
    </Link>
  )
}

export function WalletsScreen() {
  const wallets = useWallets()
  const balances = useWalletBalances()
  const nets = useWalletMonthlyNet()
  const loans = useLoanProgress()

  const balanceOf = useMemo(
    () => new Map((balances.data ?? []).map((b) => [b.wallet_id, b.balance ?? 0])),
    [balances.data],
  )

  // View columns come back nullable — Postgres cannot prove non-null through an
  // aggregate — so the id is guarded before it becomes a key.
  const loanOf = useMemo(
    () =>
      new Map(
        (loans.data ?? [])
          .filter((l) => l.wallet_id)
          .map((l) => [l.wallet_id!, l]),
      ),
    [loans.data],
  )

  if (!wallets.data) {
    return <p className="px-5 py-10 text-[13px] text-ink-muted">Loading…</p>
  }

  const mine = wallets.data.filter((w) => w.currency === CURRENCY)
  const open = activeWallets(mine)
  const closed = mine.filter(isArchived)
  const balanceFor = (w: Wallet) => balanceOf.get(w.id) ?? w.starting_balance

  // Totals run over *every* wallet, archived included. Archiving requires a zero
  // balance, so this is the same number either way — but computing it over the
  // visible ones would quietly become wrong if an archived wallet ever drifted
  // off zero (an old transaction edited, say), and the total is the one figure
  // on this screen that must never be a half-truth. The Closed section shows the
  // balance too, so a drift is visible rather than merely counted.
  const assets = mine
    .map(balanceFor)
    .filter((b) => b > 0)
    .reduce((a, b) => a + b, 0)
  const debt = Math.abs(
    mine
      .map(balanceFor)
      .filter((b) => b < 0)
      .reduce((a, b) => a + b, 0),
  )
  const total = assets - debt
  const span = assets + debt || 1

  return (
    <div className="px-5 pt-3.5 pb-40">
      {/* No count and no currency code beside the title. "7 · PLN" sat in the
          top right of a screen made of money and read as an amount. The
          currency belongs on the figures themselves, where it cannot be
          mistaken for one. */}
      <h1 className="text-[24px]">Wallets</h1>

      {/* The answer first. It used to sit under every section as a closing
          balance, which is where a ledger puts it — but this is a summary
          screen, and the number you came for should not need a scroll. The
          double rule stays, above the detail instead of below it. */}
      <div
        className="mt-3.5 flex items-baseline justify-between pb-2"
        style={{ borderBottom: '3px double var(--color-line)' }}
      >
        <span className="text-[13px] text-ink-muted">Total wealth</span>
        <span className="flex items-baseline gap-1.5">
          <span
            className="tnum text-[22px]"
            style={{ color: total < 0 ? 'var(--color-expense)' : undefined }}
          >
            {formatSigned(asMinor(total), { plus: false })}
          </span>
          {/* Symbol as its own faint sans span, the way the entry screen sets
              "zł" beside its big figure — and outside the tnum, since only the
              digits need to hold a column. */}
          <span className="font-sans text-[13px] text-ink-faint">{SYMBOL}</span>
        </span>
      </div>

      {/* Assets against debt at a glance, before any per-wallet detail. */}
      <div className="mt-3 mb-1.5 flex h-2 overflow-hidden rounded-[2px]">
        <div style={{ width: `${(assets / span) * 100}%`, background: 'var(--color-accent)' }} />
        <div style={{ width: `${(debt / span) * 100}%`, background: 'var(--color-expense)' }} />
      </div>
      <div className="tnum text-[11px] text-ink-faint">
        Assets {formatAmount(asMinor(assets))} {SYMBOL} · Debt{' '}
        {formatAmount(asMinor(debt))} {SYMBOL}
      </div>

      {SECTIONS.map((section) => {
        const rows = open.filter((w) =>
          (section.types as readonly string[]).includes(w.type),
        )
        if (rows.length === 0) return null
        const subtotal = rows.reduce((s, w) => s + balanceFor(w), 0)

        return (
          <section key={section.key}>
            <div className="flex items-baseline justify-between pt-5 pb-2">
              <span className="kicker text-ink-muted">{section.label}</span>
              <span
                className="tnum text-[11.5px]"
                style={{
                  color:
                    subtotal < 0 ? 'var(--color-expense)' : 'var(--color-ink-faint)',
                }}
              >
                {formatSigned(asMinor(subtotal), { plus: false })} {SYMBOL}
              </span>
            </div>
            <div className="h-px" style={{ background: 'var(--color-line)' }} />
            {rows.map((w) => (
              <WalletRow
                key={w.id}
                wallet={w}
                balance={balanceFor(w)}
                nets={nets.data ?? []}
                loan={loanOf.get(w.id)}
              />
            ))}
          </section>
        )
      })}

      {closed.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between pt-5 pb-2">
            <span className="kicker text-ink-muted">Closed</span>
            <span className="font-sans text-[11px] text-ink-faint">
              {closed.length} archived
            </span>
          </div>
          <div className="h-px" style={{ background: 'var(--color-line)' }} />
          {closed.map((w) => (
            // Quiet, and without the sparkline or the progress bar: a closed
            // wallet has no trend left to read. Still a link, because its
            // history is the reason it is here at all.
            <Link
              key={w.id}
              to={`/wallets/${w.id}`}
              className="flex w-full items-center gap-3 py-3 text-left opacity-60"
              style={{ borderBottom: '1px solid var(--color-line-soft)' }}
            >
              <span className="flex w-[26px] flex-none justify-center text-ink-faint">
                {(() => {
                  const Icon = iconFor(glyphForWalletType(w.type))
                  return <Icon size={18} strokeWidth={1.5} />
                })()}
              </span>
              <span className="min-w-0 flex-1 truncate text-[14px]">{w.name}</span>
              <span className="tnum flex-none text-[12.5px] text-ink-faint">
                {formatSigned(asMinor(balanceFor(w)), { plus: false })} {SYMBOL}
              </span>
            </Link>
          ))}
        </section>
      )}

      <p className="pt-6 text-center text-[11.5px] leading-[1.5] text-ink-muted">
        Tap a wallet for everything that moved through it.
      </p>
    </div>
  )
}
