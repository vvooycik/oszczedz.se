import { useState } from 'react'
import { Delete } from 'lucide-react'
import { asMinor, formatSigned, parseAmount, toRawAmount, type Minor } from '@/lib/money'
import { tapFeedback } from '@/lib/touch'

export type Operator = '+' | '−' | '×' | '÷'

const OPERATORS: Operator[] = ['÷', '×', '−', '+']
const isOperator = (key: string): key is Operator =>
  (OPERATORS as string[]).includes(key)

/** Reading order of the pad: three digit columns, operators down the side. */
const LAYOUT = [
  '1', '2', '3', '÷',
  '4', '5', '6', '×',
  '7', '8', '9', '−',
  ',', '0', 'del', '+',
] as const

/**
 * What the amount field holds while it is being entered.
 *
 * A running total rather than an expression: nothing is parsed twice and there
 * is no tree to build, because each operator immediately folds what came before
 * it into `acc`. That also settles precedence — the pad evaluates strictly left
 * to right, so `2 + 3 × 4` is 20, not 14. It is a keypad on a receipt, not a
 * calculator, and since the big figure always shows the total as it stands, the
 * rule is visible while typing rather than surprising at the end.
 *
 * Only the result is ever stored; the arithmetic that produced it is not.
 */
export type AmountEntry = {
  /** Everything folded so far, in minor units. Null until an operator is used. */
  acc: number | null
  /** The operator waiting for a right-hand operand. */
  op: Operator | null
  /** Digits being typed right now, raw keypad format ("1234,5"). */
  typed: string
}

export const EMPTY_ENTRY: AmountEntry = { acc: null, op: null, typed: '' }

/** Opens the pad on an existing amount — the edit flow's starting point. */
export const entryFrom = (amount: Minor): AmountEntry => ({
  acc: null,
  op: null,
  typed: toRawAmount(amount),
})

/**
 * Folds one operation, in minor units throughout.
 *
 * `+` and `−` have money on both sides. `×` and `÷` do not: the right-hand side
 * is a plain multiplier, which is what "three of these" and "split it three
 * ways" actually mean — folding 12,50 × 3 as 1250 × 300 would give 37 500 zł
 * instead of 37,50. Reading the operand as a scalar also keeps multiplication
 * commutative, so 3 × 12,50 lands on the same answer.
 *
 * Division rounds to the nearest grosz and the remainder is dropped; splitting
 * 100 zł three ways gives three shares of 33,33 and loses one. Dividing by zero
 * leaves the total alone rather than producing an infinity that would have to
 * be caught later.
 */
function fold(acc: number, op: Operator, operand: number): number {
  switch (op) {
    case '+':
      return acc + operand
    case '−':
      return acc - operand
    case '×':
      return Math.round((acc * operand) / 100)
    case '÷':
      return operand === 0 ? acc : Math.round((acc * 100) / operand)
  }
}

/**
 * Applies one digit keypress to the raw operand string.
 *
 * Pure, and always called from a functional state update — a fast repeated tap
 * on a value captured at render time silently drops digits.
 */
function applyDigit(current: string, key: string): string {
  if (key === ',') {
    if (current.includes(',')) return current
    return current === '' ? '0,' : `${current},`
  }

  // At most two decimals; further digits are ignored rather than truncating
  // what the user already typed.
  const [, decimals] = current.split(',')
  if (decimals !== undefined && decimals.length >= 2) return current

  // No leading zeros: "0" then "5" reads as 5, not 05.
  if (current === '0') return key
  return current + key
}

/** Applies one keypress — digit, separator, operator or delete. */
export function applyKey(state: AmountEntry, key: string): AmountEntry {
  if (key === 'del') {
    // Unwinds in the order things were entered: the operand first, then the
    // operator that is waiting on it, then the total behind it.
    if (state.typed !== '') return { ...state, typed: state.typed.slice(0, -1) }
    if (state.op !== null) return { ...state, op: null }
    return EMPTY_ENTRY
  }

  if (isOperator(key)) {
    const operand = parseAmount(state.typed)
    if (operand === null) {
      // An operator with nothing in front of it means nothing; one pressed
      // straight after another is a correction, so the last one wins.
      return state.acc === null ? state : { ...state, op: key }
    }
    const acc =
      state.acc === null || state.op === null
        ? operand
        : fold(state.acc, state.op, operand)
    return { acc, op: key, typed: '' }
  }

  return { ...state, typed: applyDigit(state.typed, key) }
}

/** The amount to store: the running total with whatever is half-typed folded in. */
export function entryValue(state: AmountEntry): Minor | null {
  const operand = parseAmount(state.typed)
  if (state.acc === null) return operand
  if (state.op === null || operand === null) return asMinor(state.acc)
  return asMinor(fold(state.acc, state.op, operand))
}

/**
 * The big figure: **always the amount that would be stored**, so the number
 * being read is the number being saved and the pad needs no `=` key.
 *
 * The one exception is a plain amount with no arithmetic behind it, which is
 * echoed back raw — a half-typed "12," has to stay "12," rather than settling
 * to "12,00" under the finger. Once an operation is in flight that feedback
 * moves to the tape, which is where the digits being typed then live.
 *
 * Null when there is nothing at all, so the caller draws its own placeholder
 * rather than a zero that could be mistaken for an entered amount.
 */
export function entryDisplay(state: AmountEntry): string | null {
  if (state.acc === null) return state.typed === '' ? null : displayAmount(state.typed)
  const total = entryValue(state)
  return total === null ? null : formatSigned(total, { plus: false })
}

/**
 * The quiet line above it: the operation in flight, as typed.
 *
 * It shows the working, not the answer — the answer is the big figure. Never
 * more than one operation wide, because `acc` is already folded, so a chain of
 * five additions still reads as one short line.
 */
export function entryTape(state: AmountEntry): string | null {
  if (state.acc === null || state.op === null) return null

  const head = `${formatSigned(asMinor(state.acc), { plus: false })} ${state.op}`
  return state.typed === '' ? head : `${head} ${displayAmount(state.typed)}`
}

/** Groups the integer part for display; the raw string stays the source. */
export function displayAmount(raw: string): string {
  if (raw === '') return ''
  const [whole = '', decimals] = raw.split(',')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return decimals === undefined ? grouped : `${grouped},${decimals}`
}

/**
 * The keypad answers a press twice: a haptic tick and a filled key.
 *
 * Both are driven from `pointerdown` rather than the click, because the point
 * of the feedback is to confirm the finger landed — waiting for the release
 * reads as lag. The key press itself still runs on click, so a drag off the
 * button cancels it the way a button should.
 *
 * The fill goes on instantly and fades out, so a fast run of digits still shows
 * each one; a symmetrical transition would smear them together.
 *
 * Operators sit in a narrower fourth column, muted until one is waiting for its
 * operand — the same accent-on-selected the pills use, and the only thing on
 * screen saying an operation is still open besides the pending line.
 */
export function Keypad({
  op,
  onKey,
}: {
  op: Operator | null
  onKey: (key: string) => void
}) {
  const [pressed, setPressed] = useState<string | null>(null)
  const release = () => setPressed(null)

  return (
    <div
      className="grid gap-[7px]"
      style={{ gridTemplateColumns: 'repeat(3, 1fr) .82fr' }}
    >
      {LAYOUT.map((key) => {
        const down = pressed === key
        const operator = isOperator(key)
        const armed = operator && key === op

        return (
          <button
            key={key}
            onPointerDown={() => {
              setPressed(key)
              tapFeedback()
            }}
            onPointerUp={release}
            onPointerCancel={release}
            onPointerLeave={release}
            onClick={() => onKey(key)}
            aria-label={key === 'del' ? 'Delete' : key}
            aria-pressed={operator ? armed : undefined}
            className="tnum flex items-center justify-center rounded-[4px] py-[11px] text-[19px]"
            style={{
              border: `1px solid ${armed ? 'var(--color-accent)' : 'var(--color-line)'}`,
              color: armed
                ? 'var(--color-accent)'
                : operator
                  ? 'var(--color-ink-muted)'
                  : 'var(--color-ink)',
              background: down ? 'var(--color-surface)' : 'transparent',
              transform: down ? 'scale(.96)' : 'none',
              transition: down
                ? 'none'
                : 'background 160ms ease-out, transform 160ms ease-out',
              // We draw our own press state; iOS's grey flash would double it.
              WebkitTapHighlightColor: 'transparent',
              touchAction: 'manipulation',
            }}
          >
            {key === 'del' ? <Delete size={19} strokeWidth={1.5} /> : key}
          </button>
        )
      })}
    </div>
  )
}
