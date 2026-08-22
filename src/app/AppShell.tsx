import { Outlet } from 'react-router'
import { DOCK_SPACER, TabBar } from './TabBar'
import { useInModal } from './ModalScreen'
import { IconRail, Sidebar } from './Sidebar'
import { isWide, useLayoutMode } from './layout'
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
 *
 * ## The second arrangement
 *
 * At 1024px and up the dock unfolds into a sidebar and the frame stops being a
 * frame: the content fills the window, and each screen lays out its own master
 * and detail inside it. Two things are deliberately different there.
 *
 * **The height is `100dvh`, not a measurement.** `useViewportHeight` exists to
 * fight one specific iOS standalone bug and is inert everywhere else; a desktop
 * window resizes continuously, where a measured pixel height is a render behind
 * the window the whole way through a drag. The hook is not deleted and not
 * called here — the mobile branch still needs it, and that is the only place it
 * was ever right.
 *
 * **`<main>` reserves nothing at the foot.** There is no floating dock to clear
 * once the navigation has its own column.
 */
export function AppShell() {
  const mode = useLayoutMode()
  const height = useViewportHeight()

  if (isWide(mode)) {
    return (
      <div className="flex h-dvh overflow-hidden bg-bg">
        {mode === 'desktop' ? <Sidebar /> : <IconRail />}
        {/* `min-w-0` so a wide master column can shrink rather than pushing
            the pane off the right edge. */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <Outlet />
        </div>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-x-0 top-0 mx-auto flex max-w-frame flex-col overflow-hidden bg-bg md:max-w-wide"
      style={{ height: height ?? '100svh' }}
    >
      <main
        className="no-scrollbar flex-1 overflow-y-auto"
        style={{ paddingTop: 'var(--safe-top)', paddingBottom: DOCK_SPACER }}
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
 *
 * **`pane` is the same idea one step further**, and is what master-detail is
 * built out of: the screen is a child of a grid cell, so it fills its box, caps
 * at nothing, and re-measures nothing. It keeps its colour field — that is most
 * of what makes a detail screen recognisable — and takes a radius only where
 * the pane is an object on the page rather than the page's right half.
 *
 * **Inside a modal it behaves the same way, and asks nobody.** `useInModal` is
 * read here rather than passed as a prop because this is the one component
 * every dialog-presented screen already goes through — which is why Categories,
 * Tags, Scheduled, the budget editor and both wallet forms became dialogs on a
 * desktop without a line changing in any of them.
 */
export function FullScreen({
  children,
  style,
  overlay = false,
  pane = false,
  rounded = false,
}: {
  children: React.ReactNode
  style?: React.CSSProperties
  overlay?: boolean
  /** Fill the parent box instead of the viewport — a detail pane. */
  pane?: boolean
  /** Draw the pane as a card rather than edge-to-edge. Desktop only. */
  rounded?: boolean
}) {
  const height = useViewportHeight()
  const inModal = useInModal()

  if (pane) {
    return (
      <div
        className={`relative flex h-full min-w-0 flex-col overflow-hidden ${
          rounded ? 'rounded-card shadow-card' : ''
        }`}
        style={style}
      >
        {children}
      </div>
    )
  }

  // The dialog owns the box: it is already `h-full` inside a scrim with its own
  // padding, so re-measuring the viewport here would size the screen to the
  // window and push its foot out through the modal's rounded bottom edge.
  if (inModal) {
    return (
      <div
        className="relative flex h-full flex-col overflow-hidden bg-bg"
        style={style}
      >
        {children}
      </div>
    )
  }

  return (
    <div
      className={`mx-auto flex max-w-frame flex-col overflow-hidden bg-bg md:max-w-wide ${
        overlay ? 'absolute inset-0 z-40' : 'relative'
      }`}
      style={{
        height: overlay ? undefined : (height ?? '100svh'),
        paddingTop: 'var(--safe-top)',
        ...style,
      }}
    >
      {children}
    </div>
  )
}
