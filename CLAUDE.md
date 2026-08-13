# Budget Tracker — Project Context

Personal budget tracker (single real user), mobile-first PWA. Core differentiator:
rich, non-generic data visualization (spending history, balance over time, budgets).
No bank integrations — transactions entered manually. Possible future: MCP server for
AI-assisted entry (e.g. parsing transaction screenshots).

Live at **https://oszczedz-se.pages.dev** — deploys automatically from `main`.

## Stack (decided — do not substitute without discussion)

- **Frontend:** React + TypeScript + Vite, Tailwind CSS v4, TanStack Query, **ECharts** for interactive charts, `react-router` for navigation, `@tabler/icons-react` for icons
- **Type:** **Instrument Sans** at 400/500/600, for words and figures alike. The serif/sans split the app used to run — Spectral for words, IBM Plex for every number — is the single thing that most made it read as aged; figures keep their accounting feel from `tabular-nums` (the `.tnum` class), not from a second typeface.
- **Backend:** Supabase (Postgres + Auth + auto-generated REST API via supabase-js). No custom server.
- **Hosting:** Cloudflare Pages (static deploy from GitHub), app installed on iPhone as PWA ("Add to Home Screen")
- **Migrations:** Supabase CLI, files in `supabase/migrations/` committed to git. Never apply schema changes through the dashboard SQL editor.
- **Tooling:** Supabase CLI is a **devDependency**, always invoked as `npx supabase ...` — never assume a globally installed `supabase` binary, and never `npm install -g supabase` (unsupported by design). Claude Code itself is a machine-level tool (native installer), never a project dependency — it must not appear in `package.json`.

ECharts is used directly (`echarts/core` + explicit registration), not via a React
wrapper package — wrapper libraries lag React majors. `src/charts/EChart.tsx` is the
one place that touches the ECharts lifecycle.

Not everything is an ECharts instance. Sparklines and the small six-month bars
are hand-rolled SVG and CSS: at that size, with no axes or tooltip, a chart engine
costs far more than the mark is worth — and there is one per row. (Budget rings
were in this list until the visual refresh turned them into cards with a bar; the
reasoning is the same, the shape is not.)

The wallet sparkline is **painted by sign, not by the wallet's colour** — the
same expense-below-zero / income-above-zero rule the Total Wealth chart follows.
It gets there with a `linearGradient` in `userSpaceOnUse` carrying two stops at
the *same* offset, which is a hard edge rather than a blend: the SVG equivalent
of what the piecewise `visualMap` compiles to. Two things it must keep doing —
place the stop at the y the data puts zero at (hence user space, not the default
bounding box), and **omit the gradient entirely when the series never crosses
zero**, because the crossing it would be built from is off the scale. Colours go
in as `var()`, not resolved values: this is DOM rather than canvas, so the mark
re-tints itself on a mode change for free.

Icons come from `src/lib/icons.ts`, which maps the kebab-case names stored in
`glyph` columns onto explicitly imported **Tabler** components. Import icons
there, never by indexing the library namespace — the rule is *stricter* than it
was under Lucide, not looser: Lucide shipped 2025 icons and a namespace index
cost **180 kB gzipped**, more than the entire initial bundle, and Tabler ships
5 900. Curated, a glyph costs ~100 bytes gzipped, so the list grows freely; the
whole Lucide→Tabler swap moved the initial chunk by −0.6 kB.

**The map's keys are data and did not change.** 59 categories and a few wallets
hold Lucide-flavoured strings in their `glyph` columns, so the refresh swapped
the *values* and left the rows alone. A few keys therefore read as one library's
name for the other's glyph (`utensils` draws `IconToolsKitchen2`,
`shopping-basket` draws `IconBasket`, `sigma` draws `IconSum`) — that is the
price of not migrating rows to repaint a screen, and it is the right trade.

Tabler's React components take **`stroke`**, not `strokeWidth`, for weight: 2 at
row size, 1.8 in the dock. `strokeWidth` happens to work — `...rest` is spread
after it — but `stroke` is the prop the package documents.

## Environment

**Node 24 is required** and the system `node` is not it. This machine's default is
Node 20.10 with a global npm 12 that refuses to run on it, so bare `npm`/`npx`
commands fail with `ERR_REQUIRE_ESM` for reasons unrelated to the project. Use
nvm (`.nvmrc` pins 24); in non-interactive shells prefix commands with:

```
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
```

Supabase project ref `abjvwdqutznmoeosnjnz` (Postgres 17, eu-north-1). The project
is linked, so `npx supabase db push` applies migrations over the network — **Docker
is only needed for the local stack** (`db reset` / `db start`), not for deploying
schema.

## Security model

- All data access from the browser with the public anon key; **Row Level Security is the security boundary**.
- Every table with `user_id` has policy: `for all using (user_id = auth.uid()) with check (user_id = auth.uid())`.
- Join tables (no `user_id`) check ownership through the parent row via `exists (...)`, on both sides.
- Views are created `with (security_invoker = on)` so RLS still applies through them. A view without it silently bypasses RLS.
- Project setting "Enable automatic RLS" is ON: new tables deny everything until a policy is written. Never disable RLS to "fix" an access problem — write the policy.
- Public sign-ups are disabled in Supabase Auth; the only account is the owner's, created by hand in the dashboard. A "login is broken" report should check the user exists before anything else.

## Hard invariants (never violate)

1. **Money is `bigint` in minor units** (grosze/cents). Never floats, never decimals in app code. Format at the display layer only — `src/lib/money.ts`, nowhere else. In TypeScript it is an integer `number` behind a branded `Minor` type: PostgREST serialises `bigint` as a JSON number, exact to ~90 trillion PLN, and the brand is what stops major units (12.34) reaching a minor-unit parameter.
2. **Balances are always derived, never stored.** Balance = `starting_balance + sum(transactions.amount)`. Use the `wallet_balances` view / SQL aggregation views for charts; the phone should fetch aggregates, not all raw rows.
   **PostgREST caps every response at 1000 rows (`db-max-rows`) and enforces it by silently truncating** — no error, no thrown exception, just a short array that looks valid. A daily series over the full history is 1031 rows, so the feed's All time chart drew a right edge a month in the past while appearing perfectly well-formed. Any query whose row count can pass a thousand must aggregate, bucket or paginate; assume nothing about a result's completeness from the fact that it parsed.
3. **Transaction `date` is `DATE`, not timestamptz.** A purchase belongs to a calendar day; no timezone math on it.
4. **Amounts are signed:** negative = money leaves the wallet, positive = enters. Category `kind` is UX guidance only (it picks a default sign in the entry form), never the source of truth for direction.
5. **Transfers are two transaction rows sharing `transfer_id`** (source negative, target positive). Created/deleted as a pair via `create_transfer(...)` / `delete_transfer(...)`, never as loose inserts. Transfer-linked rows are **excluded** from income/expense charts and from budgets.
6. **A transaction has exactly one category** (many-to-one). Multi-dimension labeling is what tags are for (M2M). Split transactions (parent/child with per-child category) are a possible future migration — do not add M2M transaction↔category.
7. **Currency lives on the wallet**; a transaction's amount is implicitly in its wallet's currency. Currency exchange = a normal transfer between wallets of different currencies with independent leg amounts (rate is derivable, not stored). Transfer legs must sum to zero **only** when both wallets share a currency.
8. **Charts are per-currency (option 1).** No FX conversion logic in v1. Aggregate charts show separate series per currency; expense charts default to a PLN filter. Future upgrade path: small `exchange_rates` table with manual snapshot rates — nothing else changes.
9. `user_id` stays on every top-level table even though there is one user (RLS keys off it). It defaults to `auth.uid()`, so clients omit it on insert.

## Domain model

Wallet types (single `wallets` table + `wallet_type` enum, NOT four tables):
- `account` — regular account
- `savings` — savings account
- `credit_card` — behaves like an account with negative balance; has `credit_limit`; UI shows remaining = `credit_limit + balance` (e.g. "2000 zł remaining" instead of "−18 000 zł")
- `loan` — goes negative and is repaid back towards 0; `interest_rate` is informational metadata only, no logic uses it. **`installment_count` is read** — see `loan_progress` below — but still never written after creation

  Two ways in, and the creation screen picks the second. A loan **taken now**
  can open at 0 and go negative via a transfer that credits a regular account —
  that models the money arriving. A loan **already being repaid** has no such
  event to record, so `/wallets/new` asks for the total to repay and stores it
  as a **negative `starting_balance`**; each repayment is then a transfer in,
  and the derived balance is what is left. Nothing new is stored either way —
  invariant 2 holds because `starting_balance` was always part of the
  derivation. "Total to repay" is taken at face value: if it includes interest,
  the wallet carries interest, because no schedule is modelled.

Type-specific fields are nullable columns guarded by CHECK constraints (not JSONB — revisit only if type-specific fields multiply significantly).

Wallet↔Category M2M (`wallet_categories`) filters **and orders** the category
picker per wallet. **Empty set = all categories allowed**, in name order — a
wallet opts into a set, and most never need one, so `[]` means "no opinion" and
never "offers nothing". UX-only; DB accepts any category on any wallet.

`position` (integer, on the join) is the order the picker draws them in. It sits
on the pairing rather than on `categories` because it is a fact about the pair:
groceries lead on the everyday account and are meaningless on the loan, and a
single global order could not say both. The client always writes dense positions
from zero, so ties do not arise from this app.

Consequence worth remembering: **the set both filters and sorts**, so ordering a
wallet's categories means selecting them. Wanting the order without the filter
means selecting all of them — which is a coherent thing to do, not a workaround.

Budgets: limit on expenses per period. A transaction counts against a budget iff: it is an expense AND not part of a transfer AND its category ∈ `budget_categories` (empty = any) AND its wallet ∈ `budget_wallets` (empty = any) AND its wallet's currency = budget's currency. "Reset" is not stored — it is just grouping by calendar period in queries.

Wallet theming: `glyph` (icon name string) + `color_scheme` (design token).

## Schema

**The authoritative schema is `supabase/migrations/`** — read it there rather than
keeping a copy in this file. Tables: `wallets`, `categories`, `tags`,
`transactions`, `budgets`, plus join tables `wallet_categories`,
`transaction_tags`, `budget_categories`, `budget_wallets`.

Plus `user_settings` — one row per user holding the appearance preference.

Enforced outside the DDL:
- Transfer pairing/balancing → `create_transfer(...)`, deletion via `delete_transfer(...)`
- `wallet_balances` view — derived balance per wallet
- `monthly_category_totals` view — pre-aggregated month/category/currency totals for charts, transfer legs excluded
- `balance_history(currency, from, to, max_points = 400)` — running total wealth per day, for the feed chart and its prior-period overlay. Thins to at most `max_points` rows by taking every Nth day, counting back from `to` so the final day always survives and keeping `from` unconditionally. Ranges shorter than `max_points` days are unaffected — the step collapses to 1.
- `budget_progress` view — spend against each budget for the current period, applying the membership rules from the Budgets paragraph above
- `wallet_monthly_net` view — net movement per wallet per month, accumulated client-side into sparklines and deltas
- `category_usage` view — transaction count per category, for the settings list and its delete copy
- `loan_progress` view — per loan wallet, its `installment_count` and how many
  repayments have landed. **Installments left are counted, never decremented.**
  A repayment is a transaction on the loan wallet that is *part of a transfer*
  and *positive* — invariant 4 makes positive "money enters", and for a wallet
  that opens negative and is repaid towards zero, that is the repayment. A loose
  positive row is deliberately not counted: repaying a loan takes money out of
  another wallet, so it is a transfer, and a single-sided row would mean the
  money came from nowhere.
  A trigger decrementing the column would be the stored-balance mistake again
  (invariant 2): it would have to be un-decremented by `delete_transfer`, and
  could not be right about a backdated repayment. The count is correct at every
  moment by construction, and deleting a repayment puts the installment back
  with no code at all.
  Two consequences to keep in mind. The count is over **all history**, not since
  the number was set — a loan imported with years of repayments already shows
  them all as paid. And `installment_count` is nullable, so a loan without one
  has a number repaid and nothing to subtract it from; the wallets row falls
  back to the ordinary sparkline rather than inventing a total.
- `useLastUsedWallet` — the wallet a new entry starts on, ordered by `created_at`
  (the wallet you were just working in; a backdated entry is still the one you
  last logged), then **`amount desc`**. That second sort is what resolves a
  transfer to its target: `create_transfer` inserts both legs in one statement,
  so `default now()` gives them an identical `created_at` and neither wins on
  time, while invariant 5 makes the target the positive leg. One row is the
  answer — no second query, and no leg matching to drift from the invariant.
- `delete_category(id, reassign_to)` — moves the category's transactions onto another category and deletes it in one statement; raises rather than orphaning rows when a target is needed and none was given

## Data

The database holds the **real legacy import**, not test rows: 7 wallets, 59
categories, 20 tags, 5086 transactions and 348 transfer pairs, covering
2023-10-15 → 2026-08-07, migrated from Spendee via the bank exports.

The exports and the generated SQL live in `supabase/legacy_data_export/` and
`supabase/seed/` and are **gitignored** — real personal finances, never committed.
The seed is wrapped in one transaction and resolves `user_id` from the single row
in `auth.users`, raising if it does not find exactly one, so a half-applied import
is not possible.

**Never seed with `supabase db reset --linked`.** Remote reset drops `auth.users`
along with everything else, so the account is gone before the seed runs and the
guard fails — and re-creating the account by hand does not help, because the *next*
reset deletes it again. Run seeds with `npx supabase db query --linked -f <file>`,
which goes over the Management API, touches only what the file touches, and needs
no Docker. (It may report a duplicate-key error after a long import: the request
succeeded and was retried. Check the row counts before assuming it failed.)

The import wrote every category as `color = '#8A8A8A'`, `glyph = 'circle'` and
every wallet as `color_scheme = 'neutral'`, none of which match the palette slots
or `src/lib/icons.ts`, so every row rendered through the deterministic fallback.
**Categories are fixed** — `supabase/seed/normalise_category_appearance.sql`
(gitignored, like everything naming real categories) writes a glyph and a palette
slot onto all 59, matched on `name + kind` because names repeat across kinds
("Gifts", "Other" and "External transfer" each exist twice). It is idempotent and
ends in a guard that raises if any row is left on a non-slot colour or on
`circle`. The categories settings screen also normalises a row on open, which is
how one-off edits stay consistent.

Six slots for 59 categories means colours repeat by construction. The assignment
keeps the **six highest-volume categories of each kind on six distinct slots** —
the part of a breakdown chart that actually gets read — and lets the tail follow
its domain. Glyph collisions mattered more than colour ones: an icon is the only
thing telling two feed rows apart, so several picks exist to break a tie
(`graduation-cap` for Education vs `book-open` for Books/Movies, `salad` for
Dieta vs `utensils` for Food & Drink) rather than because they are the best fit
in isolation.

**Wallets still have no equivalent** — the seven imported ones are
`color_scheme = 'neutral'` throughout, and there is no edit screen to fix them.
Only wallets made through `/wallets/new` carry a real palette slot.

## Types

`src/lib/database.types.ts` is **generated** (`npm run db:types`) and is overwritten
wholesale — never hand-edit it. Domain aliases live in `src/lib/db.ts`, which is the
seam that survives regeneration; app code imports types from there.

Note that view columns come back **nullable** — Postgres cannot prove non-null
through an aggregate — so chart code must guard them.

## Design tokens

`src/index.css` is the single source, in three layers:

1. `--h` / `--c-accent` / `--c-accent-mix` — written onto `<html>` at runtime from
   the user's Appearance settings.
2. `[data-mode="light"]` / `[data-mode="dark"]` blocks resolve every raw colour. A
   colour must never be defined in only one of them.
3. `@theme static` maps those raws onto Tailwind token names.

**Surfaces no longer follow the accent.** They used to: `--c-bg` read `--h`, so
every ground drifted with the theme, and a four-step `--tint` scale set its
chroma. Both are gone. Surfaces are pinned to one cool hue (262) at four
elevations — `--c-bg` (the ground), `--c-card`, `--c-dock`, `--c-inset` — and the
accent reaches them only through `--c-accent-mix`, which is `0%` or `4%`
depending on Appearance's "Tint surfaces with accent" switch. `--c-card` and
`--c-dock` are authored as a `color-mix()` against that percentage, so the switch
needs no JS branch and no second palette.

Two consequences worth knowing. `groundHex` collapsed to **two constants**, which
is why the pre-paint script in `index.html` no longer carries a copy of the OKLab
matrix — only the two answers. And `--c-accent` retired two names: `claret` and
`olive` became `copper` and `moss`, mapped rather than reset in
`normalisePrefs`, in the pre-paint script's `RETIRED` table, and in the migration
that moved the `user_settings.accent` CHECK constraint.

**Three elevation levels replace one flat ground**, and that is the point of the
split: grouping used to come from a 1px rectangle around every list, and now comes
from a raised surface (`shadow-card`) plus 14px of air. The only rule left
anywhere is `--c-divider` *inside* a card. `--sh-*` shadows are per-mode raws,
not one shared value — the light theme uses **no** inner top highlight, because
that trick only reads on a dark ground where the card is lighter than what is
behind it.

`static` is load-bearing: a plain `@theme` block only emits variables whose utility
classes appear in the source, and several tokens are read only from JS (category
colours arrive from the database by name), so they would resolve to an empty string.

`src/theme/tokens.ts` reads the properties back via `getComputedStyle`, so Tailwind
and ECharts cannot drift. Never hardcode a colour in a chart config. Values are read
on demand, never cached — mode, accent and the surface tint all change at runtime.

**Tokens arrive as colour *functions* and are normalised on the way out of
`tokens.ts`.** Custom properties are substituted, not computed, so
`getComputedStyle` hands back the literal index.css declared — `var()` inside it
resolved, the colour function not. Canvas understands both `oklch()` and
`color-mix()`, which is why flat fills never showed a problem, but **zrender
parses a colour before it can interpolate one and its parser knows neither**: it
warns `illegal color`, falls back to black, and anything building a gradient then
throws in `lerp` on the undefined parse. That is a latent trap for any future
chart work — a gradient, a `visualMap`, an animated colour transition all hit it.

`parseColor` handles it in two steps: `oklch()` is converted arithmetically
because that is cheap and covers most tokens, and anything else containing a
function call goes through a **canvas 2d context**, whose `fillStyle` setter is a
complete CSS colour parser and whose getter always returns `#rrggbb` or `rgba()`.
That second path is what makes `--color-card` readable at all now that the
surface tint authors it as a `color-mix()`. rgba and hex — the whole ink ladder —
pass straight through.

**Overriding the accent for a subtree** (the add and detail screens take their accent
from the selected category) means setting `--color-accent`, *not* `--c-accent`. A
custom property's `var()` references resolve against the element that **declares**
it, so redefining `--c-accent` deeper never reaches `--color-accent` up on `:root`.

Fixed regardless of accent: **expense and income are separated by lightness, not
hue** — red vs green at equal lightness is unreadable for ~8% of men. Those two
tokens also carry the sign in charts: the Total Wealth line and its fill are
painted by `--color-expense` below zero and `--color-income` above it, not by the
accent, because a loan can outweigh the accounts and the sign is worth more there
than the theme. It is done with a piecewise `visualMap` on the y dimension, which
ECharts compiles into one gradient with hard stops at the crossing, so the line
and the area split together. Three things that are load-bearing:

- **Pieces must be bounded on both sides.** `{ lt: 0 }` has no coordinate to
  place and throws inside the line renderer rather than defaulting. Pad past the
  data extent to cover the headroom `scale: true` adds.
- **An empty series must omit the `visualMap` entirely** — no pieces means no
  stops in range, same crash.
- **The end dot is its own series.** visualMap overrides a symbol's `color` *and*
  `borderColor` on any series it touches, so leaving the marker on the balance
  series repaints it. `seriesIndex` keeps it off the marker.

Registration is `VisualMapPiecewiseComponent`, not `VisualMapComponent` — the
latter drags the continuous variant in too, 4 kB gzipped for nothing.

The prior-period overlay sets `symbol: 'none'`. A line series still emphasises a
symbol on hover when `showSymbol` is false, and `symbolSize: 0` does not stop it
either — emphasis rescales from its own size. It drew that dot in **ECharts'
default palette blue**, because the series sets `lineStyle.color` but no
`itemStyle`, so the symbol fell through to the built-in palette. Any series whose
colour is set only via `lineStyle` has that hole; the hover dot belongs to the
series being read, not to the ghost behind it.

**Ten category slots**, in a fixed order: `moss, ochre, slate, terracotta, teal,
plum` first, then `olive, sky, indigo, rose`. The last four are new *hues* placed
in the widest gaps of the circle, not lighter and darker takes on the first six —
two tints of one hue are precisely what cannot be told apart at the size a
category mark is drawn. Four was the limit: a fifth would have forced some pair
below 30° of hue separation, and the tightest existing pair (moss↔teal, 20°) is
already the hard one to read.

`CHART_COLORS` — the **first six only** — is the categorical chart palette, and
still must not cycle past its end; a seventh series folds into "Other". A chart
wants maximum separation between adjacent series, which is what those six are.
`CATEGORY_COLORS` (all ten) is for the picker.

**The 4.5:1 cap on the palette is retired.** The category mark used to be a
filled disc with the glyph knocked out in `--color-bg`, so the *contrast was the
glyph* and every slot had to clear AA against the ground in both modes — which is
what capped the set at ten, not taste. The mark is now a **tinted tile**: the
colour moved from the fill to the glyph, over `color-mix(… var(--tile-mix) …)` of
itself. Legibility comes from the mix percentage instead, and that percentage is
a token precisely because the 34% that reads on the dark ground goes muddy on
white, where it drops to 16%.

What that buys, if it is ever wanted: an eleventh hue is now a question about hue
separation alone (the tightest existing pair, moss↔teal, is 20°) rather than
about sRGB's ceiling at 50% lightness. What it costs: a tinted tile is a weaker
mark than a disc, which is why the picker's *selected* tile goes solid with a
white glyph and a double ring.

Anything `dashed` stays outlined instead of filled — a dash needs empty space
behind it to read as one.

**A dashed outline is the feed's mark for "not a purchase."** Transfers wear it
and so do balance adjustments: both are real movement that nobody chose to
spend. They stay apart by their icon — an arrow against the adjustment's own
glyph — rather than by one of them being solid, so the distinction the dash
carries is *kind of row*, not *which special case*.

`CategoryGlyph` keeps the ring and the ink as **separate axes**: `dashed` is the
outline, `neutral` is the ink-dim tint, and both default to following `transfer`
so single-flag calls are unchanged. The categories settings screen takes `dashed`
alone — there the glyph and colour are the thing being edited, and neutralising
them would leave the picker with nothing to show and every transfer row
identical.

The tile itself lives in `src/components/ui/Tile.tsx` and is shared by wallet
marks and the settings groups. **Radius tracks size** rather than being passed
(36/13, 40/14, 52/18, 60–68/20–22): a tile at an in-between size should look like
the nearest one, not invent a corner.

`glyph` and `color` columns are free text, so `resolveCategoryColor` / `iconFor` fall
back deterministically rather than rendering an empty string or nothing.

**The app icon is the one thing outside this system.** Mark 2a from
`design/design_handoff_icon/icon/README.md` — the same two-series overlay the Total
Wealth chart draws — in a fixed gold `#c99a4e` on a fixed `#1a1917` ground. It is
deliberately *not* bound to `--color-accent`: the icon is baked into the home screen
at install time and cannot follow a user who later picks Copper or Plum. Sources are
in that handoff folder; `public/favicon.svg` carries the **full** mark, geometry
identical to the app icon, so the two read as one thing. The handoff assigns the
simplified small variant to the favicon, but that threshold assumed 1× rendering — a
16px favicon slot is 32 device pixels on a retina display, where the prior-year series
and the terminal dot are still legible. Checked at 16/32/48 before deviating.

## Build and deploy

Cloudflare Pages builds from `main`: build command `npm run build`, output `dist`,
Node from `.node-version`.

`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` must be set in Cloudflare for
**Production and Preview**. They are read at *build* time, so a variable added after
a build needs a redeploy.

`vite.config.ts` fails the build when they are missing, and that guard must stay.
Without it Vite inlines the values as `undefined`, the guard in `src/lib/supabase.ts`
folds to a constant, and the bundler dead-code-eliminates supabase-js and every
chart behind it — producing a *successful* build of an app that throws on load.

ECharts is code-split so it stays off the login path — **~174 kB gzipped initial,
~189 kB for the chart chunk** after the visual refresh (it was ~170/189 before,
so the whole restyle plus ten new components cost ~4 kB). Keep an eye on this: a
second charting library adds to that budget rather than replacing it.

`__APP_VERSION__` is inlined by `vite.config.ts` from `package.json`, for the
About row. Bump the version there, not in the component.

## Roadmap / current status

1. **Walking skeleton — DONE.** Deployed, and the full loop is verified: login,
   add transaction, integer minor units stored, derived balance, chart fed by the
   aggregate view, session surviving a reload. Remaining tail: set Supabase Auth
   Site URL to the pages.dev domain, and confirm session persistence on the actual
   iPhone after a force-quit (iOS evicts localStorage more aggressively than Chrome).
2. **Redesign — DONE.** Five screens built against the design handoff: feed (budget
   rail, total wealth, balance chart with prior-period compare, day-grouped list),
   wallets (grouped with subtotals, sparklines, credit-card utilisation), quick-add
   (full screen, auto-opening category sheet, date sheet, keypad), transaction detail
   (budget context, six-month history, transfer variant), and Appearance (mode,
   accent, tint) persisted cache-aside — localStorage first, `user_settings` as the
   durable copy read only on a cold cache.
   The feed's ranges were 7D / 1M / 1Y / All time (see item 14 for what they are
   now). **All time takes its left edge from `useEarliestTransactionDate`, not
   from the feed's own rows** — that list
   is the most recent 100, so deriving a start date from it silently clamped the
   range to the last few weeks, narrower than 1M. Compare goes inert on All time:
   nothing precedes the first transaction, so that window is flat at the opening
   balance for its whole length, and drawing it costs a thousand rows to say
   nothing.
3. **Categories CRUD — DONE.** `/categories` from More: list by kind with real
   transaction counts, a 72% editor sheet (name, kind, colour, glyph, all
   re-tinting live), and deletion that reassigns the category's transactions
   first. Same-kind targets only — moving an expense into an income category
   would flip what every chart says about it.
4. **Editing a transaction — DONE.** The pencil on the detail header goes to
   `/tx/:id/edit`, which is `AddScreen` again rather than a second form: the
   route's `:id` is what switches it from inserting to updating, and the fields
   are seeded from the row once, on the render where the transaction, its tags
   and the category list have all arrived. A `hydrated` flag closes that gate,
   so a background refetch cannot reach in and undo what has been typed.
   `useUpdateTransaction` reconciles `transaction_tags` as a diff rather than
   wiping and rewriting — the join table is the only record of a membership, and
   a failure between the two halves of a rewrite would silently strip them.
   **Transfers are excluded** at both ends: the pencil is not drawn for one, and
   the route refuses by hand if reached directly. One leg's amount or wallet
   cannot move without the other, which is `create_transfer`'s job.
5. **The keypad is a calculator — DONE.** `÷ × − +` in a narrower fourth column,
   so a receipt can be totalled in the field. **Only the result is stored**;
   nothing records the arithmetic that produced it.
   It keeps a **running total, not an expression** (`AmountEntry` = folded
   `acc`, the `op` waiting on an operand, and the digits being typed): each
   operator immediately folds what came before it, so there is no tree, nothing
   is parsed twice, and evaluation is strictly **left to right** — `2 + 3 × 4`
   is 20, not 14 — visible while typing rather than surprising at the end,
   because the total is on screen the whole time.
   **The big figure is always the amount that would be stored**, which is why
   there is no `=` key: what is being read is what Save writes. The quiet tape
   above it carries the working (`12,50 + 3,20`), not the answer, and never
   grows past one operation since `acc` is already folded. The one thing the
   figure echoes raw is a plain amount with no arithmetic behind it — a
   half-typed "12," has to stay "12," rather than settling to "12,00" under the
   finger; once an operation is in flight that feedback lives in the tape.
   `×` and `÷` read their right-hand side as a **plain multiplier, not money** —
   "three of these", "split it three ways". Folding 12,50 × 3 as 1250 × 300
   would give 37 500 zł instead of 37,50, and reading it as a scalar also keeps
   3 × 12,50 on the same answer. Division rounds to the nearest grosz and drops
   the remainder (100 zł three ways is three shares of 33,33, losing one), and
   dividing by zero leaves the total alone rather than producing an infinity
   that would have to be caught downstream.
6. **Creating a wallet — DONE.** "Add a wallet" goes to `/wallets/new`: name,
   type, colour, and the fields the type actually needs.
   **One balance field, three labels and three sign rules** — "Opening balance"
   for an account or savings (signed, so an overdrawn account can be entered),
   "Owed right now" for a card and "Total to repay" for a loan, both negated on
   the way in. Debt is a negative balance in this app, so the alternative was
   three fields that all wrote the same column.
   The screen **nulls the type-specific columns it is not using** rather than
   trusting the form to have cleared them: both CHECK constraints are two-way
   (`credit_limit` present iff `credit_card`, loan columns null off a loan), so
   a type switched after typing would otherwise carry a stale field into the
   insert and fail on the constraint.
   Two fields are deliberately absent. **Glyph** is the type's, from
   `src/lib/wallets.ts`, so a picker would be a decision with nowhere to show.
   **Currency** takes the column default, since one currency is what every
   screen filters on today.
   That map is also where the **wallets list** gets each row's mark, and it
   reads the row's `type` rather than its `glyph` column on purpose: `glyph` is
   free text and the legacy import wrote `'wallet'` into all seven, so trusting
   it would draw the same icon on an account, a savings account, a card and a
   loan — the one distinction the mark exists to make.
7. **Per-wallet category sets — DONE.** A Categories section on `/wallets/new`,
   and the same sheet on any existing wallet by tapping its row on `/wallets`.
   That tap is a **placeholder**: there is no wallet detail screen, so it goes
   straight to the only thing a wallet can be configured for. When a detail
   screen exists, the tap belongs there with categories as a row inside it.
   The sheet is **one top-down list**, not the add screen's four-column grid:
   the grid is for picking one of a few at a glance, this is for arranging
   fifty-nine. Chosen categories float to the top in their order, everything
   else sits below behind a search field, so membership and order are the same
   list with no mode to switch into. Order moves with **buttons, not drag** — a
   drag on iOS means pointer capture, autoscroll and a fight with the sheet's
   own scrolling, which a five-to-fifteen row set does not repay.
   `useSetWalletCategories` **upserts then deletes**, deliberately: the join row
   is the only record of a membership, so a failure between the halves has to
   leave a stale category offered rather than drop an arrangement. The PK is
   `(wallet_id, category_id)`, so the upsert's default conflict target is
   already right and re-saving only rewrites `position`.
   On the create screen the set is **buffered** — there is no wallet to attach
   rows to until Save — and written as a second call right after the insert. If
   that second call fails the wallet still exists, so the screen says so and
   locks Save rather than reporting a failed creation and inviting a retry that
   would make a duplicate.
   The add screen keeps the row's **current** category in the picker even when
   the wallet's set excludes it; otherwise editing a transaction would open a
   picker missing the very choice it holds.
   **This is the first Sheet inside the tabbed shell.** It anchors to
   `AppShell`'s fixed root (the scrolling `<main>` is not positioned, so it does
   not clip it) — verified by reading, not on a device.
8. **Loan installments left — DONE.** `loan_progress` (above) counts them; the
   loan row on `/wallets` draws the same bar the credit card uses, filled the
   other way — a card's bar grows as it gets worse, a loan's grows as it gets
   better, so it takes the income colour rather than the expense one.
   **Untestable through the UI today**: a repayment is a transfer leg, and the
   transfer flow does not exist, so nothing in the app can create one. The
   counting was verified against the imported history instead — the real
   `Kredyty` wallet already has 64 qualifying legs, 2023-12-21 to 2026-07-20.
   That wallet's `installment_count` is **null**, and there is no wallet edit
   screen, so it cannot be given one without SQL. Until it has one the row shows
   the ordinary sparkline.
9. **Wallets list, finished — DONE.** Type mark per row (replacing the coloured
   rule, which only repeated the section heading), **total wealth moved to the
   top** — it is the number the screen is for, and it used to need a scroll —
   sign-painted sparklines, and a loan progress bar.
   The loan bar prefers installments and **falls back to money**: a loan opens
   at the total to repay and climbs towards zero, so the share already cleared
   is a real fraction rather than a stand-in. That is what makes the bar appear
   on the imported `Kredyty` at all, since nothing ever set its
   `installment_count` — it reads "17 405,90 of 20 944,50 repaid" instead of
   counting settlements. Only a loan opened at zero has neither and falls back
   to the sparkline.
   **The FAB is route-aware**, in `TabBar`: one button, one position, and only
   the destination changes — `/wallets` makes a wallet, everything else makes a
   transaction. The alternative was every screen drawing its own button in the
   same spot and hoping they agreed, which is exactly how this screen ended up
   with a bordered "Add a wallet" below the fold *and* a transaction FAB
   floating over it.
10. **Wallet detail — DONE.** `/wallets/:id`: balance, the type's bar (card
    utilisation or loan progress), a wider sparkline, a Categories row, and the
    wallet's own feed. Tapping a row on `/wallets` goes here; the categories
    sheet moved onto this screen, which is where it always belonged.
    The feed is `TransactionFeed` handed a filtered set, **not** a per-wallet
    copy of it — two feeds would be two things to keep in step for nothing.
    `useWalletTransactions` therefore **fetches both legs of every transfer**,
    not just this wallet's: the feed collapses a pair into one "source → target"
    line and can only do that holding the pair. Given one leg it falls back to a
    bare category row, which on the loan — where every row is a repayment
    transfer — would be the entire screen saying nothing about where the money
    came from. Two round trips, because PostgREST cannot express "or its
    transfer sibling" as one filter; siblings are appended rather than merged by
    date, which is safe because `collapseTransfers` emits each pair at the first
    leg it sees and this wallet's rows come first.
    Shared maths lives in `src/lib/wallets.ts` — `balanceHistory` and
    `loanStanding` — because the list and the detail screen draw the same two
    things at different sizes.
    Side effect worth noting: this **retires the untested Sheet-inside-AppShell**
    from item 7. The categories sheet now opens on a `FullScreen` route, the
    same proven arrangement `CategoriesScreen` uses.
11. **Editing a wallet — DONE.** Pencil on the detail header → `/wallets/:id/edit`:
    name, colour, the type's own number (credit limit, or settlements — which is
    how the imported `Kredyty` finally gets an installment count), and the
    balance.
    **Type is not editable, by decision.** Moving it would have to carry
    `credit_limit` and the loan columns across two CHECK constraints, re-answer
    what an account's balance means once it is a card, and invent an installment
    count — for a change that is nearly always a mistake made at creation rather
    than an event. Delete and re-make, which asks out loud what happens to the
    transactions.
    **Setting a balance records a transaction; it never writes the balance.**
    Invariant 2 leaves no other reading: "this wallet should say 5 000" means
    something happened that was not recorded, so the honest form is a row dated
    today for the gap. Editing `starting_balance` instead would restate the
    entire history and move charts nobody was looking at.
    That row needs a category (`category_id` is not null), so one named
    **"Balance adjustment"** is found or created per direction — income when
    money appeared, expense when it went missing. Names repeating across kinds is
    already normal here ("Gifts", "Other"). It shows as its own slice in a
    breakdown, which is the point: it is visible, and it is an ordinary
    transaction afterwards — recategorise, re-date or delete it like any other.
    In the feed it is **drawn like a transfer**: dashed neutral ring, name at
    `ink/75`, amount in `ink-faint` rather than shouting income green or expense
    red. The dash is the shared mark for "not a purchase"; the icon is what keeps
    the two apart.
    `src/lib/adjustments.ts` holds the name and the predicate, so the code that
    writes adjustments and the code that recognises them cannot drift to
    different strings. **The category name is the marker**, and that is the
    limitation to know: rename the category and rows stop reading as
    adjustments. Tolerable, because renaming it is a deliberate "treat this as a
    normal category" — and the alternative is a schema concept for what is a
    presentational distinction.
    Still **counted in the spending charts**, unlike a transfer. `monthly_category_totals`
    excludes rows by `transfer_id`, which an adjustment does not have, and the
    money genuinely did move — hiding it would make the charts disagree with the
    balance. Excluding it is a separate decision, not an oversight.
    The balance field carries the same three readings as the create screen, and
    the one trap is the **overdrawn account**: `toRawAmount` is never signed, so
    seeding the field from it drops the minus, and −123,45 would read back as
    +123,45 and offer an adjustment of twice the balance. The sign is put back
    for non-debt types only — a card and a loan want the unsigned figure, since
    the field asks what is *owed*.
12. **Transfers — DONE.** The add screen creates them, and the picker's Transfer
    tab is no longer inert.
    **The category's kind is the mode switch.** "Moving money between my own
    wallets" is already one of the three kinds, so a separate toggle beside the
    picker would be a second way to say the same thing that could disagree with
    it. Picking a transfer category reveals a second wallet select, hides the
    sign toggle (direction is which wallet is which — `create_transfer` applies
    the signs) and hides tags.
    **The two wallets stay different by swapping, not refusing.** Choosing the
    other side's wallet is almost always "I had these the wrong way round", so
    the pair swaps; disabling the matching option would make the user undo their
    own selection first. The far side is seeded the moment the form becomes a
    transfer, so the pair starts valid. There is an explicit swap button too.
    `isTransfer` is declared **above** the handlers and the effect that read it:
    a `const` is in its temporal dead zone until its line, and a dependency array
    is evaluated during render, not after.
    Same-currency legs send one figure twice rather than asking for it twice.
    A second "amount received" field appears **only** when the two wallets differ
    in currency (invariant 7) — untestable today, since every wallet is PLN.
    Tags are off for transfers: `create_transfer` returns the pair's id, not the
    two row ids, so attaching them needs a second lookup and a decision about
    which leg wears them.
    Editing passes `allowTransfer={false}` to the picker — an existing single row
    cannot become a pair by changing its category.
    **Verified against the real database**, which is as far as it goes without a
    browser: both of the function's guards fire and neither writes. Same wallet
    twice raises "A transfer needs two different wallets"; two PLN wallets with
    100 vs 250 raises "Legs of a same-currency transfer must balance". Transfer
    rows stayed at 698 legs / 349 pairs — even, so no orphan leg was left behind.
    (Note for future probing: the Management API mangles `OFFSET`, so
    `offset 1 limit 1` returned the *same* wallet as `limit 1` and made a test
    look like it had caught a bug it had not. Pick rows by name.)
13. **Archiving a wallet — DONE.** `archived_at timestamptz` (null = active), set
    through `archive_wallet(id)` / `restore_wallet(id)`. Not deletion: the
    foreign key from `transactions` refuses that anyway, and it *should* — the
    account you closed in 2025 was still part of your net worth in 2024, and
    every backward-looking chart has to keep saying so. A timestamp rather than a
    boolean costs the same and answers "when".
    **Only a wallet at zero balance may be archived**, enforced in the function,
    not the form — the browser holds an anon key and RLS would let it write the
    column directly, so a client check is a hint. The rule makes a question
    disappear: an archived wallet contributes nothing to total wealth either way,
    so there is never a doubt about whether hidden wallets are counted, and the
    app cannot hide money. Real life agrees — you empty an account before closing
    it, and a loan ends when it is paid.
    Hidden from the wallets sections, the entry form and transfer targets; shown
    in a quiet **Closed** section that still links to the detail screen, and
    badged there. Archived wallets stay in `useWallets` because the feed has to
    resolve the name on a two-year-old row — `src/lib/wallets.ts` owns what
    "hidden" means (`isArchived` / `activeWallets`).
    Two places keep an archived wallet on purpose: the entry form's select keeps
    the one the edited row already uses (dropping it would silently move the row
    on save), and **the wallets screen totals run over every wallet, archived
    included**. The rule makes that the same number — but computing it over the
    visible ones would quietly go wrong if an archived wallet ever drifted off
    zero, and the total is the one figure on that screen that must never be a
    half-truth.
    Verified against the live database: `archive_wallet` on `Kredyty` raises
    "Kredyty still holds a balance of -353860; move it out before archiving".
14. **Visual refresh — DONE**, on the `visual-refresh` branch, against
    `design/design_handoff_visual_refresh/`. The brief was that the UI read as
    aged, for five named reasons, and all five are addressed: one sans instead
    of a serif/sans split, raised cards instead of 1px boxes, three elevation
    levels instead of a flat ground, a floating dock with the add button beside
    it instead of a bar welded to the edge with a FAB over the feed, and one
    inset segmented track instead of outlined pills.

    **A full-bleed header needs `FullScreen bleed`.** The frame holds the top
    safe-area inset for every screen, which meant the wallet and transaction
    colour fields began below a band of bare ground. Those two hand the inset to
    the content instead and spend `--safe-top` on the field itself, so the tint
    reaches y=0. The entry screen needs nothing — its field is on the frame's own
    `style`, and a background paints under padding.

    **The status bar strip is reclaimed through `theme-color`, not through
    layout.** It sits *outside* the web view — with
    `apple-mobile-web-app-status-bar-style: default` iOS positions the app below
    it and paints it itself — so no CSS reaches it. `useThemeColor` lends it the
    field's own top colour for as long as one of those screens is mounted, and
    hands it back to the ground on unmount. Verified in the browser: the meta
    resolves to the identical pixel as the gradient's first stop.

    Restoring uses `GROUND_HEX[resolvedMode]` rather than the value captured on
    entry, because `applyTheme` writes the same meta whenever mode or accent
    changes and a captured value can be stale by the time a screen closes.

    `black-translucent` is the other way to fill that strip and stays rejected —
    see the standalone-metadata note above for the measurement.

    **`aspect-square` needs a cap.** The swatch strips and the icon grid size
    themselves off the row they sit in, which is right on a phone and wrong at
    the 512px the frame caps at on a desktop — the six accent swatches became
    72px slabs and the icon tiles 67px. Each now pairs `w-full` with a `max-w-*`
    so the track drives the size up to a ceiling, and the grids carry
    `justify-items-center` so the slack spreads rather than collecting on the
    right. (`justify-between` does nothing on a grid; that was the first
    attempt.) The accent swatches land on exactly 44px, so the swatch is its own
    touch target.

    **The dock labels only the active tab**, in a pill washed with 16% of the
    accent — the design-language doc's treatment, not the screen set's filled
    accent circle, which the two disagreed about. The cells are therefore
    unequal: the active one is `flex-none` and takes the width its word needs,
    the other four share what is left. Measured at 390px: the nav is 288 wide,
    the widest pill ("Wallets", "Insights") is 107, and the remaining four cells
    are 41 each — enough for a 20px glyph, with no room for a sixth tab or a
    materially longer label.

    **What did not change is as important as what did.** The ten category slots
    and both money colours were already exactly what the handoff specified —
    checked value by value — so the palette is untouched, and so is every schema
    invariant. `data-mode` stayed rather than becoming the handoff's
    `data-theme`: the attribute name is an implementation detail already wired
    through three places.

    Four decisions taken against the handoff's literal text:

    - **The Total Wealth chart stays ECharts**, restyled. The handoff draws it as
      a plain SVG polyline, which would cost the tooltip, the axis and the
      expense/income sign split; its single-colour line is an artifact of
      all-negative sample data.
    - **The range is now `1M / 1Q / 1Y / All`.** `7D` is gone — a week of a
      *balance* is a flat line — and `1Q` fills the gap people actually wanted.
      The state is local, not persisted, so no migration was needed.
    - **"Count in total wealth" was not built.** It needs a new column and it
      contradicts the rule that the wallets screen's totals run over every
      wallet, archived included. Recurring and the category editor's "Monthly
      budget" row are absent for the same kind of reason: no schema behind them.
    - **The wallet colour row offers all ten slots**, not the handoff's seven.
      A wallet drawn from a narrower set would be the only place in the app
      where a colour is unavailable for no stated reason.

    Built beyond a restyle, because they were cheap and the prototypes show
    them: a **wallet icon picker** (which is why `wallets.glyph` is nullable now
    — see `walletGlyph`), a read-only **Tags** list, **Export data** as a CSV,
    and the static Currency and About rows.

    `src/lib/export.ts` is **paged**, and that is not optional: PostgREST caps a
    response at 1000 rows and enforces it by silently truncating, and there are
    over five thousand transactions. An unpaged select would produce a file that
    parses perfectly and quietly stops in 2024.

15. **Next:** budgets CRUD (the feed rail shows only its dashed placeholder until
    a budget can be created), and the Insights screen. Hard-deleting a
    transaction-free wallet is still unbuilt — the FK already permits exactly
    that case and nothing else. Tag CRUD has no design yet, which is why
    `/tags` is a list and not an editor.
16. Deferred by explicit decision: split transactions, FX conversion in charts
   (`exchange_rates`), non-monthly budget periods, MCP/AI entry.

Resolved by the redesign: icons are Lucide; both light and dark grounds ship, each
with its own resolved palette; navigation is `react-router` with five tabs (needs
`public/_redirects` for the Cloudflare SPA fallback).

**The iOS status bar must stay `default`, not `black-translucent`.** With a
translucent bar iOS counts the status bar as *retractable browser chrome* and
hands the standalone app a web view 62pt shorter than the screen — measured on
the device: screen 956, `100vh`/`100lvh` 956, but `innerHeight`, `clientHeight`,
`visualViewport` and `100svh`/`100dvh` all 894. The tab bar then strands above a
strip that is outside the web view and cannot be painted into, and sizing the
frame to `screen.height` only pushes it past the fold where it clips and
rubber-bands. The cost of `default` is that content no longer runs under the
status bar; iOS paints that strip, so `applyTheme` rewrites
`<meta name="theme-color">` to the resolved ground, and the pre-paint script in
`index.html` does the same so it does not flash on launch. That meta is the only
other place besides the app icon where a colour leaves the token system, which
is why `theme.ts` carries an `oklch()` → hex conversion.

Confirmed on the device: with `default` the reported top inset drops from 62 to
0, the web view moves to screen y 62…956, and the tab bar reaches the edge —
`innerHeight` stays 894 either way, so it is the *position* that changes, not
the size. **Changing that meta needs the app deleted from the home screen and
re-added**; iOS bakes the status-bar style into the bookmark at install, so a
force-quit reloads the page and the JS but keeps the old value. Budget for that
when touching anything in the standalone metadata.

The app frame takes its height from `useViewportHeight` (measured
`window.innerHeight`, `100svh` as the first-paint fallback), never from `100dvh`
or from stretching a fixed box to `bottom: 0` — the dynamic unit is stale on a
cold standalone launch, and the fixed box is sized against the same short
viewport described above.

**Screen transitions are entry-only, and never on a pop.**
`src/app/ScreenTransition.tsx` slides a full-screen route in — from the right for
a detail screen, from the bottom for the entry and creation forms — at 240ms
`cubic-bezier(.32,.72,0,1)`. Animating the *exit* too would mean keeping the old
screen mounted while the new one arrives, which for these screens means two live
subscriptions to the same queries and two `useViewportHeight` listeners fighting
over one measurement. A `POP` (back button, swipe-back) is not animated at all:
sliding a screen in from the right on the way back says the opposite of what the
gesture means. `prefers-reduced-motion` drops the transform entirely — index.css
already flattens durations globally, and starting from a transform that never
animates would strand the screen off-screen.

**The keyboard is only visible in the *visual* viewport.** `innerHeight`
deliberately does not move when iOS raises it — that is what keeps the frame
from collapsing mid-typing — so `useKeyboardInset` reads the overlap as
`innerHeight − visualViewport.height − offsetTop`, ignoring anything under 80px
(rubber-band scrolling and floating iPad keyboards produce a few pixels of
noise; a phone keyboard is ~300). `Sheet` spends it on `bottom` and clamps its
height with `min(…, calc(100% - inset))`, so a sheet sits *on* the keyboard
rather than behind it and gives up height instead of pushing its own top off
the screen.

**A tap that blurs a text field is spent doing only that.** iOS moves focus,
starts retracting the keyboard, and the click never reaches the button
underneath — which is why a searched-for category needed two taps. `keepFocus`
in `src/lib/touch.ts` is the fix, on `onMouseDown` (iOS synthesises that from
the tap *before* moving focus) and never on `onPointerDown`, which React listens
to non-passively and whose default is the scroll gesture. Any control that sits
beside an input inside a sheet needs it: the category grid, the kind pills, the
editor's colour and glyph pickers all carry it.

**Haptics come from a hidden `<input type="checkbox" switch>`.** iOS has no
Vibration API at all — `navigator.vibrate` is absent — but Safari 17.4's switch
control plays the system toggle haptic when flipped through its `<label>`, and
clicking that label is the only tap a web app can produce on an iPhone.
`tapFeedback()` builds the pair once, lazily, and parks it at 1px with
`opacity: 0`: the control must keep a **renderer**, so `display: none` and
`visibility: hidden` take the haptic with them. It needs a user gesture on the
stack, so it is called from the keypad's `pointerdown`, not from an effect —
which is also where the key's fill goes on, because feedback that waits for the
release reads as lag. Everything non-Apple falls through to `navigator.vibrate`.

Known gaps: the detail screen's "Balance now" row shows the wallet's balance
*now*, not the balance as of that transaction, which would need a further query
— the label says so rather than leaving it to be assumed. `delete_transfer`
is reached only from the detail screen's delete, and the **cross-currency transfer
path cannot be exercised** while every wallet is PLN.

Feature ideas go into a scratch file in the repo, not into the roadmap, until validated by actual use.

## Working conventions

- Deploy early and continuously; the app must always work from the phone.
- Design changes (schema, invariants) get decided first, then this file is updated — this file is the source of truth over code comments or memory.
- Honest trade-off notes preferred over silent cleverness; flag uncertainty instead of guessing.
