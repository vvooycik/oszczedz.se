import type { CSSProperties } from 'react'
import { categoryLightness, categoryVar } from '@/theme/tokens'

/**
 * A wash of the subject's own colour behind a whole screen, strongest at the
 * bottom and gone by the top.
 *
 * Three screens carry one: the entry screen in the chosen category's hue, and
 * the transaction and wallet detail screens in theirs. It is what gives them an
 * identity without painting a card in a colour — the tint sits behind
 * everything, so the content still reads on the surface it always did.
 *
 * **It rises from the bottom, not down from the top.** A top-anchored version
 * put the strongest tint in the header, which meant it ended in a hard line
 * against the strip iOS paints above the web view — a band the app cannot reach
 * with CSS at all, since with `apple-mobile-web-app-status-bar-style: default`
 * the status bar sits outside it. Lighting the screen from below sidesteps that
 * entirely: the top is plain ground, so there is nothing for the band to fail
 * to match.
 *
 * ## The clamp
 *
 * The mix percentage cannot be a constant. The ten slots span ~66% to ~74%
 * lightness in dark mode, and at the same mix the pale ones — olive at hue 97,
 * teal at 165, sky at 195 — wash the screen out until the keypad loses contrast
 * against it. The handoff is explicit that the fix must be derived from
 * lightness rather than kept as a per-category list, so that a slot added later
 * is handled without anyone remembering this paragraph.
 *
 * So: scale the strongest stop by how much lighter the slot is than the
 * reference, and clamp. A slot at the reference lightness gets the full mix; a
 * paler one gets proportionally less; nothing goes below the floor, or the wash
 * stops being visible at all.
 */
const REFERENCE_L = 0.68
const FLOOR = 0.62

/** Mix percentages for the two stops, before the clamp. */
const STOPS = {
  dark: { near: 42, far: 16 },
  // Half strength: the same tint over a near-white ground reads much stronger,
  // and light mode has no headroom to lose.
  light: { near: 26, far: 8 },
} as const

export function colourFieldStyle(
  colour: string | null | undefined,
  mode: 'light' | 'dark',
): CSSProperties {
  const hue = categoryVar(colour)
  const { near, far } = STOPS[mode]
  const scale = Math.max(FLOOR, Math.min(1, REFERENCE_L / categoryLightness(colour)))

  return {
    // `0deg` runs bottom to top, so the first stop is the one at the foot of
    // the screen. Ground by 72% of the way up, leaving the header on it.
    background: `linear-gradient(0deg,
      color-mix(in oklab, ${hue} ${(near * scale).toFixed(1)}%, var(--color-bg)) 0%,
      color-mix(in oklab, ${hue} ${(far * scale).toFixed(1)}%, var(--color-bg)) 42%,
      var(--color-bg) 72%)`,
  }
}
