import { lazy, Suspense } from 'react'

/**
 * The design-system reference, at `/dev/design-system`, wrapped ready to be a
 * route element.
 *
 * **Lazy, and that is load-bearing.** The page imports every component in the
 * system so it can show them, which is exactly the import graph the initial
 * chunk must not grow — the app ships ~208 kB gzipped and the figure is tracked
 * commit by commit. Behind a `lazy()` it costs nothing until it is asked for.
 *
 * It lives in its own module because **three** route trees now declare this
 * address: the signed-out router, the phone's, and the desktop's. Three
 * `lazy()` calls would share a chunk but not a component identity, and the
 * point of the page is to be readable on a desktop browser that has never
 * signed in — which is exactly where a desktop layout gets designed.
 *
 * Still deliberately unreachable from the UI: no tab, no link, no row in More.
 */
const DesignSystemScreen = lazy(() => import('./DesignSystemScreen'))

export function DesignSystemRoute() {
  return (
    <Suspense fallback={null}>
      <DesignSystemScreen />
    </Suspense>
  )
}
