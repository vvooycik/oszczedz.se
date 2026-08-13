import type { ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'scrim'

/**
 * The design has three buttons and one shape.
 *
 * `primary` is the accent. `secondary` is the inset fill — Cancel, "Save & add
 * another". `scrim` is the variant for buttons sitting on a colour field, where
 * neither token would be legible against the tint.
 *
 * `tone` overrides the primary fill with an explicit colour, which the entry
 * screen's Save uses: that screen is themed by the chosen category, so its
 * commit button is category-coloured rather than accent-coloured. Passing a
 * colour and `primary` is the only way to say that without a fourth variant.
 */
export function Button({
  children,
  variant = 'primary',
  tone,
  full = true,
  className = '',
  ...rest
}: {
  children: ReactNode
  variant?: Variant
  tone?: string
  full?: boolean
  className?: string
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const base =
    'rounded-field px-4 py-[15px] text-[14.5px] font-semibold transition-transform duration-[90ms] active:scale-[.98] disabled:opacity-40 disabled:active:scale-100'

  const styles: Record<Variant, React.CSSProperties> = {
    primary: {
      background: tone ?? 'var(--color-accent)',
      // A category colour and the accent both take the same foreground: both
      // are ~70% lightness in dark mode and ~50% in light, which is exactly
      // what --color-accent-fg is picked against.
      color: 'var(--color-accent-fg)',
    },
    secondary: {
      background: 'var(--color-inset)',
      color: 'var(--color-ink)',
    },
    scrim: {
      background: 'rgba(0,0,0,.24)',
      color: '#fff',
    },
  }

  return (
    <button
      type="button"
      className={`${base} ${full ? 'w-full' : ''} ${className}`}
      style={styles[variant]}
      {...rest}
    >
      {children}
    </button>
  )
}

/**
 * The small square action tile in a screen header — back, close, edit, delete.
 *
 * 38px visually, but the hit area is padded out to 44 with a pseudo-element
 * rather than by growing the box, so a row of them keeps the design's spacing
 * while still being tappable. `onField` switches the fill to a scrim, since a
 * card-coloured tile disappears into a colour field.
 */
export function ActionTile({
  children,
  label,
  onField = false,
  tone,
  className = '',
  ...rest
}: {
  children: ReactNode
  label: string
  onField?: boolean
  /** Overrides the glyph colour — the delete tile's red. */
  tone?: string
  className?: string
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      className={`relative flex size-[38px] flex-none items-center justify-center rounded-tile-sm after:absolute after:-inset-[3px] after:content-[''] active:opacity-70 ${className}`}
      style={
        onField
          ? { background: 'var(--field-scrim)', color: tone ?? 'var(--field-ink)' }
          : { background: 'var(--color-card)', color: tone ?? 'var(--color-ink-muted)' }
      }
      {...rest}
    >
      {children}
    </button>
  )
}
