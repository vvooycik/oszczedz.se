import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

/**
 * Bottom sheet. Slides up over the current screen with a fading scrim.
 *
 * The scrim gates pointer events on its own opacity, so a sheet that is still
 * fading in cannot swallow a tap meant for the screen underneath.
 */
export function Sheet({
  open,
  onClose,
  height = '62%',
  children,
  label,
}: {
  open: boolean
  onClose: () => void
  /** Design default is ~62% — tall enough for a 4-column category grid. */
  height?: string
  children: ReactNode
  label?: string
}) {
  // Keep the sheet mounted through its exit transition, otherwise it vanishes
  // instead of sliding away.
  const [present, setPresent] = useState(open)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    if (open) {
      setPresent(true)
      // Next frame, so the browser has a closed state to animate from.
      const id = requestAnimationFrame(() => setShown(true))
      return () => cancelAnimationFrame(id)
    }
    setShown(false)
    const id = setTimeout(() => setPresent(false), 300)
    return () => clearTimeout(id)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!present) return null

  return (
    <div className="absolute inset-0 z-30">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black transition-opacity duration-300"
        style={{
          opacity: shown ? 0.45 : 0,
          pointerEvents: shown ? 'auto' : 'none',
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="absolute inset-x-0 bottom-0 flex flex-col bg-bg"
        style={{
          height,
          borderTopLeftRadius: 12,
          borderTopRightRadius: 12,
          borderTop: '1px solid var(--color-line)',
          transform: shown ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 300ms cubic-bezier(.32,.72,0,1)',
        }}
      >
        {children}
      </div>
    </div>
  )
}
