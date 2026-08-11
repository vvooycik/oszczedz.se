import { iconFor } from '@/lib/icons'
import { categoryVar } from '@/theme/tokens'

/**
 * The circular category mark used in feed rows, the picker grid and the detail
 * header: a filled disc in the category's colour with the icon knocked out of
 * it.
 *
 * Filled rather than outlined because six hues at a 2px ring is not enough
 * colour to tell apart at a glance — the disc gives each category roughly ten
 * times the area, which is what makes the palette readable in a list.
 *
 * The knockout is `--color-bg`, not white. The palette inverts between modes —
 * the slots sit at ~50% lightness on the light ground and ~70% on the dark one —
 * so a fixed white would read correctly in light mode and vanish into the fill
 * in dark. The ground colour is near-white in light mode and near-black in dark,
 * which keeps the same contrast either way.
 *
 * `transfer` swaps to a dashed neutral ring — a transfer *transaction* is
 * movement, not spending, and shouldn't wear a category's colour.
 *
 * **A dashed outline is the feed's mark for "not a purchase."** Transfers wear
 * it, and so do balance adjustments: both are real movement that no one chose to
 * spend, and reading them as quietly as each other is the point. They stay
 * apart by their icon — an arrow against the adjustment's own glyph — rather
 * than by one being solid.
 *
 * The two axes are separate on purpose. `dashed` is the ring, `neutral` is the
 * ink, and both default to following `transfer` so the old single-flag calls are
 * unchanged. The settings screen takes `dashed` alone for transfer
 * *categories*: there the glyph and colour are the thing being edited, so
 * neutralising them would leave the picker with nothing to show and every
 * transfer row looking identical. An adjustment takes both — its colour is an
 * accident of how the category got created, not a choice worth showing.
 *
 * A dash only reads against empty space, so anything dashed stays outlined.
 */
export function CategoryGlyph({
  glyph,
  color,
  size = 34,
  transfer = false,
  dashed = transfer,
  neutral = transfer,
  ringWidth = 2.25,
}: {
  glyph: string | null | undefined
  color: string | null | undefined
  size?: number
  transfer?: boolean
  dashed?: boolean
  /** Ink-dim ring and muted glyph instead of the category's colour. */
  neutral?: boolean
  ringWidth?: number
}) {
  const Icon = iconFor(transfer ? 'arrow-left-right' : glyph)
  const tint = neutral ? 'var(--color-ink-dim)' : categoryVar(color)
  const filled = !dashed

  return (
    <span
      className="flex flex-none items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        background: filled ? tint : undefined,
        // Only the outlined variants draw a ring. Both boxes are border-box, so
        // the mark occupies `size` either way and the two sit level in a list.
        border: filled ? undefined : `${ringWidth}px dashed ${tint}`,
        color: filled
          ? 'var(--color-bg)'
          : neutral
            ? 'var(--color-ink-muted)'
            : tint,
      }}
    >
      <Icon size={Math.round(size * 0.5)} strokeWidth={2.5} />
    </span>
  )
}
