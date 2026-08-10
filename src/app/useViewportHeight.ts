import { useEffect, useState } from 'react'

/** True when running as a home-screen app rather than in browser chrome. */
const isStandalone = (): boolean =>
  window.matchMedia('(display-mode: standalone)').matches ||
  // iOS predates the media query and still sets this on home-screen apps.
  (navigator as Navigator & { standalone?: boolean }).standalone === true

/**
 * Height for the app frame, in CSS pixels.
 *
 * iOS standalone describes its viewport as though Safari's toolbars were still
 * on screen: `window.innerHeight`, `100dvh` and a `fixed inset-0` box all come
 * back about 62pt short on a Pro Max, so the tab bar floats over a strip of
 * background exactly where the browser UI would be. Measured off two home-screen
 * screenshots; the same build in Safari fits perfectly, because there the
 * reserved space is real.
 *
 * So don't ask about the viewport. A standalone window *is* the screen — that is
 * what standalone means, and with `viewport-fit=cover` the web view spans the
 * insets too (which is why `env(safe-area-inset-bottom)` still has to pad the
 * home indicator). `screen.height` is therefore the frame, and the manifest locks
 * the app to portrait so it cannot rotate out from under that.
 *
 * In a real browser the toolbar is genuinely there, so `innerHeight` is right and
 * the screen height would run the tab bar underneath it.
 */
export function useViewportHeight(): number | null {
  // Null until measured, so first paint falls back to CSS rather than rendering
  // a zero-height frame.
  const [height, setHeight] = useState<number | null>(null)

  useEffect(() => {
    const measure = () =>
      setHeight(isStandalone() ? window.screen.height : window.innerHeight)
    measure()

    window.addEventListener('resize', measure)
    window.addEventListener('orientationchange', measure)
    // Fires when the PWA returns from the background, where iOS may have changed
    // the frame without a resize event.
    window.addEventListener('pageshow', measure)
    // Deliberately not sized from visualViewport: it shrinks when the keyboard
    // opens, which would collapse the frame mid-typing. Only used as a signal
    // that something changed.
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
