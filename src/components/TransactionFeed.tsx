import { Link, useNavigate } from 'react-router'
import { IconClock, IconCopy, IconPencil, IconRepeat } from '@tabler/icons-react'
import { CategoryGlyph } from './CategoryGlyph'
import { Card, Divider } from './ui/Card'
import { Label } from './ui/Label'
import { isAdjustment } from '@/lib/adjustments'
import { useAddTransaction } from '@/data/queries'
import { asMinor, formatAmountMoney, formatSignedMoney } from '@/lib/money'
import { formatDayHeader, formatDayShort, today } from '@/lib/dates'
import { categoryVar } from '@/theme/tokens'
import type { Category, Transaction, Wallet } from '@/lib/db'

/**
 * A row that has not happened yet.
 *
 * **Not the dashed ring.** That mark means "not a purchase" and is worn by
 * transfers and balance adjustments; a planned expense is very much a purchase,
 * and the thing that makes it different is *when*, not *what*. So the glyph is
 * left alone and the signal goes on the amount, which stops shouting income
 * green or expense red and drops to ink-faint — the money has not moved — with
 * a small mark beside the name saying why.
 *
 * The mark separates the two ways a row gets here: a clock for a date somebody
 * chose by hand, a repeat arrow for one a schedule wrote. Worth telling apart,
 * because deleting the first is the end of it and deleting the second only
 * skips one charge.
 */
function PlannedMark({ scheduled }: { scheduled: boolean }) {
  return scheduled ? (
    <IconRepeat size={13} stroke={2} className="flex-none text-ink-dim" />
  ) : (
    <IconClock size={13} stroke={2} className="flex-none text-ink-dim" />
  )
}

/**
 * A transfer is two rows sharing a transfer_id. The ledger needs both; the feed
 * reads better as one line, so pairs are collapsed into a single entry showing
 * source → target.
 */
type Entry =
  | { kind: 'single'; tx: Transaction }
  | { kind: 'transfer'; out: Transaction; in: Transaction }

/** The row a link points at, and what a selection is compared against. */
const entryId = (e: Entry) => (e.kind === 'transfer' ? e.out.id : e.tx.id)

function collapseTransfers(rows: Transaction[]): Entry[] {
  const byTransfer = new Map<string, Transaction[]>()
  const entries: Entry[] = []

  for (const tx of rows) {
    if (!tx.transfer_id) {
      entries.push({ kind: 'single', tx })
      continue
    }
    const group = byTransfer.get(tx.transfer_id) ?? []
    group.push(tx)
    byTransfer.set(tx.transfer_id, group)
    // Emit a placeholder at the position of the first leg seen, so ordering
    // follows the feed rather than the map.
    if (group.length === 1) entries.push({ kind: 'single', tx })
  }

  return entries.map((entry) => {
    if (entry.kind !== 'single' || !entry.tx.transfer_id) return entry
    const legs = byTransfer.get(entry.tx.transfer_id) ?? []
    const out = legs.find((l) => l.amount < 0)
    const inLeg = legs.find((l) => l.amount > 0)
    // A half-present pair should never exist, but render it as a plain row
    // rather than crashing if it somehow does.
    return out && inLeg ? { kind: 'transfer', out, in: inLeg } : entry
  })
}

/**
 * What the whole app calls a selected row.
 *
 * Master-detail introduced a selection the app had never had, and the mark is
 * the row's own category hue rather than the accent: the pane beside it is
 * already washed in that colour, so the highlight and the thing it opened are
 * visibly the same object. The inset shadow is the rule down the left edge —
 * a border would move the content a pixel every time the selection changed.
 */
export function selectedRowStyle(hue: string): React.CSSProperties {
  return {
    background: `color-mix(in oklab, ${hue} 12%, transparent)`,
    boxShadow: `inset 3px 0 0 ${hue}`,
  }
}

/**
 * The two buttons a pointer reveals on the row it is over: edit and duplicate.
 *
 * These are the transaction screen's header actions, brought forward because a
 * pointer can reach them without opening the row — which is a thing a finger
 * cannot do, and the reason they exist here and not on the phone. Delete is
 * deliberately **not** among them: a destructive action behind a hover, one row
 * away from the one the eye is on, is how a wrong row gets deleted.
 *
 * `preventDefault` on the click, because the whole row is a `<Link>` and a
 * button inside it would otherwise navigate as well as act.
 */
function RowActions({ tx }: { tx: Transaction }) {
  const navigate = useNavigate()
  const duplicate = useAddTransaction()

  const stop = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  return (
    // `opacity`, not `display`, so the row does not reflow as the pointer
    // crosses it — and `focus-within` as well as `group-hover`, or Tab would
    // land on two buttons nobody can see.
    <span className="hidden flex-none gap-1.5 text-ink-dim opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 lg:flex">
      <button
        type="button"
        aria-label="Edit"
        className="flex size-[30px] items-center justify-center rounded-[10px] bg-tile text-value hover:text-ink"
        onClick={(e) => {
          stop(e)
          navigate(`/tx/${tx.id}/edit`)
        }}
      >
        <IconPencil size={16} stroke={2} />
      </button>
      <button
        type="button"
        aria-label="Duplicate"
        className="flex size-[30px] items-center justify-center rounded-[10px] bg-tile text-value hover:text-ink"
        onClick={(e) => {
          stop(e)
          // Dated today and otherwise identical, exactly as the detail
          // screen's copy does it — one behaviour, two places to start it.
          duplicate.mutate({
            wallet_id: tx.wallet_id,
            category_id: tx.category_id,
            amount: asMinor(tx.amount),
            date: today(),
            note: tx.note,
          })
        }}
      >
        <IconCopy size={16} stroke={2} />
      </button>
    </span>
  )
}

function Row({
  entry,
  wallets,
  categories,
  hideWallet,
  on,
  selected,
  actions,
  alignAmounts,
}: {
  entry: Entry
  wallets: Map<string, Wallet>
  categories: Map<string, Category>
  hideWallet: boolean
  /** Today, passed in rather than read per row so one list cannot straddle midnight. */
  on: string
  selected: boolean
  /** Reveal edit/duplicate on hover — wide layouts only. */
  actions: boolean
  /** Give the amount a fixed column so figures line up down a long list. */
  alignAmounts: boolean
}) {
  const amountClass = `tnum flex-none text-row font-semibold whitespace-nowrap ${
    alignAmounts ? 'min-w-[124px] text-right' : ''
  }`

  if (entry.kind === 'transfer') {
    const planned = entry.out.date > on
    const from = wallets.get(entry.out.wallet_id)
    const to = wallets.get(entry.in.wallet_id)
    return (
      <Link
        to={`/tx/${entry.out.id}`}
        className="group flex items-center gap-[13px] px-4 py-[13px] hover:bg-press active:bg-press"
        // A transfer has no category hue, so its selection takes the neutral
        // ink the row's own text already uses.
        style={selected ? selectedRowStyle('var(--color-ink-muted)') : undefined}
      >
        <CategoryGlyph glyph={null} color={null} transfer />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span
              className={`truncate text-row text-ink/75 ${
                selected ? 'font-semibold' : 'font-medium'
              }`}
            >
              {from?.name ?? '—'} → {to?.name ?? '—'}
            </span>
            {planned && <PlannedMark scheduled={entry.out.schedule_id != null} />}
          </div>
          <div className="mt-px truncate text-meta text-ink-muted">
            {planned ? 'Scheduled transfer' : 'Transfer · not counted as spending'}
          </div>
        </div>
        {/* The target leg, so the target wallet's currency — a cross-currency
            transfer has a different amount on each side. */}
        <div className={`${amountClass} text-ink-faint`}>
          {formatAmountMoney(asMinor(entry.in.amount), to?.currency ?? 'PLN')}
        </div>
      </Link>
    )
  }

  const { tx } = entry
  const wallet = wallets.get(tx.wallet_id)
  const category = categories.get(tx.category_id)
  const income = tx.amount > 0
  const planned = tx.date > on

  // A reconciliation is real movement but not a purchase, so it reads quietly —
  // the same treatment a transfer gets, dashed ring included. The two stay apart
  // by their icon rather than by one of them being solid.
  const adjustment = isAdjustment(category)

  // On a single wallet's screen the name is the same on every row, so it is
  // dropped and the note keeps the line to itself. A note that only repeats its
  // category — which is exactly what an adjustment carries — says nothing twice.
  const meta = [
    hideWallet ? null : wallet?.name,
    tx.note === category?.name ? null : tx.note,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <Link
      to={`/tx/${tx.id}`}
      className="group flex items-center gap-[13px] px-4 py-[13px] hover:bg-press active:bg-press"
      style={selected ? selectedRowStyle(categoryVar(category?.color)) : undefined}
    >
      <CategoryGlyph
        glyph={category?.glyph}
        color={category?.color}
        dashed={adjustment}
        neutral={adjustment}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span
            className={`truncate text-row ${selected ? 'font-semibold' : 'font-medium'} ${
              adjustment ? 'text-ink/75' : ''
            }`}
          >
            {category?.name ?? 'Uncategorised'}
          </span>
          {planned && <PlannedMark scheduled={tx.schedule_id != null} />}
        </div>
        {meta && <div className="mt-px truncate text-meta text-ink-muted">{meta}</div>}
      </div>
      {actions && <RowActions tx={tx} />}
      <div
        className={amountClass}
        style={{
          color:
            adjustment || planned
              ? 'var(--color-ink-faint)'
              : income
                ? 'var(--color-income)'
                : 'var(--color-expense)',
        }}
      >
        {formatSignedMoney(asMinor(tx.amount), wallet?.currency ?? 'PLN')}
      </div>
    </Link>
  )
}

/** The four fixed columns of the table variant, so header and rows cannot drift. */
const COL = { note: 180, date: 96, amount: 130 }

/**
 * The same rows as a table, for the wallet pane on a desktop.
 *
 * **This is the one place the extra width buys something real rather than more
 * of the same.** On a phone the note is concatenated into the meta line and the
 * date exists only as a day header, because there is nowhere else for either to
 * go; given four columns they become things you can scan down. That is also why
 * the day grouping goes away here — a Date column says the same thing once per
 * row instead of once per group, and a table with headings inside it is two
 * organising ideas fighting.
 *
 * Only ever drawn where `hideWallet` holds, so there is no wallet column: every
 * row belongs to the wallet the pane is about.
 */
function Table({
  entries,
  wallets,
  categories,
  on,
  selected,
}: {
  entries: Entry[]
  wallets: Map<string, Wallet>
  categories: Map<string, Category>
  on: string
  selected: string | null
}) {
  return (
    <Card>
      <div className="flex items-center gap-3.5 border-b border-divider px-4 py-[11px]">
        <span className="w-10 flex-none" />
        <Label className="flex-1">Category</Label>
        <Label className="flex-none" style={{ width: COL.note }}>
          Note
        </Label>
        <Label className="flex-none" style={{ width: COL.date }}>
          Date
        </Label>
        <Label className="flex-none text-right" style={{ width: COL.amount }}>
          Amount
        </Label>
      </div>

      {entries.map((entry, i) => {
        const id = entryId(entry)
        const isSelected = id === selected

        const transfer = entry.kind === 'transfer'
        const tx = transfer ? entry.out : entry.tx
        const category = categories.get(tx.category_id)
        const adjustment = !transfer && isAdjustment(category)
        const planned = tx.date > on
        const wallet = wallets.get(tx.wallet_id)

        const name = transfer
          ? `${wallets.get(entry.out.wallet_id)?.name ?? '—'} → ${
              wallets.get(entry.in.wallet_id)?.name ?? '—'
            }`
          : (category?.name ?? 'Uncategorised')

        const note = transfer ? 'Transfer' : (tx.note ?? '—')

        const amount = transfer
          ? formatAmountMoney(
              asMinor(entry.in.amount),
              wallets.get(entry.in.wallet_id)?.currency ?? 'PLN',
            )
          : formatSignedMoney(asMinor(tx.amount), wallet?.currency ?? 'PLN')

        const colour =
          transfer || adjustment || planned
            ? 'var(--color-ink-faint)'
            : tx.amount > 0
              ? 'var(--color-income)'
              : 'var(--color-expense)'

        return (
          <div key={id}>
            {i > 0 && <Divider inset={70} />}
            <Link
              to={`/tx/${tx.id}`}
              className="flex items-center gap-3.5 px-4 py-3 hover:bg-press active:bg-press"
              style={
                isSelected
                  ? selectedRowStyle(
                      transfer ? 'var(--color-ink-muted)' : categoryVar(category?.color),
                    )
                  : undefined
              }
            >
              <CategoryGlyph
                glyph={transfer ? null : category?.glyph}
                color={transfer ? null : category?.color}
                transfer={transfer}
                dashed={adjustment}
                neutral={adjustment}
              />
              <span
                className={`flex flex-1 items-center gap-1.5 truncate text-row ${
                  isSelected ? 'font-semibold' : 'font-medium'
                } ${transfer || adjustment ? 'text-ink/75' : ''}`}
              >
                {name}
                {planned && <PlannedMark scheduled={tx.schedule_id != null} />}
              </span>
              <span
                className="flex-none truncate text-value text-ink-muted"
                style={{ width: COL.note }}
              >
                {note}
              </span>
              <span
                className="tnum flex-none text-value text-ink-muted"
                style={{ width: COL.date }}
              >
                {formatDayShort(tx.date)}
              </span>
              <span
                className="tnum flex-none text-right text-row font-semibold"
                style={{ width: COL.amount, color: colour }}
              >
                {amount}
              </span>
            </Link>
          </div>
        )
      })}
    </Card>
  )
}

export function TransactionFeed({
  transactions,
  wallets,
  categories,
  hideWallet = false,
  order = 'desc',
  empty = 'Nothing recorded yet.',
  selectedId = null,
  rowActions = false,
  alignAmounts = false,
  variant = 'cards',
}: {
  transactions: Transaction[]
  wallets: Wallet[]
  categories: Category[]
  /** Drop the wallet name from each row — for a screen that is already one wallet. */
  hideWallet?: boolean
  /**
   * History reads backwards from today and a queue reads forwards, so the
   * Upcoming list is the same component with its days the other way round.
   */
  order?: 'asc' | 'desc'
  /** What to say with nothing to show. "Recorded" is wrong for a queue. */
  empty?: string
  /**
   * The row open in the detail pane, which on a wide layout is a route param
   * and never component state. Null on a phone, where nothing is ever selected
   * because opening a row replaces the list.
   */
  selectedId?: string | null
  /** Reveal edit/duplicate on the hovered row. */
  rowActions?: boolean
  /** Fix the amount column's width so figures align down the list. */
  alignAmounts?: boolean
  /** `table` is the wallet pane on a desktop: four columns, no day grouping. */
  variant?: 'cards' | 'table'
}) {
  const on = today()
  const walletMap = new Map(wallets.map((w) => [w.id, w]))
  const categoryMap = new Map(categories.map((c) => [c.id, c]))

  const byDay = new Map<string, Transaction[]>()
  for (const tx of transactions) {
    const bucket = byDay.get(tx.date) ?? []
    bucket.push(tx)
    byDay.set(tx.date, bucket)
  }
  const days = [...byDay.keys()].sort()
  if (order === 'desc') days.reverse()

  if (days.length === 0) {
    return <p className="px-4 py-8 text-center text-value text-ink-muted">{empty}</p>
  }

  if (variant === 'table') {
    // Collapsed across the whole list rather than per day: without day groups
    // the two legs of a pair are simply two adjacent rows, and the pair still
    // has to become one.
    const entries = collapseTransfers(days.flatMap((day) => byDay.get(day)!))
    return (
      <Table
        entries={entries}
        wallets={walletMap}
        categories={categoryMap}
        on={on}
        selected={selectedId}
      />
    )
  }

  return (
    <div className="flex flex-col gap-[14px]">
      {days.map((day) => {
        const rows = byDay.get(day)!
        // Transfers move money between own wallets, so they net to zero and are
        // left out of the day total rather than double-counted.
        const counted = rows.filter((t) => !t.transfer_id)
        const net = counted.reduce((sum, t) => sum + t.amount, 0)
        // A total only carries a currency if every row it sums shares one —
        // otherwise the figure is zloty added to euro and labelling it either
        // way would be a lie. Every wallet is PLN today, so this is a guard
        // against a future one rather than a case that fires.
        const netCurrencies = new Set(
          counted
            .map((t) => walletMap.get(t.wallet_id)?.currency)
            .filter((c): c is string => Boolean(c)),
        )
        const netCurrency = netCurrencies.size === 1 ? [...netCurrencies][0] : null
        const entries = collapseTransfers(rows)

        return (
          <div key={day} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between px-1">
              <Label>{formatDayHeader(day)}</Label>
              <span
                className="tnum text-meta font-semibold"
                style={{
                  color: net > 0 ? 'var(--color-income)' : 'var(--color-ink-faint)',
                }}
              >
                {formatSignedMoney(asMinor(net), netCurrency ?? 'PLN', {
                  plus: net > 0,
                })}
              </span>
            </div>

            <Card>
              {entries.map((entry, i) => (
                <div key={entryId(entry)}>
                  {i > 0 && <Divider />}
                  <Row
                    entry={entry}
                    wallets={walletMap}
                    categories={categoryMap}
                    hideWallet={hideWallet}
                    on={on}
                    selected={entryId(entry) === selectedId}
                    actions={rowActions}
                    alignAmounts={alignAmounts}
                  />
                </div>
              ))}
            </Card>
          </div>
        )
      })}
    </div>
  )
}
