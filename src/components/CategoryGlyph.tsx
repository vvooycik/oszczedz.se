import { iconFor } from '@/lib/icons'
import { categoryVar } from '@/theme/tokens'
import { glyphSize, Tile } from './ui/Tile'

/**
 * The category mark used in feed rows, the picker, and every detail header.
 *
 * A tinted tile rather than the filled disc it used to be — see `Tile` for what
 * that change costs and buys. What survives unchanged from the old mark is the
 * part that carries meaning:
 *
 * **A dashed outline is the feed's mark for "not a purchase."** Transfers wear
 * it and so do balance adjustments: both are real movement that nobody chose to
 * spend, and reading them as quietly as each other is the point. They stay
 * apart by their icon — an arrow against the adjustment's own glyph — rather
 * than by one of them being filled. The handoff asks for exactly this and calls
 * it out as deliberate, so it is one of the few things the refresh leaves alone.
 *
 * The two axes stay separate on purpose. `dashed` is the outline, `neutral` is
 * the ink, and both default to following `transfer` so single-flag calls are
 * unchanged. The categories settings screen takes `dashed` alone: there the
 * glyph and colour are the thing being edited, and neutralising them would
 * leave the picker with nothing to show and every transfer row identical.
 *
 * A dash only reads against empty space, so anything dashed stays unfilled.
 */
export function CategoryGlyph({
  glyph,
  color,
  size = 40,
  transfer = false,
  dashed = transfer,
  neutral = transfer,
  selected = false,
  onField = false,
}: {
  glyph: string | null | undefined
  color: string | null | undefined
  size?: number
  transfer?: boolean
  dashed?: boolean
  /** Ink-dim tile and muted glyph instead of the category's colour. */
  neutral?: boolean
  /** The picker's chosen tile: solid fill, white glyph, double ring. */
  selected?: boolean
  /** On a colour field, where a tint of the hue would vanish into the ground. */
  onField?: boolean
}) {
  const Icon = iconFor(transfer ? 'arrow-left-right' : glyph)
  const tint = neutral ? undefined : categoryVar(color)

  const variant = dashed
    ? 'dashed'
    : selected || onField
      ? 'solid'
      : neutral
        ? 'neutral'
        : 'tint'

  return (
    <Tile color={tint} size={size} variant={variant} ring={selected}>
      <Icon size={glyphSize(size)} stroke={2} />
    </Tile>
  )
}
