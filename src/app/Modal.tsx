import { useEffect } from 'react'

/**
 * The scrim a wide-layout sub-screen presents on.
 *
 * Everything the sidebar's Data group reaches — categories, tags, schedules,
 * the budget editor, wallet create and edit — is a *form*, not a view, and a
 * form that replaced the whole window would throw away the list it was started
 * from. On a phone those are full-screen routes because there is nowhere else
 * for them to be.
 *
 * `--color-bg` at 40% over black rather than a plain `rgba(0,0,0,.5)`: the
 * ground is already near-black in dark mode, where a neutral scrim would read
 * as a slab, and near-white in light mode, where it would read as ink.
 *
 * **Escape closes it here**, once, for every screen that presents this way —
 * the alternative is the same listener written into six components with six
 * chances to forget it. A screen that needs Escape for something of its own
 * (none does today) would have to call `stopPropagation` on the document.
 */
export function Modal({
  children,
  onClose,
  width = 720,
  fill = false,
  /** The colour field a themed screen carries in with it. */
  style,
}: {
  children: React.ReactNode
  onClose: () => void
  width?: number
  /**
   * Take the full height rather than the content's.
   *
   * A screen presented as a dialog wants it — those carry a header and a
   * scrolling body, and a panel that shrank to fit a short list would have the
   * dialog change size as the list is filtered. A purpose-built dialog like the
   * entry form does not: it is a fixed composition and should be exactly as
   * tall as it is.
   */
  fill?: boolean
  style?: React.CSSProperties
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: 'color-mix(in oklab, var(--color-bg) 40%, #000)' }}
      // A click on the scrim itself, not on anything inside it. The check is
      // `currentTarget` rather than a stopPropagation on the panel, so a drag
      // that starts in a field and ends outside does not close the form.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        // `relative` is load-bearing: a drawer opened from inside a dialog —
        // the entry form's category, date and repeat sheets — is an
        // `absolute inset-0` child, and without a positioned ancestor here it
        // would cover the page rather than the dialog.
        className={`relative flex w-full flex-col overflow-hidden rounded-drawer bg-bg ${
          fill ? 'h-full' : 'max-h-full'
        }`}
        style={{
          maxWidth: width,
          boxShadow: '0 40px 90px rgba(0, 0, 0, 0.55)',
          ...style,
        }}
      >
        {children}
      </div>
    </div>
  )
}
