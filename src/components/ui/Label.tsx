import type { ReactNode } from 'react'

/**
 * The uppercase section label — "Total wealth", "Accounts", "Today".
 *
 * Replaces the `.kicker` class the old design used, which had to switch font
 * family because words and figures ran in different faces. One family now, so
 * this is purely size, weight and tracking.
 */
export function Label({
  children,
  tone,
  className = '',
  style,
}: {
  children: ReactNode
  /**
   * Overrides the label ink — the budget list's red "Over" heading.
   *
   * A prop rather than a `text-expense` in `className`, because both are text
   * colour utilities of the same specificity and which one wins is decided by
   * Tailwind's own ordering in the generated stylesheet, not by the order they
   * appear in the class attribute. An inline style is the only way to be sure.
   */
  tone?: string
  className?: string
  /**
   * Geometry only — the fixed column widths of the wallet pane's table header.
   * `tone` still wins over any colour set here, since it is spread last and is
   * the reason an inline style was needed in the first place.
   */
  style?: React.CSSProperties
}) {
  return (
    <span
      className={`text-kicker font-semibold tracking-[0.06em] text-label uppercase ${className}`}
      style={tone ? { ...style, color: tone } : style}
    >
      {children}
    </span>
  )
}

/**
 * A label with something aligned to the right of it — a group total, a peak, a
 * "Select all" link. Sits above a card rather than inside one, so it carries
 * the 4px of side padding that lines its text up with the card's own.
 */
export function LabelRow({
  children,
  trailing,
  className = '',
}: {
  children: ReactNode
  trailing?: ReactNode
  className?: string
}) {
  return (
    <div className={`flex items-baseline justify-between px-1 ${className}`}>
      <Label>{children}</Label>
      {trailing}
    </div>
  )
}
