import type { CSSProperties, ReactNode } from 'react'

/**
 * The surface everything sits on.
 *
 * This replaces the hairline-bordered rectangle the app used to draw around
 * every list. Grouping now comes from a raised surface and the air between
 * cards; the only rule left anywhere is the divider *inside* a card.
 *
 * `flex: none` is not decoration — cards live in flex columns that scroll, and
 * without it a long feed squeezes the ones above it instead of scrolling.
 */
export function Card({
  children,
  className = '',
  style,
  ...rest
}: {
  children: ReactNode
  className?: string
  style?: CSSProperties
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`flex-none overflow-hidden rounded-card bg-card shadow-card ${className}`}
      style={style}
      {...rest}
    >
      {children}
    </div>
  )
}

/**
 * A row inside a card. 13/16 padding and a 13px gap, which is what puts a 40px
 * icon tile's text at the 61px the default divider inset expects.
 *
 * `press` washes the row while a finger is down. It is opt-out because a row
 * that navigates should say so, and opt-out rather than opt-in because most
 * rows here do navigate.
 */
export function CardRow({
  children,
  className = '',
  style,
  press = true,
  ...rest
}: {
  children: ReactNode
  className?: string
  style?: CSSProperties
  press?: boolean
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`flex items-center gap-[13px] px-4 py-[13px] ${
        press ? 'hover:bg-press active:bg-press' : ''
      } ${className}`}
      style={style}
      {...rest}
    >
      {children}
    </div>
  )
}

/**
 * The 1px rule between rows of one card, inset past whatever leads the row so
 * it starts under the text rather than under the icon.
 *
 * The default 61px is a 40px tile at 16px padding plus the 13px gap — i.e. the
 * feed row. Rows with a different leading element pass their own; the handoff
 * uses 51, 55, 57, 63 and 64 for the 38px, 34px, 36px, glyph-column and
 * grip-plus-tile cases respectively.
 */
export function Divider({ inset = 61 }: { inset?: number }) {
  return <div className="h-px bg-divider" style={{ marginLeft: inset }} />
}
