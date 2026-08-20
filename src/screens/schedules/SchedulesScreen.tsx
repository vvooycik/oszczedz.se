import { Link, useNavigate } from 'react-router'
import { IconPlayerPause, IconPlus, IconRepeat } from '@tabler/icons-react'
import { FullScreen } from '@/app/AppShell'
import { useGoBack } from '@/app/useGoBack'
import { ActionTile } from '@/components/ui/Button'
import { Card, Divider } from '@/components/ui/Card'
import { CategoryGlyph } from '@/components/CategoryGlyph'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { TransactionFeed } from '@/components/TransactionFeed'
import { LabelRow } from '@/components/ui/Label'
import {
  useCategories,
  useSchedules,
  useUpcomingTransactions,
  useWallets,
} from '@/data/queries'
import { cadenceLabel, hasEnded, nextOccurrence, sortByNext } from '@/lib/schedules'
import { asMinor, formatSignedMoney } from '@/lib/money'

// One currency in v1 (invariant 8), so the Upcoming total needs no filter.
const CURRENCY = 'PLN'
import { relativeDayLabel } from '@/lib/dates'
import type { Category, Schedule, Wallet } from '@/lib/db'

function ScheduleRow({
  schedule,
  wallets,
  categories,
}: {
  schedule: Schedule
  wallets: Map<string, Wallet>
  categories: Map<string, Category>
}) {
  const wallet = wallets.get(schedule.wallet_id)
  const category = categories.get(schedule.category_id)
  const target = schedule.target_wallet_id
    ? wallets.get(schedule.target_wallet_id)
    : null
  const next = nextOccurrence(schedule)
  const ended = hasEnded(schedule)

  // Paused and finished are different sentences and must not both read as
  // "off": one is a choice that can be undone from this row, the other is the
  // rule having run its course.
  const when = !schedule.active
    ? 'Paused'
    : ended || !next
      ? 'Finished'
      : `Next ${relativeDayLabel(next).toLowerCase()}`

  return (
    <Link
      to={`/scheduled/${schedule.id}/edit`}
      className="flex items-center gap-[13px] px-4 py-[13px] active:bg-press"
      style={{ opacity: schedule.active ? 1 : 0.55 }}
    >
      <CategoryGlyph
        glyph={category?.glyph}
        color={category?.color}
        transfer={Boolean(target)}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-medium">{schedule.name}</div>
        <div className="mt-px truncate text-[12.5px] text-ink-muted">
          {cadenceLabel(schedule.frequency, schedule.every_n, schedule.anchor)}
          {' · '}
          {target ? `${wallet?.name ?? '—'} → ${target.name}` : (wallet?.name ?? '—')}
        </div>
      </div>
      <div className="flex-none text-right">
        <div
          className="tnum text-[15px] font-semibold whitespace-nowrap"
          style={{
            color: target
              ? 'var(--color-ink-faint)'
              : schedule.amount > 0
                ? 'var(--color-income)'
                : 'var(--color-expense)',
          }}
        >
          {formatSignedMoney(asMinor(schedule.amount), wallet?.currency ?? 'PLN')}
        </div>
        <div className="mt-px flex items-center justify-end gap-1 text-[12px] text-ink-faint">
          {!schedule.active && <IconPlayerPause size={11} stroke={2} />}
          {when}
        </div>
      </div>
    </Link>
  )
}

/**
 * The rules that write transactions by themselves.
 *
 * **Ordered by when each one next charges**, so the list reads as a queue
 * rather than as a set — the question anybody opens this screen with is "what
 * is about to come out", and that is a different order from alphabetical or
 * from largest-first. Paused and finished rules sink to the bottom by having no
 * next date, and are dimmed rather than hidden: a rule you paused is a decision
 * you might want to reverse, and one that ran out is a record of what was set
 * up.
 *
 * There is no separate creation form. The plus routes to the entry screen with
 * its Repeats row already open, because a schedule is an ordinary transaction
 * plus a cadence and the entry screen is where a transaction gets typed —
 * keypad, category sheet, wallet select and all. A second form would be that
 * one with the calculator taken out.
 *
 * ## Two halves, and Upcoming comes first
 *
 * Neither feed shows planned rows any more — a list you read to remember what
 * you did should not open with things you have not done — so this screen is the
 * only place they exist. That makes the Upcoming list load-bearing rather than
 * decorative: without it a **one-off** future-dated transaction, which no rule
 * produced and no rule will list, would be invisible everywhere in the app.
 *
 * It sits above the rules because that is what the link into here promises. The
 * rules are the machinery; what is actually coming is the answer.
 */
export function SchedulesScreen() {
  const goBack = useGoBack('/more')
  const navigate = useNavigate()
  const schedules = useSchedules()
  const upcoming = useUpcomingTransactions()
  const wallets = useWallets()
  const categories = useCategories()

  const walletMap = new Map((wallets.data ?? []).map((w) => [w.id, w]))
  const categoryMap = new Map((categories.data ?? []).map((c) => [c.id, c]))
  const rows = sortByNext(schedules.data ?? [])
  const planned = upcoming.data ?? []

  // Transfers move money between own wallets and net to zero, so they are left
  // out rather than counted twice — the same rule the feed's day totals follow.
  const plannedNet = planned
    .filter((t) => !t.transfer_id)
    .reduce((sum, t) => sum + t.amount, 0)

  return (
    <FullScreen>
      <ScreenHeader
        title="Scheduled"
        onBack={goBack}
        size={19}
        actions={
          <ActionTile label="New schedule" onClick={() => navigate('/add?repeat=1')}>
            <IconPlus size={20} stroke={2} />
          </ActionTile>
        }
      />

      <div className="no-scrollbar flex flex-1 flex-col gap-[14px] overflow-y-auto px-4 pt-2 pb-10">
        {!schedules.data ? (
          <p className="px-1 text-[13px] text-ink-muted">
            {schedules.error ? 'Could not load schedules.' : 'Loading…'}
          </p>
        ) : rows.length === 0 && planned.length === 0 ? (
          <div className="px-1 pt-6 text-center">
            <span className="mx-auto flex size-14 items-center justify-center rounded-card bg-inset text-ink-dim">
              <IconRepeat size={26} stroke={1.8} />
            </span>
            <p className="mx-auto mt-4 max-w-[19rem] text-[13.5px] leading-[1.6] text-ink-muted">
              Nothing is scheduled. A repeating entry writes its transactions
              ahead of time — they appear here before they charge, show on the
              home chart as a dotted line, and count towards your balance only
              on the day they land.
            </p>
            <button
              type="button"
              onClick={() => navigate('/add?repeat=1')}
              className="mt-5 rounded-field bg-inset px-5 py-3 text-[14px] font-semibold"
            >
              Add a schedule
            </button>
          </div>
        ) : (
          <>
            {planned.length > 0 && (
              <>
                <LabelRow
                  trailing={
                    <span className="text-[12.5px] text-ink-muted">
                      {formatSignedMoney(asMinor(plannedNet), CURRENCY)}
                    </span>
                  }
                >
                  Upcoming
                </LabelRow>
                <TransactionFeed
                  transactions={planned}
                  wallets={wallets.data ?? []}
                  categories={categories.data ?? []}
                  order="asc"
                />
              </>
            )}

            {rows.length > 0 && (
              <>
                <LabelRow className={planned.length > 0 ? 'pt-1' : undefined}>
                  {rows.length} repeating
                </LabelRow>
                <Card>
                  {rows.map((schedule, index) => (
                    <div key={schedule.id}>
                      {index > 0 && <Divider inset={63} />}
                      <ScheduleRow
                        schedule={schedule}
                        wallets={walletMap}
                        categories={categoryMap}
                      />
                    </div>
                  ))}
                </Card>
              </>
            )}

            <p className="px-1 text-[12.5px] leading-[1.6] text-ink-muted">
              Occurrences are written four months ahead; this list shows the next
              six weeks. Deleting one skips that charge; editing the rule
              rewrites what is still to come and leaves what already happened
              alone.
            </p>
          </>
        )}
      </div>
    </FullScreen>
  )
}
