import { useGoBack } from '@/app/useGoBack'
import { ChevronLeft } from 'lucide-react'
import { FullScreen } from '@/app/AppShell'
import { useTheme } from '@/theme/ThemeProvider'
import { ACCENT_LABELS, ACCENT_ORDER, ACCENTS, TINTS, type Mode } from '@/theme/theme'
import { asMinor, formatSigned } from '@/lib/money'

const MODES: { key: Mode; label: string }[] = [
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
  { key: 'system', label: 'System' },
]

function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[]
  value: T
  onChange: (next: T) => void
}) {
  return (
    <div className="flex gap-2">
      {options.map((option) => {
        const active = option.key === value
        return (
          <button
            key={String(option.key)}
            onClick={() => onChange(option.key)}
            className="flex-1 rounded-[4px] py-2 font-sans text-[12.5px]"
            style={{
              border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-line)'}`,
              color: active ? 'var(--color-accent)' : 'var(--color-ink-muted)',
            }}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export function AppearanceScreen() {
  const goBack = useGoBack()
  const { prefs, resolvedMode, setPrefs } = useTheme()

  return (
    <FullScreen>
      <header className="flex flex-none items-center gap-3 px-5 pt-3 pb-2">
        <button onClick={goBack} aria-label="Back" className="text-ink-muted">
          <ChevronLeft size={22} strokeWidth={1.5} />
        </button>
        <h1 className="text-[18px]">Appearance</h1>
      </header>

      <div className="no-scrollbar flex-1 overflow-y-auto px-5 pb-10">
        <section>
          <div className="kicker pt-4 pb-2.5 text-ink-muted">Ground</div>
          <Segmented
            options={MODES}
            value={prefs.mode}
            onChange={(mode) => setPrefs({ mode })}
          />
        </section>

        <section>
          <div className="kicker pt-7 pb-2.5 text-ink-muted">Accent</div>
          <div className="grid grid-cols-3 gap-2">
            {ACCENT_ORDER.map((name) => {
              const active = prefs.accent === name
              const swatch =
                resolvedMode === 'dark' ? ACCENTS[name].dark : ACCENTS[name].light
              return (
                <button
                  key={name}
                  onClick={() => setPrefs({ accent: name })}
                  className="flex flex-col items-center gap-2 rounded-[4px] py-3.5"
                  style={{
                    border: `1px solid ${active ? swatch : 'var(--color-line)'}`,
                    color: active ? swatch : 'var(--color-ink-muted)',
                  }}
                >
                  <span
                    className="size-6 rounded-full"
                    style={{ border: `2px solid ${swatch}` }}
                  />
                  <span className="font-sans text-[11.5px]">{ACCENT_LABELS[name]}</span>
                </button>
              )
            })}
          </div>
        </section>

        <section>
          <div className="kicker pt-7 pb-2.5 text-ink-muted">Ground tint</div>
          <Segmented
            options={TINTS.map((t) => ({ key: t.value, label: t.label }))}
            value={prefs.tint}
            onChange={(tint) => setPrefs({ tint })}
          />
          <div className="mt-3 flex gap-1.5">
            {TINTS.map((t) => (
              <div
                key={t.value}
                className="h-8 flex-1 rounded-[3px]"
                style={{
                  background: `oklch(${resolvedMode === 'dark' ? '17%' : '96%'} ${
                    resolvedMode === 'dark' ? t.value : 0.004
                  } var(--h))`,
                  border: '1px solid var(--color-line)',
                }}
              />
            ))}
          </div>
          {resolvedMode === 'light' && (
            <p className="mt-2 text-[11.5px] leading-[1.5] text-ink-muted">
              Tint shapes the dark ground. On a light ground it would not be
              visible, so this setting takes effect at night.
            </p>
          )}
        </section>

        <section>
          <div className="kicker pt-7 pb-2.5 text-ink-muted">Preview</div>
          <div
            className="rounded-[4px] p-4"
            style={{ border: '1px solid var(--color-line)', background: 'var(--color-surface)' }}
          >
            <div className="kicker text-ink-muted">Total wealth</div>
            <div className="tnum mt-1.5" style={{ fontSize: 30, letterSpacing: '-.02em' }}>
              {formatSigned(asMinor(-959172), { plus: false })}
            </div>
            <svg viewBox="0 0 280 64" className="mt-3 block w-full" height={64}>
              <defs>
                <linearGradient id="preview-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="var(--color-accent)" stopOpacity="0.18" />
                  <stop offset="1" stopColor="var(--color-accent)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d="M0,44 40,40 80,42 120,30 160,34 200,22 240,18 278,10 L280,64 L0,64 Z"
                fill="url(#preview-fill)"
              />
              <polyline
                fill="none"
                stroke="var(--color-accent)"
                strokeWidth="2"
                points="0,44 40,40 80,42 120,30 160,34 200,22 240,18 278,10"
              />
              <circle cx="278" cy="10" r="3.5" fill="var(--color-bg)" stroke="var(--color-accent)" strokeWidth="2" />
            </svg>
            <div className="mt-3 flex gap-3 font-sans text-[11.5px]">
              <span style={{ color: 'var(--color-income)' }}>+7 000,00</span>
              <span style={{ color: 'var(--color-expense)' }}>−101,22</span>
            </div>
          </div>
        </section>
      </div>
    </FullScreen>
  )
}
