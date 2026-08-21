import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import {
  IconArrowDown,
  IconArrowUp,
  IconChevronRight,
  IconClock,
  IconRepeat,
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
import { useTheme } from '@/theme/ThemeProvider'
import { Card, CardRow, Divider } from '@/components/ui/Card'
import { colourFieldStyle } from '@/components/ui/ColourField'
import { Label } from '@/components/ui/Label'
import { ActionTile, Button } from '@/components/ui/Button'
import { iconFor } from '@/lib/icons'
import { isAdjustment } from '@/lib/adjustments'
import {
  useAddTransaction,
  useCategories,
  useCategoryMonthlyTotals,
  useDeleteTransaction,
  useEarliestTransactionDate,
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
  formatMoneyShort,
  formatSigned,
  formatSignedMoney,
} from '@/lib/money'
import {
  addMonths,
  formatFullDate,
  minDay,
  formatMonthLong,
  formatMonthShort,
  startOfMonth,
  today,
} from '@/lib/dates'
import { medianOf, verdict, type Tone } from '@/lib/insights'
import { isPlanned } from '@/lib/schedules'
import { categoryVar } from '@/theme/tokens'

const CURRENCY = 'PLN'

/**
 * Six months of one category, the last of them highlighted.
 *
 * **Every bar is quoted**, not just the tallest. The card used to carry a
 * single "peak 738,00 zł" in its header and leave the other five to be
 * estimated off a bar's height, which is precisely the reading a bar chart is
 * bad at — you can see that June was the big one without being told, and what
 * you cannot see is what any of them were worth.
 *
 * **Whole units and no sign, but the unit is named.** Grosze and a leading
 * minus would double the width of every quote to say what the category and the
 * sentence below already say; the currency would not, and a bare number in a
 * money app is the one thing worth spelling out. It rides at 9px in a dimmer
 * ink so the figure still reads first, and the whole quote is 10px rather than
 * the label's 11 — measured against the widest month in the real import
 * (Salary at 34 046 zł), which needs about 41px of a 47px column. That is the
 * case that decides the size, and it is why the columns are on `gap-2` rather
 * than the 2.5 the bars had to themselves.
 *
 * **A month the records do not reach gets an em dash, not a zero.** Before the
 * first transaction ever recorded there is no "nothing spent" to report, and
 * printing 0 would claim one — the same distinction `bucketFlow` draws on the
 * Insight tab. A recorded month with no spend in this category is a real zero
 * and keeps its 3px stub.
 */
function CategoryHistory({
  months,
  values,
  recorded,
  color,
  currency,
}: {
  /** Six 'YYYY-MM-01' days, oldest first. */
  months: string[]
  /** Magnitudes in minor units, aligned to `months`. */
  values: number[]
  /** Whether the record covers that month at all. */
  recorded: boolean[]
  color: string
  currency: string
}) {
  const max = Math.max(...values, 1)
  const current = months.length - 1
  const unit = currencySymbol(currency)

  return (
    // Columns must stretch to the container's height, not shrink to their
    // content — a percentage height needs a definite parent to resolve against.
    <div className="flex h-[128px] gap-2">
      {values.map((v, i) => (
        <div key={months[i]} className="flex flex-1 flex-col items-center gap-1.5">
          <span
            className={`tnum text-quote whitespace-nowrap ${
              i === current ? 'font-semibold text-ink' : 'font-medium text-ink-dim'
            }`}
          >
            {recorded[i] ? (
              <>
                {formatMoneyShort(asMinor(v))}
                <span className="ml-[2px] text-quote-unit font-medium text-ink-dim">
                  {unit}
                </span>
              </>
            ) : (
              '—'
            )}
          </span>
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
          <span className="tnum text-kicker font-medium text-ink-dim">
            {formatMonthShort(months[i]!).slice(0, 3)}
          </span>
        </div>
      ))}
    </div>
  )
}

const toneColour: Record<Tone, string> = {
  over: 'var(--color-expense)',
  under: 'var(--color-income)',
  level: 'var(--color-ink-muted)',
}

/**
 * What the six bars add up to saying, in one sentence.
 *
 * The block was a chart with no claim attached: a row of bars, a peak, and the
 * reader left to work out whether the month they were looking at was a normal
 * one. This says it.
 *
 * **The named month is always the last bar**, never "this transaction's month",
 * because for a planned row those differ — the window stops at the current
 * month, since nothing later is settled and every bar past it would be empty.
 * Naming the month out loud is what keeps that honest in every case.
 *
 * **A month still running is stated, never judged.** Comparing 21 days against
 * five whole months would report almost everything as under, which is the
 * partial-period trap `spending_pace` documents; so the current month gets its
 * figure and the typical one beside it, and no verdict. A month that is over
 * gets the full comparison.
 *
 * `medianOf` and `verdict` come from the Insight tab rather than being
 * recomputed here, so this card and the Categories block cannot disagree about
 * what counts as normal — including the ±10% band inside which nothing is
 * coloured at all.
 */
function CategoryVerdict({
  values,
  recorded,
  months,
  partial,
  currency,
}: {
  values: number[]
  recorded: boolean[]
  months: string[]
  /** The last month has not finished yet. */
  partial: boolean
  currency: string
}) {
  const last = values.length - 1
  const shown = values[last] ?? 0
  const priors = values.filter((_, i) => i !== last && recorded[i])
  const typical = medianOf(priors)
  const call = verdict(shown, typical)

  const amount = formatAmountMoney(asMinor(shown), currency)
  const usual = formatAmountMoney(asMinor(typical), currency)
  const month = formatMonthLong(months[last]!)

  return (
    <p className="mt-3 text-meta leading-[1.5] text-ink-muted">
      {/* Plain, like the rest of the sentence. It was ink and semibold, which
          made the sentence open on a second hero after the 42px one at the top
          of the screen — and set the leading figure above the one it is being
          compared against, when the whole point is that they are two readings
          of the same kind. Only the verdict is emphasised now. */}
      <span className="tnum">{amount}</span>
      {partial ? ` so far in ${month}` : ` in ${month}`}
      {priors.length < 2 ? (
        <>. Not enough history yet to say what is usual.</>
      ) : typical === 0 ? (
        <>. Most months before it had none.</>
      ) : partial ? (
        <>
          {' — a usual month runs '}
          <span className="tnum">{usual}</span>.
        </>
      ) : call && call.tone !== 'level' ? (
        <>
          {' — '}
          <span className="font-semibold" style={{ color: toneColour[call.tone] }}>
            {Math.round(Math.abs(call.pct) * 100)}%{' '}
            {call.tone === 'over' ? 'more' : 'less'}
          </span>
          {' than the usual '}
          <span className="tnum">{usual}</span>.
        </>
      ) : (
        <>
          {' — about the usual '}
          <span className="tnum">{usual}</span>.
        </>
      )}
    </p>
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
  const legs = useTransferLegs(tx.data?.transfer_id)
  const firstDay = useEarliestTransactionDate()

  // The six months the history is drawn over, ending at this row's own month
  // rather than always at today's. A transaction from 2024 used to be shown
  // beside the last six months of *now*, which contain neither it nor anything
  // near it — the block claimed to be context and was about a different year.
  //
  // Capped at the current month, because `monthly_category_totals` is settled
  // only: a planned row's month has nothing in it yet, and six bars ending
  // three months in the future would be three empty ones. The sentence under
  // the bars names its month out loud, so the cap can never be mistaken for the
  // row's own month.
  const lastMonth = minDay(
    startOfMonth(tx.data?.date ?? today()),
    startOfMonth(today()),
  )
  const monthly = useCategoryMonthlyTotals(
    tx.data?.category_id,
    addMonths(lastMonth, -5),
    lastMonth,
    CURRENCY,
  )
  const remove = useDeleteTransaction()
  const duplicate = useAddTransaction()

  if (tx.isLoading || !tx.data) {
    return (
      <FullScreen>
        <p className="px-4 py-10 text-value text-ink-muted">
          {tx.error ? 'Could not load this transaction.' : 'Loading…'}
        </p>
      </FullScreen>
    )
  }

  const row = tx.data
  const wallet = wallets.data?.find((w) => w.id === row.wallet_id)
  const category = categories.data?.find((c) => c.id === row.category_id)
  const isTransfer = Boolean(row.transfer_id)
  const planned = isPlanned(row)
  const accent = isTransfer ? 'var(--color-ink-muted)' : categoryVar(category?.color)

  const walletBalance =
    balances.data?.find((b) => b.wallet_id === row.wallet_id)?.balance ?? 0

  const tagNames = (allTags.data ?? [])
    .filter((t) => (txTags.data ?? []).includes(t.id))
    .map((t) => t.name)


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

  // The six columns, resolved once and handed to both the bars and the sentence
  // so they cannot describe different numbers.
  const historyMonths = Array.from({ length: 6 }, (_, i) =>
    addMonths(lastMonth, -(5 - i)),
  )
  const historyValues = historyMonths.map((m) =>
    Math.abs((monthly.data ?? []).find((t) => t.month === m)?.total ?? 0),
  )
  // A month is "recorded" once the history reaches it. Before the first
  // transaction ever there is no zero to report, only an absence.
  const historyRecorded = historyMonths.map((m) =>
    firstDay.data ? m >= startOfMonth(firstDay.data) : false,
  )
  const historyPartial = lastMonth === startOfMonth(today())

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
    <FullScreen style={colourFieldStyle(isTransfer ? null : category?.color, resolvedMode)}>
      {/* Category owns the accent here too. Override the token itself — see
          the note in AddScreen for why --c-accent would not cascade. */}
      <div
        className="flex h-full flex-col"
        style={{ ['--color-accent' as string]: accent }}
      >
        <div className="no-scrollbar flex-1 overflow-y-auto">
          <div className="px-4 pb-6">
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
                  fontSize: 'var(--text-hero)',
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
                  style={{ fontSize: 'var(--text-hero-unit)', fontWeight: 500, letterSpacing: 0 }}
                >
                  {' '}
                  {currencySymbol(wallet?.currency ?? CURRENCY)}
                </span>
              </div>

              <span
                className="mt-3.5 rounded-full px-3 py-1.5 text-value font-medium"
                style={{ background: 'var(--field-scrim)', color: 'var(--field-ink)' }}
              >
                {isTransfer ? 'Transfer' : (category?.name ?? 'Uncategorised')}
              </span>
              <div className="tnum mt-2.5 text-value text-ink-muted">
                {formatFullDate(row.date)}
              </div>

              {/* A planned row is real and editable, and the screen has to say
                  out loud that the money has not moved — otherwise the figure
                  above reads as something that already left the account, and
                  the balance row below would appear not to include it. */}
              {planned && (
                <div className="mt-2 flex items-center gap-1.5 text-meta text-ink-faint">
                  {row.schedule_id ? (
                    <IconRepeat size={13} stroke={2} />
                  ) : (
                    <IconClock size={13} stroke={2} />
                  )}
                  {row.schedule_id ? 'Scheduled · not charged yet' : 'Planned · not charged yet'}
                </div>
              )}
            </div>
          </div>

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
                          <span className="flex-1 truncate text-row font-medium">
                            {legWallet?.name ?? '—'}
                          </span>
                          <span className="tnum text-row font-semibold text-ink-muted">
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

                <Card className="flex gap-2.5 p-[18px] text-meta leading-[1.55] text-ink-muted">
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
                              className="rounded-full px-2.5 py-1 text-meta-sm font-medium"
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
                      balance at an arbitrary date would need its own query.
                      For a planned row "now" would be a figure this transaction
                      is deliberately not part of, so the label names the day it
                      lands instead and the reading follows: what the wallet
                      will hold once it does. */}
                  <DetailRow
                    icon={<IconScale size={17} stroke={2} />}
                    label={planned ? 'Balance once it lands' : 'Balance now'}
                  >
                    <span className="tnum">
                      {formatMoney(
                        asMinor(planned ? walletBalance + row.amount : walletBalance),
                        wallet?.currency ?? CURRENCY,
                      )}
                    </span>
                  </DetailRow>
                </Card>

                {/* The peak that used to sit on the right of this row is gone:
                    every bar carries its own figure now, and the tallest one is
                    the one thing a bar chart never needed help saying. The
                    label says which six months these are, since they end at the
                    row's month rather than always at this one. */}
                <section className="flex flex-col gap-2">
                  <Label className="px-1">
                    {category?.name ?? 'Category'} ·{' '}
                    {historyPartial
                      ? 'last six months'
                      : `six months to ${formatMonthLong(lastMonth)}`}
                  </Label>
                  <Card className="p-[18px]">
                    <CategoryHistory
                      months={historyMonths}
                      values={historyValues}
                      recorded={historyRecorded}
                      color={accent}
                      currency={wallet?.currency ?? CURRENCY}
                    />
                    <CategoryVerdict
                      months={historyMonths}
                      values={historyValues}
                      recorded={historyRecorded}
                      partial={historyPartial}
                      currency={wallet?.currency ?? CURRENCY}
                    />
                  </Card>
                </section>
              </>
            )}
          </div>
        </div>

        {confirming && (
          <div className="absolute inset-0 z-40 flex items-end bg-black/50 p-4">
            <Card className="w-full p-[18px]">
              <h2 className="text-dialog font-semibold">
                Delete this {isTransfer ? 'transfer' : 'transaction'}?
              </h2>
              <p className="mt-2 text-value leading-[1.55] text-ink-muted">
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
      <span className="flex-none text-value text-ink-muted">{label}</span>
      <span className="flex-1 text-right text-row font-medium">{children}</span>
    </div>
  )
}

/** The hero mark, drawn on the field rather than in a tinted tile. */
function HeroGlyph({ glyph }: { glyph: string | null | undefined }) {
  const Glyph = iconFor(glyph)
  return <Glyph size={28} stroke={2} />
}
