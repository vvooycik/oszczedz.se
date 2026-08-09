import { Outlet } from 'react-router'
import { TabBar } from './TabBar'

/**
 * The tabbed frame. Fixed height with a single scrolling region, so the tab bar
 * and FAB stay put and only the content moves — a full-page scroll would drag
 * the bar off-screen on iOS.
 *
 * Pinned with `fixed inset-0` rather than sized with `h-dvh`: on iOS the dynamic
 * viewport unit is resolved once at layout and is stale when the standalone PWA
 * launches, which left the tab bar floating short of the bottom edge until
 * something forced a reflow. Insets are resolved against the live viewport, so
 * the bar sits on the edge from the first paint.
 */
export function AppShell() {
  return (
    <div className="fixed inset-0 mx-auto flex max-w-lg flex-col overflow-hidden bg-bg">
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
  return (
    <div
      className="relative mx-auto flex h-dvh max-w-lg flex-col overflow-hidden bg-bg"
      style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 12px)' }}
    >
      {children}
    </div>
  )
}
