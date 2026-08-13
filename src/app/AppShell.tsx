import { Outlet } from 'react-router'
import { DOCK_SPACER, TabBar } from './TabBar'
import { useViewportHeight } from './useViewportHeight'

/**
 * The tabbed frame. Fixed height with a single scrolling region, so the dock
 * and the add button stay put and only the content moves — a full-page scroll
 * would drag them off-screen on iOS.
 *
 * Pinned at the top and given a *measured* height rather than stretched with
 * `bottom: 0`, which iOS standalone resolves against a viewport 62pt shorter
 * than the screen. See `useViewportHeight` for what that viewport actually is —
 * `100svh` is only the pre-measurement fallback.
 *
 * The dock is a sibling of `<main>`, absolutely positioned against this fixed
 * root, and `<main>` reserves its height as padding. That is the arrangement
 * that lets the dock float clear of the bottom edge while still guaranteeing
 * the last feed row can be scrolled out from under it — one number, declared
 * once, rather than a `pb-40` remembered on every screen.
 */
export function AppShell() {
  const height = useViewportHeight()

  return (
    <div
      className="fixed inset-x-0 top-0 mx-auto flex max-w-lg flex-col overflow-hidden bg-bg"
      style={{ height: height ?? '100svh' }}
    >
      <main
        className="no-scrollbar flex-1 overflow-y-auto"
        style={{
          paddingTop: 'max(env(safe-area-inset-top, 0px), 12px)',
          paddingBottom: DOCK_SPACER,
        }}
      >
        <Outlet />
      </main>
      <TabBar />
    </div>
  )
}

/**
 * Frame for screens that cover the tabs entirely (add, transaction detail).
 * Same fixed-height contract, no dock.
 *
 * `relative` is load-bearing: it is what a drawer's `absolute inset-0` scrim
 * covers, so a sheet opened from one of these screens fills exactly the frame
 * and not the page.
 *
 * **`overlay` is for a screen presented *over* another one** — the category
 * editor above the categories list, the per-wallet category picker above the
 * wallet. Those are rendered as children of the screen they cover rather than
 * as routes of their own, and without this they lay out in normal flow: pushed
 * below the parent's header and clipped by its height, which is exactly what
 * they looked like. An overlay takes its size from the parent instead of
 * re-measuring the viewport, since the parent has already done that.
 */
export function FullScreen({
  children,
  style,
  overlay = false,
}: {
  children: React.ReactNode
  style?: React.CSSProperties
  overlay?: boolean
}) {
  const height = useViewportHeight()

  return (
    <div
      className={`mx-auto flex max-w-lg flex-col overflow-hidden bg-bg ${
        overlay ? 'absolute inset-0 z-40' : 'relative'
      }`}
      style={{
        height: overlay ? undefined : (height ?? '100svh'),
        paddingTop: 'max(env(safe-area-inset-top, 0px), 12px)',
        ...style,
      }}
    >
      {children}
    </div>
  )
}
