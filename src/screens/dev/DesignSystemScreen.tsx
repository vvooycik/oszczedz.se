import { NavLink, useParams } from 'react-router'
import { ACCENTS, ACCENT_ORDER } from '@/theme/theme'
import { useTheme } from '@/theme/ThemeProvider'
import { Foundations } from './Foundations'
import { Components } from './Components'
import { Layout } from './Layout'
import { Audit } from './Audit'
import { Code } from './parts'

/**
 * The design system, written down.
 *
 * **Not reachable from the app.** No tab, no link, no row in More — it is typed
 * into the address bar. That is deliberate rather than lazy: this is a document
 * about the app for whoever is building it, and a route the user can stumble
 * into is a screen that has to be designed, explained and kept out of the way.
 *
 * **Lazily loaded, and that is not optional.** The app ships ~208 kB gzipped
 * initial and the figure is tracked commit by commit; a reference page that
 * imports every component in the system would land a meaningful slice of itself
 * in the chunk that the login screen waits for. It is behind a `lazy()` in
 * App.tsx, so it costs nothing until someone asks for it.
 *
 * **It reads the live tokens rather than restating them.** Every colour on this
 * page comes back out of `getComputedStyle`, so it re-themes with Appearance
 * and cannot drift from index.css the way a hand-written table would. The one
 * thing it does restate is the type scale — which is the finding, not the
 * method: there is nothing to read, because none of those sizes has a name.
 *
 * **It is the only screen not capped at `max-w-lg`.** A reference read on a
 * desktop while building a desktop layout should not be squeezed into the phone
 * frame it documents.
 */

const SECTIONS = [
  { key: 'tokens', label: 'Tokens', Panel: Foundations },
  { key: 'components', label: 'Components', Panel: Components },
  { key: 'layout', label: 'Layout', Panel: Layout },
  { key: 'audit', label: 'Audit', Panel: Audit },
] as const

type SectionKey = (typeof SECTIONS)[number]['key']

const isSection = (v: string | undefined): v is SectionKey =>
  SECTIONS.some((s) => s.key === v)

export default function DesignSystemScreen() {
  const { section } = useParams()
  const active = isSection(section) ? section : 'tokens'
  const { prefs, resolvedMode, setPrefs } = useTheme()

  const Panel = SECTIONS.find((s) => s.key === active)!.Panel

  return (
    <div className="min-h-screen bg-bg text-ink">
      <div className="mx-auto max-w-4xl px-5 pt-8 pb-24 sm:px-8">
        <header>
          <div className="text-kicker font-semibold tracking-[0.06em] text-label uppercase">
            oszczedz.se
          </div>
          <h1 className="mt-1 text-title font-semibold tracking-[-0.02em]">
            Design system
          </h1>
          <p className="mt-2 max-w-[62ch] text-value leading-[1.6] text-ink-muted">
            The live reference. Colours are read out of the running document, so
            everything below is the app as it is currently themed, not a copy of
            it. Not linked from anywhere — <Code>/dev/design-system</Code>.
          </p>
        </header>

        {/* The one control on the page: the appearance the reference is being
            read in. Every panel re-reads itself when this moves, which is the
            fastest way to check that a colour was defined in both modes. */}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 rounded-full bg-inset p-[3px]">
            {(['light', 'dark', 'system'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setPrefs({ mode })}
                className="rounded-full px-3 py-1.5 text-meta font-medium"
                style={
                  prefs.mode === mode
                    ? { background: 'var(--color-accent)', color: 'var(--color-accent-fg)' }
                    : { color: 'var(--color-ink-muted)' }
                }
              >
                {mode}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            {ACCENT_ORDER.map((accent) => (
              <button
                key={accent}
                type="button"
                aria-label={accent}
                onClick={() => setPrefs({ accent })}
                className="size-7 rounded-full text-meta-sm"
                style={{
                  // The accents are not tokens — they are literals in ACCENTS,
                  // and only the *selected* one is ever on `<html>`. Reaching
                  // for `--color-gold` painted the two swatches whose names are
                  // not also category slots as nothing at all.
                  background: ACCENTS[accent][resolvedMode],
                  boxShadow:
                    prefs.accent === accent
                      ? '0 0 0 2px var(--color-bg), 0 0 0 4px var(--color-ink)'
                      : 'inset 0 0 0 1px var(--color-divider)',
                }}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={() => setPrefs({ tintSurfaces: !prefs.tintSurfaces })}
            className="rounded-full bg-inset px-3 py-1.5 text-meta font-medium text-ink-muted"
          >
            tint surfaces: {prefs.tintSurfaces ? 'on' : 'off'}
          </button>

          <span className="text-meta-sm text-ink-dim">resolved: {resolvedMode}</span>
        </div>

        <nav className="sticky top-0 z-10 -mx-5 mt-7 flex gap-1 bg-bg px-5 py-3 sm:-mx-8 sm:px-8">
          {SECTIONS.map(({ key, label }) => (
            <NavLink
              key={key}
              to={`/dev/design-system/${key}`}
              className="rounded-full px-3.5 py-1.5 text-value font-medium"
              style={
                key === active
                  ? {
                      color: 'var(--color-accent)',
                      background:
                        'color-mix(in oklab, var(--color-accent) 16%, transparent)',
                    }
                  : { color: 'var(--color-ink-muted)' }
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <Panel />
      </div>
    </div>
  )
}
