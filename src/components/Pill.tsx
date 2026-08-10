import type { ReactNode } from 'react'

/**
 * The small bordered pill the design uses wherever a short list of options has
 * to sit in one row — kind tabs, kind selectors. Accent border and text when
 * active, hairline and muted ink when not.
 */
export function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-[3px] px-3 py-[5px] font-sans text-[11.5px]"
      style={{
        border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-line)'}`,
        color: active ? 'var(--color-accent)' : 'var(--color-ink-muted)',
      }}
    >
      {children}
    </button>
  )
}
