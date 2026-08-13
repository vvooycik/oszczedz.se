/**
 * Reads design tokens back out of the CSS custom properties Tailwind emits from
 * the `@theme static` block in index.css. This keeps ECharts and Tailwind on
 * one palette: index.css is the source, this module is the accessor.
 *
 * Values are read on demand rather than cached — the accent, tint and mode all
 * change at runtime, so a cached colour would go stale the moment the user
 * touches Appearance.
 */

import { oklchToHex } from './theme'

/**
 * Any CSS colour → something zrender can parse.
 *
 * Custom properties are substituted, not computed: `getComputedStyle` hands back
 * whatever literal index.css declared, with `var()` inside it resolved but the
 * colour function left alone. So a token arrives as `oklch(…)`, or — since the
 * surface tint — as `color-mix(in oklab, oklch(…) 4%, oklch(…))`. Canvas paints
 * both happily, which is why flat fills never showed a problem; but zrender
 * parses a colour before it can interpolate one, and its parser knows neither.
 * A gradient built from such stops throws inside `lerp`.
 *
 * `oklch()` is converted arithmetically because that is cheap and covers most
 * tokens. rgba and hex — the whole ink ladder — are already fine and pass
 * straight through. Anything left is a `color-mix()`, which only the browser can
 * evaluate.
 *
 * **That last case is resolved by painting it, not by asking for it back.**
 * Setting `fillStyle` and reading the property returns whatever colour space the
 * input was in — Chrome hands back `oklab(0.227 …)` for a mix in oklab, which
 * zrender understands no better than the `color-mix()` it came from. Filling one
 * pixel and reading it with `getImageData` goes through the compositor instead,
 * so the answer is always four sRGB bytes.
 */
const OKLCH = /^oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*\)$/i

let probe: CanvasRenderingContext2D | null | undefined

const context = (): CanvasRenderingContext2D | null => {
  if (probe === undefined) {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    // `willReadFrequently` keeps this on the software path; the alternative is a
    // GPU readback stall on every call, and this is called per chart repaint.
    probe = canvas.getContext('2d', { willReadFrequently: true })
  }
  return probe
}

const normalise = (value: string): string => {
  const ctx = context()
  if (!ctx) return value
  try {
    ctx.clearRect(0, 0, 1, 1)
    ctx.fillStyle = value
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
    // Alpha comes back premultiplied over the cleared (transparent) pixel, so a
    // translucent mix would read too dark — but every token that reaches here is
    // opaque, and returning rgba keeps that honest if one ever is not.
    return a === 255
      ? `rgb(${r}, ${g}, ${b})`
      : `rgba(${r}, ${g}, ${b}, ${(a! / 255).toFixed(3)})`
  } catch {
    // A tainted or unavailable canvas: better the original string than nothing.
    return value
  }
}

const parseColor = (value: string): string => {
  const m = OKLCH.exec(value)
  if (m) return oklchToHex(Number(m[1]) / 100, Number(m[2]), Number(m[3]))
  return value.includes('(') && !/^rgba?\(/i.test(value) ? normalise(value) : value
}

const read = (name: string): string =>
  parseColor(
    getComputedStyle(document.documentElement).getPropertyValue(name).trim(),
  )

export const token = {
  bg: () => read('--color-bg'),
  card: () => read('--color-card'),
  dock: () => read('--color-dock'),
  inset: () => read('--color-inset'),
  accent: () => read('--color-accent'),
  accentFg: () => read('--color-accent-fg'),
  ink: () => read('--color-ink'),
  inkMuted: () => read('--color-ink-muted'),
  inkFaint: () => read('--color-ink-faint'),
  inkDim: () => read('--color-ink-dim'),
  label: () => read('--color-label'),
  divider: () => read('--color-divider'),
  dash: () => read('--color-dash'),
  tile: () => read('--color-tile'),
  track: () => read('--color-track'),
  hint: () => read('--color-hint'),
  expense: () => read('--color-expense'),
  income: () => read('--color-income'),
}

/**
 * Category slots, in the fixed assignment order.
 *
 * The first six are the original set and stay first: they are the six most
 * separated hues available, so anything that consumes the palette in order gets
 * the most distinguishable colours before it reaches the rest.
 *
 * The last four fill the widest gaps left on the hue circle — olive between
 * ochre and moss, sky between teal and slate, indigo between slate and plum,
 * rose between plum and terracotta. They are new hues rather than lighter or
 * darker takes on the first six: two tints of one hue are exactly what is hard
 * to tell apart at the size these are drawn.
 */
export const CATEGORY_COLORS = [
  'moss',
  'ochre',
  'slate',
  'terracotta',
  'teal',
  'plum',
  'olive',
  'sky',
  'indigo',
  'rose',
] as const

export type CategoryColor = (typeof CATEGORY_COLORS)[number]

/**
 * The categorical chart palette — the original six, in order, and never past
 * the end; a seventh series folds into "Other". Deliberately not all of
 * `CATEGORY_COLORS`: a chart wants maximum separation between adjacent series,
 * which is what the first six are.
 */
export const CHART_COLORS = CATEGORY_COLORS.slice(0, 6)

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

/**
 * The OKLCH lightness of a category slot, 0–1.
 *
 * The colour field behind the entry and detail screens mixes a slot into the
 * ground, and the pale slots — olive at hue 97, teal at 165, sky at 195 — swamp
 * the keypad at the same mix percentage the dark ones want. The handoff asks
 * for that clamp to be *derived* rather than kept as a per-category table, and
 * lightness is what the three have in common. Falls back to the mid-palette
 * value if a slot is ever authored in a notation the regex misses, which keeps
 * the field drawable rather than blank.
 */
export const categoryLightness = (name: string | null | undefined): number => {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(`--color-${resolveCategoryColor(name)}`)
    .trim()
  const m = OKLCH.exec(raw)
  return m ? Number(m[1]) / 100 : 0.68
}

export const seriesPalette = (): string[] =>
  CHART_COLORS.map((c) => read(`--color-${c}`))
