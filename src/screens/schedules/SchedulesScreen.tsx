import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { IconClock, IconPlayerPause, IconPlus, IconRepeat } from '@tabler/icons-react'
import { FullScreen } from '@/app/AppShell'
import { useGoBack } from '@/app/useGoBack'
import { ActionTile } from '@/components/ui/Button'
import { Card, Divider } from '@/components/ui/Card'
import { CategoryGlyph } from '@/components/CategoryGlyph'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { TransactionFeed } from '@/components/TransactionFeed'
import { LabelRow } from '@/components/ui/Label'
import { SegmentedTrack } from '@/components/ui/SegmentedTrack'
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

type Tab = 'upcoming' | 'repeating'

/**
 * Counts ride in the labels. A tab that says how much is behind it answers the
 * question the tab exists for without being tapped, and both numbers are
 * already in hand — the alternative is switching to find out there was nothing
 * there.
 */
const tabs = (planned: number, repeating: number): { key: Tab; label: string }[] => [
  { key: 'upcoming', label: planned > 0 ? `Upcoming · ${planned}` : 'Upcoming' },
  {
    key: 'repeating',
    label: repeating > 0 ? `Repeating · ${repeating}` : 'Repeating',
  },
]
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
 * Either tab with nothing in it.
 *
 * Shared because the two say different things and must look identical saying
 * them — an empty Upcoming under a full Repeating is not a failure state, it
 * means nothing is due for six weeks, and it should not read as more alarming
 * than the tab that genuinely has nothing set up.
 *
 * The action is optional for that reason: there is nothing to offer someone
 * whose rules simply fire later than this list reaches.
 */
function Empty({
  icon,
  title,
  body,
  action,
  onAction,
}: {
  /** The tab's own mark: a clock for timing, a repeat arrow for recurrence. */
  icon: React.ReactNode
  title: string
  body: string
  action?: string
  onAction: () => void
}) {
  return (
    <div className="px-1 pt-8 text-center">
      <span className="mx-auto flex size-14 items-center justify-center rounded-card bg-inset text-ink-dim">
        {icon}
      </span>
      <p className="mt-4 text-[15px] font-medium">{title}</p>
      <p className="mx-auto mt-1.5 max-w-[19rem] text-[13.5px] leading-[1.6] text-ink-muted">
        {body}
      </p>
      {action && (
        <button
          type="button"
          onClick={onAction}
          className="mt-5 rounded-field bg-inset px-5 py-3 text-[14px] font-semibold"
        >
          {action}
        </button>
      )}
    </div>
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
 * ## Two tabs, and Upcoming is the one it opens on
 *
 * Neither feed shows planned rows any more — a list you read to remember what
 * you did should not open with things you have not done — so this screen is the
 * only place they exist. That makes the Upcoming list load-bearing rather than
 * decorative: without it a **one-off** future-dated transaction, which no rule
 * produced and no rule will list, would be invisible everywhere in the app.
 *
 * The two are **transactions and the rules that write them**, which is a real
 * difference in kind and not two groupings of one thing — one is dated rows you
 * can open and delete, the other is machinery. Stacked in one scroll they read
 * as one list with a heading in the middle. A track makes the choice explicit
 * and costs nothing, since neither side is ever long.
 *
 * It opens on Upcoming because that is what the link into here promises, and
 * because a rule is something you set once and a charge is something you check.
 *
 * The track sits **outside** the scrolling column rather than sticking to the
 * top of it. `ScreenHeader` is already `flex-none` above a `flex-1` scroller,
 * so a control between them is permanently visible with no sticky offsets to
 * resolve against a scrollport — which is the arrangement the Insight tab has
 * to work for, and does not get.
 */
export function SchedulesScreen() {
  const goBack = useGoBack('/more')
  const navigate = useNavigate()
  const schedules = useSchedules()
  const upcoming = useUpcomingTransactions()
  const wallets = useWallets()
  const categories = useCategories()

  const [tab, setTab] = useState<Tab>('upcoming')

  const walletMap = new Map((wallets.data ?? []).map((w) => [w.id, w]))
  const categoryMap = new Map((categories.data ?? []).map((c) => [c.id, c]))
  const rows = sortByNext(schedules.data ?? [])
  const planned = upcoming.data ?? []

  // Transfers move money between own wallets and net to zero, so they are left
  // out rather than counted twice — the same rule the feed's day totals follow.
  const plannedNet = planned
    .filter((t) => !t.transfer_id)
    .reduce((sum, t) => sum + t.amount, 0)

  // Both halves, because the counts in the tab labels come from both and a tab
  // that said "0" and then filled in would be worse than one that waited.
  const loading = !schedules.data || !upcoming.data

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

      {/* Outside the scroller, so it stays put with no sticky geometry. */}
      <div className="flex-none px-4 pt-1 pb-2">
        <SegmentedTrack
          options={tabs(planned.length, rows.length)}
          value={tab}
          onChange={setTab}
        />
      </div>

      <div className="no-scrollbar flex flex-1 flex-col gap-[14px] overflow-y-auto px-4 pt-1 pb-10">
        {loading ? (
          <p className="px-1 text-[13px] text-ink-muted">
            {schedules.error || upcoming.error
              ? 'Could not load schedules.'
              : 'Loading…'}
          </p>
        ) : tab === 'upcoming' ? (
          planned.length === 0 ? (
            <Empty
              icon={<IconClock size={26} stroke={1.8} />}
              title="Nothing is due"
              body={
                rows.length > 0
                  ? 'No charge lands in the next six weeks. Rules that fire later than that have their rows written already — they are just further out than this list reaches.'
                  : 'Give a transaction a date in the future and it waits here until that day, counting towards your balance only when it lands.'
              }
              action={rows.length > 0 ? undefined : 'Add a schedule'}
              onAction={() => navigate('/add?repeat=1')}
            />
          ) : (
            <>
              <LabelRow
                trailing={
                  <span className="tnum text-[12.5px] text-ink-muted">
                    {formatSignedMoney(asMinor(plannedNet), CURRENCY)}
                  </span>
                }
              >
                Next six weeks
              </LabelRow>
              <TransactionFeed
                transactions={planned}
                wallets={wallets.data ?? []}
                categories={categories.data ?? []}
                order="asc"
              />
              <p className="px-1 text-[12.5px] leading-[1.6] text-ink-muted">
                Each of these is a real transaction already, and counts towards
                your balance on the day it lands. Deleting one skips that charge
                and leaves its rule alone.
              </p>
            </>
          )
        ) : rows.length === 0 ? (
          <Empty
            icon={<IconRepeat size={26} stroke={1.8} />}
            title="Nothing repeats"
            body="A repeating entry writes its transactions ahead of time — they show under Upcoming before they charge, and on the home chart as a dotted line."
            action="Add a schedule"
            onAction={() => navigate('/add?repeat=1')}
          />
        ) : (
          <>
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
            <p className="px-1 text-[12.5px] leading-[1.6] text-ink-muted">
              Occurrences are written four months ahead. Editing a rule rewrites
              what is still to come and leaves what already happened alone.
            </p>
          </>
        )}
      </div>
    </FullScreen>
  )
}
