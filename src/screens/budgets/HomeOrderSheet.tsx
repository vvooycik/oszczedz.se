import { useEffect, useRef, useState } from 'react'
import { IconGripVertical } from '@tabler/icons-react'
import { FullScreen } from '@/app/AppShell'
import { Card, Divider } from '@/components/ui/Card'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { Tile } from '@/components/ui/Tile'
import { Toggle } from '@/components/ui/Toggle'
import { useBudgetProgress, useSetHomeOrder } from '@/data/queries'
import { iconFor } from '@/lib/icons'
import { categoryVar } from '@/theme/tokens'
import { useGoBack } from '@/app/useGoBack'
import { reorder, useDragOrder } from '@/screens/wallets/useDragOrder'
import type { BudgetProgress } from '@/lib/db'

/**
 * `useDragOrder` turns travel into a target index without measuring anything
 * mid-gesture, so every row has to be this tall: 36px tile + 13px of padding
 * top and bottom + the 1px divider.
 */
const ROW_HEIGHT = 63

type Entry = { id: string; name: string; color: string; glyph: string; on: boolean }

/**
 * The rail's order and membership, in one list.
 *
 * A full-screen **route** rather than the handoff's sheet, for two reasons. A
 * drawer claims the vertical axis twice over — its own scroll and its
 * drag-to-dismiss — and a drag reorder is a third claim on it, which is the
 * fight the wallet category picker records losing. And a drawer opened from a
 * tabbed screen would have to be an `absolute inset-0` child of an unpositioned
 * `<main>`, the one arrangement in this app that has never been verified on a
 * device.
 *
 * **Budgets dropped from the rail stay in the list**, greyed, rather than
 * vanishing on the toggle. Removing a row under the finger that just touched it
 * takes away the undo, and the whole screen is one committed action.
 */
export function HomeOrderScreen() {
  const goBack = useGoBack('/budgets')
  const { data } = useBudgetProgress()
  return <HomeOrder budgets={data ?? []} onClose={goBack} />
}

function HomeOrder({
  budgets,
  onClose,
}: {
  budgets: BudgetProgress[]
  onClose: () => void
}) {
  const save = useSetHomeOrder()
  const scroller = useRef<HTMLDivElement>(null)

  const [rows, setRows] = useState<Entry[]>([])
  // Seeded once, on the render the budgets arrive, so a background refetch
  // cannot undo an arrangement in progress.
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    if (hydrated || budgets.length === 0) return
    setRows(
      [...budgets]
        .sort(
          (a, b) =>
            Number(b.show_on_home) - Number(a.show_on_home) ||
            a.home_order - b.home_order ||
            a.name.localeCompare(b.name),
        )
        .map((b) => ({
          id: b.budget_id,
          name: b.name,
          color: b.color,
          glyph: b.glyph,
          on: b.show_on_home,
        })),
    )
    setHydrated(true)
  }, [hydrated, budgets])

  const { drag, handleProps, shiftFor } = useDragOrder({
    count: rows.length,
    rowHeight: ROW_HEIGHT,
    scroller,
    onDrop: (from, to) => setRows((current) => reorder(current, from, to)),
  })

  const shown = rows.filter((r) => r.on).length

  return (
    <FullScreen>
      <ScreenHeader
        title="Home rail"
        onClose={onClose}
        actions={
          <button
            type="button"
            onClick={() =>
              save.mutate(
                rows.map((r) => ({ id: r.id, show_on_home: r.on })),
                { onSuccess: onClose },
              )
            }
            disabled={save.isPending || !hydrated}
            className="px-1 text-[14px] font-semibold text-accent disabled:opacity-40"
          >
            {save.isPending ? 'Saving…' : 'Done'}
          </button>
        }
      />

      {save.error instanceof Error && (
        <p className="flex-none px-4 pt-2 text-center text-[12.5px] text-expense">
          {save.error.message}
        </p>
      )}

      <div
        ref={scroller}
        className="no-scrollbar flex flex-1 flex-col gap-[14px] overflow-y-auto px-4 pt-2 pb-10"
      >
        <p className="px-1 text-[12.5px] leading-[1.5] text-ink-muted">
          {shown === 0
            ? 'Nothing on Home. The rail collapses to a single “Add a budget” tile until something is switched on.'
            : `${shown} on Home, in this order. Drag the handle to move one; the switch takes it off the rail without deleting it.`}
        </p>

        <Card>
          {rows.map((entry, index) => {
            const lifted = drag?.from === index
            const Icon = iconFor(entry.glyph)
            return (
              <div
                key={entry.id}
                style={{
                  transform: `translateY(${shiftFor(index)}px)`,
                  transition: lifted ? 'none' : 'transform 120ms ease-out',
                  position: 'relative',
                  zIndex: lifted ? 2 : 1,
                  background: lifted ? 'var(--color-inset)' : undefined,
                  boxShadow: lifted ? 'var(--shadow-drag)' : undefined,
                  borderRadius: lifted ? 12 : undefined,
                  opacity: entry.on ? 1 : 0.5,
                }}
              >
                {index > 0 && <Divider inset={64} />}
                <div className="flex items-center gap-[10px] px-4 py-[13px]">
                  <span
                    {...handleProps(index)}
                    aria-label={`Reorder ${entry.name}`}
                    className="-my-3 flex flex-none cursor-grab items-center py-3 text-ink-dim active:cursor-grabbing"
                  >
                    <IconGripVertical size={18} stroke={2} />
                  </span>
                  <Tile color={categoryVar(entry.color)} size={36}>
                    <Icon size={18} stroke={2} />
                  </Tile>
                  <span className="min-w-0 flex-1 truncate text-[15px] font-medium">
                    {entry.name}
                  </span>
                  <Toggle
                    checked={entry.on}
                    label={`Show ${entry.name} on Home`}
                    onChange={(on) =>
                      setRows((current) =>
                        current.map((r) => (r.id === entry.id ? { ...r, on } : r)),
                      )
                    }
                  />
                </div>
              </div>
            )
          })}
        </Card>

        <p className="px-1 text-[12.5px] leading-[1.5] text-ink-muted">
          Order is saved on Done, not on every crossing — the intermediate
          positions never reach the database.
        </p>
      </div>
    </FullScreen>
  )
}
