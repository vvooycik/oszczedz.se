/**
 * Two small things the phone needs that the DOM does not hand over directly:
 * haptics, and a tap that survives a focused text field.
 */

let hapticLabel: HTMLLabelElement | null = null

/**
 * Lazily builds the hidden switch used for haptics, once per document.
 *
 * The input must stay *rendered*: `display: none` and `visibility: hidden` take
 * it out of the layout and the haptic goes with it, so it is parked at 1px in
 * the corner with pointer events off instead.
 */
function hapticSwitch(): HTMLLabelElement {
  if (hapticLabel) return hapticLabel

  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.style.cssText =
    'position:fixed;top:0;left:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;z-index:-1'

  const input = document.createElement('input')
  input.type = 'checkbox'
  input.id = 'haptic-switch'
  input.tabIndex = -1
  // Set as an attribute rather than a property: `switch` is Safari-only, so no
  // other engine reflects it, and JSX would not pass it through either.
  input.setAttribute('switch', '')

  const label = document.createElement('label')
  label.htmlFor = input.id

  host.append(input, label)
  document.body.append(host)

  hapticLabel = label
  return label
}

/**
 * A single short tap of haptic feedback, if the device has any.
 *
 * iOS has no Vibration API — `navigator.vibrate` is simply absent — but Safari
 * 17.4 added `<input type="checkbox" switch>`, and flipping one through its
 * label plays the system toggle haptic. Clicking a hidden label is the only way
 * a web app gets a tap out of an iPhone today; it needs a user gesture on the
 * stack, so call this from the press handler, not from an effect.
 *
 * Everywhere else falls back to the real API. Both paths are best-effort: a
 * missed buzz is not worth an exception on the keypad's hot path.
 */
export function tapFeedback(): void {
  try {
    if (typeof navigator.vibrate === 'function') {
      navigator.vibrate(8)
      return
    }
    hapticSwitch().click()
  } catch {
    /* haptics are a nicety, never a failure */
  }
}

/**
 * `onMouseDown` handler for controls that sit next to a focused text field.
 *
 * On iOS the tap that blurs an input is spent doing just that: focus leaves the
 * field, the keyboard starts to retract, and the click never reaches the button
 * underneath — which is why a searched-for category needed two taps, one to put
 * the keyboard away and one to actually pick. iOS synthesises `mousedown` from
 * the tap *before* it moves focus, so cancelling its default keeps focus where
 * it is, nothing moves, and the click lands the first time.
 *
 * Deliberately not `pointerdown`: React listens to that one non-passively, and
 * preventing it would also cancel the scroll gesture on a grid you can swipe.
 */
export const keepFocus = (e: { preventDefault: () => void }): void =>
  e.preventDefault()
