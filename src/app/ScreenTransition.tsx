import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigationType } from 'react-router'

/** The design's one easing and one duration for a screen arriving. */
const DURATION = 240
const EASING = 'cubic-bezier(.32,.72,0,1)'

/**
 * Routes that present *modally*, from the bottom, rather than pushing from the
 * right. Everything that creates something: the entry screen and the two
 * creation forms. A push says "deeper into what you were looking at"; a modal
 * says "a task, and you will come back here".
 */
const MODAL = [/^\/add$/, /^\/tx\/[^/]+\/edit$/, /^\/wallets\/new$/]

const isModal = (pathname: string) => MODAL.some((r) => r.test(pathname))

/**
 * Animates a full-screen route in.
 *
 * Deliberately **entry only**. Animating the exit as well means keeping the old
 * screen mounted while the new one arrives, which for these screens would mean
 * two live subscriptions to the same queries and two `useViewportHeight`
 * listeners fighting over the same measurement. The arrival is what carries the
 * sense of direction; the departure is covered by the screen behind already
 * being there.
 *
 * A **pop** is not animated at all. Going back should feel like the screen was
 * always there — and sliding it in from the right on the way back would say the
 * opposite of what the gesture means.
 *
 * `prefers-reduced-motion` collapses the transform to nothing; index.css
 * already flattens the duration, and starting from a transform that never
 * animates would leave the screen offset.
 */
export function ScreenTransition({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()
  const navigationType = useNavigationType()
  const [entered, setEntered] = useState(false)

  const reduced = useRef(
    typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  // POP is the back button and the swipe-back gesture.
  const animate = navigationType !== 'POP' && !reduced.current
  const modal = isModal(pathname)

  useEffect(() => {
    if (!animate) return setEntered(true)
    setEntered(false)
    // Next frame, so the browser has an un-entered state to animate from.
    const id = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(id)
  }, [pathname, animate])

  const offset = modal ? 'translateY(100%)' : 'translateX(100%)'

  return (
    <div
      style={{
        transform: entered ? 'none' : offset,
        opacity: entered ? 1 : modal ? 1 : 0.6,
        transition: animate
          ? `transform ${DURATION}ms ${EASING}, opacity ${DURATION}ms ${EASING}`
          : undefined,
        // Contains the off-screen start so it cannot widen the page while it
        // is still outside the viewport.
        overflow: 'hidden',
      }}
    >
      {children}
    </div>
  )
}
