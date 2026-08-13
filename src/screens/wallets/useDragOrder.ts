import { useCallback, useEffect, useRef, useState } from 'react'

export type DragState = {
  /** Index of the row being carried, in the *original* array. */
  from: number
  /** Index it would land at if released now. */
  to: number
  /** Pixels the finger has travelled from where it grabbed. */
  offset: number
}

/**
 * Pointer-driven reordering for a fixed-height vertical list.
 *
 * The app used to move rows with up/down buttons, and the reason was recorded:
 * a drag on iOS means owning pointer capture, fighting the scroll container for
 * the gesture, and autoscrolling at the edges. All three are still true — this
 * just pays for them, because the handoff asks for a drag and because the list
 * moved out of a bottom sheet onto a full-screen route, which removes the worst
 * of the fight (a sheet that also drags to dismiss).
 *
 * What makes it behave:
 *
 * - **Rows are assumed uniform height.** The target index is `round(offset /
 *   rowHeight)` rather than a hit test against each row's box, so nothing has to
 *   be measured while the finger is moving and the calculation cannot disagree
 *   with the transform being drawn.
 * - **The gesture starts on the handle only.** `touch-action: none` on the grip
 *   tells the browser the vertical axis belongs to us; the rest of the row keeps
 *   scrolling the list normally.
 * - **Pointer capture** keeps the move and up events coming after the finger
 *   leaves the 18px handle, which it does immediately.
 * - **Autoscroll** runs off a rAF loop rather than the move handler, because a
 *   finger held still at the edge produces no move events and the list would
 *   stop dead exactly when it needs to keep going.
 * - **The order is committed on drop**, not on every crossing: the caller
 *   persists once, and the intermediate positions never reach the database.
 */
export function useDragOrder({
  count,
  rowHeight,
  onDrop,
  scroller,
}: {
  count: number
  rowHeight: number
  onDrop: (from: number, to: number) => void
  scroller: React.RefObject<HTMLElement | null>
}) {
  const [drag, setDrag] = useState<DragState | null>(null)

  const origin = useRef(0)
  const pointerY = useRef(0)
  const frame = useRef(0)
  // Read by the autoscroll loop, which must not close over a stale `drag`.
  const live = useRef<DragState | null>(null)

  const update = useCallback((next: DragState | null) => {
    live.current = next
    setDrag(next)
  }, [])

  const apply = useCallback(
    (clientY: number) => {
      const current = live.current
      if (!current) return
      const offset = clientY - origin.current
      const moved = Math.round(offset / rowHeight)
      const to = Math.max(0, Math.min(count - 1, current.from + moved))
      update({ ...current, to, offset })
    },
    [count, rowHeight, update],
  )

  const dragging = drag !== null

  // Autoscroll while the finger sits near either edge of the scrolling region.
  useEffect(() => {
    if (!dragging) return
    const el = scroller.current
    if (!el) return

    const EDGE = 72
    const SPEED = 10

    const tick = () => {
      const box = el.getBoundingClientRect()
      const y = pointerY.current
      const above = y - box.top
      const below = box.bottom - y

      if (above < EDGE) el.scrollTop -= SPEED * (1 - Math.max(0, above) / EDGE)
      else if (below < EDGE) el.scrollTop += SPEED * (1 - Math.max(0, below) / EDGE)

      // The row under the finger changes when the list scrolls even though the
      // finger has not moved, so recompute from the last known pointer.
      apply(pointerY.current)
      frame.current = requestAnimationFrame(tick)
    }

    frame.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame.current)
  }, [dragging, scroller, apply])

  const handleProps = (index: number) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      origin.current = e.clientY
      pointerY.current = e.clientY
      update({ from: index, to: index, offset: 0 })
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (!live.current) return
      pointerY.current = e.clientY
      apply(e.clientY)
    },
    onPointerUp: () => {
      const current = live.current
      update(null)
      if (current && current.to !== current.from) onDrop(current.from, current.to)
    },
    onPointerCancel: () => update(null),
    // The vertical axis is ours; without this iOS starts a scroll and never
    // sends the move events.
    style: { touchAction: 'none' as const },
  })

  /**
   * How far row `index` should be shifted while a drag is in flight.
   *
   * The carried row follows the finger; every row between its old and new
   * positions steps one place the other way. Rows outside that span do not move,
   * which is what opens the gap where the row will land.
   */
  const shiftFor = (index: number): number => {
    if (!drag) return 0
    if (index === drag.from) return drag.offset
    if (drag.to > drag.from && index > drag.from && index <= drag.to) return -rowHeight
    if (drag.to < drag.from && index < drag.from && index >= drag.to) return rowHeight
    return 0
  }

  return { drag, handleProps, shiftFor }
}

/** Moves one item, returning a new array. */
export function reorder<T>(list: T[], from: number, to: number): T[] {
  const next = [...list]
  const [item] = next.splice(from, 1)
  if (item === undefined) return list
  next.splice(to, 0, item)
  return next
}
