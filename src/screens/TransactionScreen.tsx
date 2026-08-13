import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import {
  IconArrowDown,
  IconArrowUp,
  IconChevronRight,
  IconClock,
  IconCopy,
  IconInfoCircle,
  IconPencil,
  IconScale,
  IconTag,
  IconTrash,
  IconWallet,
} from '@tabler/icons-react'
import { FullScreen } from '@/app/AppShell'
import { useGoBack } from '@/app/useGoBack'
import { useThemeColor } from '@/app/useThemeColor'
import { useTheme } from '@/theme/ThemeProvider'
import { Card, CardRow, Divider } from '@/components/ui/Card'
import { ColourField, colourFieldTop } from '@/components/ui/ColourField'
import { Label } from '@/components/ui/Label'
import { ActionTile, Button } from '@/components/ui/Button'
import { iconFor } from '@/lib/icons'
import { isAdjustment } from '@/lib/adjustments'
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
import {
  asMinor,
  currencySymbol,
  formatAmount,
  formatAmountMoney,
  formatMoney,
  formatSigned,
  formatSignedMoney,
} from '@/lib/money'
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
    <div className="flex h-[110px] gap-2.5">
      {values.map((v, i) => (
        <div key={months[i]} className="flex flex-1 flex-col items-center gap-2">
          <div className="flex w-full flex-1 items-end">
            {/* Filled rather than outlined now: the bars sit on a card, not on
                the ground, so an outline reads as a hole in it. The current
                month is solid and the rest a 40% mix of the same hue — one
                colour, two weights, so which month is which needs no legend.
                A month with nothing in it keeps a 3px stub, because an absent
                bar and a tiny one mean different things. */}
            <div
              className="w-full rounded-lg"
              style={
                v === 0
                  ? { height: 3, background: 'var(--color-track)' }
                  : {
                      height: `${Math.max((v / max) * 100, 4)}%`,
                      background:
                        i === current
                          ? color
                          : `color-mix(in oklab, ${color} 40%, transparent)`,
                    }
              }
            />
          </div>
          <span className="tnum text-[11px] font-medium text-ink-dim">
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
  const { resolvedMode } = useTheme()

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

  // A transfer has no category hue, so its field — and the strip above it —
  // stays the plain ground. Before the early return, so the hook order holds.
  const fieldColour = tx.data?.transfer_id
    ? null
    : categories.data?.find((c) => c.id === tx.data?.category_id)?.color
  useThemeColor(fieldColour ? colourFieldTop(fieldColour, resolvedMode) : null)

  if (tx.isLoading || !tx.data) {
    return (
      <FullScreen>
        <p className="px-4 py-10 text-[13px] text-ink-muted">
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

  // A balance adjustment is real movement that nobody chose to spend, so it
  // wears the same dashed mark a transfer does and its amount stays neutral.
  // The two are told apart by the glyph, not by one of them being filled.
  const adjustment = isAdjustment(category)
  const dashed = isTransfer || adjustment
  const heroGlyph = isTransfer ? 'arrow-left-right' : category?.glyph
  const amountColour =
    dashed
      ? 'var(--color-ink)'
      : row.amount > 0
        ? 'var(--color-income)'
        : 'var(--color-expense)'

  // The tallest bar in the six-month history, so the card can say what the
  // scale actually is instead of leaving it to be guessed.
  const categoryPeak = categoryTotals.reduce(
    (max, m) => Math.max(max, Math.abs(m.total ?? 0)),
    0,
  )

  const onDelete = async () => {
    await remove.mutateAsync(row)
    // Back where you came from, not home: a row opened from a wallet belongs to
    // that wallet's feed, and being thrown to the home feed loses the place you
    // were working in. `useGoBack` still falls back to '/' when this screen is
    // the first history entry — a deep link or a cold launch — where there is no
    // "came from" to return to.
    //
    // Safe after a delete because the list behind is query-driven: the mutation
    // invalidates ['transactions'], which every feed's key sits under, so the
    // page it returns to has already dropped the row.
    goBack()
  }

  return (
    <FullScreen bleed>
      {/* Category owns the accent here too. Override the token itself — see
          the note in AddScreen for why --c-accent would not cascade. */}
      <div
        className="flex h-full flex-col"
        style={{ ['--color-accent' as string]: accent }}
      >
        <div className="no-scrollbar flex-1 overflow-y-auto">
          {/* Header block only: the tint fades into the ground by 72%, so the
              cards below sit on the surface they do everywhere else. */}
          <ColourField
            colour={isTransfer ? null : category?.color}
            className="px-4 pb-6"
            style={{ paddingTop: 'var(--safe-top)' }}
          >
            <header className="flex items-center gap-2 pt-1 pb-5">
              <ActionTile label="Back" onField onClick={goBack}>
                <IconChevronRight size={20} stroke={2} className="rotate-180" />
              </ActionTile>
              <div className="flex-1" />
              {/* Transfers are left out: editing one leg on its own unbalances
                  the pair, and there is no paired flow yet. */}
              {!isTransfer && (
                <ActionTile
                  label="Edit"
                  onField
                  onClick={() => navigate(`/tx/${row.id}/edit`)}
                >
                  <IconPencil size={19} stroke={2} />
                </ActionTile>
              )}
              <ActionTile
                label="Duplicate"
                onField
                onClick={async () => {
                  await duplicate.mutateAsync({
                    wallet_id: row.wallet_id,
                    category_id: row.category_id,
                    amount: asMinor(row.amount),
                    date: today(),
                    note: row.note,
                  })
                  // Same rule as delete: back where you came from. The copy is
                  // dated today and keeps this row's wallet, so a wallet feed
                  // shows it just as the home feed would.
                  goBack()
                }}
              >
                <IconCopy size={19} stroke={2} />
              </ActionTile>
              <ActionTile
                label="Delete"
                onField
                tone="var(--color-expense)"
                onClick={() => setConfirming(true)}
              >
                <IconTrash size={19} stroke={2} />
              </ActionTile>
            </header>

            <div className="flex flex-col items-center">
              <span
                className="flex size-[60px] items-center justify-center rounded-tile-lg"
                style={{
                  background: 'var(--field-scrim)',
                  color: 'var(--field-ink)',
                  ...(dashed
                    ? {
                        background: 'transparent',
                        border: '1.5px dashed var(--color-dash)',
                        boxSizing: 'border-box' as const,
                      }
                    : null),
                }}
              >
                <HeroGlyph glyph={heroGlyph} />
              </span>

              <div
                className="tnum mt-4"
                style={{
                  fontSize: 44,
                  fontWeight: 600,
                  lineHeight: 1,
                  letterSpacing: '-0.035em',
                  color: amountColour,
                }}
              >
                {isTransfer
                  ? formatAmount(asMinor(row.amount))
                  : formatSigned(asMinor(row.amount))}
                <span
                  className="text-ink-faint"
                  style={{ fontSize: 20, fontWeight: 500, letterSpacing: 0 }}
                >
                  {' '}
                  {currencySymbol(wallet?.currency ?? CURRENCY)}
                </span>
              </div>

              <span
                className="mt-3.5 rounded-full px-3 py-1.5 text-[13px] font-medium"
                style={{ background: 'var(--field-scrim)', color: 'var(--field-ink)' }}
              >
                {isTransfer ? 'Transfer' : (category?.name ?? 'Uncategorised')}
              </span>
              <div className="tnum mt-2.5 text-[13px] text-ink-muted">
                {formatFullDate(row.date)}
              </div>
            </div>
          </ColourField>

          <div className="flex flex-col gap-[14px] px-4 pb-8">
            {isTransfer && outLeg && inLeg ? (
              <>
                <Card>
                  {[outLeg, inLeg].map((leg, i) => {
                    const legWallet = wallets.data?.find((w) => w.id === leg.wallet_id)
                    const Arrow = i === 0 ? IconArrowUp : IconArrowDown
                    return (
                      <div key={leg.id}>
                        {i > 0 && <Divider inset={55} />}
                        <CardRow press={false}>
                          <span className="flex w-[26px] flex-none justify-center text-ink-dim">
                            <Arrow size={18} stroke={2} />
                          </span>
                          <span className="flex-1 truncate text-[15px] font-medium">
                            {legWallet?.name ?? '—'}
                          </span>
                          <span className="tnum text-[15px] font-semibold text-ink-muted">
                            {formatSignedMoney(
                              asMinor(leg.amount),
                              legWallet?.currency ?? CURRENCY,
                            )}
                          </span>
                        </CardRow>
                      </div>
                    )
                  })}
                </Card>

                <Card className="flex gap-2.5 p-[18px] text-[12.5px] leading-[1.55] text-ink-muted">
                  <IconInfoCircle size={16} stroke={2} className="mt-0.5 flex-none" />
                  <p>
                    A transfer moves money between your own wallets, so it is left
                    out of spending charts and never counts against a budget.
                    Deleting it removes both legs together.
                  </p>
                </Card>
              </>
            ) : (
              <>
                <Card>
                  <DetailRow icon={<IconWallet size={17} stroke={2} />} label="Wallet">
                    {wallet?.name ?? '—'}
                  </DetailRow>
                  {row.note && (
                    <>
                      <Divider inset={63} />
                      <DetailRow icon={<IconPencil size={17} stroke={2} />} label="Note">
                        {row.note}
                      </DetailRow>
                    </>
                  )}
                  {tagNames.length > 0 && (
                    <>
                      <Divider inset={63} />
                      <DetailRow icon={<IconTag size={17} stroke={2} />} label="Tags">
                        <span className="flex flex-wrap justify-end gap-1.5">
                          {tagNames.map((name) => (
                            <span
                              key={name}
                              className="rounded-full px-2.5 py-1 text-[12px] font-medium"
                              style={{
                                background: `color-mix(in oklab, ${accent} 20%, transparent)`,
                                color: accent,
                              }}
                            >
                              {name}
                            </span>
                          ))}
                        </span>
                      </DetailRow>
                    </>
                  )}
                  <Divider inset={63} />
                  <DetailRow icon={<IconClock size={17} stroke={2} />} label="Recorded">
                    <span className="tnum">
                      {new Date(row.created_at).toLocaleString('en-GB')}
                    </span>
                  </DetailRow>
                  <Divider inset={63} />
                  {/* The wallet's balance *now*, not as of this row — a running
                      balance at an arbitrary date would need its own query. */}
                  <DetailRow
                    icon={<IconScale size={17} stroke={2} />}
                    label="Balance now"
                  >
                    <span className="tnum">
                      {formatMoney(
                        asMinor(walletBalance),
                        wallet?.currency ?? CURRENCY,
                      )}
                    </span>
                  </DetailRow>
                </Card>

                {budget && (budget.limit_amount ?? 0) > 0 && (
                  <section className="flex flex-col gap-2">
                    <Label className="px-1">Against the budget</Label>
                    <Card className="p-[18px]">
                      <div className="flex items-baseline justify-between">
                        <span className="text-[15px] font-medium">{budget.name}</span>
                        <span className="tnum text-[13px] text-ink-muted">
                          {formatAmount(asMinor(budget.spent ?? 0))} /{' '}
                          {formatAmountMoney(
                            asMinor(budget.limit_amount ?? 0),
                            budget.currency ?? CURRENCY,
                          )}
                        </span>
                      </div>
                      {/* This transaction's slice sits at the end of the spent
                          portion, so its share of the month is legible at a
                          glance. */}
                      <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-track">
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
                      <p className="mt-2.5 text-[12.5px] text-ink-muted">
                        This one is{' '}
                        {formatAmountMoney(
                          asMinor(Math.abs(row.amount)),
                          budget.currency ?? CURRENCY,
                        )}{' '}
                        of it.
                      </p>
                    </Card>
                  </section>
                )}

                <section className="flex flex-col gap-2">
                  <div className="flex items-baseline justify-between px-1">
                    <Label>{category?.name ?? 'Category'} · six months</Label>
                    <span className="tnum text-[12px] text-ink-muted">
                      peak {formatAmountMoney(asMinor(categoryPeak), CURRENCY)}
                    </span>
                  </div>
                  <Card className="p-[18px]">
                    <CategoryHistory totals={categoryTotals} color={accent} />
                  </Card>
                </section>
              </>
            )}
          </div>
        </div>

        {confirming && (
          <div className="absolute inset-0 z-40 flex items-end bg-black/50 p-4">
            <Card className="w-full p-[18px]">
              <h2 className="text-[17px] font-semibold">
                Delete this {isTransfer ? 'transfer' : 'transaction'}?
              </h2>
              <p className="mt-2 text-[13px] leading-[1.55] text-ink-muted">
                {isTransfer && outLeg && inLeg
                  ? `Both legs go together. ${
                      wallets.data?.find((w) => w.id === outLeg.wallet_id)?.name ?? '—'
                    } and ${
                      wallets.data?.find((w) => w.id === inLeg.wallet_id)?.name ?? '—'
                    } will both be recalculated.`
                  : 'Balances and charts recalculate immediately. This cannot be undone.'}
              </p>
              <div className="mt-4 flex gap-2.5">
                <Button variant="secondary" onClick={() => setConfirming(false)}>
                  Keep
                </Button>
                <Button
                  tone="var(--color-expense)"
                  onClick={onDelete}
                  disabled={remove.isPending}
                >
                  {remove.isPending ? 'Deleting…' : 'Delete'}
                </Button>
              </div>
            </Card>
          </div>
        )}
      </div>
    </FullScreen>
  )
}

/** A label/value row in the details card, with its 34px leading glyph column. */
function DetailRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-[13px]">
      <span className="flex w-[26px] flex-none justify-center pt-px text-ink-faint">
        {icon}
      </span>
      <span className="flex-none text-[13px] text-ink-muted">{label}</span>
      <span className="flex-1 text-right text-[15px] font-medium">{children}</span>
    </div>
  )
}

/** The hero mark, drawn on the field rather than in a tinted tile. */
function HeroGlyph({ glyph }: { glyph: string | null | undefined }) {
  const Glyph = iconFor(glyph)
  return <Glyph size={28} stroke={2} />
}
