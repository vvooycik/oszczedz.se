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
