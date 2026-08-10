import { Outlet } from 'react-router'
import { TabBar } from './TabBar'
import { useViewportHeight } from './useViewportHeight'

/**
 * The tabbed frame. Fixed height with a single scrolling region, so the tab bar
 * and FAB stay put and only the content moves — a full-page scroll would drag
 * the bar off-screen on iOS.
 *
 * Pinned at the top and given a *measured* height rather than stretched with
 * `bottom: 0`: in a standalone PWA iOS resolves a fixed box's bottom against a
 * viewport that excludes the top safe-area inset, so the frame ended 62pt short
 * of the screen and the tab bar floated over a strip of body background. See
 * `useViewportHeight` — `100vh` is only the pre-measurement fallback.
 */
export function AppShell() {
  const height = useViewportHeight()

  return (
    <div
      className="fixed inset-x-0 top-0 mx-auto flex max-w-lg flex-col overflow-hidden bg-bg"
      style={{ height: height ?? '100vh' }}
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
        height: height ?? '100vh',
        paddingTop: 'max(env(safe-area-inset-top, 0px), 12px)',
      }}
    >
      {children}
    </div>
  )
}
