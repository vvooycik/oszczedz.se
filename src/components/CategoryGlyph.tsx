import { iconFor } from '@/lib/icons'
import { categoryVar } from '@/theme/tokens'

/**
 * The circular category mark used in feed rows, the picker grid and the detail
 * header: a 1px ring and the icon, both in the category's colour.
 *
 * `transfer` swaps to a dashed neutral ring — transfers are movement, not
 * spending, and shouldn't wear a category's colour.
 */
export function CategoryGlyph({
  glyph,
  color,
  size = 34,
  transfer = false,
}: {
  glyph: string | null | undefined
  color: string | null | undefined
  size?: number
  transfer?: boolean
}) {
  const Icon = iconFor(transfer ? 'arrow-left-right' : glyph)
  const stroke = transfer ? 'var(--color-ink-dim)' : categoryVar(color)

  return (
    <span
      className="flex flex-none items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        border: `1px ${transfer ? 'dashed' : 'solid'} ${stroke}`,
        color: transfer ? 'var(--color-ink-muted)' : stroke,
      }}
    >
      <Icon size={Math.round(size * 0.5)} strokeWidth={1.5} />
    </span>
  )
}
