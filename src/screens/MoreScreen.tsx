import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import {
  IconCategory,
  IconChevronRight,
  IconCloudUpload,
  IconCurrencyZloty,
  IconInfoCircle,
  IconLogout,
  IconPalette,
  IconRepeat,
  IconTag,
  IconWallet,
} from '@tabler/icons-react'
import { Card, Divider } from '@/components/ui/Card'
import { Label } from '@/components/ui/Label'
import { Tile } from '@/components/ui/Tile'
import { Button } from '@/components/ui/Button'
import { SegmentedTrack } from '@/components/ui/SegmentedTrack'
import { useCategories, useSchedules, useTags, useWallets } from '@/data/queries'
import { buildTransactionsCsv, downloadCsv } from '@/lib/export'
import { supabase } from '@/lib/supabase'
import { useTheme } from '@/theme/ThemeProvider'
import { ACCENT_LABELS, ACCENT_ORDER, ACCENTS, type Mode } from '@/theme/theme'
import { today } from '@/lib/dates'
import { categoryVar } from '@/theme/tokens'

const MODES: { key: Mode; label: string }[] = [
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
  // 'system' is the stored value; "Auto" is what it is called on screen, since
  // the phone is the system and nobody thinks of it that way.
  { key: 'system', label: 'Auto' },
]

/** A navigation row: tinted tile, name, a quiet value, chevron. */
function NavRow({
  to,
  onClick,
  icon,
  hue,
  name,
  value,
}: {
  to?: string
  onClick?: () => void
  icon: React.ReactNode
  /** A category slot, or nothing for the neutral tile the App group uses. */
  hue?: string
  name: string
  value?: React.ReactNode
}) {
  const body = (
    <>
      <Tile
        size={36}
        color={hue ? categoryVar(hue) : undefined}
        variant={hue ? 'tint' : 'neutral'}
      >
        {icon}
      </Tile>
      <span className="flex-1 truncate text-row font-medium">{name}</span>
      {value != null && <span className="text-value text-ink-muted">{value}</span>}
      <IconChevronRight size={18} stroke={2} className="flex-none text-ink-dim" />
    </>
  )

  const className =
    'flex w-full items-center gap-[13px] px-4 py-[13px] text-left active:bg-press'

  return to ? (
    <Link to={to} className={className}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={className}>
      {body}
    </button>
  )
}

export function MoreScreen() {
  const navigate = useNavigate()
  const { prefs, resolvedMode, setPrefs } = useTheme()
  const categories = useCategories()
  const wallets = useWallets()
  const tags = useTags()
  const schedules = useSchedules()

  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const runExport = async () => {
    setExporting(true)
    setExportError(null)
    try {
      const csv = await buildTransactionsCsv(wallets.data ?? [], categories.data ?? [])
      downloadCsv(csv, `oszczedz-se-${today()}.csv`)
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Could not build the file')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex flex-col gap-[14px] px-4 pt-1">
      <h1 className="px-1 text-title-sm font-semibold tracking-[-0.02em]">More</h1>

      <section className="flex flex-col gap-2">
        <Label className="px-1">Data</Label>
        <Card>
          <NavRow
            to="/categories"
            icon={<IconCategory size={18} stroke={2} />}
            hue="ochre"
            name="Categories"
            value={categories.data?.length ?? '—'}
          />
          <Divider inset={57} />
          <NavRow
            to="/wallets"
            icon={<IconWallet size={18} stroke={2} />}
            hue="moss"
            name="Wallets"
            value={wallets.data?.length ?? '—'}
          />
          <Divider inset={57} />
          <NavRow
            to="/tags"
            icon={<IconTag size={18} stroke={2} />}
            hue="indigo"
            name="Tags"
            value={tags.data?.length ?? '—'}
          />
          <Divider inset={57} />
          {/* Counted active-only: a paused rule writes nothing, and a row
              reading "6" over five that actually charge would be the screen
              disagreeing with the Upcoming list. */}
          <NavRow
            to="/scheduled"
            icon={<IconRepeat size={18} stroke={2} />}
            hue="teal"
            name="Scheduled"
            value={
              schedules.data
                ? schedules.data.filter((s) => s.active).length
                : '—'
            }
          />
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <Label className="px-1">Appearance</Label>
        <Card>
          {/* The accent row opens the full picker; the swatches under it apply
              on tap. Both, because changing accent is the thing people come
              here for, and a screen away is a screen too far for a colour you
              want to see against your own data. */}
          <NavRow
            onClick={() => navigate('/appearance')}
            icon={<IconPalette size={18} stroke={2} />}
            name="Accent"
            value={ACCENT_LABELS[prefs.accent]}
          />

          {/* `aspect-square` alone sizes these off the row's width, which is
              fine at 390 (~48px each) and absurd at the 512 the frame caps at
              on a desktop, where they became 72px slabs. The max-width holds
              them at a swatch; `justify-between` spends the slack on the gaps
              instead of on the squares. */}
          <div className="flex justify-between gap-2 px-4 pb-3.5">
            {ACCENT_ORDER.map((accentName) => {
              const active = prefs.accent === accentName
              const swatch =
                resolvedMode === 'dark'
                  ? ACCENTS[accentName].dark
                  : ACCENTS[accentName].light
              return (
                <button
                  key={accentName}
                  type="button"
                  aria-label={ACCENT_LABELS[accentName]}
                  aria-pressed={active}
                  onClick={() => setPrefs({ accent: accentName })}
                  className="relative aspect-square max-w-11 flex-1 rounded-tile after:absolute after:-inset-1.5 after:content-['']"
                  style={{
                    background: swatch,
                    boxShadow: active
                      ? '0 0 0 2px var(--color-card), 0 0 0 4px var(--color-accent)'
                      : undefined,
                  }}
                />
              )
            })}
          </div>

          <Divider inset={0} />

          <div className="flex items-center gap-3 px-4 py-[13px]">
            <span className="flex-1 text-row font-medium">Theme</span>
            <SegmentedTrack
              className="w-[200px]"
              options={MODES}
              value={prefs.mode}
              onChange={(mode) => setPrefs({ mode })}
            />
          </div>
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <Label className="px-1">App</Label>
        <Card>
          <NavRow
            onClick={runExport}
            icon={<IconCloudUpload size={18} stroke={2} />}
            name={exporting ? 'Preparing…' : 'Export data'}
            value="CSV"
          />
          <Divider inset={57} />
          <div className="flex items-center gap-[13px] px-4 py-[13px]">
            <Tile size={36} variant="neutral">
              <IconCurrencyZloty size={18} stroke={2} />
            </Tile>
            <span className="flex-1 text-row font-medium">Currency</span>
            <span className="text-value text-ink-muted">PLN · zł</span>
          </div>
          <Divider inset={57} />
          <div className="flex items-center gap-[13px] px-4 py-[13px]">
            <Tile size={36} variant="neutral">
              <IconInfoCircle size={18} stroke={2} />
            </Tile>
            <span className="flex-1 text-row font-medium">About</span>
            <span className="tnum text-value text-ink-muted">
              {__APP_VERSION__}
            </span>
          </div>
        </Card>
        {exportError && (
          <p className="px-1 text-meta text-expense">{exportError}</p>
        )}
      </section>

      <Button variant="secondary" className="mt-2" onClick={() => supabase.auth.signOut()}>
        <span className="flex items-center justify-center gap-2">
          <IconLogout size={17} stroke={2} />
          Sign out
        </span>
      </Button>
    </div>
  )
}
