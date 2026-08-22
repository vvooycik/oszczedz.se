import { useState, type ReactNode } from 'react'
import { IconChevronRight, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react'
import { Button, ActionTile } from '@/components/ui/Button'
import { Card, CardRow, Divider } from '@/components/ui/Card'
import { Label, LabelRow } from '@/components/ui/Label'
import { SegmentedTrack } from '@/components/ui/SegmentedTrack'
import { Toggle } from '@/components/ui/Toggle'
import { Tile, glyphSize } from '@/components/ui/Tile'
import { CategoryGlyph } from '@/components/CategoryGlyph'
import { MonthStepper } from '@/components/MonthStepper'
import { Sparkline } from '@/components/Sparkline'
import { iconFor } from '@/lib/icons'
import { categoryVar } from '@/theme/tokens'
import { startOfMonth, today } from '@/lib/dates'
import { Block, Code, Section } from './parts'

const TREND = [1200, 1450, 900, 1800, 1650, 2100, 1900, 2400]

function Mark({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      {children}
      <span className="text-kicker text-ink-dim">{label}</span>
    </div>
  )
}

export function Components() {
  const [segment, setSegment] = useState('1Q')
  const [on, setOn] = useState(true)
  const [month, setMonth] = useState(() => startOfMonth(today()))

  return (
    <>
      <Section
        id="surface"
        title="Surfaces"
        lead={
          <>
            <Code>Card</Code> is the surface everything sits on, and it carries{' '}
            <Code>flex: none</Code> for a reason that is not decoration: cards
            live in scrolling flex columns, and without it a long feed squeezes
            the ones above it instead of scrolling.
          </>
        }
      >
        <Block title="Card, CardRow, Divider">
          <Card className="max-w-sm">
            <CardRow>
              <span className="flex-1 text-row font-medium">A row</span>
              <span className="text-value text-ink-muted">value</span>
              <IconChevronRight size={18} stroke={2} className="text-ink-dim" />
            </CardRow>
            <Divider inset={16} />
            <CardRow>
              <Tile size={40} variant="neutral">
                {(() => {
                  const Icon = iconFor('wallet')
                  return <Icon size={glyphSize(40)} stroke={2} />
                })()}
              </Tile>
              <span className="flex-1 text-row font-medium">With a tile</span>
            </CardRow>
            <Divider />
            <CardRow press={false}>
              <span className="flex-1 text-value text-ink-muted">
                press={'{false}'} — a row that does not navigate
              </span>
            </CardRow>
          </Card>
          <p className="mt-2 max-w-[62ch] text-meta-sm text-ink-muted">
            The divider's default 61px inset is a 40px tile at 16px padding plus
            the 13px gap. A row with different leading passes its own.
          </p>
        </Block>

        <Block title="Label and LabelRow">
          <div className="max-w-sm">
            <LabelRow trailing={<span className="text-meta font-semibold text-accent">See all</span>}>
              Section label
            </LabelRow>
            <div className="mt-2">
              <Label>Plain label</Label>
            </div>
          </div>
        </Block>
      </Section>

      <Section
        id="controls"
        title="Controls"
        lead={
          <>
            Every control that sits beside a text field carries{' '}
            <Code>keepFocus</Code> on <Code>onMouseDown</Code> — without it, the
            first tap after typing is spent dismissing the keyboard and never
            reaches the button.
          </>
        }
      >
        <Block title="Button">
          <div className="flex max-w-sm flex-col gap-3">
            <Button>primary — the accent</Button>
            <Button variant="secondary">secondary — inset fill</Button>
            <Button tone={categoryVar('terracotta')}>
              primary + tone — a category-coloured commit
            </Button>
            <Button disabled>disabled — 40% and no press</Button>
          </div>
          <p className="mt-2 max-w-[62ch] text-meta-sm text-ink-muted">
            A third variant, <Code>scrim</Code>, exists and is used nowhere. See
            the Audit.
          </p>
        </Block>

        <Block
          title="ActionTile"
          note="38px visually, hit area padded to 44 with a pseudo-element rather than by growing the box, so a row of them keeps the design's spacing."
        >
          <div className="flex items-center gap-2">
            <ActionTile label="Edit">
              <IconPencil size={19} stroke={2} />
            </ActionTile>
            <ActionTile label="Delete" tone="var(--color-expense)">
              <IconTrash size={19} stroke={2} />
            </ActionTile>
            <div className="rounded-card p-3" style={{ background: categoryVar('plum') }}>
              <ActionTile label="On a field" onField>
                <IconPencil size={19} stroke={2} />
              </ActionTile>
            </div>
          </div>
        </Block>

        <Block
          title="SegmentedTrack"
          note="One inset track with a selection that slides. The pill's geometry is measured from the segment elements, not computed as 100/n percent — segments are not always equal width."
        >
          <div className="max-w-xs">
            <SegmentedTrack
              options={[
                { key: '1M', label: '1M' },
                { key: '1Q', label: '1Q' },
                { key: '1Y', label: '1Y' },
                { key: 'ALL', label: 'All' },
              ]}
              value={segment}
              onChange={setSegment}
            />
          </div>
        </Block>

        <Block title="Toggle" note="44×26, 20px knob. A button with role=switch, not a checkbox.">
          <Toggle checked={on} onChange={setOn} label="Example" />
        </Block>

        <Block
          title="MonthStepper"
          note="Two widths. Compact where something shares the row (Home, beside the Scheduled link); spread where nothing does (wallet detail)."
        >
          <div className="flex max-w-sm flex-col gap-4">
            <MonthStepper month={month} onChange={setMonth} earliest="2023-10-15" />
            <MonthStepper month={month} onChange={setMonth} earliest="2023-10-15" spread />
          </div>
        </Block>
      </Section>

      <Section
        id="marks"
        title="Marks"
        lead={
          <>
            <Code>Tile</Code> is the rounded square a glyph sits in — the mark
            that identifies a category, a wallet or a settings group. Radius
            tracks size; the glyph size does too, through{' '}
            <Code>glyphSize()</Code>.
          </>
        }
      >
        <Block title="Tile sizes">
          <div className="flex flex-wrap items-end gap-4">
            {[34, 40, 52, 60, 68].map((size) => {
              const Icon = iconFor('shopping-basket')
              return (
                <div key={size} className="flex flex-col items-center gap-1.5">
                  <Tile size={size} color={categoryVar('moss')}>
                    <Icon size={glyphSize(size)} stroke={2} />
                  </Tile>
                  <span className="tnum text-kicker text-ink-dim">{size}</span>
                </div>
              )
            })}
          </div>
        </Block>

        <Block
          title="Tile variants"
          note="tint is the default mark. solid is the picker's chosen tile and the entry hero. dashed is “not a purchase”, worn by transfers and balance adjustments alike — they stay apart by their glyph, not by one of them being filled. neutral is for a subject with no colour."
        >
          <div className="flex flex-wrap items-center gap-5">
            {(['tint', 'solid', 'dashed', 'neutral'] as const).map((variant) => {
              const Icon = iconFor('shopping-basket')
              return (
                <div key={variant} className="flex flex-col items-center gap-1.5">
                  <Tile size={40} variant={variant} color={categoryVar('ochre')}>
                    <Icon size={glyphSize(40)} stroke={2} />
                  </Tile>
                  <span className="font-mono text-kicker text-ink-dim">{variant}</span>
                </div>
              )
            })}
          </div>
        </Block>

        <Block title="CategoryGlyph">
          <div className="flex flex-wrap items-center gap-5">
            <Mark label="category">
              <CategoryGlyph glyph="car" color="slate" />
            </Mark>
            <Mark label="transfer">
              <CategoryGlyph glyph={null} color={null} transfer />
            </Mark>
            <Mark label="adjustment">
              <CategoryGlyph glyph="scale" color="teal" dashed neutral />
            </Mark>
            <Mark label="selected">
              <CategoryGlyph glyph="car" color="slate" selected />
            </Mark>
          </div>
        </Block>

        <Block
          title="Sparkline"
          note="Hand-rolled SVG, not ECharts — at this size, with no axes and no tooltip, a chart engine costs far more than the mark is worth, and there is one per row. Painted by sign: a hard-edged gradient in userSpaceOnUse, omitted entirely when the series never crosses zero."
        >
          <div className="flex flex-wrap items-center gap-6">
            <Sparkline values={TREND} width={120} height={34} />
            <Sparkline values={[-400, -200, 300, 900]} width={120} height={34} />
            <Sparkline values={TREND} width={330} height={56} strokeWidth={2} />
          </div>
        </Block>
      </Section>

      <Section
        id="feedback"
        title="Feedback and state"
        lead="What the app does with nothing to show, and what it does under a finger."
      >
        <Block title="Empty">
          <p className="px-4 py-8 text-center text-value text-ink-muted">
            Nothing recorded in March 2025.
          </p>
        </Block>
        <Block title="Loading">
          <p className="px-4 py-10 text-value text-ink-muted">Loading…</p>
        </Block>
        <Block title="Error">
          <p className="px-4 py-10 text-value text-expense">Could not load transactions.</p>
        </Block>
        <Block
          title="Press"
          note="hover:bg-press active:bg-press on anything that navigates; active:scale-[.98] over 90ms on anything that commits. Haptics come from a hidden <input type=checkbox switch>, fired on pointerdown — iOS has no Vibration API at all."
        >
          <Card className="max-w-sm">
            <CardRow>
              <span className="flex-1 text-row font-medium">Press and hold me</span>
            </CardRow>
          </Card>
        </Block>
        <Block title="FAB">
          <button
            aria-label="Add"
            className="flex size-[60px] items-center justify-center rounded-full bg-accent text-accent-fg shadow-fab transition-transform duration-[90ms] active:scale-[.98]"
          >
            <IconPlus size={26} stroke={2} />
          </button>
        </Block>
      </Section>
    </>
  )
}
