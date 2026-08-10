import { useEffect, useState } from 'react'

/**
 * Height for the app frame, in CSS pixels: the viewport the app can actually
 * paint into.
 *
 * On this iPhone, standalone, measured with the probe on More: the screen is
 * 956pt and `100vh`/`100lvh` agree, but `innerHeight`, `clientHeight`,
 * `visualViewport` and `100svh`/`100dvh` all report 894 — exactly 956 minus the
 * 62pt status bar. iOS counts the translucent status bar as *retractable browser
 * chrome*, so the web view it hands a home-screen app is 894pt tall at screen
 * y 0…894, and the last 62pt of the screen is outside it entirely.
 *
 * Which means the tab bar cannot reach the physical bottom edge in this
 * configuration, and sizing the frame to `screen.height` only pushes it past the
 * fold, where the labels clip and a drag rubber-bands back. `innerHeight` is the
 * honest number in both standalone and a browser; `100svh` is the CSS equivalent
 * for first paint.
 */
export function useViewportHeight(): number | null {
  // Null until measured, so first paint falls back to CSS rather than rendering
  // a zero-height frame.
  const [height, setHeight] = useState<number | null>(null)

  useEffect(() => {
    const measure = () => setHeight(window.innerHeight)
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
