import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ArrowDown, ArrowUp, ChevronLeft, Copy, Info, Tag, Trash2, Wallet as WalletIcon, Pencil } from 'lucide-react'
import { FullScreen } from '@/app/AppShell'
import { useGoBack } from '@/app/useGoBack'
import { CategoryGlyph } from '@/components/CategoryGlyph'
import {
  useAddTransaction,
  useBudgetProgress,
  useCategories,
  useDeleteTransaction,
  useMonthlyTotals,
  useTags,
  useTransaction,
  useTransactionTags,
  useTransferLegs,
  useWalletBalances,
  useWallets,
} from '@/data/queries'
import { asMinor, formatAmount, formatMoney, formatSigned } from '@/lib/money'
import { addMonths, formatFullDate, formatMonthShort, startOfMonth, today } from '@/lib/dates'
import { categoryVar } from '@/theme/tokens'

const CURRENCY = 'PLN'

/** Six-month history for the category, current month highlighted. */
function CategoryHistory({
  totals,
  color,
}: {
  totals: { month: string | null; total: number | null }[]
  color: string
}) {
  const months = Array.from({ length: 6 }, (_, i) =>
    startOfMonth(addMonths(today(), -(5 - i))),
  )
  const values = months.map((m) => {
    const row = totals.find((t) => t.month === m)
    return Math.abs(row?.total ?? 0)
  })
  const max = Math.max(...values, 1)
  const current = months.length - 1

  return (
    // Columns must stretch to the container's height, not shrink to their
    // content — a percentage height needs a definite parent to resolve against.
    <div className="flex h-24 gap-2">
      {values.map((v, i) => (
        <div key={months[i]} className="flex flex-1 flex-col items-center gap-1.5">
          <div className="flex w-full flex-1 items-end">
            <div
              className="w-full rounded-t-[2px]"
              style={{
                height: `${Math.max((v / max) * 100, 2)}%`,
                background: i === current ? color : 'transparent',
                border: `1px solid ${color}`,
                opacity: i === current ? 1 : 0.55,
              }}
            />
          </div>
          <span className="tnum text-[9.5px] text-ink-dim">
            {formatMonthShort(months[i]!).slice(0, 3)}
          </span>
        </div>
      ))}
    </div>
  )
}

export function TransactionScreen() {
  const { id } = useParams()
  const navigate = useNavigate()
  const goBack = useGoBack()
  const [confirming, setConfirming] = useState(false)

  const tx = useTransaction(id)
  const wallets = useWallets()
  const categories = useCategories()
  const balances = useWalletBalances()
  const allTags = useTags()
  const txTags = useTransactionTags(id)
  const budgets = useBudgetProgress()
  const legs = useTransferLegs(tx.data?.transfer_id)
  const monthly = useMonthlyTotals(CURRENCY)
  const remove = useDeleteTransaction()
  const duplicate = useAddTransaction()

  if (tx.isLoading || !tx.data) {
    return (
      <FullScreen>
        <p className="px-5 py-10 text-[13px] text-ink-muted">
          {tx.error ? 'Could not load this transaction.' : 'Loading…'}
        </p>
      </FullScreen>
    )
  }

  const row = tx.data
  const wallet = wallets.data?.find((w) => w.id === row.wallet_id)
  const category = categories.data?.find((c) => c.id === row.category_id)
  const isTransfer = Boolean(row.transfer_id)
  const accent = isTransfer ? 'var(--color-ink-muted)' : categoryVar(category?.color)

  const walletBalance =
    balances.data?.find((b) => b.wallet_id === row.wallet_id)?.balance ?? 0

  const tagNames = (allTags.data ?? [])
    .filter((t) => (txTags.data ?? []).includes(t.id))
    .map((t) => t.name)

  // Budgets this transaction could count against: same currency, and either
  // unfiltered or naming this category.
  const budget = (budgets.data ?? []).find((b) => b.currency === CURRENCY)

  const categoryTotals = (monthly.data ?? []).filter(
    (m) => m.category_id === row.category_id,
  )

  const outLeg = legs.data?.find((l) => l.amount < 0)
  const inLeg = legs.data?.find((l) => l.amount > 0)

  const onDelete = async () => {
    await remove.mutateAsync(row)
    navigate('/')
  }

  return (
    <FullScreen>
      {/* Category owns the accent here too. Override the token itself — see
          the note in AddScreen for why --c-accent would not cascade. */}
      <div
        className="flex h-full flex-col"
        style={{ ['--color-accent' as string]: accent }}
      >
        <header className="flex flex-none items-center gap-3 px-5 pt-3 pb-2 font-sans">
          <button onClick={goBack} aria-label="Back" className="text-ink-muted">
            <ChevronLeft size={22} strokeWidth={1.5} />
          </button>
          <div className="flex-1" />
          {/* Transfers are left out: editing one leg on its own unbalances the
              pair, and there is no paired flow yet. */}
          {!isTransfer && (
            <button
              aria-label="Edit"
              className="text-ink-muted"
              onClick={() => navigate(`/tx/${row.id}/edit`)}
            >
              <Pencil size={19} strokeWidth={1.5} />
            </button>
          )}
          <button
            aria-label="Duplicate"
            className="text-ink-muted"
            onClick={async () => {
              await duplicate.mutateAsync({
                wallet_id: row.wallet_id,
                category_id: row.category_id,
                amount: asMinor(row.amount),
                date: today(),
                note: row.note,
              })
              navigate('/')
            }}
          >
            <Copy size={19} strokeWidth={1.5} />
          </button>
          <button
            aria-label="Delete"
            onClick={() => setConfirming(true)}
            style={{ color: 'var(--color-expense)' }}
          >
            <Trash2 size={19} strokeWidth={1.5} />
          </button>
        </header>

        <div className="no-scrollbar flex-1 overflow-y-auto px-5 pb-8">
          <div
            className="flex flex-col items-center pt-4 pb-5"
            style={{ borderBottom: '1px solid var(--color-line)' }}
          >
            <CategoryGlyph
              glyph={category?.glyph}
              color={category?.color}
              size={62}
              transfer={isTransfer}
            />
            <div
              className="tnum mt-3.5"
              style={{
                fontSize: 44,
                lineHeight: 1.1,
                letterSpacing: '-.02em',
                color: isTransfer
                  ? 'var(--color-ink)'
                  : row.amount > 0
                    ? 'var(--color-income)'
                    : 'var(--color-expense)',
              }}
            >
              {isTransfer
                ? formatAmount(asMinor(row.amount))
                : formatSigned(asMinor(row.amount))}
            </div>
            <div className="mt-1 text-[16px]" style={{ color: accent }}>
              {isTransfer ? 'Transfer' : (category?.name ?? 'Uncategorised')}
            </div>
            <div className="tnum mt-1.5 text-[12px] text-ink-faint">
              {formatFullDate(row.date)}
            </div>
          </div>

          {isTransfer && outLeg && inLeg ? (
            <>
              <div className="flex flex-col py-5">
                {[outLeg, inLeg].map((leg, i) => {
                  const legWallet = wallets.data?.find((w) => w.id === leg.wallet_id)
                  const Icon = i === 0 ? ArrowUp : ArrowDown
                  return (
                    <div key={leg.id} className="flex items-center gap-3 py-2">
                      <Icon size={16} strokeWidth={1.5} className="w-6 flex-none text-ink-dim" />
                      <span className="flex-1 text-[15px]">{legWallet?.name ?? '—'}</span>
                      <span className="tnum text-[14px] text-ink-muted">
                        {formatSigned(asMinor(leg.amount))}
                      </span>
                    </div>
                  )
                })}
              </div>
              <div
                className="flex gap-2.5 rounded-[4px] p-3.5 text-[12.5px] leading-[1.55] text-ink-muted"
                style={{ border: '1px solid var(--color-line)' }}
              >
                <Info size={16} strokeWidth={1.5} className="mt-0.5 flex-none" />
                <p>
                  A transfer moves money between your own wallets, so it is left
                  out of spending charts and never counts against a budget.
                  Deleting it removes both legs together.
                </p>
              </div>
            </>
          ) : (
            <>
              <Row icon={<WalletIcon size={17} strokeWidth={1.5} />} label="Wallet">
                {wallet?.name ?? '—'}
              </Row>
              {row.note && (
                <Row icon={<Pencil size={17} strokeWidth={1.5} />} label="Note">
                  {row.note}
                </Row>
              )}
              {tagNames.length > 0 && (
                <Row icon={<Tag size={17} strokeWidth={1.5} />} label="Tags">
                  <span className="flex flex-wrap justify-end gap-1.5">
                    {tagNames.map((name) => (
                      <span
                        key={name}
                        className="rounded-[3px] px-2.5 py-1 font-sans text-[11.5px]"
                        style={{ border: `1px solid ${accent}`, color: accent }}
                      >
                        {name}
                      </span>
                    ))}
                  </span>
                </Row>
              )}

              {budget && (budget.limit_amount ?? 0) > 0 && (
                <section>
                  <div className="kicker pt-6 pb-2.5 text-ink-muted">
                    Against the budget
                  </div>
                  <div
                    className="rounded-[4px] p-3.5"
                    style={{ border: '1px solid var(--color-line)' }}
                  >
                    <div className="flex items-baseline justify-between">
                      <span className="text-[14px]">{budget.name}</span>
                      <span className="tnum text-[13px]">
                        {formatAmount(asMinor(budget.spent ?? 0))} /{' '}
                        {formatAmount(asMinor(budget.limit_amount ?? 0))}
                      </span>
                    </div>
                    {/* This transaction's slice sits at the end of the spent
                        portion, so its share of the month is legible at a glance. */}
                    <div
                      className="mt-2.5 flex h-1.5 overflow-hidden rounded-[2px]"
                      style={{ background: 'var(--color-track)' }}
                    >
                      <div
                        style={{
                          width: `${Math.min(100, (((budget.spent ?? 0) - Math.abs(row.amount)) / (budget.limit_amount || 1)) * 100)}%`,
                          background: 'var(--color-ink-dim)',
                        }}
                      />
                      <div
                        style={{
                          width: `${Math.min(100, (Math.abs(row.amount) / (budget.limit_amount || 1)) * 100)}%`,
                          background: accent,
                        }}
                      />
                    </div>
                    <p className="mt-2 text-[11.5px] text-ink-muted">
                      This one is {formatAmount(asMinor(Math.abs(row.amount)))} of it.
                    </p>
                  </div>
                </section>
              )}

              <section>
                <div className="kicker pt-6 pb-2.5 text-ink-muted">
                  {category?.name ?? 'Category'}, last six months
                </div>
                <div
                  className="rounded-[4px] p-3.5"
                  style={{ border: '1px solid var(--color-line)' }}
                >
                  <CategoryHistory totals={categoryTotals} color={accent} />
                </div>
              </section>
            </>
          )}

          <p className="tnum pt-6 text-[11px] text-ink-dim">
            Recorded {new Date(row.created_at).toLocaleString('en-GB')} · {wallet?.name}{' '}
            balance now {formatMoney(asMinor(walletBalance), wallet?.currency ?? CURRENCY)}
          </p>
        </div>

        {confirming && (
          <div className="absolute inset-0 z-40 flex items-end bg-black/50 p-5">
            <div
              className="w-full rounded-[8px] bg-bg p-5"
              style={{ border: '1px solid var(--color-line)' }}
            >
              <h2 className="text-[16px]">Delete this {isTransfer ? 'transfer' : 'transaction'}?</h2>
              <p className="mt-2 text-[12.5px] leading-[1.55] text-ink-muted">
                {isTransfer && outLeg && inLeg
                  ? `Both legs go together. ${
                      wallets.data?.find((w) => w.id === outLeg.wallet_id)?.name ?? '—'
                    } and ${
                      wallets.data?.find((w) => w.id === inLeg.wallet_id)?.name ?? '—'
                    } will both be recalculated.`
                  : 'Balances and charts recalculate immediately. This cannot be undone.'}
              </p>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => setConfirming(false)}
                  className="flex-1 rounded-[4px] py-2.5 text-[13.5px] text-ink-muted"
                  style={{ border: '1px solid var(--color-line)' }}
                >
                  Keep
                </button>
                <button
                  onClick={onDelete}
                  disabled={remove.isPending}
                  className="flex-1 rounded-[4px] py-2.5 text-[13.5px] disabled:opacity-50"
                  style={{
                    border: '1px solid var(--color-expense)',
                    color: 'var(--color-expense)',
                  }}
                >
                  {remove.isPending ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </FullScreen>
  )
}

function Row({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div
      className="flex items-start gap-3 py-3.5"
      style={{ borderBottom: '1px solid var(--color-line-soft)' }}
    >
      <span className="flex w-6 flex-none justify-center pt-0.5 text-ink-dim">{icon}</span>
      <span className="flex-none font-sans text-[12px] text-ink-muted">{label}</span>
      <span className="flex-1 text-right text-[15px]">{children}</span>
    </div>
  )
}
