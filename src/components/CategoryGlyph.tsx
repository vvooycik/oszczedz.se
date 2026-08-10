import { iconFor } from '@/lib/icons'
import { categoryVar } from '@/theme/tokens'

/**
 * The circular category mark used in feed rows, the picker grid and the detail
 * header: a 1px ring and the icon, both in the category's colour.
 *
 * `transfer` swaps to a dashed neutral ring — a transfer *transaction* is
 * movement, not spending, and shouldn't wear a category's colour.
 *
 * `dashed` is that ring on its own, and defaults to following `transfer`. The
 * settings screen wants it for transfer *categories*: there the glyph and colour
 * are the thing being edited, so replacing them with a neutral arrow would leave
 * the picker with nothing to show and every transfer row looking identical.
 */
export function CategoryGlyph({
  glyph,
  color,
  size = 34,
  transfer = false,
  dashed = transfer,
  ringWidth = 2.5,
}: {
  glyph: string | null | undefined
  color: string | null | undefined
  size?: number
  transfer?: boolean
  dashed?: boolean
  ringWidth?: number
}) {
  const Icon = iconFor(transfer ? 'arrow-left-right' : glyph)
  const stroke = transfer ? 'var(--color-ink-dim)' : categoryVar(color)

  return (
    <span
      className="flex flex-none items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        border: `${ringWidth}px ${dashed ? 'dashed' : 'solid'} ${stroke}`,
        color: transfer ? 'var(--color-ink-muted)' : stroke,
      }}
    >
      <Icon size={Math.round(size * 0.5)} strokeWidth={2} />
    </span>
  )
}
