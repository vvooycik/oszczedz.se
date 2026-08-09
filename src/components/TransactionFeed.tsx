import { Link } from 'react-router'
import { CategoryGlyph } from './CategoryGlyph'
import { asMinor, formatAmount, formatSigned } from '@/lib/money'
import { formatDayHeader } from '@/lib/dates'
import type { Category, Transaction, Wallet } from '@/lib/db'

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
}: {
  entry: Entry
  wallets: Map<string, Wallet>
  categories: Map<string, Category>
}) {
  if (entry.kind === 'transfer') {
    const from = wallets.get(entry.out.wallet_id)
    const to = wallets.get(entry.in.wallet_id)
    return (
      <Link
        to={`/tx/${entry.out.id}`}
        className="flex items-center gap-3 px-3.5 py-3"
      >
        <CategoryGlyph glyph={null} color={null} transfer />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] text-ink/75">
            {from?.name ?? '—'} → {to?.name ?? '—'}
          </div>
          <div className="mt-0.5 truncate text-[11.5px] text-ink-muted">
            Transfer · not counted as spending
          </div>
        </div>
        <div className="tnum flex-none text-[14px] text-ink-faint">
          {formatAmount(asMinor(entry.in.amount))}
        </div>
      </Link>
    )
  }

  const { tx } = entry
  const wallet = wallets.get(tx.wallet_id)
  const category = categories.get(tx.category_id)
  const income = tx.amount > 0
  const meta = [wallet?.name, tx.note].filter(Boolean).join(' · ')

  return (
    <Link to={`/tx/${tx.id}`} className="flex items-center gap-3 px-3.5 py-3">
      <CategoryGlyph glyph={category?.glyph} color={category?.color} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px]">{category?.name ?? 'Uncategorised'}</div>
        {meta && (
          <div className="mt-0.5 truncate text-[11.5px] text-ink-muted">{meta}</div>
        )}
      </div>
      <div
        className="tnum flex-none text-[14px]"
        style={{ color: income ? 'var(--color-income)' : 'var(--color-expense)' }}
      >
        {formatSigned(asMinor(tx.amount))}
      </div>
    </Link>
  )
}

export function TransactionFeed({
  transactions,
  wallets,
  categories,
}: {
  transactions: Transaction[]
  wallets: Wallet[]
  categories: Category[]
}) {
  const walletMap = new Map(wallets.map((w) => [w.id, w]))
  const categoryMap = new Map(categories.map((c) => [c.id, c]))

  const byDay = new Map<string, Transaction[]>()
  for (const tx of transactions) {
    const bucket = byDay.get(tx.date) ?? []
    bucket.push(tx)
    byDay.set(tx.date, bucket)
  }
  const days = [...byDay.keys()].sort().reverse()

  if (days.length === 0) {
    return (
      <p className="px-5 py-8 text-center text-[13px] text-ink-muted">
        Nothing recorded yet.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-[11px] px-5 pt-5 pb-40">
      {days.map((day) => {
        const rows = byDay.get(day)!
        // Transfers move money between own wallets, so they net to zero and are
        // left out of the day total rather than double-counted.
        const net = rows
          .filter((t) => !t.transfer_id)
          .reduce((sum, t) => sum + t.amount, 0)
        const entries = collapseTransfers(rows)

        return (
          <div key={day} className="flex flex-col gap-[11px]">
            <div className="flex items-baseline justify-between">
              <span className="kicker text-ink-muted">{formatDayHeader(day)}</span>
              <span
                className="tnum text-[11.5px]"
                style={{
                  color:
                    net > 0 ? 'var(--color-income)' : 'var(--color-ink-muted)',
                }}
              >
                {formatSigned(asMinor(net), { plus: net > 0 })}
              </span>
            </div>

            <div
              className="flex flex-col rounded-[4px]"
              style={{ border: '1px solid var(--color-line)' }}
            >
              {entries.map((entry, i) => (
                <div
                  key={entry.kind === 'transfer' ? entry.out.id : entry.tx.id}
                  style={{
                    borderTop: i === 0 ? undefined : '1px solid var(--color-line)',
                  }}
                >
                  <Row entry={entry} wallets={walletMap} categories={categoryMap} />
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
