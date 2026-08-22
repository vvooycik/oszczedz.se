import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import { PANE_W, type LayoutMode } from './layout'

/**
 * The pane's one animation: a 120ms cross-fade of its *contents*, with the
 * geometry left completely still.
 *
 * `ScreenTransition`'s push-from-the-right is wrong here and would be wrong at
 * any duration — nothing is being covered. A pane that slides says a new screen
 * arrived over the old one; what actually happened is that the same box now
 * shows a different row.
 *
 * Keyed on the pathname, so stepping from one transaction to the next fades,
 * and a refetch of the row already shown does not.
 */
function CrossFade({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()
  const [shown, setShown] = useState(false)
  const last = useRef(pathname)

  useEffect(() => {
    if (last.current === pathname && shown) return
    last.current = pathname
    setShown(false)
    const id = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(id)
    // `shown` is deliberately out of the dep list: including it would re-run
    // the effect on the very state change it makes and restart the fade.
    // oxlint-disable-next-line exhaustive-deps
  }, [pathname])

  return (
    <div
      className="h-full min-h-0"
      style={{ opacity: shown ? 1 : 0, transition: 'opacity 120ms linear' }}
    >
      {children}
    </div>
  )
}

/**
 * A list on the left and whatever it has open on the right.
 *
 * **Selection is a URL, never state.** `/tx/:id` already exists and already
 * means "this row is open"; on a wide window it renders here instead of over
 * the tabs, and the row highlight is a comparison against the route param. That
 * keeps deep links, the back button and every `useGoBack` fallback working
 * unchanged — and it is why no screen in this app gained a `selected` state.
 *
 * **Nothing is auto-selected.** A feed is a list you read; opening a
 * transaction nobody asked for would put a colour field on the screen to answer
 * a question nobody had.
 */
export function MasterDetail({
  mode,
  master,
  detail,
  /** The master column's width. Fixed at `rail`, fluid at `desktop`. */
  masterWidth,
  /** The pane's width at `desktop`; at `rail` it always takes the remainder. */
  paneWidth = PANE_W,
  /** What the empty pane says. */
  empty,
  gap,
  bordered,
  className = '',
}: {
  mode: LayoutMode
  master: React.ReactNode
  detail: React.ReactNode | null
  masterWidth?: number
  paneWidth?: number
  empty: string
  /** Air between the columns. Defaults to 20 where the pane is a card, 0 where it is the page's other half. */
  gap?: number
  /** A rule between the columns, for the arrangements that have no gap. */
  bordered?: boolean
  /** The grid's own padding, which differs by layout: 28px at desktop, none at rail. */
  className?: string
}) {
  /**
   * At `rail` the two halves *are* the page's two halves, so they meet on a
   * 1px rule; at `desktop` the pane is an object sitting on the ground, so
   * they are separated by air instead. The wallets screen overrides both,
   * because its pane is edge-to-edge at every width — it is a whole wallet,
   * washed in that wallet's colour, and a rounded card would make it a picture
   * of one.
   */
  const railed = mode === 'rail'
  const rule = bordered ?? railed
  const air = gap ?? (railed ? 0 : 20)

  return (
    <div
      className={`grid min-h-0 flex-1 ${className}`}
      style={{
        gridTemplateColumns: masterWidth
          ? `${masterWidth}px minmax(0, 1fr)`
          : `minmax(0, 1fr) ${paneWidth}px`,
        gap: air,
      }}
    >
      <div
        className={`flex min-h-0 min-w-0 flex-col ${
          rule ? 'border-r border-divider' : ''
        }`}
      >
        {master}
      </div>

      <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
        {detail ? (
          <CrossFade>{detail}</CrossFade>
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-value text-ink-muted">
            {empty}
          </div>
        )}
      </div>
    </div>
  )
}
