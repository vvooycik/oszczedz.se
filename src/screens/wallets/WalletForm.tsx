import { useState } from 'react'
import { IconCheck, IconChevronRight } from '@tabler/icons-react'
import { Sheet } from '@/components/Sheet'
import { Card } from '@/components/ui/Card'
import { Label } from '@/components/ui/Label'
import { Tile } from '@/components/ui/Tile'
import { GLYPH_CHOICES, iconFor } from '@/lib/icons'
import { keepFocus } from '@/lib/touch'
import { WALLET_TYPES } from '@/lib/wallets'
import { CATEGORY_COLORS, categoryVar } from '@/theme/tokens'
import type { WalletType } from '@/lib/db'

/**
 * The pieces both wallet forms draw. Create and edit differ in what they may
 * change — type is fixed after creation, and a balance means something different
 * once there are transactions behind it — but the identity block is the same
 * object on both, so it lives here rather than in two near-copies.
 */

/** Name, mark and colour: everything about a wallet that is not a number. */
export function WalletIdentityCard({
  name,
  onName,
  glyph,
  onGlyph,
  colour,
  onColour,
  type,
}: {
  name: string
  onName: (next: string) => void
  /** Null means "no choice yet" and falls back to the type's own mark. */
  glyph: string | null
  onGlyph: (next: string) => void
  colour: string
  onColour: (next: string) => void
  type: WalletType
}) {
  const [picking, setPicking] = useState(false)
  const effective = glyph ?? WALLET_TYPES.find((t) => t.key === type)?.glyph ?? 'wallet'
  const Icon = iconFor(effective)

  return (
    <>
      <Card className="p-[18px]">
        <div className="flex items-center gap-[13px]">
          <button
            type="button"
            aria-label="Change icon"
            onMouseDown={keepFocus}
            onClick={() => setPicking(true)}
            className="flex-none active:opacity-70"
          >
            <Tile color={categoryVar(colour)} size={52}>
              <Icon size={26} stroke={2} />
            </Tile>
          </button>

          <div className="min-w-0 flex-1">
            <input
              value={name}
              onChange={(e) => onName(e.target.value)}
              placeholder="Wallet name"
              aria-label="Wallet name"
              className="w-full bg-transparent text-[17px] font-semibold outline-none placeholder:text-ink-faint"
            />
            <div className="mt-0.5 text-[12.5px] text-ink-muted">
              Tap the tile to change icon
            </div>
          </div>

          <IconChevronRight size={18} stroke={2} className="flex-none text-ink-dim" />
        </div>

        {/* All ten slots, wrapping. The handoff's row shows seven, but the
            category palette has ten and a wallet drawn from a narrower set
            would be the only place in the app where a colour is unavailable
            for no stated reason. */}
        <div className="mt-4 flex flex-wrap gap-[9px]">
          {CATEGORY_COLORS.map((slot) => {
            const active = colour === slot
            return (
              <button
                key={slot}
                type="button"
                aria-label={slot}
                aria-pressed={active}
                onMouseDown={keepFocus}
                onClick={() => onColour(slot)}
                className="relative size-[26px] flex-none rounded-[9px] after:absolute after:-inset-2 after:content-['']"
                style={{
                  background: `var(--color-${slot})`,
                  // A card-coloured gap, then the accent: the ring has to clear
                  // the swatch's own colour to read at 26px.
                  boxShadow: active
                    ? '0 0 0 2px var(--color-card), 0 0 0 4px var(--color-accent)'
                    : undefined,
                }}
              />
            )
          })}
        </div>
      </Card>

      <Sheet
        open={picking}
        onClose={() => setPicking(false)}
        height="62%"
        label="Choose an icon"
      >
        <div className="px-4 pb-2">
          <Label>Icon</Label>
        </div>
        <div className="no-scrollbar grid flex-1 grid-cols-6 gap-2 overflow-y-auto px-4 pb-8">
          {GLYPH_CHOICES.map((name) => {
            const Option = iconFor(name)
            const active = effective === name
            return (
              <button
                key={name}
                type="button"
                aria-label={name}
                aria-pressed={active}
                onMouseDown={keepFocus}
                onClick={() => {
                  onGlyph(name)
                  setPicking(false)
                }}
                className="flex aspect-square items-center justify-center rounded-tile-sm"
                style={
                  active
                    ? {
                        background: `color-mix(in oklab, ${categoryVar(colour)} var(--tile-mix), transparent)`,
                        color: categoryVar(colour),
                      }
                    : { background: 'var(--color-tile)', color: 'var(--color-ink-muted)' }
                }
              >
                <Option size={21} stroke={2} />
              </button>
            )
          })}
        </div>
      </Sheet>
    </>
  )
}

/** A label/value row inside a settings card, with a right-aligned figure. */
export function SettingRow({
  label,
  children,
  invalid = false,
}: {
  label: string
  children: React.ReactNode
  invalid?: boolean
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-[13px]">
      <span
        className="flex-1 text-[15px] font-medium"
        style={{ color: invalid ? 'var(--color-expense)' : undefined }}
      >
        {label}
      </span>
      {children}
    </div>
  )
}

/** The tabular figure input those rows carry. */
export function AmountInput({
  value,
  onChange,
  label,
  unit = 'zł',
  placeholder = '0,00',
  invalid = false,
  numeric = false,
}: {
  value: string
  onChange: (next: string) => void
  label: string
  unit?: string
  placeholder?: string
  invalid?: boolean
  /** Whole numbers — the loan's settlement count, not money. */
  numeric?: boolean
}) {
  return (
    <span className="flex items-baseline gap-1.5">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        // `decimal` rather than `numeric` for money: iOS shows the separator
        // key, and amounts are typed with one.
        inputMode={numeric ? 'numeric' : 'decimal'}
        placeholder={placeholder}
        aria-label={label}
        className="tnum w-32 bg-transparent text-right text-[16px] font-semibold outline-none placeholder:text-ink-faint"
        style={{ color: invalid ? 'var(--color-expense)' : undefined }}
      />
      <span className="text-[13px] text-ink-faint">{unit}</span>
    </span>
  )
}

/** The four wallet types, in a drawer, because each needs a line of blurb. */
export function TypeSheet({
  open,
  onClose,
  value,
  onChange,
}: {
  open: boolean
  onClose: () => void
  value: WalletType
  onChange: (next: WalletType) => void
}) {
  return (
    <Sheet open={open} onClose={onClose} height="52%" label="Wallet type">
      <div className="px-4 pb-2">
        <Label>Type</Label>
      </div>
      <div className="flex flex-col gap-2 px-4 pb-8">
        {WALLET_TYPES.map((option) => {
          const active = value === option.key
          const Icon = iconFor(option.glyph)
          return (
            <button
              key={option.key}
              type="button"
              onMouseDown={keepFocus}
              onClick={() => {
                onChange(option.key)
                onClose()
              }}
              className="flex items-center gap-[13px] rounded-field bg-inset px-4 py-3 text-left active:opacity-80"
            >
              <Tile size={38} variant="neutral">
                <Icon size={18} stroke={2} />
              </Tile>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium">{option.label}</span>
                <span className="block text-[12.5px] text-ink-muted">
                  {option.blurb}
                </span>
              </span>
              {active && (
                <span className="flex size-[22px] flex-none items-center justify-center rounded-full bg-accent text-accent-fg">
                  <IconCheck size={14} stroke={2.5} />
                </span>
              )}
            </button>
          )
        })}
      </div>
    </Sheet>
  )
}
