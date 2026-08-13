import { keepFocus } from '@/lib/touch'

/**
 * The 44×26 switch. Accent when on, track colour when off, 20px knob.
 *
 * Rendered as a `button` with `role="switch"` rather than a checkbox: the app
 * already keeps a real hidden checkbox around for the iOS haptic (see
 * `tapFeedback`), and a second one here would be two controls fighting over
 * what "checked" means.
 */
export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onMouseDown={keepFocus}
      onClick={() => onChange(!checked)}
      // 44px of hit area around a 26px control, without the control growing.
      className="relative flex h-[26px] w-[44px] flex-none items-center rounded-full px-[3px] transition-colors duration-200 after:absolute after:-inset-y-[9px] after:-inset-x-1 after:content-['']"
      style={{ background: checked ? 'var(--color-accent)' : 'var(--color-track)' }}
    >
      <span
        className="size-5 rounded-full bg-white transition-transform duration-200 ease-out"
        style={{ transform: `translateX(${checked ? 18 : 0}px)` }}
      />
    </button>
  )
}
