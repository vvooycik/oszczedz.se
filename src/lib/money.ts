/**
 * Money is always an integer count of minor units (grosze/cents), never a
 * float and never a decimal string. Formatting happens here and nowhere else.
 *
 * Trade-off: the DB column is `bigint`, but PostgREST serialises it as a JSON
 * number, so it arrives as a JS number. That is exact up to 2^53 minor units
 * (~90 trillion PLN), far beyond anything this app will hold, so we keep
 * `number` rather than paying the ergonomic cost of `bigint` in arithmetic and
 * chart libraries. The `Minor` brand is what stops a major-unit value (12.34)
 * from being passed where minor units (1234) are expected.
 */

declare const brand: unique symbol
export type Minor = number & { readonly [brand]: 'minor' }

/** Trusts that `n` is already an integer count of minor units (e.g. from the DB). */
export const asMinor = (n: number): Minor => {
  if (!Number.isInteger(n)) {
    throw new Error(`Money must be an integer of minor units, got ${n}`)
  }
  return n as Minor
}

/**
 * Parses user input in major units ("12,34", "-5.5", "1 234,56") into minor
 * units. Returns null for anything unparseable so callers can show a
 * validation message rather than silently storing 0.
 */
export const parseAmount = (input: string): Minor | null => {
  const cleaned = input.replace(/\s| /g, '').replace(',', '.')
  if (!/^-?\d*\.?\d*$/.test(cleaned) || cleaned === '' || cleaned === '-') {
    return null
  }
  const negative = cleaned.startsWith('-')
  const [whole = '0', frac = ''] = cleaned.replace('-', '').split('.')
  if (frac.length > 2) return null
  const minor = Number(whole) * 100 + Number(frac.padEnd(2, '0'))
  if (!Number.isSafeInteger(minor)) return null
  return asMinor(negative ? -minor : minor)
}

const formatters = new Map<string, Intl.NumberFormat>()

const formatterFor = (currency: string): Intl.NumberFormat => {
  let f = formatters.get(currency)
  if (!f) {
    f = new Intl.NumberFormat('pl-PL', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      // pl-PL groups only from five digits by default (CLDR
      // minimumGroupingDigits: 2), so 9591,72 would print ungrouped. The design
      // groups from four, and a column of money reads better that way.
      useGrouping: 'always',
    })
    formatters.set(currency, f)
  }
  return f
}

/** Display only. Never feed the result back into arithmetic. */
export const formatMoney = (amount: Minor, currency: string): string =>
  formatterFor(currency).format(amount / 100)

const symbols = new Map<string, string>()

/**
 * The currency's display symbol on its own: 'PLN' → 'zł'.
 *
 * For places that need the sign glyph and the explicit "+" of `formatSigned`
 * and so cannot use `formatMoney`, which formats the number its own way. Taken
 * from Intl rather than a lookup table so an unknown code degrades to its own
 * name instead of rendering nothing.
 */
export function currencySymbol(currency: string): string {
  let s = symbols.get(currency)
  if (s === undefined) {
    s =
      formatterFor(currency)
        .formatToParts(0)
        .find((p) => p.type === 'currency')?.value ?? currency
    symbols.set(currency, s)
  }
  return s
}

/** Bare number without the currency symbol — for dense chart axes. */
export const formatMoneyShort = (amount: Minor): string =>
  new Intl.NumberFormat('pl-PL', {
    maximumFractionDigits: 0,
    useGrouping: 'always',
  }).format(amount / 100)

const plain = new Intl.NumberFormat('pl-PL', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: 'always',
})

/** Magnitude only, no sign and no symbol: "9 591,72". */
export const formatAmount = (amount: Minor): string =>
  plain.format(Math.abs(amount) / 100)

/**
 * Signed for display: "−101,22" / "+7 000,00".
 *
 * Uses U+2212 MINUS SIGN rather than a hyphen — it aligns with the digits at
 * the same width, which matters in a right-aligned tabular column.
 */
export function formatSigned(amount: Minor, opts?: { plus?: boolean }): string {
  const body = formatAmount(amount)
  if (amount < 0) return `−${body}`
  return opts?.plus === false ? body : `+${body}`
}
