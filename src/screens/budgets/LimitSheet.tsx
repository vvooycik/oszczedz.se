import { useEffect, useRef, useState } from 'react'
import { IconCalculator } from '@tabler/icons-react'
import { Sheet } from '@/components/Sheet'
import { Button } from '@/components/ui/Button'
import { Label } from '@/components/ui/Label'
import { isWide, useLayoutMode } from '@/app/layout'
import {
  applyKey,
  entryDisplay,
  entryFrom,
  entryTape,
  entryValue,
  keypadKeyFor,
  EMPTY_ENTRY,
  Keypad,
  type AmountEntry,
} from '@/screens/add/Keypad'
import { currencySymbol, type Minor } from '@/lib/money'

/**
 * The limit, typed on the same pad a transaction is.
 *
 * Not a text field, and the reason is the same one the entry screen gives: a
 * limit is usually arrived at rather than known — "four weeks of 300" is how
 * someone decides on 1 200 — and the pad's running total is what makes that
 * legible while typing. It also keeps the figure at 38px instead of at the
 * 16px floor an `<input>` needs to stop iOS zooming the viewport.
 *
 * The pad is re-seeded on every open rather than kept between them: this drawer
 * edits one number that already exists on the screen behind it, so opening it
 * with yesterday's half-finished arithmetic would be a state nobody put there.
 *
 * ## It is a pad, not the only way in
 *
 * **Typing works everywhere, and the pad is off by default on a desktop** —
 * the same call the entry modal makes, for the same reason: a machine with a
 * hardware keyboard already has a better keypad than this one, and a drawer
 * that can only be clicked at is a form that has to be filled in with the
 * mouse. Digits, both decimal separators and the four operators go through
 * `keypadKeyFor` into the very same `applyKey`, so `4×300` folds while typed
 * exactly as it would while tapped, and Enter commits.
 *
 * The listener is on the window rather than on a focused field, because the
 * figure is a 38px display and not an `<input>` — making it one would push the
 * unit to the far side of the drawer and put the phone's own layout at risk to
 * serve a keyboard the phone does not have. Nothing else can have focus while
 * a modal drawer is open, and the guard covers the case anyway.
 */
export function LimitSheet({
  open,
  onClose,
  value,
  onChange,
  currency,
  tone,
  periodLabel,
}: {
  open: boolean
  onClose: () => void
  /** Null before a limit has been set. */
  value: Minor | null
  onChange: (next: Minor) => void
  currency: string
  /** The budget's colour, so the commit button matches the screen behind it. */
  tone: string
  /** "per month" — the same sub-line the card shows. */
  periodLabel: string
}) {
  const [entry, setEntry] = useState<AmountEntry>(EMPTY_ENTRY)
  const mode = useLayoutMode()
  /**
   * Whether the pad is drawn. Seeded on open rather than at mount, so it
   * follows a window that was resized between two openings — and so a toggle
   * does not outlive the drawer that offered it, which is the same rule the
   * entry itself follows one line up.
   */
  const [showKeypad, setShowKeypad] = useState(true)
  // Through a ref, so the seeding effect below reads the current width without
  // depending on it: crossing a breakpoint with the drawer already open should
  // not fold the pad away under the finger.
  const modeNow = useRef(mode)
  modeNow.current = mode

  useEffect(() => {
    if (!open) return
    setEntry(value === null ? EMPTY_ENTRY : entryFrom(value))
    setShowKeypad(modeNow.current !== 'desktop')
    // **The drawer takes focus off the screen it covers.** The figure that
    // opens it carries `keepFocus`, so the budget's name field keeps focus
    // through the tap — which on a phone leaves the system keyboard up over
    // this drawer, and on a desktop would send every digit typed here into the
    // name behind it.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  }, [open, value])

  const figure = entryDisplay(entry)
  const tape = entryTape(entry)
  const parsed = entryValue(entry)
  // Zero is a limit that can never be met and the CHECK constraint refuses it,
  // so Done stays shut rather than failing on save.
  const valid = parsed !== null && parsed > 0

  const commit = () => {
    if (parsed !== null && parsed > 0) onChange(parsed)
    onClose()
  }
  // The listener below is bound once per open; this is how it reaches the
  // current figure and the current callbacks without rebinding on every
  // keystroke.
  const latest = useRef(commit)
  latest.current = commit

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      // Nothing in this drawer takes text, but the screen behind it does, and a
      // stray focus there would otherwise have its digits stolen.
      const el = document.activeElement
      if (
        el instanceof HTMLElement &&
        (el.isContentEditable ||
          el instanceof HTMLInputElement ||
          el instanceof HTMLTextAreaElement)
      ) {
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        latest.current()
        return
      }
      const key = keypadKeyFor(e.key)
      if (!key) return
      // Backspace would otherwise navigate back in some browsers, and the
      // operators are fine either way — one rule is easier to trust than two.
      e.preventDefault()
      setEntry((st) => applyKey(st, key))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <Sheet
      open={open}
      onClose={onClose}
      // Without the pad there is a figure and two buttons in here, and 62% of a
      // desktop dialog would be mostly air.
      height={showKeypad ? '62%' : '272px'}
      label="Budget limit"
    >
      <div className="flex flex-1 flex-col px-4 pb-[max(env(safe-area-inset-bottom,0px),16px)]">
        <Label>Limit</Label>

        <div className="flex min-h-[92px] flex-col justify-center py-2">
          {/* The working, not the answer — the answer is the figure below. */}
          <div className="tnum h-[18px] text-value text-ink-faint">{tape ?? ''}</div>
          <div
            className="tnum"
            style={{
              fontSize: 'var(--text-sheet)',
              fontWeight: 600,
              lineHeight: 1.1,
              letterSpacing: '-.035em',
              color: figure ? undefined : 'var(--color-ink-faint)',
            }}
          >
            {figure ?? '0,00'}
            {/* Typed into rather than tapped at, so it says so: with the pad
                away the figure is the only thing here that takes input, and a
                money display with no caret does not look like one. */}
            {!showKeypad && (
              <span
                aria-hidden
                className="ml-[3px] inline-block w-[2px] align-baseline motion-safe:animate-pulse"
                style={{ height: '0.82em', background: tone, borderRadius: 1 }}
              />
            )}
            <span
              className="text-ink-faint"
              style={{ fontSize: 'var(--text-sheet-unit)', fontWeight: 500, letterSpacing: 0 }}
            >
              {' '}
              {currencySymbol(currency)}
            </span>
          </div>
          <div className="mt-1 text-meta text-ink-muted">{periodLabel}</div>
        </div>

        {showKeypad && (
          <Keypad op={entry.op} onKey={(key) => setEntry((s) => applyKey(s, key))} />
        )}

        {/* Only where there is something to type with. On a phone the pad is
            the input, and a button that takes it away would be a dead end. */}
        {isWide(mode) && (
          <>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => setShowKeypad((k) => !k)}
              className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-tile bg-inset py-[11px] text-meta font-semibold text-ink-muted"
            >
              <IconCalculator size={17} stroke={2} />
              {showKeypad ? 'Hide keypad' : 'Show keypad'}
            </button>
          </>
        )}

        <div className="mt-2.5">
          <Button
            tone={tone}
            disabled={!valid}
            onClick={() => {
              if (parsed !== null && parsed > 0) onChange(parsed)
              onClose()
            }}
          >
            Done
          </Button>
        </div>
      </div>
    </Sheet>
  )
}
