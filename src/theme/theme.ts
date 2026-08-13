/**
 * The appearance model: an accent, a mode, and one switch deciding whether the
 * accent touches the surfaces at all.
 */

export const ACCENTS = {
  ink: { hue: 255, light: 'oklch(52% 0.14 255)', dark: 'oklch(76% 0.12 255)' },
  gold: { hue: 85, light: 'oklch(54% 0.12 85)', dark: 'oklch(74% 0.13 85)' },
  copper: { hue: 40, light: 'oklch(52% 0.13 40)', dark: 'oklch(68% 0.13 40)' },
  moss: { hue: 155, light: 'oklch(50% 0.11 155)', dark: 'oklch(70% 0.12 155)' },
  plum: { hue: 300, light: 'oklch(50% 0.12 300)', dark: 'oklch(66% 0.12 300)' },
  slate: { hue: 200, light: 'oklch(50% 0.09 200)', dark: 'oklch(72% 0.1 200)' },
} as const

export type AccentName = keyof typeof ACCENTS

export const ACCENT_ORDER: AccentName[] = [
  'gold',
  'copper',
  'ink',
  'moss',
  'plum',
  'slate',
]

export const ACCENT_LABELS: Record<AccentName, string> = {
  gold: 'Gold',
  copper: 'Copper',
  ink: 'Ink',
  moss: 'Moss',
  plum: 'Plum',
  slate: 'Slate',
}

/**
 * The palette before the visual refresh had `claret` and `olive` where `slate`
 * and `moss` now sit. A stored preference names one of six strings, so without
 * this the two retired names would fail `normalisePrefs` and silently reset a
 * deliberate choice to Gold.
 */
const RETIRED_ACCENTS: Record<string, AccentName> = {
  claret: 'copper',
  olive: 'moss',
}

/** How much accent is mixed into cards and the dock when tinting is on. */
export const SURFACE_TINT = '4%'

export type Mode = 'light' | 'dark' | 'system'

export type ThemePrefs = {
  mode: Mode
  accent: AccentName
  /** Mixes a little accent into `--c-card` / `--c-dock`. Off by default. */
  tintSurfaces: boolean
}

export const DEFAULT_PREFS: ThemePrefs = {
  mode: 'system',
  accent: 'gold',
  tintSurfaces: false,
}

export const THEME_STORAGE_KEY = 'oszczedz.theme'

/** Resolves 'system' against the OS setting. */
export const resolveMode = (mode: Mode): 'light' | 'dark' =>
  mode === 'system'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'
    : mode

/**
 * oklch() → `#rrggbb`.
 *
 * Two consumers need a colour outside the CSS custom-property system, both
 * because something downstream cannot resolve `oklch()`:
 *
 * - iOS reads `<meta name="theme-color">` to paint the status bar strip, and a
 *   meta tag resolves neither `var()` nor, dependably, `oklch()`.
 * - zrender's colour parser predates oklch. Canvas understands it, so a flat
 *   fill happens to work, but anything that *interpolates* — a gradient, which
 *   is what a piecewise `visualMap` compiles to — parses the string first, gets
 *   undefined, and throws. See `parseColor` in tokens.ts.
 *
 * Everything else must keep going through the tokens.
 */
export function oklchToHex(lightness: number, chroma: number, hueDeg: number): string {
  const h = (hueDeg * Math.PI) / 180
  const a = chroma * Math.cos(h)
  const b = chroma * Math.sin(h)

  // OKLab → LMS → linear sRGB (Björn Ottosson's matrices).
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3

  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]

  return (
    '#' +
    linear
      .map((v) => {
        const encoded = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055
        return Math.round(Math.min(1, Math.max(0, encoded)) * 255)
          .toString(16)
          .padStart(2, '0')
      })
      .join('')
  )
}

/**
 * The resolved ground, matching the `--c-bg` definitions in index.css.
 *
 * Two constants rather than a computation: the ground no longer takes the
 * accent's hue or a user-chosen chroma, so there is nothing left to vary. The
 * pre-paint script in index.html carries the same two strings, which is why it
 * no longer needs a copy of the OKLab matrix.
 */
export const GROUND_HEX = {
  light: oklchToHex(0.965, 0.004, 262),
  dark: oklchToHex(0.15, 0.008, 262),
} as const

/**
 * Writes the theme onto <html>. Everything else in the app reads these
 * variables through Tailwind tokens — nothing should set a colour directly.
 */
export function applyTheme(prefs: ThemePrefs) {
  const resolved = resolveMode(prefs.mode)
  const accent = ACCENTS[prefs.accent] ?? ACCENTS.gold
  const root = document.documentElement

  root.dataset.mode = resolved
  root.style.setProperty('--h', String(accent.hue))
  root.style.setProperty('--c-accent', resolved === 'dark' ? accent.dark : accent.light)
  root.style.setProperty('--c-accent-mix', prefs.tintSurfaces ? SURFACE_TINT : '0%')
  root.style.colorScheme = resolved

  // The status bar is iOS's to paint now that it is no longer translucent, so
  // hand it the ground rather than let it pick.
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', GROUND_HEX[resolved])
}

/** Tolerates partial or stale stored shapes rather than throwing on boot. */
export function normalisePrefs(raw: unknown): ThemePrefs {
  const p = (raw ?? {}) as Partial<ThemePrefs> & { tint?: unknown }
  const accent = typeof p.accent === 'string' ? p.accent : ''

  return {
    mode:
      p.mode === 'light' || p.mode === 'dark' || p.mode === 'system'
        ? p.mode
        : DEFAULT_PREFS.mode,
    accent:
      accent in ACCENTS
        ? (accent as AccentName)
        : (RETIRED_ACCENTS[accent] ?? DEFAULT_PREFS.accent),
    // `tint` is the retired four-step ground chroma. Anything above zero was a
    // deliberate "I want to see the accent in the ground", which is what the
    // switch now means.
    tintSurfaces:
      typeof p.tintSurfaces === 'boolean'
        ? p.tintSurfaces
        : Number(p.tint ?? 0) > 0,
  }
}
