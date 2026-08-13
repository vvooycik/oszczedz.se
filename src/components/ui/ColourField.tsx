import { useMemo } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useTheme } from '@/theme/ThemeProvider'
import { categoryLightness, categoryVar, resolveColour } from '@/theme/tokens'

/**
 * A full-bleed vertical gradient in the subject's own colour, fading into the
 * ground. Three screens carry one: the entry screen (whole screen, the chosen
 * category's hue), transaction detail and wallet detail (header block only).
 *
 * It is what gives those screens an identity without painting a card in a
 * colour — the tint is behind everything, so the content still sits on the
 * ground it always sat on.
 *
 * ## The clamp
 *
 * The mix percentage cannot be a constant. The ten slots span ~66% to ~74%
 * lightness in dark mode, and at the same 42% mix the pale ones — olive at hue
 * 97, teal at 165, sky at 195 — wash the top of the screen out until the keypad
 * loses contrast against it. The handoff is explicit that the fix must be
 * derived from lightness rather than kept as a per-category list, so that a
 * slot added later is handled without anyone remembering this paragraph.
 *
 * So: scale the top stop by how much lighter the slot is than the reference,
 * and clamp. A slot at the reference lightness gets the full mix; a paler one
 * gets proportionally less; nothing goes below the floor, or the field stops
 * being visible at all.
 */
const REFERENCE_L = 0.68
const FLOOR = 0.62

/** Mix percentages for the two stops, before the clamp. */
const STOPS = {
  dark: { top: 42, mid: 16 },
  // Half strength: the same tint over a near-white ground reads much stronger,
  // and light mode has no headroom to lose.
  light: { top: 26, mid: 8 },
} as const

/** The two stop colours, as CSS the browser still has to evaluate. */
function stops(colour: string | null | undefined, mode: 'light' | 'dark') {
  const hue = categoryVar(colour)
  const { top, mid } = STOPS[mode]
  const scale = Math.max(FLOOR, Math.min(1, REFERENCE_L / categoryLightness(colour)))
  return {
    top: `color-mix(in oklab, ${hue} ${(top * scale).toFixed(1)}%, var(--color-bg))`,
    mid: `color-mix(in oklab, ${hue} ${(mid * scale).toFixed(1)}%, var(--color-bg))`,
  }
}

export function colourFieldStyle(
  colour: string | null | undefined,
  mode: 'light' | 'dark',
): CSSProperties {
  const { top, mid } = stops(colour, mode)
  return {
    background: `linear-gradient(180deg, ${top} 0%, ${mid} 42%, var(--color-bg) 72%)`,
  }
}

/**
 * The field's topmost colour, resolved to something a `<meta>` tag can hold.
 *
 * iOS paints the status bar strip itself — that strip is outside the web view,
 * so no amount of CSS reaches it — and it takes the colour from
 * `<meta name="theme-color">`. Handing it the field's top stop is what makes a
 * tinted header look like it runs to the top of the phone rather than starting
 * under a band of bare ground.
 *
 * Resolved rather than passed through: a meta tag evaluates neither `var()` nor
 * `color-mix()`, so this has to be an actual colour by the time it lands.
 */
export function colourFieldTop(
  colour: string | null | undefined,
  mode: 'light' | 'dark',
): string {
  return resolveColour(stops(colour, mode).top)
}

export function ColourField({
  colour,
  children,
  className = '',
  style,
}: {
  colour: string | null | undefined
  children: ReactNode
  className?: string
  style?: CSSProperties
}) {
  const { resolvedMode } = useTheme()

  // Recomputed when the mode flips, because `categoryLightness` reads the
  // resolved token and the palette inverts between modes.
  const field = useMemo(
    () => colourFieldStyle(colour, resolvedMode),
    [colour, resolvedMode],
  )

  return (
    <div className={className} style={{ ...field, ...style }}>
      {children}
    </div>
  )
}
