import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import {
  IconChevronLeft,
  IconChevronRight,
  IconClock,
  IconPencil,
  IconPlus,
} from '@tabler/icons-react'
import { FullScreen } from '@/app/AppShell'
import { DOCK_SPACER } from '@/app/TabBar'
import { useGoBack } from '@/app/useGoBack'
import { useTheme } from '@/theme/ThemeProvider'
import { MonthStepper } from '@/components/MonthStepper'
import { Sparkline } from '@/components/Sparkline'
import { TransactionFeed } from '@/components/TransactionFeed'
import { Card, CardRow, Divider } from '@/components/ui/Card'
import { colourFieldStyle } from '@/components/ui/ColourField'
import { Label } from '@/components/ui/Label'
import { ActionTile } from '@/components/ui/Button'
import {
  useCategories,
  useLoanProgress,
  useWalletBalances,
  useWalletCategoryIds,
  useWalletMonthlyNet,
  useWalletTransactions,
  useWallets,
} from '@/data/queries'
import { iconFor } from '@/lib/icons'
import {
  asMinor,
  currencySymbol,
  formatAmountMoney,
  formatSigned,
} from '@/lib/money'
import { formatMonthLabel, startOfMonth, today } from '@/lib/dates'
import { balanceHistory, isArchived, loanStanding, walletGlyph } from '@/lib/wallets'
import { categoryVar } from '@/theme/tokens'
import { AdjustBalanceSheet } from './AdjustBalanceSheet'
import { WalletCategoriesEditor } from './WalletCategoriesSheet'

/** The bar on a colour field: its track has to be a scrim, not the ink token. */
function FieldBar({ fraction, colour }: { fraction: number; colour: string }) {
  return (
    <div className="mt-4 h-2 rounded-full" style={{ background: 'var(--field-block)' }}>
      <div
        className="h-2 rounded-full"
        style={{ width: `${Math.min(100, fraction * 100)}%`, background: colour }}
      />
    </div>
  )
}

/**
 * One wallet: what it holds, and everything that ever moved through it.
 *
 * The feed is the same component the home screen draws, handed a filtered set
 * rather than a filtered copy of itself — a per-wallet feed that diverged from
 * the main one would be two things to keep in step for no gain.
 */
export function WalletScreen() {
  const { id } = useParams()
  const goBack = useGoBack('/wallets')
  const navigate = useNavigate()

  const wallets = useWallets()
  const balances = useWalletBalances()
  const nets = useWalletMonthlyNet()
  const loans = useLoanProgress()
  const categories = useCategories()
  const categoryIds = useWalletCategoryIds(id)

  // Which month the feed at the foot of this screen is showing. Everything
  // above it — the balance, the bar, the sparkline — is the wallet as it stands
  // now and stays put; the list is the part you page through.
  const [month, setMonth] = useState(() => startOfMonth(today()))
  const transactions = useWalletTransactions(id, month)

  const [catOpen, setCatOpen] = useState(false)
  const [adjustOpen, setAdjustOpen] = useState(false)
  const { resolvedMode } = useTheme()

  const wallet = useMemo(
    () => (wallets.data ?? []).find((w) => w.id === id),
    [wallets.data, id],
  )

  // What is booked against this wallet but has not charged. Its own figure
  // rather than folded into the balance: the whole point of the split is that
  // the number above it is money that is actually there.
  const planned = useMemo(() => {
    if (!wallet) return 0
    return (
      (balances.data ?? []).find((b) => b.wallet_id === wallet.id)?.planned ?? 0
    )
  }, [balances.data, wallet])

  const balance = useMemo(() => {
    if (!wallet) return 0
    const row = (balances.data ?? []).find((b) => b.wallet_id === wallet.id)
    return row?.balance ?? wallet.starting_balance
  }, [balances.data, wallet])

  if (!wallet) {
    return (
      <FullScreen>
        <p className="px-4 py-10 text-[13px] text-ink-muted">
          {wallets.data ? 'That wallet no longer exists.' : 'Loading…'}
        </p>
      </FullScreen>
    )
  }

  const Icon = iconFor(walletGlyph(wallet))
  const loan = (loans.data ?? []).find((l) => l.wallet_id === wallet.id)
  const { total, left, origin, repaid, progress } = loanStanding(wallet, balance, loan)
  const isCard = wallet.type === 'credit_card' && wallet.credit_limit !== null
  const chosen = categoryIds.data?.length ?? 0
  const trend = balanceHistory(wallet, nets.data ?? [])

  // The stepper's floor, taken from the monthly nets this screen already loads
  // for the sparkline rather than from a query of its own: that view has one
  // row per month this wallet saw movement in, so the earliest of them *is* the
  // first month there is anything to show. Using the global first-transaction
  // date instead would let a wallet opened last year page back through 2023 to
  // find nothing.
  const firstMonth = (nets.data ?? [])
    .filter((n) => n.wallet_id === wallet.id && n.month)
    .reduce<string | null>(
      (min, n) => (min == null || n.month! < min ? n.month! : min),
      null,
    )

  return (
    <FullScreen style={colourFieldStyle(wallet.color_scheme, resolvedMode)}>
      {/* The scroll column reserves the same lane the dock gets on a tabbed
          screen, for the same reason: the last feed row has to be scrollable
          out from under the button floating over it. */}
      <div
        className="no-scrollbar flex-1 overflow-y-auto"
        style={{ paddingBottom: DOCK_SPACER }}
      >
        <div className="px-4 pb-5">
          <header className="flex items-center gap-3 pt-1 pb-4">
            <ActionTile label="Back" onField onClick={goBack}>
              <IconChevronLeft size={20} stroke={2} />
            </ActionTile>
            <h1
              className="min-w-0 flex-1 truncate text-[19px] font-semibold tracking-[-0.01em]"
              style={{ color: 'var(--field-ink)' }}
            >
              {wallet.name}
            </h1>
            <ActionTile
              label="Edit wallet"
              onField
              onClick={() => navigate(`/wallets/${wallet.id}/edit`)}
            >
              <IconPencil size={19} stroke={2} />
            </ActionTile>
          </header>

          <div className="flex items-center gap-3">
            <span
              className="flex size-[34px] flex-none items-center justify-center rounded-tile-sm"
              style={{ background: 'var(--field-scrim)', color: 'var(--field-ink)' }}
            >
              <Icon size={19} stroke={2} />
            </span>
            <Label>{isCard ? 'Owed' : 'Balance'}</Label>
            {isArchived(wallet) && (
              <span
                className="rounded-full px-2 py-px text-[10.5px] font-semibold tracking-[0.06em] uppercase"
                style={{
                  border: '1px dashed var(--color-dash)',
                  color: 'var(--color-ink-muted)',
                }}
              >
                Closed
              </span>
            )}
          </div>

          <div
            className="tnum mt-2.5"
            style={{
              fontSize: 42,
              fontWeight: 600,
              lineHeight: 1,
              letterSpacing: '-0.035em',
              color: balance < 0 ? 'var(--color-expense)' : undefined,
            }}
          >
            {formatSigned(asMinor(balance), { plus: false })}
            <span
              className="text-ink-faint"
              style={{ fontSize: 19, fontWeight: 500, letterSpacing: 0 }}
            >
              {' '}
              {currencySymbol(wallet.currency)}
            </span>
          </div>

          {/* Reads as arithmetic waiting to happen — the sign is on the figure
              and the sentence says where it lands — because that is exactly
              what it is. Hidden at zero, which is every wallet with nothing
              scheduled against it. */}
          {planned !== 0 && (
            <Link
              to="/scheduled"
              className="tnum mt-2 flex items-center gap-1.5 text-[12.5px] text-ink-muted"
            >
              <IconClock size={13} stroke={2} className="text-ink-dim" />
              {formatSigned(asMinor(planned), { plus: planned > 0 })}{' '}
              {currencySymbol(wallet.currency)} planned ·{' '}
              {formatSigned(asMinor(balance + planned), { plus: false })} after
            </Link>
          )}

          {isCard && (
            <>
              <FieldBar
                fraction={Math.abs(Math.min(balance, 0)) / wallet.credit_limit!}
                colour="var(--color-expense)"
              />
              <div className="tnum mt-2 flex justify-between text-[12.5px] text-ink-muted">
                <span>
                  {formatAmountMoney(
                    asMinor(wallet.credit_limit! + balance),
                    wallet.currency,
                  )}{' '}
                  left
                </span>
                <span>
                  {formatAmountMoney(asMinor(wallet.credit_limit!), wallet.currency)} limit
                </span>
              </div>
            </>
          )}

          {progress !== null && (
            <>
              <FieldBar fraction={progress} colour="var(--color-income)" />
              <div className="tnum mt-2 text-[12.5px] text-ink-muted">
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
          )}

          {/* Wider than the list's, because there is room for it here — same
              series, same sign-painted rule. */}
          {!isCard && progress === null && trend.length > 2 && (
            <div className="mt-4">
              <Sparkline values={trend} width={330} height={56} strokeWidth={2} />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-[14px] px-4">
          <Card>
            {/* The balance is the figure this screen leads with, so the way to
                correct it belongs here rather than three taps away inside Edit
                wallet — and it is an *event*, not an attribute of the wallet. */}
            <CardRow onClick={() => setAdjustOpen(true)} className="cursor-pointer">
              <span className="flex-1 text-[15px] font-medium">Adjust balance</span>
              <span className="text-[13px] text-ink-muted">
                {isCard ? 'Owed or remaining' : 'Set what it really holds'}
              </span>
              <IconChevronRight size={18} stroke={2} className="text-ink-dim" />
            </CardRow>

            <Divider inset={16} />

            <CardRow onClick={() => setCatOpen(true)} className="cursor-pointer">
              <span className="flex-1 text-[15px] font-medium">Categories</span>
              <span className="text-[13px] text-ink-muted">
                {categoryIds.isPending
                  ? '—'
                  : chosen === 0
                    ? `All ${categories.data?.length ?? 0}`
                    : `${chosen} of ${categories.data?.length ?? 0}`}
              </span>
              <IconChevronRight size={18} stroke={2} className="text-ink-dim" />
            </CardRow>
          </Card>

          {/* `spread`, unlike Home's: nothing shares this line — there is no
              `/scheduled` link on a wallet — so the chevrons take the two edges
              and the month centres between them. */}
          <div className="-mb-1.5 px-1">
            <MonthStepper
              month={month}
              onChange={setMonth}
              earliest={firstMonth}
              spread
            />
          </div>

          {transactions.data ? (
            <TransactionFeed
              transactions={transactions.data}
              wallets={wallets.data ?? []}
              categories={categories.data ?? []}
              // Every row is this wallet, so naming it on each one is noise. The
              // note keeps its place on the same line.
              hideWallet
              empty={`Nothing moved through this wallet in ${formatMonthLabel(month)}.`}
            />
          ) : (
            <p className="py-8 text-center text-[13px] text-ink-muted">
              {transactions.error ? 'Could not load transactions.' : 'Loading…'}
            </p>
          )}
        </div>
      </div>

      {/* The same button the dock carries, in the same place — but this screen
          knows which wallet it is about, so it hands that to the form rather
          than letting it fall back to the last-used one.

          Not drawn on an archived wallet: a closed wallet is hidden from the
          entry form's select entirely, so the button would open a form that
          immediately disagrees with where it came from. */}
      {!isArchived(wallet) && (
        <button
          aria-label={`Add transaction to ${wallet.name}`}
          onClick={() => navigate(`/add?wallet=${wallet.id}`)}
          className="absolute flex size-[60px] items-center justify-center rounded-full text-accent-fg shadow-fab transition-transform duration-[90ms] active:scale-[.98]"
          style={{
            right: 16,
            bottom: 'calc(26px + env(safe-area-inset-bottom, 0px))',
            // The wallet's colour, not the accent. This screen is themed by the
            // wallet the whole way down — the same argument the entry screen
            // makes for its category-coloured Save.
            background: categoryVar(wallet.color_scheme),
          }}
        >
          <IconPlus size={26} stroke={2} />
        </button>
      )}

      <AdjustBalanceSheet
        wallet={wallet}
        balance={balance}
        open={adjustOpen}
        onClose={() => setAdjustOpen(false)}
      />

      {catOpen && (
        <WalletCategoriesEditor
          walletId={wallet.id}
          walletName={wallet.name}
          categories={categories.data ?? []}
          onClose={() => setCatOpen(false)}
        />
      )}
    </FullScreen>
  )
}
