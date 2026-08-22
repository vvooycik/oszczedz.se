import { useEffect, useState } from 'react'

/**
 * The four arrangements the app has, and the widths that pick them.
 *
 * Named rather than numbered because two of the four boundaries are not about
 * width at all — they are about what the layout can *say*. 1024 is the real
 * line: below it a detail pane cannot hold 440px without squeezing the list
 * under the 512 a transaction row wants, so master-detail simply does not fit
 * and the sub-screens stay full-screen. 1280 is where a labelled sidebar earns
 * its 264px over a 76px rail.
 *
 *  - `mobile`  <768   ships today: 32rem frame, floating dock, full-screen subs
 *  - `tablet`  768…1023 the dock stays, gutters go to 32, the rail is four cards
 *  - `rail`    1024…1279 76px icon rail, 512px master, pane takes the rest
 *  - `desktop` ≥1280  264px labelled sidebar, fluid master, 440px pane
 *
 * These match Tailwind's own `md` / `lg` / `xl`, deliberately: everything that
 * can be a media query stays one, and this hook exists only for the changes CSS
 * cannot make — a dock that becomes a sidebar, a route that becomes a pane.
 */
export type LayoutMode = 'mobile' | 'tablet' | 'rail' | 'desktop'

/** Sidebar, at `desktop`. */
export const SIDEBAR_W = 264
/** Icon rail, at `rail`. */
export const RAIL_W = 76
/** The transaction pane on the home screen. */
export const PANE_W = 440
/** The wallets master column, which is a list of rows rather than of cards. */
export const WALLETS_MASTER_W = 428
/** The feed column at `rail` — the same 512 `--container-frame` names. */
export const FEED_COLUMN_W = 512

const QUERIES: [LayoutMode, string][] = [
  ['desktop', '(min-width: 1280px)'],
  ['rail', '(min-width: 1024px)'],
  ['tablet', '(min-width: 768px)'],
]

function read(): LayoutMode {
  // SSR-safe by accident rather than by need: there is no server, but a
  // media query read at module scope would also run before jsdom exists.
  if (typeof window === 'undefined') return 'mobile'
  for (const [mode, query] of QUERIES) {
    if (window.matchMedia(query).matches) return mode
  }
  return 'mobile'
}

/**
 * Which arrangement the window is in, live.
 *
 * One listener per breakpoint rather than a resize handler: `matchMedia` fires
 * only when a boundary is actually crossed, so dragging a window edge across a
 * thousand pixels re-renders the app once instead of a thousand times.
 */
export function useLayoutMode(): LayoutMode {
  const [mode, setMode] = useState(read)

  useEffect(() => {
    const update = () => setMode(read())
    const lists = QUERIES.map(([, query]) => window.matchMedia(query))
    for (const list of lists) list.addEventListener('change', update)
    // The first paint may have measured before fonts and scrollbars settled.
    update()
    return () => {
      for (const list of lists) list.removeEventListener('change', update)
    }
  }, [])

  return mode
}

/**
 * Whether this width shows a sidebar and a detail pane.
 *
 * The single question almost every caller actually has — `rail` and `desktop`
 * differ in how much room they have, never in what they are.
 */
export const isWide = (mode: LayoutMode) => mode === 'rail' || mode === 'desktop'
