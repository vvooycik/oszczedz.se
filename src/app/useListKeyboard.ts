import { useEffect } from 'react'

/**
 * Arrow up/down move the selection in a master list; Enter opens the first row
 * when nothing is selected yet.
 *
 * Only ever bound on a wide layout — a phone has no keyboard to press and the
 * list is not beside anything for a selection to fill.
 *
 * **It refuses to fire while a dialog is open.** The list behind a modal is
 * still mounted — that is the whole point of the wide layout's background
 * location — so without this, arrowing through the entry form would silently
 * walk the feed underneath it. `Modal` is the one thing that sets
 * `role="dialog"`, which makes the check one query rather than a flag threaded
 * from the router into every master screen.
 *
 * **It refuses to fire while a field has focus.** Arrow keys inside a text
 * input, a select or a textarea belong to that control; stealing them would
 * make the note field on the add modal move the feed behind it. `isContentEditable`
 * covers nothing in this app today and is checked anyway, because it is the one
 * case that would look like a bug rather than a missing feature.
 */
export function useListKeyboard({
  enabled,
  ids,
  selected,
  onSelect,
}: {
  enabled: boolean
  /** The rows, in the order they are drawn. */
  ids: string[]
  /** Which one is open, or null. */
  selected: string | null
  onSelect: (id: string) => void
}) {
  useEffect(() => {
    if (!enabled || ids.length === 0) return

    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (document.querySelector('[role="dialog"]')) return

      const el = document.activeElement
      if (
        el instanceof HTMLElement &&
        (el.isContentEditable ||
          el instanceof HTMLInputElement ||
          el instanceof HTMLSelectElement ||
          el instanceof HTMLTextAreaElement)
      ) {
        return
      }

      const step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0
      if (step === 0) {
        // Enter with nothing open picks the top of the list, which is the only
        // thing it could reasonably mean. With a row already open, Enter
        // belongs to whatever that row's pane has focused.
        if (e.key === 'Enter' && selected === null) {
          e.preventDefault()
          onSelect(ids[0]!)
        }
        return
      }

      e.preventDefault()
      const at = selected === null ? -1 : ids.indexOf(selected)
      // From nothing, down opens the first and up opens the last. Clamped
      // rather than wrapped: a list that jumps from its foot back to its head
      // loses the reader's place.
      const next =
        at < 0
          ? step > 0
            ? 0
            : ids.length - 1
          : Math.min(ids.length - 1, Math.max(0, at + step))
      const id = ids[next]
      if (id && id !== selected) onSelect(id)
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled, ids, selected, onSelect])
}
