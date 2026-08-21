import { useEffect, useState } from 'react'
import { Sheet } from '@/components/Sheet'
import { Button } from '@/components/ui/Button'
import { Label } from '@/components/ui/Label'
import {
  applyKey,
  entryDisplay,
  entryFrom,
  entryTape,
  entryValue,
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

  useEffect(() => {
    if (open) setEntry(value === null ? EMPTY_ENTRY : entryFrom(value))
  }, [open, value])

  const figure = entryDisplay(entry)
  const tape = entryTape(entry)
  const parsed = entryValue(entry)
  // Zero is a limit that can never be met and the CHECK constraint refuses it,
  // so Done stays shut rather than failing on save.
  const valid = parsed !== null && parsed > 0

  return (
    <Sheet open={open} onClose={onClose} height="62%" label="Budget limit">
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

        <Keypad op={entry.op} onKey={(key) => setEntry((s) => applyKey(s, key))} />

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
