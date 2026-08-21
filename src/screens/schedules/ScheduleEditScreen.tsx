import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import {
  IconCalendar,
  IconCalendarOff,
  IconChevronRight,
  IconPencil,
  IconPlayerPause,
  IconPlayerPlay,
  IconRepeat,
  IconTrash,
  IconWallet,
} from '@tabler/icons-react'
import { FullScreen } from '@/app/AppShell'
import { useGoBack } from '@/app/useGoBack'
import { useTextFieldFocused } from '@/app/useTextFieldFocused'
import { Button } from '@/components/ui/Button'
import { Card, Divider } from '@/components/ui/Card'
import { CategoryGlyph } from '@/components/CategoryGlyph'
import { Label } from '@/components/ui/Label'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { Tile } from '@/components/ui/Tile'
import { CategorySheet } from '@/screens/add/CategorySheet'
import { DateSheet } from '@/screens/add/DateSheet'
import { LimitSheet } from '@/screens/budgets/LimitSheet'
import { RepeatSheet, type Repeat } from '@/screens/add/RepeatSheet'
import {
  useCategories,
  useDeleteSchedule,
  useSaveSchedule,
  useSchedule,
  useSetScheduleActive,
  useWallets,
} from '@/data/queries'
import { cadenceLabel, hasEnded, nextOccurrence } from '@/lib/schedules'
import { asMinor, currencySymbol, formatSigned, type Minor } from '@/lib/money'
import { formatFullDate, relativeDayLabel } from '@/lib/dates'
import { activeWallets } from '@/lib/wallets'
import { categoryVar } from '@/theme/tokens'
import type { Category } from '@/lib/db'

type Draft = {
  name: string
  wallet_id: string
  target_wallet_id: string | null
  category_id: string
  /** Magnitude; the sign is kept out of the pad and put back on save. */
  amount: Minor
  negative: boolean
  note: string | null
  repeat: NonNullable<Repeat>
  anchor: string
  ends_on: string | null
  active: boolean
}

/** A tapped row: tile, name, a quiet value, chevron. */
function EditRow({
  icon,
  title,
  value,
  onClick,
}: {
  icon: React.ReactNode
  title: string
  value: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-[13px] px-4 py-[13px] text-left active:bg-press"
    >
      <Tile size={36} variant="neutral">
        {icon}
      </Tile>
      <span className="min-w-0 flex-1 text-row font-medium">{title}</span>
      <span className="truncate text-value text-ink-muted">{value}</span>
      <IconChevronRight size={18} stroke={2} className="flex-none text-ink-dim" />
    </button>
  )
}

/**
 * Editing one rule.
 *
 * **Only editing.** Creation lives on the entry screen behind its Repeats row,
 * because a schedule is a transaction plus a cadence and the entry screen is
 * where a transaction is typed — keypad, category sheet, wallet select. This
 * screen would otherwise be that one with the calculator removed.
 *
 * Saving calls `reschedule`, which throws away this rule's rows *after today*
 * and writes them again, and never touches the past. Changing what a
 * subscription costs changes what it will charge, not what it charged — so a
 * price rise is a normal edit here rather than a reason to delete the rule and
 * start a new one.
 *
 * The screen is themed by its category the way the entry and detail screens
 * are, which is also the only place the colour comes from: a schedule has no
 * colour of its own to store.
 */
export function ScheduleEditScreen() {
  const { id } = useParams()
  const goBack = useGoBack('/scheduled')
  const navigate = useNavigate()
  const typing = useTextFieldFocused()

  const schedule = useSchedule(id)
  const wallets = useWallets()
  const categories = useCategories()
  const save = useSaveSchedule()
  const setActive = useSetScheduleActive()
  const remove = useDeleteSchedule()

  const [draft, setDraft] = useState<Draft | null>(null)
  const [amountOpen, setAmountOpen] = useState(false)
  const [repeatOpen, setRepeatOpen] = useState(false)
  const [anchorOpen, setAnchorOpen] = useState(false)
  const [endsOpen, setEndsOpen] = useState(false)
  const [catOpen, setCatOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const row = schedule.data

  // Deleted elsewhere, or a stale deep link: nothing to edit and no form to
  // show, so leave rather than sit on a spinner.
  useEffect(() => {
    if (schedule.isError) navigate('/scheduled', { replace: true })
  }, [schedule.isError, navigate])

  // Seeded once, on the render where the row has arrived — the same `hydrated`
  // gate `/tx/:id/edit` uses, so a background refetch cannot undo typing.
  useEffect(() => {
    if (draft || !row) return
    setDraft({
      name: row.name,
      wallet_id: row.wallet_id,
      target_wallet_id: row.target_wallet_id,
      category_id: row.category_id,
      amount: asMinor(Math.abs(row.amount)),
      negative: row.amount < 0,
      note: row.note,
      repeat: { frequency: row.frequency, everyN: row.every_n },
      anchor: row.anchor,
      ends_on: row.ends_on,
      active: row.active,
    })
  }, [draft, row])

  if (!draft || !row) {
    return (
      <FullScreen>
        <ScreenHeader title="Schedule" onBack={goBack} size={19} />
        <p className="px-4 py-10 text-value text-ink-muted">
          {schedule.error ? 'Could not load this schedule.' : 'Loading…'}
        </p>
      </FullScreen>
    )
  }

  const patch = (next: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...next } : d))

  const all = wallets.data ?? []
  const selectable = activeWallets(all)
  const wallet = all.find((w) => w.id === draft.wallet_id)
  const category = (categories.data ?? []).find((c) => c.id === draft.category_id)
  const isTransfer = Boolean(draft.target_wallet_id)
  const currency = wallet?.currency ?? 'PLN'
  // Falls back to the accent for a category whose colour cannot be resolved,
  // rather than leaving the commit button and the amount pad untoned.
  const hue = category ? categoryVar(category.color) : 'var(--color-accent)'

  const signed = asMinor(draft.negative ? -draft.amount : draft.amount)
  const next = nextOccurrence({
    frequency: draft.repeat.frequency,
    every_n: draft.repeat.everyN,
    anchor: draft.anchor,
    ends_on: draft.ends_on,
  })
  const ended = hasEnded({
    frequency: draft.repeat.frequency,
    every_n: draft.repeat.everyN,
    anchor: draft.anchor,
    ends_on: draft.ends_on,
  })

  const busy = save.isPending || setActive.isPending || remove.isPending
  const canSave = draft.name.trim().length > 0 && draft.amount !== 0

  const commit = async () => {
    setError(null)
    try {
      await save.mutateAsync({
        id: row.id,
        name: draft.name.trim(),
        wallet_id: draft.wallet_id,
        target_wallet_id: draft.target_wallet_id,
        category_id: draft.category_id,
        amount: signed,
        note: draft.note,
        frequency: draft.repeat.frequency,
        every_n: draft.repeat.everyN,
        anchor: draft.anchor,
        ends_on: draft.ends_on,
      })
      goBack()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
    }
  }

  const toggleActive = async () => {
    setError(null)
    try {
      await setActive.mutateAsync({ id: row.id, active: !draft.active })
      patch({ active: !draft.active })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change this schedule')
    }
  }

  return (
    <FullScreen>
      <ScreenHeader title="Schedule" onBack={goBack} size={19} />

      <div className="no-scrollbar flex-1 overflow-y-auto px-4 pb-6">
        {/* ------------------------------------------------------- the hero */}
        <div className="flex flex-col items-center pt-1 pb-5">
          <button type="button" onClick={() => setCatOpen(true)} className="active:opacity-80">
            <CategoryGlyph
              glyph={category?.glyph}
              color={category?.color}
              transfer={isTransfer}
              size={64}
            />
          </button>

          <button
            type="button"
            onClick={() => setAmountOpen(true)}
            className="tnum mt-4 flex items-end justify-center active:opacity-80"
            style={{
              fontSize: 'var(--text-hero)',
              fontWeight: 600,
              lineHeight: 1,
              letterSpacing: '-.035em',
              color: isTransfer
                ? 'var(--color-ink)'
                : draft.negative
                  ? 'var(--color-expense)'
                  : 'var(--color-income)',
            }}
          >
            {formatSigned(signed, { plus: !draft.negative && !isTransfer })}
            <span
              className="text-ink-faint"
              style={{ fontSize: 'var(--text-hero-unit)', fontWeight: 500, letterSpacing: 0 }}
            >
              &nbsp;{currencySymbol(currency)}
            </span>
          </button>

          <div className="mt-3 text-center text-meta text-ink-muted">
            {cadenceLabel(draft.repeat.frequency, draft.repeat.everyN, draft.anchor)}
            {!draft.active
              ? ' · paused'
              : ended || !next
                ? ' · finished'
                : ` · next ${relativeDayLabel(next).toLowerCase()}`}
          </div>
        </div>

        {/* --------------------------------------------------- the fields */}
        <Label className="px-1">Details</Label>
        <Card className="mt-2">
          <div className="flex items-center gap-[13px] px-4 py-[13px]">
            <Tile size={36} variant="neutral">
              <IconPencil size={18} stroke={2} />
            </Tile>
            {/* 16px is the floor: iOS zooms the viewport for anything smaller
                and never zooms back out. */}
            <input
              value={draft.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="Name"
              aria-label="Schedule name"
              className="flex-1 bg-transparent text-field font-medium outline-none placeholder:text-ink-faint"
            />
          </div>

          <Divider inset={63} />
          <EditRow
            icon={<IconRepeat size={18} stroke={2} />}
            title="Repeats"
            value={cadenceLabel(
              draft.repeat.frequency,
              draft.repeat.everyN,
              draft.anchor,
            )}
            onClick={() => setRepeatOpen(true)}
          />

          <Divider inset={63} />
          <EditRow
            icon={<IconCalendar size={18} stroke={2} />}
            title="Starts"
            value={formatFullDate(draft.anchor)}
            onClick={() => setAnchorOpen(true)}
          />

          <Divider inset={63} />
          {/* An open-ended rule is the normal one, so "Never" is a value here
              rather than an empty field. */}
          <EditRow
            icon={<IconCalendarOff size={18} stroke={2} />}
            title="Ends"
            value={draft.ends_on ? formatFullDate(draft.ends_on) : 'Never'}
            onClick={() => setEndsOpen(true)}
          />
          {draft.ends_on && (
            <div className="px-4 pb-3" style={{ marginLeft: 49 }}>
              <button
                type="button"
                onClick={() => patch({ ends_on: null })}
                className="rounded-full px-3 py-1.5 text-meta-sm text-ink-muted"
                style={{ background: 'var(--color-inset)' }}
              >
                Clear end date
              </button>
            </div>
          )}
        </Card>

        <Label className="mt-5 px-1">Where it lands</Label>
        <Card className="mt-2">
          <div className="flex items-center gap-[13px] px-4 py-[13px]">
            <Tile size={36} variant="neutral">
              <IconWallet size={18} stroke={2} />
            </Tile>
            <span className="flex-none text-meta-sm text-ink-muted">
              {isTransfer ? 'From' : 'Wallet'}
            </span>
            <select
              value={draft.wallet_id}
              onChange={(e) => patch({ wallet_id: e.target.value })}
              aria-label="Wallet"
              className="flex-1 appearance-none bg-transparent text-right text-field outline-none"
            >
              {selectable.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>

          {/* A schedule's kind is fixed at creation for the same reason a
              wallet's type is: a transfer is a pair and a plain row is not, and
              turning one into the other would have to decide what happens to
              every occurrence already written. The far wallet is still
              editable — moving a standing repayment to another account is an
              ordinary thing to do. */}
          {isTransfer && (
            <>
              <Divider inset={63} />
              <div className="flex items-center gap-[13px] px-4 py-[13px]">
                <Tile size={36} variant="neutral">
                  <IconWallet size={18} stroke={2} />
                </Tile>
                <span className="flex-none text-meta-sm text-ink-muted">To</span>
                <select
                  value={draft.target_wallet_id ?? ''}
                  onChange={(e) => patch({ target_wallet_id: e.target.value })}
                  aria-label="Target wallet"
                  className="flex-1 appearance-none bg-transparent text-right text-field outline-none"
                >
                  {selectable
                    .filter((w) => w.id !== draft.wallet_id)
                    .map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                </select>
              </div>
            </>
          )}
        </Card>

        {error && <p className="px-1 pt-3 text-meta text-expense">{error}</p>}

        {/* ------------------------------------------------------- actions */}
        <div className="mt-6 flex flex-col gap-2.5">
          <button
            type="button"
            disabled={busy}
            onClick={toggleActive}
            className="flex items-center justify-center gap-2 rounded-field bg-card py-3.5 text-action font-semibold disabled:opacity-40"
          >
            {draft.active ? (
              <>
                <IconPlayerPause size={17} stroke={2} />
                Pause this schedule
              </>
            ) : (
              <>
                <IconPlayerPlay size={17} stroke={2} />
                Resume
              </>
            )}
          </button>

          {confirmDelete ? (
            <div className="rounded-card bg-card px-4 py-4">
              <p className="text-prose leading-[1.55] text-ink-muted">
                Delete this schedule? Occurrences still to come are cancelled;
                the ones that already charged stay in your history as ordinary
                transactions.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1 rounded-field bg-inset py-3 text-link font-semibold"
                >
                  Keep it
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setError(null)
                    try {
                      await remove.mutateAsync(row.id)
                      navigate('/scheduled', { replace: true })
                    } catch (err) {
                      setError(
                        err instanceof Error ? err.message : 'Could not delete',
                      )
                    }
                  }}
                  className="flex-1 rounded-field py-3 text-link font-semibold disabled:opacity-40"
                  style={{
                    background: 'color-mix(in oklab, var(--color-expense) 18%, transparent)',
                    color: 'var(--color-expense)',
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="flex items-center justify-center gap-2 rounded-field bg-card py-3.5 text-action font-semibold text-expense"
            >
              <IconTrash size={17} stroke={2} />
              Delete
            </button>
          )}
        </div>

        <p className="px-1 pt-4 pb-2 text-meta leading-[1.6] text-ink-muted">
          Saving rewrites what is still to come and leaves what already happened
          alone.
        </p>
      </div>

      {/* The commit bar lifts for the keyboard the way the entry screen's does;
          being a nudge out is the worst this can be. */}
      {!typing && (
        <div
          className="flex-none px-4 pt-2"
          style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}
        >
          <Button tone={hue} disabled={!canSave || busy} onClick={commit}>
            {busy ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      )}

      <LimitSheet
        open={amountOpen}
        onClose={() => setAmountOpen(false)}
        value={draft.amount}
        onChange={(amount) => patch({ amount })}
        currency={currency}
        tone={hue}
        periodLabel={cadenceLabel(
          draft.repeat.frequency,
          draft.repeat.everyN,
          draft.anchor,
        ).toLowerCase()}
      />

      <RepeatSheet
        open={repeatOpen}
        onClose={() => setRepeatOpen(false)}
        value={draft.repeat}
        anchor={draft.anchor}
        onChange={(repeat) => repeat && patch({ repeat })}
      />

      <DateSheet
        open={anchorOpen}
        onClose={() => setAnchorOpen(false)}
        value={draft.anchor}
        onPick={(anchor) => patch({ anchor })}
      />

      <DateSheet
        open={endsOpen}
        onClose={() => setEndsOpen(false)}
        value={draft.ends_on ?? draft.anchor}
        onPick={(ends_on) => patch({ ends_on })}
      />

      <CategorySheet
        open={catOpen}
        onClose={() => setCatOpen(false)}
        categories={categories.data ?? []}
        selectedId={draft.category_id}
        // A plain schedule cannot become a transfer by changing its category,
        // the same rule `/tx/:id/edit` follows: the pair is `create_transfer`'s
        // to make, and the occurrences already written would disagree.
        allowTransfer={isTransfer}
        onPick={(c: Category) => patch({ category_id: c.id })}
      />
    </FullScreen>
  )
}
