/**
 * Reads design tokens back out of the CSS custom properties Tailwind emits from
 * the `@theme static` block in index.css. This keeps ECharts and Tailwind on
 * one palette: index.css is the source, this module is the accessor.
 *
 * Values are read on demand rather than cached — the accent, tint and mode all
 * change at runtime, so a cached colour would go stale the moment the user
 * touches Appearance.
 */

const read = (name: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim()

export const token = {
  bg: () => read('--color-bg'),
  surface: () => read('--color-surface'),
  accent: () => read('--color-accent'),
  ink: () => read('--color-ink'),
  inkMuted: () => read('--color-ink-muted'),
  inkFaint: () => read('--color-ink-faint'),
  line: () => read('--color-line'),
  lineSoft: () => read('--color-line-soft'),
  track: () => read('--color-track'),
  expense: () => read('--color-expense'),
  income: () => read('--color-income'),
}

/**
 * Category slots, in the fixed assignment order. Also the categorical chart
 * palette — never cycle past the end; a seventh series folds into "Other".
 */
export const CATEGORY_COLORS = [
  'moss',
  'ochre',
  'slate',
  'terracotta',
  'teal',
  'plum',
] as const

export type CategoryColor = (typeof CATEGORY_COLORS)[number]

/**
 * The palette before the redesign used different slot names, and `color` is a
 * free-text column, so a row can hold anything. Map what we know and fall back
 * deterministically rather than rendering an empty string (which paints black).
 */
const LEGACY_ALIASES: Record<string, CategoryColor> = {
  green: 'moss',
  amber: 'ochre',
  indigo: 'slate',
  rose: 'terracotta',
  violet: 'plum',
  teal: 'teal',
}

export function resolveCategoryColor(name: string | null | undefined): CategoryColor {
  if (!name) return 'slate'
  if ((CATEGORY_COLORS as readonly string[]).includes(name)) {
    return name as CategoryColor
  }
  const alias = LEGACY_ALIASES[name]
  if (alias) return alias

  // Unknown value: hash it so the same category keeps the same colour between
  // renders instead of flickering.
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0
  return CATEGORY_COLORS[Math.abs(hash) % CATEGORY_COLORS.length]!
}

/** CSS value for inline styles and SVG attributes (stroke, fill). */
export const categoryVar = (name: string | null | undefined): string =>
  `var(--color-${resolveCategoryColor(name)})`

/** Resolved colour, for canvas-based charts that cannot take a var(). */
export const categoryColor = (name: string | null | undefined): string =>
  read(`--color-${resolveCategoryColor(name)}`)

export const seriesPalette = (): string[] =>
  CATEGORY_COLORS.map((c) => read(`--color-${c}`))
