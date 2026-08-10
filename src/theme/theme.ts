/**
 * The appearance model: a theme is one hue applied at several lightnesses,
 * parameterised by two user settings — accent and ground tint.
 */

export const ACCENTS = {
  gold: { hue: 85, light: '#b68235', dark: '#e1ad66' },
  copper: { hue: 48, light: 'oklch(56% 0.13 48)', dark: 'oklch(72% 0.13 48)' },
  claret: { hue: 18, light: 'oklch(45% 0.13 18)', dark: 'oklch(67% 0.13 18)' },
  olive: { hue: 120, light: 'oklch(50% 0.08 120)', dark: 'oklch(74% 0.08 120)' },
  ink: { hue: 252, light: 'oklch(46% 0.09 252)', dark: 'oklch(72% 0.09 252)' },
  plum: { hue: 340, light: 'oklch(48% 0.12 340)', dark: 'oklch(70% 0.12 340)' },
} as const

export type AccentName = keyof typeof ACCENTS

export const ACCENT_ORDER: AccentName[] = [
  'gold',
  'copper',
  'claret',
  'olive',
  'ink',
  'plum',
]

export const ACCENT_LABELS: Record<AccentName, string> = {
  gold: 'Gold',
  copper: 'Copper',
  claret: 'Claret',
  olive: 'Olive',
  ink: 'Ink',
  plum: 'Plum',
}

/** Chroma applied to the dark ground. Above ~0.02 it reads as a coloured screen. */
export const TINTS = [
  { value: 0, label: 'None' },
  { value: 0.008, label: 'Slight' },
  { value: 0.014, label: 'Warm' },
  { value: 0.026, label: 'Strong' },
] as const

export type Tint = (typeof TINTS)[number]['value']
export type Mode = 'light' | 'dark' | 'system'

export type ThemePrefs = {
  mode: Mode
  accent: AccentName
  tint: Tint
}

export const DEFAULT_PREFS: ThemePrefs = {
  mode: 'system',
  accent: 'gold',
  tint: 0.008,
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
 * The one place a colour has to leave the CSS custom-property system: iOS reads
 * `<meta name="theme-color">` to paint the status bar strip, and a meta tag
 * resolves neither `var()` nor, dependably, `oklch()`. Everything else must keep
 * going through the tokens.
 */
function oklchToHex(lightness: number, chroma: number, hueDeg: number): string {
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

/** The resolved ground, matching the `--c-bg` definitions in index.css. */
const groundHex = (mode: 'light' | 'dark', tint: number, hue: number): string =>
  mode === 'dark' ? oklchToHex(0.17, tint, hue) : oklchToHex(0.96, 0.004, hue)

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
  root.style.setProperty('--tint', String(prefs.tint))
  root.style.setProperty('--c-accent', resolved === 'dark' ? accent.dark : accent.light)
  root.style.colorScheme = resolved

  // The status bar is iOS's to paint now that it is no longer translucent, so
  // hand it the ground rather than let it pick.
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', groundHex(resolved, prefs.tint, accent.hue))
}

/** Tolerates partial or stale stored shapes rather than throwing on boot. */
export function normalisePrefs(raw: unknown): ThemePrefs {
  const p = (raw ?? {}) as Partial<ThemePrefs>
  return {
    mode: p.mode === 'light' || p.mode === 'dark' || p.mode === 'system'
      ? p.mode
      : DEFAULT_PREFS.mode,
    accent: p.accent && p.accent in ACCENTS ? p.accent : DEFAULT_PREFS.accent,
    tint: TINTS.some((t) => t.value === p.tint)
      ? (p.tint as Tint)
      : DEFAULT_PREFS.tint,
  }
}
