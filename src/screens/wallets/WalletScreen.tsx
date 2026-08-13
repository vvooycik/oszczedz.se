import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { IconChevronLeft, IconChevronRight, IconPencil } from '@tabler/icons-react'
import { FullScreen } from '@/app/AppShell'
import { useGoBack } from '@/app/useGoBack'
import { Sparkline } from '@/components/Sparkline'
import { TransactionFeed } from '@/components/TransactionFeed'
import { Card, CardRow } from '@/components/ui/Card'
import { ColourField } from '@/components/ui/ColourField'
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
import { balanceHistory, isArchived, loanStanding, walletGlyph } from '@/lib/wallets'
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
  const transactions = useWalletTransactions(id)
  const categoryIds = useWalletCategoryIds(id)

  const [catOpen, setCatOpen] = useState(false)

  const wallet = useMemo(
    () => (wallets.data ?? []).find((w) => w.id === id),
    [wallets.data, id],
  )

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

  return (
    <FullScreen bleed>
      <div className="no-scrollbar flex-1 overflow-y-auto">
        {/* Header block only — the tint fades into the ground by 72%, so the
            feed below sits on the same surface it does everywhere else. */}
        <ColourField
          colour={wallet.color_scheme}
          className="px-4 pb-5"
          style={{ paddingTop: 'var(--safe-top)' }}
        >
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
        </ColourField>

        <div className="flex flex-col gap-[14px] px-4">
          <Card>
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

          {transactions.data ? (
            <TransactionFeed
              transactions={transactions.data}
              wallets={wallets.data ?? []}
              categories={categories.data ?? []}
              // Every row is this wallet, so naming it on each one is noise. The
              // note keeps its place on the same line.
              hideWallet
            />
          ) : (
            <p className="py-8 text-center text-[13px] text-ink-muted">
              {transactions.error ? 'Could not load transactions.' : 'Loading…'}
            </p>
          )}
        </div>
      </div>

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
