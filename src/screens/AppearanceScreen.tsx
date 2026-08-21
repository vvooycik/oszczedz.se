import { IconArrowUpRight, IconCheck, IconPlus } from '@tabler/icons-react'
import { FullScreen } from '@/app/AppShell'
import { useGoBack } from '@/app/useGoBack'
import { Card, Divider } from '@/components/ui/Card'
import { Label } from '@/components/ui/Label'
import { SegmentedTrack } from '@/components/ui/SegmentedTrack'
import { Toggle } from '@/components/ui/Toggle'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { useTheme } from '@/theme/ThemeProvider'
import {
  ACCENT_LABELS,
  ACCENT_ORDER,
  ACCENTS,
  type AccentName,
  type Mode,
} from '@/theme/theme'
import { asMinor, formatSigned } from '@/lib/money'

const MODES: { key: Mode; label: string }[] = [
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
  // 'system' is the stored value; "Auto" is what it is called on screen, since
  // the phone is the system and nobody thinks of it that way.
  { key: 'system', label: 'Auto' },
]

/**
 * A miniature of the Home hero, rendered in the *candidate* accent.
 *
 * The point is judging a colour against the thing it will actually tint — a
 * swatch says nothing about how an accent reads under a 30px figure or on a
 * 36px square. It scopes `--color-accent` to itself, which is also what would
 * let it preview a colour before it is applied.
 */
function Preview({ accent }: { accent: AccentName }) {
  const { resolvedMode } = useTheme()
  const colour = resolvedMode === 'dark' ? ACCENTS[accent].dark : ACCENTS[accent].light

  return (
    <Card className="p-[18px]" style={{ ['--color-accent' as string]: colour }}>
      <div className="flex items-center justify-between">
        <Label>Total wealth</Label>
        <span
          className="flex items-center gap-[5px] rounded-full px-[9px] py-1 text-meta-sm font-semibold"
          style={{
            color: 'var(--color-income)',
            background: 'color-mix(in oklab, var(--color-income) 20%, transparent)',
          }}
        >
          <IconArrowUpRight size={12} stroke={2} />
          <span className="tnum">1 240,00 zł</span>
        </span>
      </div>

      <div
        className="tnum mt-2"
        style={{ fontSize: 'var(--text-stat-sm)', fontWeight: 600, lineHeight: 1, letterSpacing: '-0.035em' }}
      >
        {formatSigned(asMinor(95843), { plus: false })}
        <span
          className="text-ink-faint"
          style={{ fontSize: 'var(--text-stat-sm-unit)', fontWeight: 500, letterSpacing: 0 }}
        >
          {' '}
          zł
        </span>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <SegmentedTrack
          className="flex-1"
          options={[
            { key: '1M', label: '1M' },
            { key: '1Q', label: '1Q' },
            { key: '1Y', label: '1Y' },
          ]}
          value="1Y"
          onChange={() => {}}
        />
        <span className="flex size-9 flex-none items-center justify-center rounded-tile bg-accent text-accent-fg">
          <IconPlus size={18} stroke={2} />
        </span>
      </div>
    </Card>
  )
}

export function AppearanceScreen() {
  const goBack = useGoBack('/more')
  const { prefs, resolvedMode, setPrefs } = useTheme()

  return (
    <FullScreen>
      <ScreenHeader title="Appearance" onBack={goBack} size={19} />

      <div className="no-scrollbar flex flex-1 flex-col gap-[14px] overflow-y-auto px-4 pt-2 pb-10">
        <Preview accent={prefs.accent} />

        <section className="flex flex-col gap-2">
          <Label className="px-1">Accent</Label>
          <Card>
            {ACCENT_ORDER.map((name, index) => {
              const active = prefs.accent === name
              const swatch =
                resolvedMode === 'dark' ? ACCENTS[name].dark : ACCENTS[name].light
              return (
                <div key={name}>
                  {index > 0 && <Divider inset={55} />}
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => setPrefs({ accent: name })}
                    className="flex w-full items-center gap-[13px] px-4 py-[13px] text-left active:bg-press"
                  >
                    <span
                      className="size-[34px] flex-none rounded-tile-sm"
                      style={{ background: swatch }}
                    />
                    <span className="flex-1 text-row font-medium">
                      {ACCENT_LABELS[name]}
                    </span>
                    {active && (
                      <span className="flex size-[22px] flex-none items-center justify-center rounded-full bg-accent text-accent-fg">
                        <IconCheck size={14} stroke={2.5} />
                      </span>
                    )}
                  </button>
                </div>
              )
            })}
          </Card>
        </section>

        <section className="flex flex-col gap-2">
          <Label className="px-1">Theme</Label>
          <Card>
            <div className="px-4 py-[9px]">
              <SegmentedTrack
                options={MODES}
                value={prefs.mode}
                onChange={(mode) => setPrefs({ mode })}
              />
            </div>
            <Divider inset={0} />
            <div className="flex items-center gap-3 px-4 py-[13px]">
              <span className="min-w-0 flex-1">
                <span className="block text-row font-medium">
                  Tint surfaces with accent
                </span>
                <span className="mt-px block text-meta leading-[1.4] text-ink-muted">
                  Mixes a little of the accent into cards and the dock. Off keeps
                  every surface neutral.
                </span>
              </span>
              <Toggle
                label="Tint surfaces with accent"
                checked={prefs.tintSurfaces}
                onChange={(tintSurfaces) => setPrefs({ tintSurfaces })}
              />
            </div>
          </Card>
        </section>

        <p className="px-1 text-meta leading-[1.5] text-ink-muted">
          Expense red and income green never follow the accent. They are separated
          by lightness as well as hue, so the direction of money survives for the
          ~8% of men who cannot take the hue difference.
        </p>
      </div>
    </FullScreen>
  )
}
