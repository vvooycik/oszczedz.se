/**
 * Reads design tokens back out of the CSS custom properties Tailwind emits
 * from the `@theme` block in index.css. This keeps ECharts and Tailwind on one
 * palette: index.css is the source, this module is the accessor.
 */

const read = (name: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim()

export const token = {
  surface: () => read('--color-surface'),
  surfaceRaised: () => read('--color-surface-raised'),
  border: () => read('--color-border'),
  ink: () => read('--color-ink'),
  inkMuted: () => read('--color-ink-muted'),
  income: () => read('--color-income'),
  expense: () => read('--color-expense'),
  scheme: (name: string) => read(`--color-scheme-${name}`),
}

/**
 * Fixed assignment order — see the note in index.css. Adjacent entries are
 * deliberately alternating in lightness so they survive colour-vision
 * deficiency. Never cycle past the end: a 7th series folds into "Other".
 */
export const COLOR_SCHEMES = [
  'indigo',
  'amber',
  'rose',
  'teal',
  'violet',
  'green',
] as const

export type ColorScheme = (typeof COLOR_SCHEMES)[number]

/** Categorical series palette for charts, in a deliberate order. */
export const seriesPalette = (): string[] =>
  COLOR_SCHEMES.map((s) => token.scheme(s))
