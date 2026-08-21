import type { ReactNode } from 'react'
import { Block, Code, Section } from './parts'

type Severity = 'fixed' | 'open' | 'fine'

const TONE: Record<Severity, { label: string; colour: string }> = {
  fixed: { label: 'Fixed', colour: 'var(--color-income)' },
  open: { label: 'Open', colour: 'var(--color-ochre)' },
  fine: { label: 'Not a bug', colour: 'var(--color-income)' },
}

function Finding({
  severity,
  title,
  where,
  children,
}: {
  severity: Severity
  title: string
  where?: string
  children: ReactNode
}) {
  const tone = TONE[severity]
  return (
    <div className="border-b border-divider py-4 last:border-b-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span
          className="rounded-full px-2 py-px text-badge font-semibold tracking-[0.06em] uppercase"
          style={{
            color: tone.colour,
            background: `color-mix(in oklab, ${tone.colour} 16%, transparent)`,
          }}
        >
          {tone.label}
        </span>
        <span className="text-link font-semibold">{title}</span>
        {where && <span className="font-mono text-kicker text-ink-dim">{where}</span>}
      </div>
      <div className="mt-2 max-w-[70ch] text-meta leading-[1.6] text-ink-muted">
        {children}
      </div>
    </div>
  )
}

/**
 * What a read of every styled surface in the app turned up.
 *
 * Kept on the page rather than in a commit message because it is a working
 * list: the form-factor work will close some of these and knowingly accept
 * others, and both need somewhere to be written down.
 */
export function Audit() {
  return (
    <>
      <Section
        id="audit"
        title="Audit"
        lead={
          <>
            Found by reading every styled surface in the app against the
            reference above. Everything that stood between this design and a
            second form factor has been fixed; what is left open is listed with
            it, because a closed audit that hides its remainder is worse than no
            audit.
          </>
        }
      >
        <Block title="Findings">
          <Finding
            severity="fixed"
            title="The type scale — every size now has a name"
            where="index.css"
          >
            Type was set two ways — <Code>text-[12.5px]</Code> utilities (17
            distinct values, ~300 uses) and inline <Code>fontSize: 42</Code> (14
            more) — with no name on any of them. The roles were consistent and
            the sizes mostly right; what was missing was anything to{' '}
            <i>change</i>. A tablet wanting body text a point larger meant
            editing several hundred call sites.
            <br />
            <br />
            <b>348 class literals and every inline size now resolve through a
            named token.</b> Nothing moved visually except two 1px unit sizes on
            the 30px step, where Budgets used 17 and Appearance 15 against the
            other two's 16 — a step cannot mean three things. Near-duplicates
            were deliberately <i>not</i> collapsed: 13.5 and 14 are still two
            names. Naming first is the right order, because merging two named
            steps is now a one-line change in index.css, where merging two
            literals would mean finding all 348 sites again.
          </Finding>

          <Finding
            severity="fixed"
            title="Two selects sat below the 16px iOS floor"
            where="AddScreen.tsx:553, :573"
          >
            The wallet and target-wallet selects on the entry screen were{' '}
            <Code>text-[15px]</Code>. index.css floors{' '}
            <Code>input, select, textarea, button</Code> at 16px, but a Tailwind
            utility beats an element selector, so the floor did not catch them —
            focusing either zoomed the viewport, and iOS never zooms back out.
            Both now take <Code>text-field</Code>, which is the 16px step and is
            named for this rule.
          </Finding>

          <Finding
            severity="fixed"
            title="A solid category tile knocked its glyph out in white"
            where="Tile.tsx:53"
          >
            <Code>variant=&quot;solid&quot;</Code> hardcoded{' '}
            <Code>color: &#39;#fff&#39;</Code>. Fine in light mode, where the
            slots sit near 50% lightness; in dark they are near 70%, where white
            lands around <b>2.2:1</b>. It now takes{' '}
            <Code>--color-accent-fg</Code> — the token{' '}
            <Code>Button</Code> already uses when handed a category{' '}
            <Code>tone</Code>, on the grounds that a category colour and the
            accent share a foreground — which gives about <b>6.4:1</b> on the
            same tile. Affects the picker's selected tile and the entry screen's
            hero mark.
          </Finding>

          <Finding
            severity="fixed"
            title="Button’s scrim variant was dead, and hardcoded one mode"
            where="Button.tsx:46–49"
          >
            <Code>variant=&quot;scrim&quot;</Code> was used nowhere, and wrote{' '}
            <Code>rgba(0,0,0,.24)</Code> and <Code>#fff</Code> directly — the{' '}
            <i>dark</i> values of <Code>--field-scrim</Code> and{' '}
            <Code>--field-ink</Code>, whose light values are deliberately
            different (ink at 78% over a barely-there wash, because a white glyph
            vanishes on a pale field). The one variant nobody used was also the
            one that would have been wrong in light mode. Deleted;{' '}
            <Code>ActionTile onField</Code> is the living version of that idea
            and reads the tokens.
          </Finding>

          <Finding
            severity="fixed"
            title="Login took its height from h-dvh"
            where="LoginPage.tsx:90"
          >
            The app frame is measured through <Code>useViewportHeight</Code>{' '}
            precisely because <Code>100dvh</Code> is stale on a cold standalone
            launch — and the login screen is the definitive cold-launch surface.
            Now <Code>h-svh</Code>, which is the small viewport and therefore the
            same value the frame falls back to before it has measured. It centres
            its content rather than filling a column, so this was never visible;
            it was one screen contradicting a rule the rest of the app follows.
          </Finding>

          <Finding
            severity="open"
            title="Three radii still sit outside the token set"
            where="AppearanceScreen.tsx:116, TransactionScreen.tsx:141, HomeOrderSheet.tsx:142, WalletCategoriesSheet.tsx:214"
          >
            The 34px appearance swatch moved from <Code>rounded-xl</Code>{' '}
            (12px, a Tailwind default) to <Code>rounded-tile-sm</Code>, which is
            the system's answer for anything under 40px. Three are left, all
            genuinely new sizes rather than strays: <Code>rounded-lg</Code> on
            the category history bars, and <Code>borderRadius: 12</Code> inline
            in the two drag-lift styles. They want names — <i>bar</i> and{' '}
            <i>lifted</i> — but naming a radius is a design decision about what
            those things are, not a refactor.
          </Finding>

          <Finding
            severity="fixed"
            title="The same date helper was defined twice"
            where="queries.ts:34, TransactionScreen.tsx:24"
          >
            <Code>min(a, b)</Code> in <Code>queries.ts</Code> and{' '}
            <Code>minDay(a, b)</Code> on the transaction screen were the same
            lexical comparison on <Code>&#39;YYYY-MM-DD&#39;</Code> strings,
            written twice within a week. Now one <Code>minDay</Code> in{' '}
            <Code>src/lib/dates.ts</Code>, with <Code>maxDay</Code> beside it —
            three words is not too small to share when the alternative is two of
            them.
          </Finding>

          <Finding
            severity="open"
            title="No breakpoint has ever been used"
            where="0 occurrences outside this page"
          >
            The source still contains no <Code>sm:</Code>, <Code>md:</Code> or{' '}
            <Code>lg:</Code> utility outside this page, and that is correct until
            there is a second form factor to serve. What changed is that there is
            now something for a breakpoint to <i>do</i>: every type step and the
            frame's width cap are single properties, so the first tablet layout
            starts from one media query rather than from a search-and-replace.
            <br />
            <br />
            <Code>max-w-lg</Code> was written literally in three places and is
            now <Code>max-w-frame</Code> against <Code>--container-frame</Code>,
            declared once.
          </Finding>
        </Block>

        <Block
          title="Looks wrong, is not"
          note="Things that read as inconsistency until you know why, kept here so they are not “fixed” later."
        >
          <Finding severity="fine" title="Two tokens for one dashed border">
            <Code>--color-dash</Code> and <Code>--color-hint</Code> are both
            drawn as <Code>1.5px dashed</Code>, and the split is by meaning, not
            by accident: <i>dash</i> is “a real thing that is not a purchase”
            (transfers, balance adjustments) and <i>hint</i> is “a thing that
            does not exist yet” (the rail’s add-a-budget placeholder). Same
            stroke, different claim.
          </Finding>
          <Finding severity="fine" title="Odd-numbered spacing">
            13px row padding, a 13px icon gap and a 61px divider inset are not
            sloppiness — 16 + 40 + 13 is exactly 61, so the rule starts under the
            text rather than under the tile. The 4px base yields to that.
          </Finding>
          <Finding severity="fine" title="Tile radius is not a prop">
            It is derived from size inside <Code>Tile</Code>, so a tile at an
            in-between size looks like the nearest one instead of inventing a
            corner. Passing it would let two 40px tiles disagree.
          </Finding>
          <Finding severity="fine" title="The app icon ignores every token">
            It is baked into the home screen at install time and cannot follow a
            user who later picks a different accent, so it is authored in fixed
            hex at the dark theme’s expense and income values.
          </Finding>
        </Block>
      </Section>
    </>
  )
}
