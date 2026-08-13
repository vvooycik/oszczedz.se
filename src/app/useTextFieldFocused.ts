import { useEffect, useState } from 'react'

/**
 * Input types that raise a keyboard. `number` and the empty string are here
 * because `type` defaults to `text` and reads back as `''` on some paths.
 */
const TEXT_TYPES = new Set([
  '',
  'email',
  'number',
  'password',
  'search',
  'tel',
  'text',
  'url',
])

const isTextField = (el: Element | null): boolean =>
  el instanceof HTMLTextAreaElement ||
  (el instanceof HTMLInputElement && TEXT_TYPES.has(el.type)) ||
  (el instanceof HTMLElement && el.isContentEditable)

/**
 * Whether a text field anywhere on the page currently holds focus.
 *
 * The entry screen uses this to put its calculator keypad away while the system
 * keyboard is up. **Focus rather than the visual viewport**, which was the first
 * attempt: `useKeyboardInset` is the honest signal for *where* the keyboard is
 * and drives the layout that lifts Save above it, but it did not reliably
 * report a keyboard at all in the installed standalone app, so the keypad stayed
 * put. Focus is what the app can actually be sure of, it is synchronous, and it
 * answers the question being asked — a keypad has no business on screen while
 * someone is typing words.
 *
 * A document-level listener rather than props threaded through every field: the
 * category drawer's search box is the case that matters most and it lives in a
 * different part of the tree.
 *
 * `focusout` fires *before* focus lands anywhere, so `activeElement` is briefly
 * `<body>` while moving between two fields. Deferring that read to the next task
 * keeps the keypad from flashing back in between them.
 */
export function useTextFieldFocused(): boolean {
  const [focused, setFocused] = useState(() => isTextField(document.activeElement))

  useEffect(() => {
    let pending = 0
    const check = () => setFocused(isTextField(document.activeElement))
    const defer = () => {
      clearTimeout(pending)
      pending = window.setTimeout(check, 0)
    }

    check()
    document.addEventListener('focusin', check)
    document.addEventListener('focusout', defer)
    return () => {
      clearTimeout(pending)
      document.removeEventListener('focusin', check)
      document.removeEventListener('focusout', defer)
    }
  }, [])

  return focused
}
