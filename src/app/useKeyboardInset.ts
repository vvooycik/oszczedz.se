import { useEffect, useState } from 'react'

/**
 * How much of the app frame the on-screen keyboard is currently covering, in
 * CSS pixels. Zero when there is no keyboard.
 *
 * `window.innerHeight` deliberately does *not* move when iOS raises the
 * keyboard — that is what keeps the frame from collapsing mid-typing, see
 * `useViewportHeight` — so the keyboard only exists in the **visual** viewport:
 * it is the strip of the layout viewport that the visual one no longer reaches.
 *
 * Small differences are read as zero. A few pixels show up during rubber-band
 * scrolling and around a floating iPad keyboard, and neither should shove a
 * sheet around; a phone keyboard is ~300px, nowhere near the threshold.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0)

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    const measure = () => {
      const covered = window.innerHeight - vv.height - vv.offsetTop
      setInset(covered > 80 ? Math.round(covered) : 0)
    }
    measure()

    vv.addEventListener('resize', measure)
    // The visual viewport also *scrolls* when iOS nudges a focused field clear
    // of the keyboard, which changes the overlap without resizing anything.
    vv.addEventListener('scroll', measure)
    return () => {
      vv.removeEventListener('resize', measure)
      vv.removeEventListener('scroll', measure)
    }
  }, [])

  return inset
}
