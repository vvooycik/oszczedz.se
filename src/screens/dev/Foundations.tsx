import { ACCENTS, ACCENT_ORDER } from '@/theme/theme'
import { CATEGORY_COLORS, CHART_COLORS } from '@/theme/tokens'
import { Block, Code, declared, Section, Spec, Swatch, useTokens } from './parts'

/** The three elevations plus the accent pair — every ground in the app. */
const SURFACES: [string, string][] = [
  ['--color-bg', 'The ground. Hue 262 at every elevation; never follows the accent.'],
  ['--color-card', 'Raised surface. Authored as a color-mix against --c-accent-mix.'],
  ['--color-dock', 'The floating dock, one step above a card.'],
  ['--color-inset', 'Recessed: segmented tracks, text wells, secondary buttons.'],
  ['--color-accent', 'From Appearance. The only token the user picks.'],
  ['--color-accent-fg', 'What reads on the accent — and on any category colour.'],
]

const INK: [string, string][] = [
  ['--color-ink', 'Body and figures.'],
  ['--color-ink-muted', 'Secondary line of a row, most meta text.'],
  ['--color-ink-faint', 'A figure that has not happened yet, placeholders.'],
  ['--color-label', 'The uppercase section label.'],
  ['--color-ink-dim', 'Chevrons, axis labels, the quietest ink there is.'],
]

const LINES: [string, string][] = [
  ['--color-divider', 'The 1px rule inside a card. The only line left anywhere.'],
  ['--color-tile', 'Neutral tile fill, where there is no subject colour.'],
  ['--color-dash', 'The dashed ring: transfers and balance adjustments.'],
  ['--color-track', 'Unfilled bar, toggle off.'],
  ['--color-press', 'The wash under a finger.'],
  ['--color-hint', 'Ghost weight: the prior-period line, a dashed placeholder.'],
]

/** Not in `@theme` — these are read by name, so Tailwind never sees them. */
const FIELD: [string, string][] = [
  ['--field-scrim', 'Control fill on a colour field, where a card would vanish.'],
  ['--field-ink', 'Ink on a colour field.'],
  ['--field-ink-dim', 'Its quiet half.'],
  ['--field-divider', 'Rule on a colour field.'],
  ['--field-key', 'Keypad key.'],
  ['--field-key-soft', 'Keypad operator column.'],
  ['--field-block', 'A bar track on a colour field.'],
]

const RADII: [string, number, string][] = [
  ['--radius-drawer', 28, 'Sheet, top corners only'],
  ['--radius-card', 22, 'Card, FAB footprint, 60px+ tile'],
  ['--radius-tile-lg', 18, '52–59px tile'],
  ['--radius-field', 16, 'Button, text well'],
  ['--radius-tile', 14, '40–51px tile'],
  ['--radius-tile-sm', 13, '≤39px tile, ActionTile'],
]

const SHADOWS: [string, string][] = [
  ['--shadow-card', 'Card. Dark mode adds an inset top highlight; light mode must not.'],
  ['--shadow-dock', 'The floating dock.'],
  ['--shadow-fab', 'The add button.'],
  ['--shadow-drawer', 'A sheet, thrown upward.'],
  ['--shadow-drag', 'A row lifted by a reorder.'],
]

/**
 * The scale, in the order index.css declares it.
 *
 * Read out of the live properties rather than restated — the page shows what
 * the running document says a step is, so a form-factor media query that moves
 * one is visible here without touching this file.
 */
const AMOUNTS: [string, string, string][] = [
  ['entry', 'entry-unit', 'The entry screen’s figure while typing'],
  ['hero', 'hero-unit', 'A detail screen’s subject: a transaction, a schedule'],
  ['figure', 'figure-unit', 'A screen’s headline figure: total wealth, a balance'],
  ['sheet', 'sheet-unit', 'A sheet’s figure: a budget limit'],
  ['stat', 'stat-unit', 'The Pace card'],
  ['stat-sm', 'stat-sm-unit', 'Cash flow, Balances, Budgets, the Appearance preview'],
  ['stat-xs', null as unknown as string, 'Total wealth on the wallets list — no unit, the format carries it'],
]

const BODY: [string, string][] = [
  ['title', 'Screen title: Sign in, Insights, Budgets'],
  ['title-sm', 'Screen title: Wallets, Categories'],
  ['heading', 'A pushed sub-screen’s name'],
  ['dialog', 'A confirmation’s title'],
  ['field', 'Every text field — and the hard floor iOS imposes'],
  ['row', 'A row’s primary line'],
  ['action', 'Button label, the dock’s active tab'],
  ['link', 'A sheet header’s action link'],
  ['prose', 'Explanatory paragraphs'],
  ['value', 'A row’s trailing value, empty states'],
  ['meta', 'The workhorse: feed meta, sentences, chips'],
  ['meta-sm', 'Dense meta, chart axes'],
  ['micro', 'The smallest running text'],
  ['kicker', 'The uppercase section label'],
  ['badge', 'A pill like “Closed”'],
  ['quote', 'A figure printed on a bar'],
  ['quote-unit', 'Its currency'],
]

function Step({ name, sample }: { name: string; sample: string }) {
  useTokens()
  return (
    <span
      className="tnum truncate"
      style={{ fontSize: `var(--text-${name})`, fontWeight: 500 }}
    >
      {sample}
    </span>
  )
}

export function Foundations() {
  useTokens()

  return (
    <>
      <Section
        id="appearance"
        title="Appearance"
        lead={
          <>
            Three inputs, written onto <Code>&lt;html&gt;</Code> at runtime by{' '}
            <Code>applyTheme</Code>: a mode, an accent, and one switch deciding
            whether the accent touches surfaces at all. Everything below re-reads
            itself when any of the three changes — this page is showing the live
            values, not a copy.
          </>
        }
      >
        <Block
          title="Accents"
          note="Six, each authored twice. The hue also lands on --h, which is all that is left of the era when the ground followed the accent."
        >
          <div className="flex flex-wrap gap-3">
            {ACCENT_ORDER.map((name) => (
              <div key={name} className="flex items-center gap-2">
                <span
                  className="size-9 rounded-tile-sm"
                  style={{ background: ACCENTS[name].dark }}
                />
                <span
                  className="size-9 rounded-tile-sm"
                  style={{ background: ACCENTS[name].light }}
                />
                <span className="font-mono text-micro">{name}</span>
              </div>
            ))}
          </div>
        </Block>

        <Block
          title="Surface tint"
          note="--c-accent-mix is 0% or 4%. --color-card and --color-dock are authored as a color-mix against it, so the switch needs no second palette and no JS branch."
        >
          <div className="font-mono text-micro text-ink-muted">
            --c-accent-mix: <span className="text-ink">{declaredMix()}</span>
          </div>
        </Block>
      </Section>

      <Section
        id="colour"
        title="Colour"
        lead={
          <>
            <b>index.css is the single source</b>, in three layers: runtime
            properties on <Code>:root</Code>, a full resolution per{' '}
            <Code>[data-mode]</Code>, then <Code>@theme static</Code> mapping the
            raws onto Tailwind names. A colour defined in only one mode is a bug.
            The right-hand column is the literal declaration; the far right is
            what it resolves to in sRGB.
          </>
        }
      >
        <Block title="Surfaces and accent">
          {SURFACES.map(([n, note]) => (
            <Swatch key={n} name={n} note={note} />
          ))}
        </Block>

        <Block title="Ink">
          {INK.map(([n, note]) => (
            <Swatch key={n} name={n} note={note} />
          ))}
        </Block>

        <Block title="Lines and fills">
          {LINES.map(([n, note]) => (
            <Swatch key={n} name={n} note={note} />
          ))}
        </Block>

        <Block
          title="Money"
          note="Separated by lightness, not hue — red against green at equal lightness is unreadable for roughly 8% of men. These two also carry the sign in charts, above and below zero, rather than the accent."
        >
          <Swatch name="--color-expense" note="Money leaving. Also “over” in any verdict." />
          <Swatch name="--color-income" note="Money arriving. Also “under”." />
        </Block>

        <Block
          title="Category slots"
          note="Ten, in a fixed order. The first six are the categorical chart palette and must never cycle past their end — a seventh series folds into “Other”. The last four are new hues in the widest gaps of the circle, never tints of the first six."
        >
          {CATEGORY_COLORS.map((c, i) => (
            <Swatch
              key={c}
              name={`--color-${c}`}
              note={
                i < CHART_COLORS.length
                  ? `Slot ${i + 1} · chart palette`
                  : `Slot ${i + 1} · picker only`
              }
            />
          ))}
        </Block>

        <Block
          title="Colour field"
          note="Controls sitting on a screen's colour wash. Not in @theme, because nothing reads them as a utility — they are named in inline styles. The light values are the load-bearing ones: a white glyph vanishes on a pale field, so light mode is ink at 78% over a barely-there wash rather than a lightened copy of dark."
        >
          {FIELD.map(([n, note]) => (
            <Swatch key={n} name={n} note={note} />
          ))}
        </Block>

        <Block
          title="Tile mix"
          note="How much of a category's colour a tinted tile carries. A token rather than a constant because the 34% that reads on the dark ground goes muddy on white, where it drops to 16%."
        >
          <div className="font-mono text-micro text-ink-muted">
            --tile-mix: <span className="text-ink">{declaredTileMix()}</span>
          </div>
        </Block>
      </Section>

      <Section
        id="type"
        title="Type"
        lead={
          <>
            One family — <b>Instrument Sans</b> at 400/500/600 — for words and
            figures alike. Figures keep their accounting feel from{' '}
            <Code>.tnum</Code>, not from a second face.
            <br />
            <br />
            <b>Every size has a name in index.css and nowhere else.</b> Tailwind
            compiles <Code>text-row</Code> to{' '}
            <Code>font-size: var(--text-row)</Code>, so a second form factor
            re-sizes the app from one media query:{' '}
            <Code>
              {'@media (min-width: 768px) { :root { --text-row: 16px } }'}
            </Code>.
            Names describe the role that <i>dominates</i> a step, not a promise
            that only that role may use it. Two names at one value (title and
            stat-sm are both 30px) are deliberate — they can diverge, where one
            name shared by two roles could not be split again.
          </>
        }
      >
        <Block
          title="Weights"
          note="Three, and the app uses them positionally: 600 for anything that names or totals, 500 for a row's primary line, 400 for prose."
        >
          <div className="flex flex-wrap items-baseline gap-6">
            {[400, 500, 600].map((w) => (
              <span key={w} style={{ fontWeight: w, fontSize: 19 }}>
                {w} · 1 234,56 zł
              </span>
            ))}
          </div>
        </Block>

        <Block
          title="Tabular numerals"
          note="Every figure in the app wears .tnum. Without it a column of amounts wanders as digits change width."
        >
          <div className="flex flex-col gap-1 text-row">
            <span className="tnum">1 111,11 · 2 222,22 · with .tnum</span>
            <span>1 111,11 · 2 222,22 · without</span>
          </div>
        </Block>

        <Block
          title="Amount blocks"
          note="A figure and its unit, which have to scale together — hence a paired name per step rather than one ladder they both index into. Every one of these was an inline fontSize copied between nine screens before the scale existed."
        >
          <div className="flex flex-col">
            {AMOUNTS.map(([figure, unit, where]) => (
              <Spec
                key={figure}
                label={<Code>{`--text-${figure}`}</Code>}
                spec={`${declared(`--text-${figure}`)}${unit ? ` / ${declared(`--text-${unit}`)}` : ''} · ${where}`}
              >
                <span className="tnum" style={{ fontWeight: 600, letterSpacing: '-.035em' }}>
                  <span style={{ fontSize: `var(--text-${figure})` }}>405,90</span>
                  {unit && (
                    <span
                      className="text-ink-faint"
                      style={{ fontSize: `var(--text-${unit})`, fontWeight: 500, letterSpacing: 0 }}
                    >
                      {' '}
                      zł
                    </span>
                  )}
                </span>
              </Spec>
            ))}
          </div>
        </Block>

        <Block title="Titles and body">
          <div className="flex flex-col">
            {BODY.map(([name, role]) => (
              <Spec
                key={name}
                label={<Code>{`--text-${name}`}</Code>}
                spec={`${declared(`--text-${name}`)} · ${role}`}
              >
                <Step name={name} sample="Nothing recorded in August" />
              </Spec>
            ))}
          </div>
        </Block>

      </Section>

      <Section
        id="radius"
        title="Radius"
        lead={
          <>
            Named by the thing they belong to rather than by size, so a card and
            a screen's outer container cannot drift apart. Tile radius is the
            exception: it <b>tracks size</b> inside <Code>Tile</Code> rather than
            being passed, so a tile at an in-between size looks like the nearest
            one instead of inventing a corner.
          </>
        }
      >
        <Block title="Tokens">
          <div className="flex flex-wrap gap-5">
            {RADII.map(([name, px, use]) => (
              <div key={name} className="flex flex-col gap-1.5">
                <div
                  className="size-16 bg-inset"
                  style={{ borderRadius: `var(${name})` }}
                />
                <div className="font-mono text-kicker">{name.replace('--radius-', '')}</div>
                <div className="tnum text-kicker text-ink-dim">{px}px</div>
                <div className="max-w-[9rem] text-kicker text-ink-muted">{use}</div>
              </div>
            ))}
          </div>
        </Block>

        <Block
          title="Fully round"
          note="rounded-full is the single most used radius in the app (54 uses): the dock, every pill, every chip, the toggle, both add buttons and every 30px stepper key."
        >
          <div className="flex items-center gap-3">
            <span className="h-[34px] rounded-full bg-inset px-4 text-meta leading-[34px]">
              pill
            </span>
            <span className="size-[30px] rounded-full bg-inset" />
            <span className="size-[60px] rounded-full bg-accent" />
          </div>
        </Block>
      </Section>

      <Section
        id="elevation"
        title="Elevation"
        lead={
          <>
            Three levels replace one flat ground, and that is the whole point of
            the split: grouping used to come from a 1px rectangle around every
            list and now comes from a raised surface plus 14px of air. Shadows
            are per-mode raws, never one shared value — light mode uses{' '}
            <b>no</b> inner top highlight, because that trick only reads where
            the card is lighter than what is behind it.
          </>
        }
      >
        <Block title="Shadows">
          {SHADOWS.map(([name, note]) => (
            <Spec key={name} label={<Code>{name}</Code>} spec={note}>
              <div
                className="h-14 w-full max-w-sm rounded-card bg-card"
                style={{ boxShadow: `var(${name})` }}
              />
            </Spec>
          ))}
        </Block>

        <Block title="The stack">
          <div className="rounded-card bg-bg p-5">
            <div className="rounded-card bg-card p-5 shadow-card">
              <div className="rounded-field bg-inset p-4 text-meta text-ink-muted">
                inset — inside a card
              </div>
            </div>
            <div className="mt-4 rounded-full bg-dock p-4 text-center text-meta shadow-dock">
              dock — above both
            </div>
          </div>
        </Block>
      </Section>

      <Section
        id="space"
        title="Space and motion"
        lead="A 4px base with a handful of deliberate odd numbers. The odd ones are not sloppiness — 13px row padding and a 13px icon gap are what put a 40px tile's text at the 61px the default divider inset expects."
      >
        <Block title="The numbers that repeat">
          <div className="flex flex-col">
            <Spec label="Screen gutter" spec="px-4">16px on every screen</Spec>
            <Spec label="Card gap" spec="gap-[14px]">Between cards in a column</Spec>
            <Spec label="Card padding" spec="p-[18px]">Inside a card that is not a row list</Spec>
            <Spec label="Row padding" spec="px-4 py-[13px]">CardRow, feed row</Spec>
            <Spec label="Icon gap" spec="gap-[13px]">Tile to text, in a row</Spec>
            <Spec label="Divider inset" spec="61px">40px tile + 16 padding + 13 gap</Spec>
            <Spec label="Dock lane" spec="DOCK_SPACER = 96">
              Dock is 60 tall, floats 26 up; 96 leaves ten more
            </Spec>
            <Spec label="Touch target" spec="44px">
              Grown with a pseudo-element, never by growing the box
            </Spec>
          </div>
        </Block>

        <Block
          title="Motion"
          note="index.css flattens every duration under prefers-reduced-motion, so nothing below needs its own guard — only JS-driven transforms read the query, through useReducedMotion."
        >
          <div className="flex flex-col">
            <Spec label="Screen transition" spec="240ms cubic-bezier(.32,.72,0,1)">
              Entry only, never on a POP
            </Spec>
            <Spec label="Sheet slide" spec="280ms / scrim 200ms">
              Scrim is quicker so the panel arrives on a ground
            </Spec>
            <Spec label="Press" spec="90ms, scale .98">Buttons and the FAB</Spec>
            <Spec label="Segment pill" spec="200ms ease-out">Measured, not computed</Spec>
            <Spec label="Budget ring" spec="420ms entry, 260ms update">
              Animates dash offset, never the arc
            </Spec>
          </div>
        </Block>
      </Section>
    </>
  )
}

const declaredMix = () =>
  getComputedStyle(document.documentElement).getPropertyValue('--c-accent-mix').trim()

const declaredTileMix = () =>
  getComputedStyle(document.documentElement).getPropertyValue('--tile-mix').trim()
