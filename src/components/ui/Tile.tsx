import type { ReactNode } from 'react'

/**
 * The rounded square a glyph sits in — the mark that identifies a category, a
 * wallet, or a settings group across the whole app.
 *
 * It replaces the filled disc. The colour moves from the fill to the glyph,
 * over a tint of itself: the same ten hues and the same recognition, but far
 * less weight per row, which is what lets a feed of forty rows read as a list
 * rather than as a column of dots.
 *
 * That change quietly retires a constraint. The disc knocked its glyph out in
 * `--color-bg`, so the *contrast* was the glyph and every slot had to clear
 * 4.5:1 against the ground — which is what capped the palette at ten. Here the
 * glyph is drawn in the colour over a tint of the same colour, so legibility
 * comes from the tint percentage instead, and that percentage is a token
 * (`--tile-mix`) precisely because 34% on the dark ground goes muddy on white.
 *
 * Radius tracks size rather than being passed: these are the handoff's five
 * sizes and their radii, and a tile at an in-between size should look like the
 * nearest one rather than invent a corner.
 */
const radiusFor = (size: number): number =>
  size >= 60 ? 22 : size >= 52 ? 18 : size >= 40 ? 14 : 13

export function Tile({
  color,
  size = 40,
  children,
  variant = 'tint',
  ring = false,
  className = '',
}: {
  /** Any CSS colour — usually `categoryVar(...)`. */
  color?: string
  size?: number
  children: ReactNode
  /**
   * `tint` is the default mark. `solid` fills with the colour and knocks the
   * glyph out in white — the picker's selected tile and the entry screen's
   * hero. `dashed` has no fill at all. `neutral` is the ink-dim tile the
   * settings groups use, where there is no subject colour to show.
   */
  variant?: 'tint' | 'solid' | 'dashed' | 'neutral'
  /** The picker's double ring: a card-coloured gap, then the accent. */
  ring?: boolean
  className?: string
}) {
  const hue = color ?? 'var(--color-ink)'

  const skin: React.CSSProperties =
    variant === 'solid'
      ? // Not white. In light mode the slots sit near 50% lightness and white
        // is fine; in dark they are near 70%, where white lands around 2.2:1.
        // `--color-accent-fg` is the token picked for exactly this pairing —
        // `Button` already takes it when it is handed a category `tone`, on the
        // grounds that a category colour and the accent share a foreground —
        // and it gives about 6.4:1 on the same tile.
        { background: hue, color: 'var(--color-accent-fg)' }
      : variant === 'dashed'
        ? {
            // box-sizing keeps a dashed tile the same footprint as a filled
            // one, so the two sit level in a list.
            border: '1.5px dashed var(--color-dash)',
            boxSizing: 'border-box',
            color: 'var(--color-ink-muted)',
          }
        : variant === 'neutral'
          ? { background: 'var(--color-tile)', color: 'var(--color-ink-muted)' }
          : {
              background: `color-mix(in oklab, ${hue} var(--tile-mix), transparent)`,
              color: hue,
            }

  return (
    <span
      className={`flex flex-none items-center justify-center ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: radiusFor(size),
        ...skin,
        ...(ring
          ? {
              boxShadow: '0 0 0 2px var(--color-card), 0 0 0 4px var(--color-accent)',
            }
          : null),
      }}
    >
      {children}
    </span>
  )
}

/** The glyph size a tile of a given size wants, per the handoff's five sizes. */
export const glyphSize = (size: number): number =>
  size >= 68 ? 34 : size >= 60 ? 28 : size >= 52 ? 24 : size >= 40 ? 20 : 18
