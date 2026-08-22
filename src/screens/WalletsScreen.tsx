import { useCallback, useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { IconPlus } from '@tabler/icons-react'
import { MasterDetail } from '@/app/MasterDetail'
import { isWide, useLayoutMode, WALLETS_MASTER_W } from '@/app/layout'
import { useListKeyboard } from '@/app/useListKeyboard'
import { selectedRowStyle } from '@/components/TransactionFeed'
import { WalletScreen } from '@/screens/wallets/WalletScreen'
import { Sparkline } from '@/components/Sparkline'
import { Card, Divider } from '@/components/ui/Card'
import { Label } from '@/components/ui/Label'
import { ActionTile } from '@/components/ui/Button'
import { Tile } from '@/components/ui/Tile'
import {
  useLoanProgress,
  useWalletBalances,
  useWalletMonthlyNet,
  useWallets,
} from '@/data/queries'
import {
  asMinor,
  formatAmountMoney,
  formatSigned,
  formatSignedMoney,
} from '@/lib/money'
import { categoryVar } from '@/theme/tokens'
import { iconFor } from '@/lib/icons'
import {
  activeWallets,
  balanceHistory,
  isArchived,
  loanStanding,
  walletGlyph,
} from '@/lib/wallets'
import { startOfMonth, today } from '@/lib/dates'
import type { LoanProgress, Wallet, WalletMonthlyNet } from '@/lib/db'

const CURRENCY = 'PLN'

const SECTIONS = [
  { key: 'accounts', label: 'Accounts', types: ['account'] },
  { key: 'savings', label: 'Savings', types: ['savings'] },
  { key: 'debt', label: 'Debt', types: ['credit_card', 'loan'] },
] as const

/** The 3px track a card's utilisation and a loan's progress both draw on. */
function ProgressBar({ fraction, colour }: { fraction: number; colour: string }) {
  return (
    <div className="mt-2 h-1.5 rounded-full bg-track">
      <div
        className="h-1.5 rounded-full"
        style={{ width: `${Math.min(100, fraction * 100)}%`, background: colour }}
      />
    </div>
  )
}

function WalletRow({
  wallet,
  balance,
  nets,
  loan,
  selected,
}: {
  wallet: Wallet
  balance: number
  nets: WalletMonthlyNet[]
  loan: LoanProgress | undefined
  /** Open in the detail pane. Never true below 1024, where there is no pane. */
  selected: boolean
}) {
  const hue = categoryVar(wallet.color_scheme)
  const Icon = iconFor(walletGlyph(wallet))
  const isCard = wallet.type === 'credit_card' && wallet.credit_limit !== null

  const { total, left, origin, repaid, progress: loanProgress } = loanStanding(
    wallet,
    balance,
    loan,
  )

  const thisMonth = startOfMonth(today())
  const monthNet = nets
    .filter((n) => n.wallet_id === wallet.id && n.month === thisMonth)
    .reduce((s, n) => s + (n.net ?? 0), 0)
  const yearNet = nets
    .filter(
      (n) => n.wallet_id === wallet.id && n.month?.slice(0, 4) === today().slice(0, 4),
    )
    .reduce((s, n) => s + (n.net ?? 0), 0)

  const [delta, deltaLabel] =
    monthNet !== 0 ? [monthNet, 'this month'] : [yearNet, 'this year']

  const trend = balanceHistory(wallet, nets)

  return (
    // The whole row opens the wallet. Its categories moved onto that screen when
    // it arrived — the row tap is worth more as "show me this wallet" than as a
    // shortcut to one setting.
    <Link
      to={`/wallets/${wallet.id}`}
      className="flex w-full items-center gap-[13px] px-4 py-[13px] text-left hover:bg-press active:bg-press"
      // The wallet's own hue, the same way a feed row takes its category's:
      // the pane beside it is washed in that colour, so the highlight and what
      // it opened read as one object.
      style={selected ? selectedRowStyle(hue) : undefined}
    >
      <Tile color={hue} size={40}>
        <Icon size={20} stroke={2} />
      </Tile>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <div className={`truncate text-row ${selected ? 'font-semibold' : 'font-medium'}`}>
            {wallet.name}
          </div>

          {isCard ? (
            <div className="flex-none text-right">
              <div className="tnum text-row font-semibold whitespace-nowrap">
                {formatAmountMoney(asMinor(wallet.credit_limit! + balance), wallet.currency)}
              </div>
              <div className="text-kicker text-ink-faint">remaining</div>
            </div>
          ) : (
            <div
              className="tnum flex-none text-row font-semibold whitespace-nowrap"
              style={{
                color:
                  balance < 0
                    ? 'var(--color-expense)'
                    : balance === 0
                      ? 'var(--color-ink-muted)'
                      : undefined,
              }}
            >
              {formatSignedMoney(asMinor(balance), wallet.currency, { plus: false })}
            </div>
          )}
        </div>

        {isCard ? (
          <>
            {/* Utilisation, not a trend: a card's story is how much headroom is
                left, which a sparkline of the balance does not show. The bar
                stays expense-red whatever the wallet's own hue is — the thing
                being reported is debt, not identity. */}
            <ProgressBar
              fraction={Math.abs(Math.min(balance, 0)) / wallet.credit_limit!}
              colour="var(--color-expense)"
            />
            <div className="tnum mt-[5px] text-meta-sm text-ink-muted">
              {formatSigned(asMinor(balance), { plus: false })} of{' '}
              {formatAmountMoney(asMinor(wallet.credit_limit!), wallet.currency)} limit
            </div>
          </>
        ) : loanProgress !== null ? (
          <>
            {/* Repayment as progress, the same shape the card uses — filled the
                other way round. A card's bar grows as it gets worse; a loan's
                grows as it gets better, so it takes the income colour. */}
            <ProgressBar fraction={loanProgress} colour="var(--color-income)" />
            <div className="tnum mt-[5px] text-meta-sm text-ink-muted">
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
                  {formatSigned(asMinor(repaid), { plus: false })} of{' '}
                  {formatAmountMoney(asMinor(origin), wallet.currency)} repaid
                </>
              )}
            </div>
          </>
        ) : (
          <div className="mt-px flex items-end justify-between gap-3">
            <div
              className="tnum truncate text-meta"
              style={{
                color:
                  delta === 0
                    ? 'var(--color-ink-muted)'
                    : delta > 0
                      ? 'var(--color-income)'
                      : 'var(--color-expense)',
              }}
            >
              {delta === 0
                ? 'No movement yet'
                : `${delta > 0 ? '↑' : '↓'} ${formatAmountMoney(asMinor(delta), wallet.currency)} ${deltaLabel}`}
            </div>
            {/* Dropped when there is nothing to draw: two points is a line
                between two arbitrary heights, which reads as a trend that does
                not exist. */}
            {trend.length > 2 && <Sparkline values={trend} />}
          </div>
        )}
      </div>
    </Link>
  )
}

export function WalletsScreen() {
  const mode = useLayoutMode()
  const wide = isWide(mode)
  const navigate = useNavigate()
  // `/wallets` and `/wallets/:id` are the same element on a wide layout, so the
  // selection is the route param and nothing else — see `MasterDetail`.
  const { id: openId } = useParams()
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
        (loans.data ?? []).filter((l) => l.wallet_id).map((l) => [l.wallet_id!, l]),
      ),
    [loans.data],
  )

  // The rows the arrow keys walk, in the order the sections draw them — open
  // wallets by section, then the closed ones. Derived before the loading guard
  // because a hook cannot sit behind an early return.
  const rowIds = useMemo(() => {
    const mine = (wallets.data ?? []).filter((w) => w.currency === CURRENCY)
    const open = activeWallets(mine)
    return [
      ...SECTIONS.flatMap((section) =>
        open
          .filter((w) => (section.types as readonly string[]).includes(w.type))
          .map((w) => w.id),
      ),
      ...mine.filter(isArchived).map((w) => w.id),
    ]
  }, [wallets.data])

  const select = useCallback(
    (id: string) => navigate(`/wallets/${id}`),
    [navigate],
  )
  useListKeyboard({
    enabled: wide,
    ids: rowIds,
    selected: openId ?? null,
    onSelect: select,
  })

  if (!wallets.data) {
    return <p className="px-4 py-10 text-value text-ink-muted">Loading…</p>
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

  const body = (
    <div className="flex flex-col gap-[14px] px-4 pt-1 md:px-8 lg:px-5 lg:pt-5 lg:pb-6">
      <div className="flex items-center justify-between px-1">
        <h1 className="text-title-sm font-semibold tracking-[-0.02em]">Wallets</h1>
        <ActionTile label="New wallet" onClick={() => navigate('/wallets/new')}>
          <IconPlus size={20} stroke={2} />
        </ActionTile>
      </div>

      <Card className="p-[18px]">
        <Label>Total wealth</Label>
        <div
          className="tnum mt-1.5"
          style={{
            fontSize: 'var(--text-stat-xs)',
            fontWeight: 600,
            letterSpacing: '-0.02em',
            color: total < 0 ? 'var(--color-expense)' : undefined,
          }}
        >
          {formatSignedMoney(asMinor(total), CURRENCY, { plus: false })}
        </div>

        {/* Assets against debt at a glance, before any per-wallet detail. Two
            bars with a gap rather than one split bar: the gap is what stops the
            eye reading the boundary as a value on a single scale. */}
        <div className="mt-3.5 flex h-2.5 gap-[3px]">
          <div
            className="rounded-full"
            style={{ width: `${(assets / span) * 100}%`, background: 'var(--color-income)' }}
          />
          <div
            className="rounded-full"
            style={{ width: `${(debt / span) * 100}%`, background: 'var(--color-expense)' }}
          />
        </div>
        <div className="mt-2 flex items-baseline justify-between text-meta text-ink-muted">
          <span className="tnum">Assets {formatAmountMoney(asMinor(assets), CURRENCY)}</span>
          <span className="tnum">Debt {formatAmountMoney(asMinor(debt), CURRENCY)}</span>
        </div>
      </Card>

      {SECTIONS.map((section) => {
        const rows = open.filter((w) =>
          (section.types as readonly string[]).includes(w.type),
        )
        if (rows.length === 0) return null
        const subtotal = rows.reduce((s, w) => s + balanceFor(w), 0)

        return (
          <section key={section.key} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between px-1">
              <Label>{section.label}</Label>
              <span
                className="tnum text-meta font-semibold"
                style={{
                  color:
                    subtotal < 0 ? 'var(--color-expense)' : 'var(--color-ink-muted)',
                }}
              >
                {formatSignedMoney(asMinor(subtotal), CURRENCY, { plus: false })}
              </span>
            </div>
            <Card>
              {rows.map((w, i) => (
                <div key={w.id}>
                  {i > 0 && <Divider />}
                  <WalletRow
                    wallet={w}
                    balance={balanceFor(w)}
                    nets={nets.data ?? []}
                    loan={loanOf.get(w.id)}
                    selected={w.id === openId}
                  />
                </div>
              ))}
            </Card>
          </section>
        )
      })}

      {closed.length > 0 && (
        <section className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between px-1">
            <Label>Closed</Label>
            <span className="text-meta text-ink-muted">{closed.length} archived</span>
          </div>
          <Card>
            {closed.map((w, i) => {
              const Icon = iconFor(walletGlyph(w))
              return (
                // Quiet, and without the sparkline or the progress bar: a closed
                // wallet has no trend left to read. Still a link, because its
                // history is the reason it is here at all.
                <div key={w.id}>
                  {i > 0 && <Divider inset={57} />}
                  <Link
                    to={`/wallets/${w.id}`}
                    className="flex w-full items-center gap-[13px] px-4 py-[13px] text-left opacity-60 hover:bg-press active:bg-press"
                    style={
                      w.id === openId
                        ? selectedRowStyle('var(--color-ink-muted)')
                        : undefined
                    }
                  >
                    <Tile size={36} variant="neutral">
                      <Icon size={18} stroke={2} />
                    </Tile>
                    <span className="min-w-0 flex-1 truncate text-row font-medium">
                      {w.name}
                    </span>
                    <span className="tnum flex-none text-value text-ink-muted">
                      {formatSignedMoney(asMinor(balanceFor(w)), w.currency, {
                        plus: false,
                      })}
                    </span>
                  </Link>
                </div>
              )
            })}
          </Card>
        </section>
      )}
    </div>
  )

  if (!wide) return body

  return (
    <MasterDetail
      mode={mode}
      masterWidth={WALLETS_MASTER_W}
      // Edge-to-edge at every wide width, unlike the transaction pane. This one
      // is a whole wallet washed in that wallet's colour, and putting it in a
      // rounded card would make it a picture of a wallet sitting on the ground
      // rather than the right half of the page.
      gap={0}
      bordered
      empty="Pick a wallet to see it here"
      master={<div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">{body}</div>}
      detail={openId ? <WalletScreen pane /> : null}
    />
  )
}
