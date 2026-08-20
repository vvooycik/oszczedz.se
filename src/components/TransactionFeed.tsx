import { Link } from 'react-router'
import { IconClock, IconRepeat } from '@tabler/icons-react'
import { CategoryGlyph } from './CategoryGlyph'
import { Card, Divider } from './ui/Card'
import { Label } from './ui/Label'
import { isAdjustment } from '@/lib/adjustments'
import { asMinor, formatAmountMoney, formatSignedMoney } from '@/lib/money'
import { formatDayHeader, today } from '@/lib/dates'
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

function Row({
  entry,
  wallets,
  categories,
  hideWallet,
  on,
}: {
  entry: Entry
  wallets: Map<string, Wallet>
  categories: Map<string, Category>
  hideWallet: boolean
  /** Today, passed in rather than read per row so one list cannot straddle midnight. */
  on: string
}) {
  if (entry.kind === 'transfer') {
    const planned = entry.out.date > on
    const from = wallets.get(entry.out.wallet_id)
    const to = wallets.get(entry.in.wallet_id)
    return (
      <Link
        to={`/tx/${entry.out.id}`}
        className="flex items-center gap-[13px] px-4 py-[13px] active:bg-press"
      >
        <CategoryGlyph glyph={null} color={null} transfer />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[15px] font-medium text-ink/75">
              {from?.name ?? '—'} → {to?.name ?? '—'}
            </span>
            {planned && <PlannedMark scheduled={entry.out.schedule_id != null} />}
          </div>
          <div className="mt-px truncate text-[12.5px] text-ink-muted">
            {planned ? 'Scheduled transfer' : 'Transfer · not counted as spending'}
          </div>
        </div>
        {/* The target leg, so the target wallet's currency — a cross-currency
            transfer has a different amount on each side. */}
        <div className="tnum flex-none text-[15px] font-semibold whitespace-nowrap text-ink-faint">
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
      className="flex items-center gap-[13px] px-4 py-[13px] active:bg-press"
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
            className={`truncate text-[15px] font-medium ${adjustment ? 'text-ink/75' : ''}`}
          >
            {category?.name ?? 'Uncategorised'}
          </span>
          {planned && <PlannedMark scheduled={tx.schedule_id != null} />}
        </div>
        {meta && (
          <div className="mt-px truncate text-[12.5px] text-ink-muted">{meta}</div>
        )}
      </div>
      <div
        className="tnum flex-none text-[15px] font-semibold whitespace-nowrap"
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

export function TransactionFeed({
  transactions,
  wallets,
  categories,
  hideWallet = false,
  order = 'desc',
  empty = 'Nothing recorded yet.',
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
    return (
      <p className="px-4 py-8 text-center text-[13px] text-ink-muted">{empty}</p>
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
                className="tnum text-[12.5px] font-semibold"
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
                <div key={entry.kind === 'transfer' ? entry.out.id : entry.tx.id}>
                  {i > 0 && <Divider />}
                  <Row
                    entry={entry}
                    wallets={walletMap}
                    categories={categoryMap}
                    hideWallet={hideWallet}
                    on={on}
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
