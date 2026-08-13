import { useEffect } from 'react'
import { GROUND_HEX } from '@/theme/theme'
import { useTheme } from '@/theme/ThemeProvider'

/**
 * Paints the iOS status bar strip for as long as a screen is mounted.
 *
 * That strip is **outside the web view** — with
 * `apple-mobile-web-app-status-bar-style: default` iOS positions the app below
 * it and paints it itself, so no CSS reaches it. The only handle is
 * `<meta name="theme-color">`, which `applyTheme` normally holds at the ground.
 *
 * A screen whose header is a full-bleed colour field lends it the field's top
 * colour instead, so the tint reads as running to the top of the phone rather
 * than starting under a band of bare ground.
 *
 * The alternative was `black-translucent`, which genuinely does put content
 * under the status bar — and was measured and rejected, because iOS then treats
 * the bar as retractable browser chrome and hands the app a web view 62pt
 * shorter than the screen, stranding the dock above an unpaintable strip at the
 * *bottom*. This trades nothing.
 *
 * On unmount it restores the ground for the current mode rather than whatever
 * it captured on the way in: `applyTheme` writes this same meta whenever the
 * mode or accent changes, so a captured value can be stale by the time a screen
 * closes.
 */
export function useThemeColor(colour: string | null | undefined) {
  const { resolvedMode } = useTheme()

  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]')
    if (!meta || !colour) return

    meta.setAttribute('content', colour)
    return () => meta.setAttribute('content', GROUND_HEX[resolvedMode])
  }, [colour, resolvedMode])
}
