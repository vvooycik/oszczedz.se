import type { ReactNode } from 'react'
import { IconChevronLeft, IconX } from '@tabler/icons-react'
import { ActionTile } from './Button'

/**
 * The header every sub-screen wears: a leading action tile, a centred title,
 * and whatever actions belong on the right.
 *
 * Centring is done with a fixed-width spacer opposite the leading tile rather
 * than with absolute positioning, so a long title truncates in the space it
 * actually has instead of running under the buttons.
 *
 * `onField` hands the tiles their scrim treatment for the three screens whose
 * header sits on a colour field.
 */
export function ScreenHeader({
  title,
  onBack,
  onClose,
  actions,
  onField = false,
  size = 15,
}: {
  title?: ReactNode
  onBack?: () => void
  onClose?: () => void
  actions?: ReactNode
  onField?: boolean
  /** 15 for a modal's centred title, 19 for a pushed sub-screen. */
  size?: 15 | 19
}) {
  const leading = onClose ? (
    <ActionTile label="Close" onField={onField} onClick={onClose}>
      <IconX size={20} stroke={2} />
    </ActionTile>
  ) : onBack ? (
    <ActionTile label="Back" onField={onField} onClick={onBack}>
      <IconChevronLeft size={20} stroke={2} />
    </ActionTile>
  ) : null

  // A 19px title is a screen's name and sits next to the back tile; a 15px one
  // is a modal's label and sits in the middle. Balancing the row only makes
  // sense for the second.
  const centred = size === 15

  return (
    <header className="flex flex-none items-center gap-3 px-4 pt-2.5 pb-1.5">
      {leading}
      {title != null && (
        <div
          className={`min-w-0 truncate ${centred ? 'flex-1 text-center' : 'flex-1'}`}
          style={{
            fontSize: size,
            fontWeight: 600,
            letterSpacing: centred ? undefined : '-0.01em',
            color: onField ? 'var(--field-ink)' : undefined,
          }}
        >
          {title}
        </div>
      )}
      {actions ?? (centred && leading ? <span className="w-[38px] flex-none" /> : null)}
    </header>
  )
}
