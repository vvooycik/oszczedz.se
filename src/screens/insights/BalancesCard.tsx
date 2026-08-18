import { useMemo } from 'react'
import { Link } from 'react-router'
import { IconChevronRight } from '@tabler/icons-react'
import { Card, Divider } from '@/components/ui/Card'
import { LabelRow } from '@/components/ui/Label'
import { Sparkline } from '@/components/Sparkline'
import { Tile } from '@/components/ui/Tile'
import { iconFor } from '@/lib/icons'
import { asMinor, currencySymbol, formatSigned } from '@/lib/money'
import { activeWallets, balanceHistory, walletGlyph } from '@/lib/wallets'
import { categoryVar } from '@/theme/tokens'
import type { Wallet, WalletBalance, WalletMonthlyNet } from '@/lib/db'

const W = 326
const H = 88
const PAD = 4

/**
 * What everything is worth, and how each wallet got there.
 *
 * The total is period-scoped and comes from `balance_history`, already thinned
 * in Postgres. The **per-wallet lines are the wallet's whole monthly history**,
 * not the selected period, and that is deliberate: a 1M period is one row of
 * `wallet_monthly_net` and therefore no line at all, and a per-wallet daily
 * series would be a fifth round trip and ~150 rows to draw a 56px mark. The
 * period owns the total; the row shows the wallet.
 *
 * The lines share a **span**, so they are comparable — a wallet that moved 12 zł
 * must not look as dramatic as one that moved 12 000. They do not share a
 * min/max, which is the literal reading and unusable here: with a loan at
 * −20 000 in the set, one scale flattens every other wallet to a dead line. See
 * `Sparkline`'s `span` prop.
 */
export function BalancesCard({
  wallets,
  balances,
  nets,
  history,
  currency,
  periodLabel,
}: {
  wallets: Wallet[]
  balances: WalletBalance[]
  nets: WalletMonthlyNet[]
  history: { day: string; balance: number }[]
  currency: string
  periodLabel: string
}) {
  const open = useMemo(
    () => activeWallets(wallets).filter((w) => w.currency === currency),
    [wallets, currency],
  )

  const rows = useMemo(() => {
    const balanceOf = new Map(balances.map((b) => [b.wallet_id, b.balance ?? 0]))
    return open
      .map((wallet) => ({
        wallet,
        balance: balanceOf.get(wallet.id) ?? wallet.starting_balance,
        trend: balanceHistory(wallet, nets),
      }))
      // Biggest first by size, not by sign: a −20 000 loan is the largest thing
      // on the screen and belongs at the top of it.
      .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance))
  }, [open, balances, nets])

  // One span for every row: the widest movement any wallet made.
  const span = useMemo(
    () =>
      Math.max(
        1,
        ...rows.map((r) =>
          r.trend.length > 1 ? Math.max(...r.trend) - Math.min(...r.trend) : 0,
        ),
      ),
    [rows],
  )

  // Every wallet, archived included — the same rule the wallets screen follows.
  // Archiving requires a zero balance, so this is the same number either way,
  // and computing it over the visible ones would go quietly wrong if that ever
  // stopped being true.
  const total = balances
    .filter((b) => b.currency === currency)
    .reduce((sum, b) => sum + (b.balance ?? 0), 0)

  const moved =
    history.length > 1 ? history[history.length - 1]!.balance - history[0]!.balance : 0

  const lo = history.length ? Math.min(...history.map((p) => p.balance)) : 0
  const hi = history.length ? Math.max(...history.map((p) => p.balance)) : 0
  const range = hi - lo || 1
  const totalLine = history
    .map((p, i) => {
      const x = PAD + (i / Math.max(1, history.length - 1)) * (W - PAD * 2)
      const y = H - PAD - ((p.balance - lo) / range) * (H - PAD * 2)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <section className="flex flex-col gap-2">
      <LabelRow
        trailing={
          <span className="tnum text-[12px] text-ink-muted">
            {open.length} wallet{open.length === 1 ? '' : 's'}
          </span>
        }
      >
        Balances
      </LabelRow>

      <Card className="pt-[18px] pb-1.5">
        <div className="px-[18px]">
          <div
            className="tnum"
            style={{
              fontSize: 30,
              fontWeight: 600,
              lineHeight: 1,
              letterSpacing: '-.03em',
              color: total < 0 ? 'var(--color-expense)' : undefined,
            }}
          >
            {formatSigned(asMinor(total), { plus: false })}
            <span
              className="text-ink-faint"
              style={{ fontSize: 16, fontWeight: 500, letterSpacing: 0 }}
            >
              {' '}
              {currencySymbol(currency)}
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-[7px] text-[12.5px]">
            <span
              className="tnum font-semibold"
              style={{
                color: moved >= 0 ? 'var(--color-income)' : 'var(--color-expense)',
              }}
            >
              {formatSigned(asMinor(moved))} {currencySymbol(currency)}
            </span>
            <span className="text-ink-muted">in {periodLabel}</span>
          </div>
        </div>

        {history.length > 1 && (
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="mt-2.5 block w-full"
            style={{ height: 'auto' }}
            aria-hidden="true"
          >
            <polyline
              fill="none"
              // Sign-painted like every other balance mark in the app: the total
              // line takes expense when the wealth is negative, income when it
              // is not. Never the accent.
              stroke={total < 0 ? 'var(--color-expense)' : 'var(--color-income)'}
              strokeWidth="2.2"
              strokeLinejoin="round"
              strokeLinecap="round"
              points={totalLine}
            />
          </svg>
        )}

        <div className="mt-2 flex flex-col">
          {rows.map((row, i) => {
            const Glyph = iconFor(walletGlyph(row.wallet))
            return (
              <div key={row.wallet.id}>
                <Divider inset={i === 0 ? 16 : 62} />
                <Link
                  to={`/wallets/${row.wallet.id}`}
                  className="flex items-center gap-3 px-4 py-[11px] active:bg-press"
                >
                  <Tile color={categoryVar(row.wallet.color_scheme)} size={34}>
                    <Glyph size={18} stroke={2} />
                  </Tile>
                  <span className="min-w-0 flex-1 truncate text-[14.5px] font-medium">
                    {row.wallet.name}
                  </span>
                  <Sparkline values={row.trend} width={56} height={20} span={span} />
                  {/* A fixed column so the figures form a right-aligned stack
                      rather than each one ending wherever its digits do. */}
                  <span
                    className="tnum flex-none text-right text-[14.5px] font-semibold"
                    style={{ minWidth: 92 }}
                  >
                    {formatSigned(asMinor(row.balance), { plus: false })}
                  </span>
                  <IconChevronRight
                    size={16}
                    stroke={2}
                    className="flex-none text-ink-dim"
                  />
                </Link>
              </div>
            )
          })}
        </div>
      </Card>
    </section>
  )
}
