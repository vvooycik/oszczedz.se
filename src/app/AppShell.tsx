import { Outlet } from 'react-router'
import { TabBar } from './TabBar'
import { useViewportHeight } from './useViewportHeight'

/**
 * The tabbed frame. Fixed height with a single scrolling region, so the tab bar
 * and FAB stay put and only the content moves — a full-page scroll would drag
 * the bar off-screen on iOS.
 *
 * Pinned at the top and given a *measured* height rather than stretched with
 * `bottom: 0`, which iOS standalone resolves against a viewport 62pt shorter
 * than the screen. See `useViewportHeight` for what that viewport actually is —
 * `100svh` is only the pre-measurement fallback.
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
        style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 12px)' }}
      >
        <Outlet />
      </main>
      <TabBar />
    </div>
  )
}

/**
 * Frame for screens that cover the tabs entirely (add, transaction detail).
 * Same fixed-height contract, no tab bar.
 */
export function FullScreen({ children }: { children: React.ReactNode }) {
  const height = useViewportHeight()

  return (
    <div
      className="relative mx-auto flex max-w-lg flex-col overflow-hidden bg-bg"
      style={{
        height: height ?? '100svh',
        paddingTop: 'max(env(safe-area-inset-top, 0px), 12px)',
      }}
    >
      {children}
    </div>
  )
}
