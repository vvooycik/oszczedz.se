import { createContext, use, useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import {
  applyTheme,
  DEFAULT_PREFS,
  normalisePrefs,
  resolveMode,
  THEME_STORAGE_KEY,
  type ThemePrefs,
} from './theme'

type ThemeContextValue = {
  prefs: ThemePrefs
  resolvedMode: 'light' | 'dark'
  setPrefs: (next: Partial<ThemePrefs>) => void
}

const ThemeContext = createContext<ThemeContextValue>({
  prefs: DEFAULT_PREFS,
  resolvedMode: 'dark',
  setPrefs: () => {},
})

const readCache = (): ThemePrefs | null => {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY)
    return raw ? normalisePrefs(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

/**
 * Cache-aside persistence: localStorage is the fast path, `user_settings` the
 * durable copy.
 *
 * On boot we apply the cached prefs synchronously and make no network call at
 * all. Only a cold cache — new device, cleared storage — falls through to the
 * database. Writes go to both, so the two can only diverge if a write fails,
 * and the next cold boot repairs that from the server copy.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [prefs, setState] = useState<ThemePrefs>(() => readCache() ?? DEFAULT_PREFS)
  const [resolvedMode, setResolvedMode] = useState(() => resolveMode(prefs.mode))
  const hadCache = useRef(readCache() !== null)

  // Cold cache only: fetch the durable copy. maybeSingle so a user with no row
  // yet is not an error.
  useEffect(() => {
    if (hadCache.current) return
    let cancelled = false

    supabase
      .from('user_settings')
      .select('mode, accent, tint_surfaces')
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled || error || !data) return
        const next = normalisePrefs({ ...data, tintSurfaces: data.tint_surfaces })
        setState(next)
        localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(next))
      })

    return () => {
      cancelled = true
    }
  }, [])

  // Apply on every change, and track the OS setting while mode is 'system'.
  useEffect(() => {
    applyTheme(prefs)
    setResolvedMode(resolveMode(prefs.mode))

    if (prefs.mode !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      applyTheme(prefs)
      setResolvedMode(resolveMode(prefs.mode))
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [prefs])

  const setPrefs = useCallback((patch: Partial<ThemePrefs>) => {
    setState((current) => {
      const next = normalisePrefs({ ...current, ...patch })
      localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(next))

      // Durable copy is best-effort — the UI has already updated and a failed
      // write self-heals on the next cold boot — but it must actually be sent.
      // A supabase-js builder is a lazy thenable: it only issues the request
      // when subscribed, so `void builder` would silently never run.
      // The row's column is `tint_surfaces`; the pref is `tintSurfaces`. Spell
      // the payload out rather than spreading `next`, so a rename on either
      // side is a type error instead of a silently ignored column.
      supabase
        .from('user_settings')
        .upsert(
          { mode: next.mode, accent: next.accent, tint_surfaces: next.tintSurfaces },
          { onConflict: 'user_id' },
        )
        .then(({ error }) => {
          if (error) console.warn('Could not persist theme settings:', error.message)
        })

      return next
    })
  }, [])

  return (
    <ThemeContext value={{ prefs, resolvedMode, setPrefs }}>{children}</ThemeContext>
  )
}

export const useTheme = () => use(ThemeContext)
