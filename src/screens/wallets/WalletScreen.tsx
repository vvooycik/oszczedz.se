import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ChevronLeft, ChevronRight, Pencil } from 'lucide-react'
import { FullScreen } from '@/app/AppShell'
import { useGoBack } from '@/app/useGoBack'
import { Sparkline } from '@/components/Sparkline'
import { TransactionFeed } from '@/components/TransactionFeed'
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
import { asMinor, currencySymbol, formatAmount, formatSigned } from '@/lib/money'
import {
  balanceHistory,
  glyphForWalletType,
  isArchived,
  loanStanding,
} from '@/lib/wallets'
import { categoryVar } from '@/theme/tokens'
import { WalletCategoriesEditor } from './WalletCategoriesSheet'

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
        <p className="px-5 py-10 text-[13px] text-ink-muted">
          {wallets.data ? 'That wallet no longer exists.' : 'Loading…'}
        </p>
      </FullScreen>
    )
  }

  const symbol = currencySymbol(wallet.currency)
  const tint = categoryVar(wallet.color_scheme)
  const Icon = iconFor(glyphForWalletType(wallet.type))
  const loan = (loans.data ?? []).find((l) => l.wallet_id === wallet.id)
  const { total, left, origin, repaid, progress } = loanStanding(
    wallet,
    balance,
    loan,
  )
  const isCard = wallet.type === 'credit_card' && wallet.credit_limit !== null
  const chosen = categoryIds.data?.length ?? 0

  return (
    <FullScreen>
      <header className="flex flex-none items-center gap-3 px-5 pt-3 pb-2">
        <button onClick={goBack} aria-label="Back" className="text-ink-muted">
          <ChevronLeft size={22} strokeWidth={1.5} />
        </button>
        <span className="flex-none" style={{ color: tint }}>
          <Icon size={20} strokeWidth={1.5} />
        </span>
        <h1 className="min-w-0 flex-1 truncate text-[18px]">{wallet.name}</h1>
        <Link
          to={`/wallets/${wallet.id}/edit`}
          aria-label="Edit wallet"
          className="flex-none text-ink-muted"
        >
          <Pencil size={18} strokeWidth={1.5} />
        </Link>
      </header>

      <div className="no-scrollbar flex-1 overflow-y-auto">
        <div className="px-5 pt-2">
          <div className="flex items-baseline gap-2 pb-1.5">
            <span className="kicker text-ink-muted">
              {isCard ? 'Owed' : 'Balance'}
            </span>
            {isArchived(wallet) && (
              <span
                className="rounded-[3px] px-1.5 py-px font-sans text-[10px] text-ink-faint"
                style={{ border: '1px dashed var(--color-line)' }}
              >
                Closed
              </span>
            )}
          </div>
          <div className="flex items-baseline gap-2">
            <span
              className="tnum text-[32px]"
              style={{
                lineHeight: 1,
                letterSpacing: '-.02em',
                color: balance < 0 ? 'var(--color-expense)' : undefined,
              }}
            >
              {formatSigned(asMinor(balance), { plus: false })}
            </span>
            <span className="font-sans text-[14px] text-ink-faint">{symbol}</span>
          </div>

          {isCard && (
            <>
              <div
                className="mt-3.5 h-[3px] rounded-[2px]"
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
              <div className="tnum mt-[6px] text-[11.5px] text-ink-faint">
                {formatAmount(asMinor(wallet.credit_limit! + balance))} {symbol}{' '}
                remaining of {formatAmount(asMinor(wallet.credit_limit!))} {symbol}{' '}
                limit
              </div>
            </>
          )}

          {progress !== null && (
            <>
              <div
                className="mt-3.5 h-[3px] rounded-[2px]"
                style={{ background: 'var(--color-track)' }}
              >
                <div
                  className="h-[3px] rounded-[2px]"
                  style={{
                    width: `${progress * 100}%`,
                    background: 'var(--color-income)',
                  }}
                />
              </div>
              <div className="tnum mt-[6px] text-[11.5px] text-ink-faint">
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
                    {formatAmount(asMinor(repaid))} of {formatAmount(asMinor(origin))}{' '}
                    {symbol} repaid
                  </>
                )}
              </div>
            </>
          )}

          {/* Wider than the list's, because there is room for it here — same
              series, same sign-painted rule. */}
          {!isCard && (
            <div className="mt-4">
              <Sparkline
                values={balanceHistory(wallet, nets.data ?? [])}
                width={320}
                height={56}
              />
            </div>
          )}

          <button
            onClick={() => setCatOpen(true)}
            className="mt-2 flex w-full items-center gap-3 py-3.5 text-left"
            style={{ borderTop: '1px solid var(--color-line-soft)' }}
          >
            <span className="flex-1 text-[14.5px]">Categories</span>
            <span className="font-sans text-[12px] text-ink-faint">
              {categoryIds.isPending
                ? '—'
                : chosen === 0
                  ? 'Every category'
                  : `${chosen} chosen`}
            </span>
            <ChevronRight size={18} strokeWidth={1.5} className="text-ink-dim" />
          </button>
        </div>

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
          <p className="px-5 py-8 text-center text-[13px] text-ink-muted">
            {transactions.error ? 'Could not load transactions.' : 'Loading…'}
          </p>
        )}
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
