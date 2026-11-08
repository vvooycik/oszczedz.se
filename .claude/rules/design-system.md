---
paths:
  - "src/index.css"
  - "src/theme/**"
  - "src/components/ui/**"
  - "src/components/CategoryGlyph.tsx"
  - "src/screens/dev/**"
  - "src/screens/AppearanceScreen.tsx"
  - "index.html"
---

# Design tokens and the component system

## `src/index.css` is the single source

Three layers, then two unlayered media queries:

1. `--h` / `--c-accent` / `--c-accent-mix` — written onto `<html>` at runtime
   from Appearance settings.
2. `[data-mode="light"]` / `[data-mode="dark"]` resolve every raw colour. **A
   colour must never be defined in only one of them.** (`data-mode`, not
   `data-theme`, is wired through three places.)
3. `@theme static` maps raws onto Tailwind names. `static` is load-bearing:
   several tokens are read only from JS (category colours arrive by name from
   the database) and a plain `@theme` would drop them.

The tablet (768) and desktop (1280) media queries restate the type scale (plus
`--dock-gutter` / `--dock-right`). They are **unlayered on purpose** — `@theme`
emits inside `@layer theme`, and an unlayered rule wins regardless of order.
This is the whole mechanism of the wide layouts: `text-row` compiles to
`font-size: var(--text-row)`, so no component knows a breakpoint exists.

## Type

**Instrument Sans** 400/500/600 for words and figures; figures get
`tabular-nums` (`.tnum`). Every size is a token (`--text-*`); no literal sizes
in components. Amount blocks are paired tokens (`--text-figure` /
`--text-figure-unit`, seven steps) so figure and unit cannot scale apart.

- **A new size token must be checked against the colour namespace**:
  `--text-label` would collide with `--color-label` (both `.text-label`), which
  is why the 11px step is `--text-kicker`.
- Near-duplicate steps (13.5 vs 14) are deliberately separate names; merging is
  now a one-line change.
- **Text fields are at least 16px** (`--text-field`) — iOS zooms on focus below
  that and never zooms back. index.css's element floor is a net; a Tailwind
  utility beats it, so each field states its own size. That floor also covers
  `button`, which is arguably wrong: a button without its own `text-*` renders
  at 16px. Narrowing the selector is a deliberate change with every button
  re-checked, not a drive-by.

## Surfaces and accent

Surfaces are pinned to one cool hue (262) at four elevations — `--c-bg`,
`--c-card`, `--c-dock`, `--c-inset`. The accent reaches them only through
`--c-accent-mix` (0% or 4%, Appearance's "Tint surfaces" switch); `--c-card`
and `--c-dock` are `color-mix()` against it. Grouping comes from a raised card
(`shadow-card`) plus 14px of air; the only rule line is `--c-divider` inside a
card. `--sh-*` shadows are per mode (light has no inner top highlight).

The pre-paint script in `index.html` carries two ground constants and a
`RETIRED` accent table (`claret` → `copper`, `olive` → `moss`), mirrored in
`normalisePrefs` and the `user_settings.accent` CHECK. It also writes
`<meta name="theme-color">`, as does `applyTheme` (`theme.ts` has an
`oklch()` → hex conversion for it) — that meta and the app icon are the only
places colour leaves the token system.

**Overriding the accent for a subtree** means setting `--color-accent`, not
`--c-accent`: `var()` resolves where the property is declared, so a deeper
`--c-accent` never reaches `--color-accent` on `:root`.

## Reading tokens from JS

`src/theme/tokens.ts` reads values back via `getComputedStyle` on demand, never
cached. Custom properties come back as the declared literal (colour functions
unresolved), so `parseColor` normalises: `oklch()` arithmetically, anything else
with a function through a canvas 2d `fillStyle` round-trip (always yields
`#rrggbb` / `rgba()`). zrender cannot parse either form and falls back to black
or throws in `lerp`. `readToken` is exported for the design-system page.

## Money colours and category palette

- Expense vs income are separated by **lightness, not hue** (colour-blind safe).
  They also carry sign in charts.
- **Ten category slots**, fixed order: `moss, ochre, slate, terracotta, teal,
  plum`, then `olive, sky, indigo, rose` (new hues in the widest gaps; tightest
  pair moss↔teal at 20°). `CHART_COLORS` is the **first six only** and must not
  cycle — a seventh series folds into "Other". `CATEGORY_COLORS` (all ten) is
  for pickers, including wallets.
- The category mark is a **tinted tile**: colour on the glyph over
  `color-mix(… var(--tile-mix) …)` (34% dark, 16% light). The selected picker
  tile goes solid, glyph in `--color-accent-fg` (never `#fff` — 2.2:1 in dark
  mode), with a double ring.
- `Tile.tsx`: radius tracks size (36/13, 40/14, 52/18, 60–68/20–22), never
  passed.
- **Dashed outline = "not a purchase"** (transfers, balance adjustments),
  outlined not filled. `CategoryGlyph`'s `dashed` (outline) and `neutral` (ink)
  are separate axes, both defaulting to `transfer`; the categories settings
  screen passes `dashed` alone.

## Layout details

- `aspect-square` grids pair `w-full` with a `max-w-*` cap and
  `justify-items-center` (`justify-between` does nothing on a grid). Accent
  swatches land on 44px.
- `max-w-frame` (`--container-frame`) is the phone column width.
- Open: three radii still outside the set (`rounded-lg` on the history bars,
  `borderRadius: 12` on two drag-lifts) — naming them is a design decision.
- The colour field rises **from the bottom** of a full-screen route, set via
  `colourFieldStyle` on `FullScreen`'s `style` (top-anchored washes fought the
  iOS status bar strip). A pane drops it.

## Design-system reference (`/dev/design-system`)

Sub-routes `/tokens`, `/components`, `/layout`, `/audit`. **Not linked from the
UI** by decision; still behind the auth gate. **Lazy-loaded** — it imports every
component, which must not reach the initial chunk. It reads live tokens through
`readToken` (never restates them) except the type scale. Its header accent
swatches use `ACCENTS` literals — accents other than the selected one are not
tokens.
