import { useEffect, useState } from 'react'

/**
 * The screen height in CSS pixels, measured rather than expressed as a viewport
 * unit or inferred from `bottom: 0`.
 *
 * iOS standalone gets both of those wrong, in different ways:
 *
 *   - `100dvh` is resolved once at layout and comes back stale on a cold PWA
 *     launch, leaving the frame short until something forces a reflow.
 *   - a `fixed inset-0` box is sized against a viewport that *excludes* the top
 *     safe-area inset while `top: 0` anchors at the true top, so it ends short
 *     of the bottom edge by exactly the height of the Dynamic Island (62pt on a
 *     Pro Max, measured from a home-screen screenshot: the tab bar and the FAB
 *     both floated 62.7pt high, over a strip of body background the same colour
 *     as the app).
 *
 * `window.innerHeight` sidesteps the question — with `viewport-fit=cover` it is
 * the full screen height — and is re-read on every event that can change it.
 * Deliberately not `visualViewport.height`: that shrinks when the keyboard
 * opens, which would collapse the frame mid-typing.
 */
export function useViewportHeight(): number | null {
  // Null until the first measurement, so SSR-less first paint falls back to CSS
  // rather than rendering a zero-height frame.
  const [height, setHeight] = useState<number | null>(null)

  useEffect(() => {
    const measure = () => setHeight(window.innerHeight)
    measure()

    window.addEventListener('resize', measure)
    window.addEventListener('orientationchange', measure)
    // Fires when the PWA comes back from the background, where iOS may have
    // changed the frame without a resize event.
    window.addEventListener('pageshow', measure)
    window.visualViewport?.addEventListener('resize', measure)

    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('orientationchange', measure)
      window.removeEventListener('pageshow', measure)
      window.visualViewport?.removeEventListener('resize', measure)
    }
  }, [])

  return height
}
