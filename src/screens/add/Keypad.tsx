import { Delete } from 'lucide-react'

export const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'del'] as const

/**
 * Applies one keypress to the raw amount string.
 *
 * Pure, and always called from a functional state update — a fast repeated tap
 * on a value captured at render time silently drops digits.
 */
export function applyKey(current: string, key: string): string {
  if (key === 'del') return current.slice(0, -1)

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

/** Groups the integer part for display; the raw string stays the source. */
export function displayAmount(raw: string): string {
  if (raw === '') return ''
  const [whole = '', decimals] = raw.split(',')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return decimals === undefined ? grouped : `${grouped},${decimals}`
}

export function Keypad({ onKey }: { onKey: (key: string) => void }) {
  return (
    <div className="grid grid-cols-3 gap-[7px]">
      {KEYS.map((key) => (
        <button
          key={key}
          onClick={() => onKey(key)}
          aria-label={key === 'del' ? 'Delete' : key}
          className="tnum flex items-center justify-center rounded-[4px] py-[11px] text-[19px]"
          style={{ border: '1px solid var(--color-line)', color: 'var(--color-ink)' }}
        >
          {key === 'del' ? <Delete size={19} strokeWidth={1.5} /> : key}
        </button>
      ))}
    </div>
  )
}
