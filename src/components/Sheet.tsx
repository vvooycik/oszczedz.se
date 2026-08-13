import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useKeyboardInset } from '@/app/useKeyboardInset'

/** Slide in, scrim fade. The scrim is quicker so the panel arrives on a ground. */
const SLIDE_MS = 280
const SCRIM_MS = 200

/** Past this fraction of its own height, releasing dismisses rather than snaps back. */
const DISMISS_FRACTION = 0.4
/** …or below it, if the release was fast enough to read as a flick (px/ms). */
const FLICK_VELOCITY = 0.5

/**
 * Bottom drawer. Slides up over the current screen with a fading scrim.
 *
 * The scrim gates pointer events on its own opacity, so a drawer that is still
 * fading in cannot swallow a tap meant for the screen underneath.
 *
 * A drawer containing a text field gets out of the keyboard's way: it sits on
 * top of it rather than behind it, and gives up height instead of pushing its
 * own top off the screen. Drawers with nothing to type into never see an inset,
 * so this costs them nothing.
 *
 * ## Drag to dismiss
 *
 * The grab handle is not decoration — the whole header area drags. Two things
 * make this behave on iOS:
 *
 * - Only **downward** movement is applied. Dragging up would lift the drawer
 *   past its own top edge and expose the screen behind it.
 * - The transform transition is **off while dragging** and back on for the
 *   release, so the panel tracks the finger exactly and then animates to
 *   wherever it is going. Leaving it on makes every move event a 280ms
 *   animation and the drawer lags a full beat behind the finger.
 *
 * Pointer capture keeps the gesture alive when the finger leaves the handle,
 * which it always does on a 640px drawer.
 */
export function Sheet({
  open,
  onClose,
  height = '76%',
  children,
  label,
  /** The drawer's own scrollable body should not also drag the drawer. */
  draggable = true,
}: {
  open: boolean
  onClose: () => void
  /** Design default is ~76% — 640px of an 844px screen. */
  height?: string
  children: ReactNode
  label?: string
  draggable?: boolean
}) {
  // Keep the drawer mounted through its exit transition, otherwise it vanishes
  // instead of sliding away.
  const [present, setPresent] = useState(open)
  const [shown, setShown] = useState(false)
  const [drag, setDrag] = useState(0)
  const gesture = useRef<{ y: number; t: number; last: number; lastT: number } | null>(null)
  const panel = useRef<HTMLDivElement>(null)
  const keyboard = useKeyboardInset()

  useEffect(() => {
    if (open) {
      setDrag(0)
      setPresent(true)
      // Next frame, so the browser has a closed state to animate from.
      const id = requestAnimationFrame(() => setShown(true))
      return () => cancelAnimationFrame(id)
    }
    setShown(false)
    const id = setTimeout(() => setPresent(false), SLIDE_MS)
    return () => clearTimeout(id)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!draggable) return
      e.currentTarget.setPointerCapture(e.pointerId)
      const now = performance.now()
      gesture.current = { y: e.clientY, t: now, last: e.clientY, lastT: now }
    },
    [draggable],
  )

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const g = gesture.current
    if (!g) return
    g.last = e.clientY
    g.lastT = performance.now()
    // Downward only — an upward drag has nowhere to go.
    setDrag(Math.max(0, e.clientY - g.y))
  }, [])

  const onPointerUp = useCallback(() => {
    const g = gesture.current
    if (!g) return
    gesture.current = null

    const travelled = Math.max(0, g.last - g.y)
    const elapsed = Math.max(1, g.lastT - g.t)
    const flicked = travelled / elapsed > FLICK_VELOCITY && travelled > 24
    const far = travelled > (panel.current?.offsetHeight ?? 640) * DISMISS_FRACTION

    if (flicked || far) onClose()
    // Either way the transform goes back to the transitioned path: on dismiss
    // the drawer animates the rest of the way out, otherwise back to rest.
    setDrag(0)
  }, [onClose])

  if (!present) return null

  const dragging = gesture.current !== null

  return (
    <div className="absolute inset-0 z-30">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black"
        style={{
          opacity: shown ? 0.5 : 0,
          pointerEvents: shown ? 'auto' : 'none',
          transition: `opacity ${SCRIM_MS}ms ease-out`,
        }}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="absolute inset-x-0 bottom-0 flex flex-col bg-card shadow-drawer"
        style={{
          bottom: keyboard,
          // min() rather than a plain subtraction: with the keyboard up, the
          // requested height plus the inset can overrun the frame, and the top
          // of the drawer is the part that would go.
          height: `min(${height}, calc(100% - ${keyboard}px))`,
          borderTopLeftRadius: 'var(--radius-drawer)',
          borderTopRightRadius: 'var(--radius-drawer)',
          transform: shown ? `translateY(${drag}px)` : 'translateY(100%)',
          transition: dragging
            ? 'none'
            : `transform ${SLIDE_MS}ms cubic-bezier(.32,.72,0,1)`,
        }}
      >
        {draggable && (
          <div
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            // The gesture belongs to the drawer, not to the page.
            className="flex flex-none touch-none justify-center pt-2.5 pb-1"
          >
            <span
              className="h-1 w-10 rounded-full"
              style={{ background: 'var(--color-ink-dim)', opacity: 0.66 }}
            />
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
