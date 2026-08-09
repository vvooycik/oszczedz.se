import { useMemo } from 'react'
import { Sparkline } from '@/components/Sparkline'
import {
  useWalletBalances,
  useWalletMonthlyNet,
  useWallets,
} from '@/data/queries'
import { asMinor, formatAmount, formatSigned } from '@/lib/money'
import { categoryVar, categoryColor } from '@/theme/tokens'
import { startOfMonth, today } from '@/lib/dates'
import type { Wallet, WalletMonthlyNet } from '@/lib/db'

const CURRENCY = 'PLN'

const SECTIONS = [
  { key: 'accounts', label: 'Accounts', types: ['account'] },
  { key: 'savings', label: 'Savings', types: ['savings'] },
  { key: 'debt', label: 'Debt', types: ['credit_card', 'loan'] },
] as const

/** Running balance per month, for the sparkline. */
function historyFor(wallet: Wallet, nets: WalletMonthlyNet[]): number[] {
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

function WalletRow({
  wallet,
  balance,
  nets,
}: {
  wallet: Wallet
  balance: number
  nets: WalletMonthlyNet[]
}) {
  const color = categoryVar(wallet.color_scheme)
  const isCard = wallet.type === 'credit_card' && wallet.credit_limit !== null

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
    <div
      className="flex gap-3 py-3.5"
      style={{ borderBottom: '1px solid var(--color-line-soft)' }}
    >
      <div
        className="w-0.5 flex-none rounded-[1px]"
        style={{ background: color }}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <div className="truncate text-[15px]">{wallet.name}</div>
          {isCard ? (
            <div className="text-right">
              <div className="tnum text-[14.5px]">
                {formatAmount(asMinor(wallet.credit_limit! + balance))}
              </div>
              <div className="text-[11px] text-ink-faint">remaining</div>
            </div>
          ) : (
            <div
              className="tnum flex-none text-[14.5px]"
              style={{ color: balance < 0 ? 'var(--color-expense)' : undefined }}
            >
              {formatSigned(asMinor(balance), { plus: false })}
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
              {formatAmount(asMinor(wallet.credit_limit!))} limit
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
                : `${delta > 0 ? '↑' : '↓'} ${formatAmount(asMinor(delta))} ${deltaLabel}`}
            </div>
            <Sparkline
              values={historyFor(wallet, nets)}
              color={categoryColor(wallet.color_scheme)}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export function WalletsScreen() {
  const wallets = useWallets()
  const balances = useWalletBalances()
  const nets = useWalletMonthlyNet()

  const balanceOf = useMemo(
    () => new Map((balances.data ?? []).map((b) => [b.wallet_id, b.balance ?? 0])),
    [balances.data],
  )

  if (!wallets.data) {
    return <p className="px-5 py-10 text-[13px] text-ink-muted">Loading…</p>
  }

  const mine = wallets.data.filter((w) => w.currency === CURRENCY)
  const balanceFor = (w: Wallet) => balanceOf.get(w.id) ?? w.starting_balance

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
      <div className="flex items-baseline justify-between">
        <h1 className="text-[24px]">Wallets</h1>
        <span className="font-sans text-[11.5px] text-ink-faint">
          {mine.length} · {CURRENCY}
        </span>
      </div>

      {/* Assets against debt at a glance, before any per-wallet detail. */}
      <div className="mt-4 mb-1.5 flex h-2 overflow-hidden rounded-[2px]">
        <div style={{ width: `${(assets / span) * 100}%`, background: 'var(--color-accent)' }} />
        <div style={{ width: `${(debt / span) * 100}%`, background: 'var(--color-expense)' }} />
      </div>
      <div className="tnum text-[11px] text-ink-faint">
        Assets {formatAmount(asMinor(assets))} · Debt {formatAmount(asMinor(debt))}
      </div>

      {SECTIONS.map((section) => {
        const rows = mine.filter((w) =>
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
                {formatSigned(asMinor(subtotal), { plus: false })}
              </span>
            </div>
            <div className="h-px" style={{ background: 'var(--color-line)' }} />
            {rows.map((w) => (
              <WalletRow
                key={w.id}
                wallet={w}
                balance={balanceFor(w)}
                nets={nets.data ?? []}
              />
            ))}
          </section>
        )
      })}

      <div
        className="mt-6 flex items-baseline justify-between pb-2"
        style={{ borderBottom: '3px double var(--color-line)' }}
      >
        <span className="text-[15px]">Total wealth</span>
        <span
          className="tnum text-[16px]"
          style={{ color: total < 0 ? 'var(--color-expense)' : undefined }}
        >
          {formatSigned(asMinor(total), { plus: false })}
        </span>
      </div>

      <button
        className="mt-6 w-full rounded-[4px] py-3 text-[14px] text-accent"
        style={{ border: '1px solid var(--color-accent)' }}
      >
        Add a wallet
      </button>
    </div>
  )
}
