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
6 179. The whole Lucide→Tabler swap moved the initial chunk by −0.6 kB.

**A glyph costs ~86 bytes gzipped, measured** — the map grew from 111 keys to
**256** and the initial chunk from 177 kB to 189.6. So the list grows, but it is
not free, and there is no lazy path available for the picker-only ones:
`iconFor` has to answer synchronously because a feed row's glyph comes out of
the database and is drawn on the same paint as the row. Everything in the map is
in the initial chunk, login screen included. A few hundred is comfortable; a
thousand would be 86 kB and the largest single thing the app ships.

**Tabler has no taxi**, checked against 3.46 — `car-taxi-front` draws
`IconCarSuv`, deliberately a different silhouette from `car` so a ride share and
the car itself are not the same mark in a feed. Searching "taxi" in the picker
finds it, because the search matches the key.

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

**Typecheck with `npx tsc -b`, never `npx tsc --noEmit`.** The root tsconfig is
a solution file — nothing but `references` to `tsconfig.app.json` and
`tsconfig.node.json` — so `--noEmit` type-checks *zero files* and exits 0 on a
codebase that does not compile. Measured: a `ReferenceError`-grade missing
import passed `--noEmit` clean and was caught by `tsc -b` (and by `npm run
build`, which runs `tsc -b && vite build`). A green `--noEmit` means nothing at
all here.

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
3b. **A transaction dated after today has not happened.** Three words, kept apart
   on purpose: **settled** is dated today or earlier, **planned** is dated later,
   and a **schedule** is the recurrence rule that writes planned rows.
   Balances, budgets, cash flow, category totals and installment counts count
   settled rows only — and they say so *once*, by reading the
   `settled_transactions` view instead of `transactions`. Eight copies of
   `date <= current_date` scattered through eight bodies is how one of them
   silently starts lying; adding a new aggregate is now a choice between two
   named relations, not a predicate to remember.
   Two things deliberately still read `transactions` directly.
   `balance_history` **must** see planned rows — that is what draws the
   forecast — and its own `p_from`/`p_to` are the guard there.
   `spending_pace` is already safe: its running total at day *d* sums only rows
   up to *d*, and `spent` is null past today.
   A planned row is otherwise an ordinary transaction: same table, same type,
   same detail screen, editable and deletable. It becomes settled by the
   calendar moving, not by anything being written.
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

Budgets: a **named envelope** — a limit per period with its own `color` and
`glyph`, spent against a set of categories and a set of wallets. A transaction
counts against one iff its category is of kind `expense` AND it is not part of a
transfer AND its category ∈ `budget_categories` (empty = any) AND its wallet ∈
`budget_wallets` (empty = any) AND its wallet's currency = the budget's.

Two things about that rule are easy to get wrong. **The sign is not filtered**:
every row in a counted category is summed negated, so a refund (a positive
amount under an expense category) *reduces* the spend rather than being ignored.
And the kind filter is what makes an empty category set safe — it means "any
expense category", never "any category including salary". **Balance adjustments
are not excluded by name**, deliberately: the alternative is a copy of the string
in `src/lib/adjustments.ts` living in SQL with nothing keeping the two in step,
and it buys nothing, because the editor requires at least one category and
nobody picks that one.

"Reset" is still not stored, but it is no longer always the calendar month.
`period` is `monthly | weekly | yearly` and `resets_on` is **one integer read
three ways** — day of month 1–31 (clamped to short months, so a payday budget on
the 31st runs 31 Jan → 28 Feb), weekday 0–6 with 0 = Sunday (matching both
`extract(dow)` and `getDay()`), or an ordinal 1–365 against a fixed *non-leap*
reference year, which is a month/day pair in disguise and is what stops an
anniversary drifting every February. That one column is why there is no separate
"custom" period.

`rollover` adds the previous period's unspent remainder to this period's limit —
**one period, never compounding**, and overspend never carries as a debt. The
*effective* limit (`amount + rolled_over`) is what every ring, bar and percentage
on screen is drawn against; the stored `amount` alone would disagree with the
header above it.

`show_on_home` and `home_order` are the Home rail: which budgets appear there and
in what order.

`budget_progress` also returns **`planned`** — spend booked into the rest of the
period that has not charged. It is drawn as a ghost segment ahead of the real
bar and is counted in **no** verdict, share or projection: a subscription due in
eleven days has not been spent, and a budget reading "over" because of one would
be answering a question nobody asked it.

Schedules: a **recurrence rule** that writes transactions by itself. Not a
transaction — it *makes* them, out to a rolling 120-day horizon, and they are
planned until their day comes.

`anchor` is the first occurrence and carries everything positional: day of month
for a monthly, weekday for a weekly, month-and-day for a yearly. That is why
there is no `resets_on` here the way budgets have one — a budget period is a
window that has to be *found* for an arbitrary day, and an occurrence is counted
off from a known start. It is also why the entry form asks for no extra date: the
transaction's own date is the anchor.

`target_wallet_id` non-null makes it a transfer schedule, materialised through
`create_transfer` so the pair is written by the one statement that owns
invariant 5, then both legs stamped with `schedule_id`. A **trigger refuses a
cross-currency pair** at write time, because `create_transfer` takes two
independent leg amounts and a schedule stores one — inventing a rate is what
invariant 8 defers.

`materialised_through` is the high-water mark, and it does two jobs: it makes a
second call in the same horizon a no-op, and it makes a **deliberately deleted
occurrence stay deleted**, since generation only fills the range beyond it.
Deleting one planned row skips that charge and nothing else.

Wallet theming: `glyph` (icon name string) + `color_scheme` (design token).

## Schema

**The authoritative schema is `supabase/migrations/`** — read it there rather than
keeping a copy in this file. Tables: `wallets`, `categories`, `tags`,
`transactions`, `budgets`, `schedules`, plus join tables `wallet_categories`,
`transaction_tags`, `budget_categories`, `budget_wallets`.

Plus `user_settings` — one row per user holding the appearance preference.

Enforced outside the DDL:
- Transfer pairing/balancing → `create_transfer(...)`, deletion via `delete_transfer(...)`
- `settled_transactions` view — `transactions` dated today or earlier. The one
  definition of "has happened"; see invariant 3b for what reads it and what does
  not. Note `select *` is expanded at *creation*, so adding a column to
  `transactions` means a `create or replace` here too — which is legal, since
  the rule only permits appending to the end of a view's column list
- `wallet_balances(today = current_date)` — settled balance per wallet, plus a
  `planned` column for what is booked against it. **A function, not the view it
  replaces**, for the reason `budget_progress` became one: the settled/planned
  boundary is a calendar day (invariant 3) and `current_date` is the *server's*,
  in UTC, so between local midnight and 02:00 a transaction entered for today
  would read as planned and the balance would silently refuse to move
- `monthly_category_totals` view — pre-aggregated month/category/currency totals for charts, transfer legs excluded
- `balance_history(currency, from, to, max_points = 400, anchor = null)` —
  running total wealth per day, for the feed chart, its prior-period overlay and
  its forecast. Thins to at most `max_points` rows by taking every Nth day,
  counting back from `to` so the final day always survives and keeping `from`
  unconditionally. Ranges shorter than `max_points` days are unaffected — the
  step collapses to 1.
  **`anchor` is a third day kept unconditionally, and the chart cannot do
  without it.** The range now ends a month past today, so *today* — where the
  solid line stops, the fill's sign can flip and the end dot sits — is an
  interior point rather than the edge. Measured over the full history at 60
  points the step is 18 days and today is simply absent from the result; being a
  day out on the join between what happened and what is coming is the one place
  here a sampled point will not do.
- `budget_progress(today = current_date)` — one row per budget for the period
  containing `today`, with its bounds, its spend, its rolled-over remainder and
  its scope counts. **A function, not the view it replaces**, and the argument is
  the point: `current_date` is the *server's* day, and a period boundary here is
  a calendar day the way `transactions.date` is (invariant 3), so the phone says
  which day it is. Verdict, share, projection and days-left are deliberately not
  columns — they are arithmetic over these, they change with no write behind
  them, and `src/lib/budgets.ts` owns them
- `budget_period_bounds(period, resets_on, on)` / `budget_month_anchor(month, day)`
  — the half-open range containing a day. Everything about periods is answered
  here once, so no caller has to know that months clamp and years do not. The day
  before a period started is by definition in the previous one, which is how
  `budget_progress` finds the rollover's window with the same function
- `budget_spend(budget, user, currency, from, to)` — one budget's spend over a
  day range, split out because the rollover needs the same answer for the period
  before and two copies of those membership rules is how a budget starts
  disagreeing with itself. **Unchanged by the settled/planned split**: the range
  is already half-open, so clamping the caller's bounds is the whole of it —
  settled is `[start, least(end, today + 1))` and planned is
  `[greatest(start, today + 1), end)`. The rollover's window is the period
  before this one and therefore entirely in the past, where nothing planned can
  live, so it keeps its own bounds
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
- `schedule_occurrences(anchor, frequency, every_n, ends_on, from, to)` — the one
  occurrence generator, used by everything that needs to know when a rule fires.
  A `generate_series` over **ordinals**, so every date is `anchor + n·step`.
  The far shorter `generate_series(anchor, hi, '1 month')` *walks* — it adds the
  step to the previous value — and that was a real bug, caught by test rather
  than by reading: it returned 31 Jan, 28 Feb, **28 Mar**, 28 Apr, so a
  subscription on the 31st slid backwards permanently the first time it met a
  short month, and a yearly anchored on 29 February never saw another leap day.
  Counting from the anchor gives 31 Jan, 28 Feb, 31 Mar, and Postgres does the
  clamping. `src/lib/schedules.ts` mirrors this rule client-side and must keep
  agreeing with it — the list would otherwise name a date the feed does not show
- `materialise_schedules(today = current_date, horizon_days = 120)` — writes
  every occurrence due in `(materialised_through, today + horizon]`, advances
  the mark, and returns how many rows it made. Called by the app **on open**;
  there is no cron and no server, so the one moment the app is certainly running
  is the moment it starts. Unopened for a month means that month's occurrences
  arrive at once carrying their true dates — late to appear, never wrong about
  when they happened
- `reschedule(id, today)` / `set_schedule_active(id, active, today)` /
  `delete_schedule(id, today)` — all three drop the rule's rows **after today**
  and never touch the past. Editing a subscription changes what it will charge,
  not what it charged; pausing has to take the already-written future with it or
  a paused rule keeps charging for four months; deleting cancels what is coming
  and leaves the nine months it already charged as ordinary transactions, which
  is what `on delete set null` on `transactions.schedule_id` is for
- `monthly_cash_flow` view — money in and money out per month per currency, kept
  apart rather than netted. Not derivable from `monthly_category_totals`, which
  sums *signed* amounts per category and so reports a refund as a smaller total
  with no way back to the two figures.
- `spending_pace(currency, start, step, periods = 6, max_points = 120)` —
  cumulative spend through a period against the median of the preceding ones,
  both series in one bounded answer. See the Insight tab roadmap item.
- `category_period_totals(currency, start, step, periods = 6)` — spend per
  category for a period and the six before it, `period_index` 0 being the
  selected one

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
- **The fill anchors to zero, never to the plot floor.** The area means
  "distance from zero", so it cannot appear on the far side of it. Anchoring to
  the axis minimum (`areaStyle.origin: 'start'`) draws fill *through* zero under
  a rising stretch, where the visualMap then correctly paints it expense-red —
  so a positive balance grows a red shadow beneath it. Zero-anchored is the
  ECharts default; it is named explicitly in the option as a note not to reach
  for the other one.

  What tempts you towards `'start'` is a one-sided series: when the balance
  never approaches zero, the area between it and zero is most of the plot, and
  at a heavy opacity that reads as a slab rather than a measurement. The answer
  is the opacity, not the anchor — 0.16, not the handoff's 0.3, because 0.3 was
  the *top of a fade* and a flat 0.3 is far more ink than a 30%→0 gradient. The
  fade itself is not reproducible while `visualMap` owns the series colour;
  splitting the area onto its own ungoverned series would buy it, at the cost of
  the sign split on the fill.

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

**The app icon is the one thing outside this system.** It is the app's own
balance chart cropped to a rounded tile: red while the balance is below zero,
green above it, with the fill sitting **between the line and the undrawn zero
line** — the same rule `BalanceChart` follows, which is why zero is never drawn
and the colour change is what marks it. It ends on the chart's white last-point
dot just above zero, so the mark reads as a recovery.

The colours are the app's own expense and income at their **dark-theme**
values, resolved to hex (`#d7654b`, `#7cbd89`) on a fixed `#1e1f21` tile. That
tile grey is deliberately lighter than either ground so the icon reads as an
object on both. Nothing here re-themes: the icon is baked into the home screen
at install time and cannot follow a user who later picks Copper.

**`scripts/build-icons.mjs` is the source of truth**, run on demand with `npm
run icons` and deliberately *not* part of `npm run build` — these change once a
year and rasterising them per deploy would add a dependency the app does not
otherwise need. The geometry lives in that script rather than in a file read
from `design/`, because the design bundles are gitignored: the script is the
only copy of the mark actually in the repository, and PNGs nobody can
regenerate are worse than none. `@resvg/resvg-js` is a devDependency for this
one job.

It emits the whole set: `favicon.svg` with the **full** mark (a 16px slot is 32
device pixels on a retina display, where the dot is still legible), 16/32 PNGs
and a two-frame `favicon.ico` with the **dot dropped** (below ~24px the white
ring closes up into a blob), 192/256/384/512 for the manifest, a maskable 512
with square corners and the artwork pulled into the inner 80%, and a 180 for
Apple with no radius since iOS applies its own.

`src/auth/AppMark.tsx` is the same artwork inline, for the login screen — inline
rather than an `<img>` so it paints with the first frame, since it is the only
thing above the fold there. Its gradient ids come from `useId`; two marks on one
page with hardcoded ids would have the second silently reuse the first's fills.


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

ECharts is code-split so it stays off the login path — **~202 kB gzipped initial,
~189 kB for the chart chunk**. The initial figure was ~174 kB after the visual
refresh and grew to ~177 with the wallet add button and balance-adjustment
sheet, then to ~190 when the glyph set went from 111 to 256 (that 12 kB is icons
and nothing else), then to ~194 with the whole Insight tab — four blocks for
4.5 kB, because none of them is an ECharts instance — and then to ~202 with
budgets: three screens, three drawers and two pickers for 8 kB, on the same
argument. Scheduled transactions took it to **~207** — two screens, a drawer and
the planned treatment for 5 kB, and the chart chunk did not move at all, because
the forecast is a second series on a chart that already existed. Keep an eye on
this: a second charting library adds to that budget rather than replacing it.

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
   (six-month history, transfer variant — see item 20 for the budget block that
   used to sit there), and Appearance (mode,
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

    The screen carries **its own add button**, in the dock's position and shape
    but painted in the wallet's colour rather than the accent — this screen is
    themed by the wallet the whole way down, the same argument the entry screen
    makes for its category-coloured Save. It goes to **`/add?wallet=<id>`**, and
    the scroll column reserves `DOCK_SPACER` so the last feed row still clears
    it. The wallet travels in the URL rather than in router state so a reload
    keeps it. In `AddScreen` it is a *starting value* that outranks
    `useLastUsedWallet` and does not wait on it — the caller has already
    answered the question that query exists to answer — and it is still checked
    against `activeWallets` before it is used, so an id that no longer resolves
    falls through to the ordinary default. The button is **not drawn on an
    archived wallet**: a closed wallet is hidden from the entry form's select,
    so it would open a form that immediately disagreed with where it came
    from.
11. **Editing a wallet — DONE.** Pencil on the detail header → `/wallets/:id/edit`:
    name, colour, and the type's own number (credit limit, or settlements —
    which is how the imported `Kredyty` finally gets an installment count).
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
    **The balance is not a field on that form** — it is
    `src/screens/wallets/AdjustBalanceSheet.tsx`, opened from a row on the
    wallet detail screen (where the balance is the figure being read) and from
    a row on the edit screen. One implementation, because it is one act: the
    edit screen used to carry its own copy of the subtraction, which saved with
    the form and could not offer a card's remaining reading.

    It opens on what the wallet is worth *now*, so leaving it alone records
    nothing and typing what the bank says is the whole interaction — **the user
    never computes the difference**, which was the point of building it.

    Same three readings as the create screen, plus a fourth for a credit card:
    **Remaining or Owed**, on a segmented track, because a statement quotes what
    is left to spend and the wallet stores what is owed (`remaining =
    credit_limit + balance`, balance negative). Both are offered rather than
    remaining alone, since the screen behind the sheet leads with *Owed* and a
    silent switch would disagree with the figure above it. Moving the segment
    re-seeds the field — leaving the other quote in place would offer an
    adjustment the size of the credit limit — and that re-seed happens **during
    render, not in an effect**, or one paint shows the wrong reading. It is
    keyed on open-plus-reading rather than on the balance, so a background
    refetch cannot overwrite what has been typed.

    The trap in seeding is the **overdrawn account**: `toRawAmount` is never
    signed, so a naive seed drops the minus and −123,45 reads back as +123,45,
    offering an adjustment of twice the balance. The sign is put back for the
    readings that can legitimately go negative (an account, a card past its
    limit) and withheld from the debt readings, which ask what is *owed*.
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

    **The colour field rises from the bottom of the screen, not down from the
    top**, and it is on the frame rather than on a header block — all three
    screens set it through `colourFieldStyle` on `FullScreen`'s own `style`, so
    the wash stays put while content scrolls over it.

    It was top-anchored first, and that is worth knowing because it failed for a
    reason no amount of CSS could fix. The strongest tint sat in the header, and
    the header ends against the strip iOS paints *above* the web view — with
    `apple-mobile-web-app-status-bar-style: default` the status bar is outside
    the app entirely, so nothing in the document reaches it. Two attempts went
    by: giving the field the safe-area inset so it started at y=0 (which fixed a
    second, real band the frame's own padding was adding), then lending iOS the
    field's top colour through `<meta name="theme-color">` while such a screen
    was mounted. Both worked, and it still read as a stripe.

    Lighting the screen from below sidesteps the whole problem: the top is plain
    ground, so there is nothing for the untouchable band to fail to match, and
    the entry screen gets what the handoff actually asked for — keys sitting on
    the tint. `black-translucent` would put content under the bar for real and
    stays rejected; see the standalone-metadata note above for the measurement.

    **Every text field is at least 16px, and that is a hard floor.** iOS zooms
    the viewport when a focused field is smaller and never zooms back out,
    leaving the whole app scrolled sideways; Safari has ignored
    `user-scalable=no` and `maximum-scale` since iOS 10, so the font size is the
    only lever. The handoff puts body text at 14.5–15px and the fields
    deliberately deviate — a pixel and a half against an app that has to be
    pinched back into place is not a trade. `index.css` carries a floor on
    `input, select, textarea, button`, but it is a net and not the rule: a
    Tailwind utility beats an element selector, so each field states its own
    size.

    **`button` is in that selector and arguably should not be** — iOS zooms a
    focused *text field*, and a button is never one. The consequence is a trap:
    a button that does not state a size renders at 16px wherever it sits, so an
    inline one inside a 12.5px paragraph comes out half again as large as the
    sentence around it. Every button in the app happens to carry its own
    `text-[…]`, which is why this stayed invisible until one did not. Narrowing
    the selector is the real fix and is a change to make deliberately, with the
    whole button set re-checked, not as a drive-by.

    **The system keyboard and the calculator keypad are never up together.**
    Typing a note, a received amount or a category search raises iOS's keyboard
    over the keypad, which left two keyboards fighting for the same 330px and
    Save buried under both.

    **Focus decides whether the keypad is drawn** — `useTextFieldFocused`, a
    document-level `focusin`/`focusout` listener, because the drawer's search box
    is the case that matters most and lives elsewhere in the tree. The visual
    viewport was tried first and is the better answer in theory, since it knows
    where the keyboard actually *is*; it did not reliably report one in the
    installed standalone app, and the keypad stayed put on the device while
    testing clean in Safari. Focus is what the app can be sure of.

    `useKeyboardInset` still earns its place next to it: it is the only thing
    that can say how far up to lift Save. Being wrong there costs a nudge, not
    the whole behaviour — which is the right way round for a signal that cannot
    be trusted in standalone.

    Note `focusout` fires *before* focus lands, so `activeElement` is briefly
    `<body>` between two fields; that read is deferred a task, or the keypad
    flashes back in between them.

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
    - **The range is now `1M / 1Q / 1Y / All`, defaulting to `1Q`.** `7D` is
      gone — a week of a *balance* is a flat line — and `1Q` fills the gap
      people actually wanted, which is also why the chart opens on it rather
      than on `1Y`. The state is local, not persisted, so no migration was
      needed.
    - **"Count in total wealth" was not built.** It needs a new column and it
      contradicts the rule that the wallets screen's totals run over every
      wallet, archived included. Recurring and the category editor's "Monthly
      budget" row are absent for the same kind of reason: no schema behind them.
    - **The wallet colour row offers all ten slots**, not the handoff's seven.
      A wallet drawn from a narrower set would be the only place in the app
      where a colour is unavailable for no stated reason.
    - **The add button is a circle, not the handoff's 60×60 at radius 22.** A
      rounded square sitting 10px from a pill of the same height put two
      different corner radii side by side at the only place they touch, and it
      read as a mismatch rather than as a contrast. Both are radius 999 now. The
      cost is that the button no longer distinguishes itself from the bar by
      shape and leans on its colour and its own lane to do it — which is also
      why the wallet detail screen's copy of it (painted in the wallet's colour)
      had to change in the same breath. Two buttons, one shape, always.

    Built beyond a restyle, because they were cheap and the prototypes show
    them: a **wallet icon picker** (which is why `wallets.glyph` is nullable now
    — see `walletGlyph`), a read-only **Tags** list, **Export data** as a CSV,
    and the static Currency and About rows.

    `src/lib/export.ts` is **paged**, and that is not optional: PostgREST caps a
    response at 1000 rows and enforces it by silently truncating, and there are
    over five thousand transactions. An unpaged select would produce a file that
    parses perfectly and quietly stops in 2024.

15. **Icon and login — DONE**, against
    `design/design_handoff_icon_login/`. The new mark (above) replaces the gold
    two-series overlay, and the login screen is rebuilt in the refresh's
    language: the mark, a 30px "Sign in", labelled fields on card wells with a
    focus ring drawn as a `box-shadow` (a border would shift the text by a
    pixel), a reveal toggle, "Keep me signed in", and an accent button that
    stays disabled until both fields have something in them.

    Two deviations from that handoff, both because the app is single-account:
    there is no "Forgot password?" link and no "Create one" footer — sign-ups
    are disabled in Supabase Auth and the one account was made by hand, so the
    footer says that instead of offering a route that cannot work. The lock-out
    countdown state is also absent; Supabase's own rate limiting is what would
    drive it, and inventing a timer the server does not report would be a lie.

    Supabase returns "Invalid login credentials" for a bad pair; the screen says
    "Wrong email or password." and clears it on the next keystroke in either
    field. Any other error is shown as it came, because it is a real fault.

16. **Insight tab — DONE**, against `design/design_handoff_insight_tab/`. Four
    blocks in one scroll — **Pace, Cash flow, Categories, Balances** — in that
    order, because the first question is always "am I fine right now" and the
    rest is context. `src/screens/insights/`.

    **One sticky control owns the period for all four**, so the answers always
    describe the same window; no block carries its own range switch. Four
    independent pickers would be four chances for the screen to contradict
    itself.

    **Periods are calendar-aligned and steppable**, unlike the feed's trailing
    windows, and `src/lib/insights.ts` is the whole of that maths. The feed reads
    a *balance*, where a sliding thirty days is exactly right; this screen reads
    a *period*, and every sentence on it — "day 18 of 31", "usual for August",
    "vs typical August" — is meaningless against a window that started on the
    19th of last month. **There is no All time**: nothing precedes it to compare
    against and it has no end to project towards, so Pace would half-answer on
    it. The lifetime view already lives on the Home chart.

    **Nothing here is an ECharts instance.** No axis engine, no zoom, and the
    handoff itself rules out tooltips on the first pass, so the 189 kB chart
    chunk would have been the entire cost for none of the benefit — the same
    call `Sparkline` makes. All four blocks are hand-rolled SVG, and every SVG
    scales uniformly (`width: 100%`, `height: auto`) rather than through
    `preserveAspectRatio: none`, which would widen every stroke with the card
    and turn the end dot into an ellipse.

    **Three new aggregates, each row-bounded by construction** — see the schema
    list. That is not tidiness: PostgREST truncates past 1000 rows silently
    (invariant 2), and a daily expense series over seven years is 2 500. The
    widest real case measured 157 rows.

    **The median must ignore periods the records do not cover, and that was a
    real bug, not a precaution.** On 1Y the six preceding years reach 2020 while
    the history starts 2023-10-15, so three empty years and one ten-week year
    folded in as near-zeros and put "usual" at 29,55 zł a day against a real
    781,46 — the chart reported a catastrophe when what it had found was the
    edge of the data. `spending_pace` now counts a prior period only if it
    *starts* on or after the first transaction, so a partial period is dropped
    for the same reason an empty one is. When nothing survives, `typical` comes
    back null the whole way down and the card drops its chip and its projection
    sentence rather than inventing a comparison. `bucketFlow` draws the same
    line client-side for the cash-flow average, and marks unrecorded columns
    with an em dash — printing "+0" would claim the period broke even.

    Two comparisons on the Pace card are allowed to disagree, and the copy is
    written so that reads as intended rather than as a bug: the chip reads *now*
    (spend to date against the median at the same day), the sentence reads *the
    finish* (a linear projection against the median's whole period). A month
    that usually spends late is genuinely on pace today and genuinely lands
    under, because a straight line cannot know about the back half. They are
    coloured by their own verdicts, not by one shared tone.

    **Delta colour is judgement, not direction**, in both the pace chip and the
    category rows: over the median is expense-red, under is income-green, and
    within **±10%** takes no colour at all. One threshold (`LEVEL_BAND`), so a
    category and the period containing it cannot disagree about what counts as
    normal.

    In the cash-flow block **both bars rise from a shared baseline**. A diverging
    chart spends half its height repeating what the colour already says and
    leaves the two impossible to compare, since neither starts where the other
    does. The bar heights are a *floor*, never a rescale — the real data is
    lumpy enough that one month had no income at all beside one at ten times the
    outflow, and normalising each column would destroy the only comparison the
    chart exists to make.

    Five deviations from the handoff, all deliberate:

    - **No currency picker.** v1 is PLN-only (invariant 8); there is one
      currency to pick.
    - **No All time**, as above.
    - **Wallet trend lines share a *span*, not a min/max.** `Sparkline` takes an
      optional `span` and centres each series on its own mean. The literal
      reading is unusable here: with a loan at −20 000 in the set, one shared
      min/max flattens every other wallet to a dead line through the middle.
    - **Those lines cover the wallet's whole monthly history, not the selected
      period.** A 1M period is one row of `wallet_monthly_net` and therefore no
      line at all, and a per-wallet daily series would be a fifth round trip and
      ~150 rows to draw a 56px mark. The period owns the total; the row shows
      the wallet.
    - **"All N categories" expands in place** instead of linking out. There is
      no category detail screen to link to.

    One layout note worth keeping: **a sticky header inside `AppShell` has to be
    pulled up by `--safe-top`.** `<main>` carries that inset as padding, and a
    sticky element's offsets are measured against the scrollport, which is the
    padding box — so `top: 0` alone parks the header 12px down and leaves a band
    of bare scrollport above it with rows visibly sliding through. A negative
    margin of `--safe-top` with the same value added back as padding puts the
    opaque edge at the true top and changes nothing below it.

17. **Budgets — DONE**, against `design/design_handoff_budgets/`. Three surfaces
    over one model: the **list** (`/budgets`, the `ti-target` tab that was a
    placeholder), the **editor** (`/budgets/new`, `/budgets/:id/edit`) and the
    **Home rail**, now rings. `src/screens/budgets/`, with the maths in
    `src/lib/budgets.ts` and the schema changes described above.

    **The tab bar did not change.** The tab and its route already existed; only
    what they point at did. The FAB stays a transaction everywhere, budgets
    included — `CREATES` gains no entry, and the plus that makes a budget is a
    38px tile in the list's own title row.

    **The list groups by verdict, not by size**, so the screen answers "what
    needs attention" before "what did I set": over → at risk → on track, and
    inside a group by *share of limit* descending. A 200 zł budget at 140% is
    worth reading before a 3 000 zł one at 60%, and only the share says so.
    Empty groups are omitted entirely, label row included.

    **"At risk" is a straight line, and the copy says so.** Projection is
    `spend / dayOfPeriod × daysInPeriod`, which cannot know that a month usually
    spends late — so a period that always does will be called at risk and land
    fine. Nothing is at risk **before its third day** (`RATE_SETTLES_ON_DAY`),
    where a single big shop projects thirty of them.

    Four decisions taken against the handoff's literal text:

    - **`resetsOn` is a grid, not a wheel.** A wheel is an iOS picker imitated
      in the DOM — momentum, snapping, a hit area one row tall, three of
      thirty-one options visible. The 7-column grid shows all of them and
      matches the calendar grid the date sheet already draws. It stops at 28
      with a separate "Last day of the month" row rather than offering 29–31 and
      clamping quietly: the database *does* clamp, but a budget that says "the
      31st" and runs to the 28th is a surprise worth not building.
    - **The group identity follows the *first* category picked**, not the
      largest member. "Largest" means a spend query the editor otherwise does
      not need, and the category someone reaches for first is what the budget is
      about. Adding a second category never re-themes what is already on screen,
      and any manual edit to the name, colour or glyph stops the following.
    - **The Home-order screen is a route, not a sheet.** A drawer claims the
      vertical axis twice over — its own scroll and its drag-to-dismiss — and a
      drag reorder is a third claim, which is the fight the wallet category
      picker records losing. It would also have to be an `absolute inset-0` child
      of an unpositioned `<main>`, the one arrangement in this app never verified
      on a device.
    - **The period summary only names a month when every budget is in it.** The
      handoff assumes one shared calendar month; a payday budget resetting on the
      25th genuinely is a different window, and a card headed "Budgeted in
      August" summing them would be quietly wrong. It reads "Budgeted now"
      instead. The days-left chip is likewise the *soonest* reset.

    **The rail's ring animates its dash offset, not its arc.** `stroke-dasharray`
    is fixed at the circumference and only the offset moves, so the browser
    interpolates one number and the arc sweeps rather than being re-laid-out. The
    entry duration is **state, not a ref read during render** — a ref flipped
    inside the effect changes on the very render that sets the offset, so the
    420ms sweep would run at the 260ms tween's duration. `prefers-reduced-motion`
    needs no code here: index.css flattens every duration, and the ring appears
    at its final geometry.

    Two other things worth knowing. The picker screens **take over the editor's
    frame** rather than overlaying it — the editor is the same component
    returning a different tree, so the draft they write into is never rebuilt,
    which is exactly what `NewWalletScreen` does. And `useSetHomeOrder` sends
    **one request per budget** rather than upserting the set: an upsert would
    have to carry every not-null column of a row that screen does not own, and a
    stale name or limit would silently overwrite an edit made elsewhere.

    **Verified against the real database, not in a browser** — there is no
    browser automation on this machine. Every check ran inside a rolled-back
    transaction against the live data: the period bounds for all three periods
    including the February clamp and a leap year, a scoped budget's spend and
    rollover agreeing exactly with the same figures computed by hand off
    `transactions`, and the two new counting rules — a 100 zł refund reduced the
    spend by exactly 100 zł, and an income-category row of the same size on the
    same wallet did not move it at all. **Nothing was left behind**; the app has
    still never created a budget, so the list and the rail have only been seen in
    their empty states.
18. **Scheduled and planned transactions — DONE.** The future, in three
    pieces: a transaction can be dated ahead, a **schedule** writes those rows
    by itself, and the Home chart continues a month past today as a dotted
    tail. `src/screens/schedules/`, `src/lib/schedules.ts`, and the two
    migrations described above.

    **A future date was always accepted and that was the problem**, not the
    feature. `transactions.date` is a plain DATE and the date sheet has always
    paged into next month, so rent entered for the 1st came straight off total
    wealth, counted against a budget and landed in the Insight tab. Being
    possible and being wrong is worse than being impossible. Invariant 3b is the
    fix, and it is one view rather than a predicate copied into eight bodies.

    **Occurrences are written ahead, not projected.** Because a planned row is
    harmless to every aggregate by construction, materialising four months early
    costs nothing and buys a great deal: a subscription is a real row weeks
    before it charges, so it can be skipped by deleting it and amended by
    editing it, the Upcoming list is tappable, and the forecast needs no
    projection SQL at all — it is the same `balance_history` call run a month
    further.

    **Creation is the entry screen's Repeats row**, not a second form. A
    schedule is a transaction plus a cadence, and the entry screen is where a
    transaction gets typed — keypad, category sheet, wallet select. The sheet
    asks only *how often*, never *which day*: the transaction's own date is the
    anchor, and a second control saying the same thing is exactly what the
    transfer flow avoids by making the category's kind the mode switch. The
    Scheduled list's plus routes to `/add?repeat=1`, so there is one creation
    path. `/scheduled/:id/edit` is editing only.

    **The list is ordered by when each rule next charges**, so it reads as a
    queue — the question anybody opens it with is "what is about to come out",
    which is a different order from alphabetical or largest-first. Paused and
    finished rules sink by having no next date, and are dimmed rather than
    hidden.

    Three decisions taken against the obvious:

    - **The planned mark is not the dashed ring.** That means "not a purchase"
      and is worn by transfers and adjustments; a planned expense is very much a
      purchase, and what makes it different is *when*. So the glyph is left
      alone, the amount drops to `ink-faint` instead of shouting income green or
      expense red, and a small mark says why — a clock for a date chosen by
      hand, a repeat arrow for one a schedule wrote. Worth telling apart:
      deleting the first is the end of it, deleting the second skips one charge.
    - **The forecast is a fixed month on every range**, so 1M draws two months
      and 1Q four. The tail means "what is already booked", which is a quantity
      of future rather than a fraction of whatever window is selected — a third
      of 1Y would be four months of mostly nothing.
    - **`useLastUsedWallet` skips rows a schedule wrote.** The question is which
      wallet *you* were last working in, and materialisation runs on app open,
      so without it the answer after every cold start would be whichever wallet
      a subscription happens to charge.

    **Two real bugs were caught by testing rather than by reading**, both
    recorded above: `generate_series` with an interval walks instead of counting
    from the anchor, which slid a monthly-on-the-31st permanently back to the
    28th; and `balance_history`'s thinning drops *today* from the series once
    the range runs past it, which is what `p_anchor` exists for.

    **Verified against the real database, not in a browser.** Every check ran
    inside a rolled-back transaction, some of them under `set local role
    authenticated` with a real JWT subject so `auth.uid()` resolved and RLS was
    the boundary it is in the browser — which is the only way to exercise
    `create_transfer` from the materialiser at all. The strongest check was
    free: nothing in the import is future-dated, so all eleven rewritten
    aggregates had to come back **byte-identical**, and they did. Then a
    future-dated row proved invisible to every one of them while `planned`
    picked it up and the forecast stepped on exactly the right day; occurrence
    clamping was checked across leap years and short months; the materialiser
    was run three times for 12 / 0 / 0 rows created with a hand-deleted
    occurrence staying deleted; a transfer schedule produced five balanced pairs
    with both legs stamped; and `archive_wallet` and the cross-currency trigger
    both raised their own sentences.

    **Not built, deliberately.** Cross-currency schedules (one stored amount,
    two independent legs — invariant 8 defers the rate). Tags on a schedule, for
    the reason transfers have none. Notifications: the row is already on screen,
    and iOS PWAs are the wrong place to start.
19. **Feeds are one month at a time — DONE.** Both transaction lists stopped
    being a rolling hundred rows and became a calendar month with a `‹ August ›`
    stepper over them: the Home list, where the stepper sits where the "Recent"
    label used to, directly under the budget rail; and the wallet detail feed,
    where it sits between the Adjust balance / Categories card and the list.

    **The stepper is independent of the chart's range, by decision.** The chart
    reads a *balance*, which is a trailing window that has to end at today (and
    a month past it, for the forecast); the list reads what happened, which is a
    page you turn. Tying them together would mean either a chart that can no
    longer end at now or a list you cannot leave August without also rewriting
    the picture above it. Two controls, two questions.

    **The month name is the heading, not a label above one.** "Recent" was true
    of a rolling window and is a lie the moment the reader steps back to March,
    so the row is the control and the heading at once — 15px ink rather than the
    uppercase `Label`. On Home the `/scheduled` link keeps its place on the
    right of that row and shortened to "Scheduled" to fit beside it, so the
    stepper is a compact cluster on the left with a minimum-width label — which
    is what stops the right chevron walking sideways between "May" and
    "September". The wallet screen has nothing else on that line and takes the
    component's `spread`: chevrons at the two edges, month centred between them.
    Same bounds, same labels, one component.

    **`src/components/MonthStepper.tsx` owns both bounds**, rather than each
    screen computing its own — two callers with two copies of "where does the
    history end" is how they start disagreeing. Forward stops at the current
    month, because these lists are settled rows only and every month past this
    one is empty by construction (invariant 3b). Back stops at the month of the
    first activity *the caller knows about*, which is deliberately a different
    fact on each screen: the whole history on Home (from
    `useEarliestTransactionDate`, which is why that query now has two callers),
    and this wallet's own first month on the detail screen. `earliest={null}`
    means not yet known and disables the chevron for a beat rather than offering
    a step whose destination has not arrived.

    **The wallet's floor costs no query.** `wallet_monthly_net` is already
    loaded there for the sparkline and holds one row per month the wallet saw
    movement in, so the earliest of them *is* the first month there is anything
    to show. Reaching for the global first-transaction date instead would let a
    wallet opened last year page back through 2023 to find nothing.

    `useMonthTransactions(month)` replaces `useRecentTransactions`, and
    `useWalletTransactions` took a `month` in place of its `limit`. Both clamp
    the upper bound to **`today()`**, the phone's day, so the current month
    stops at the record and the planned rows further down it stay on
    `/scheduled`; a month entirely in the future is answered without a round
    trip. The wallet's *sibling* query stays unbounded by date — it is looked up
    by `transfer_id`, and a pair shares a day anyway.

    **There is no paging and none is needed** — the calendar is the bound.
    Measured over the real import, the busiest month across every wallet is
    **224 rows**, so a month would have to be four times heavier than anything
    ever recorded to reach PostgREST's silent 1000-row truncation (invariant 2).

20. **The transaction detail screen's lower half — DONE.**

    **"Against the budget" is gone, because it was lying.** The block picked the
    budget with `budgets.find((b) => b.currency === CURRENCY)` — the *first* one
    in the currency — while its own comment claimed it found the budgets "this
    transaction could count against". It read neither `budget_categories` nor
    `budget_wallets`, so an mBank transaction was shown against a Credit Card
    Spending budget it can never touch, complete with a bar and "This one is
    405,90 zł of it." Every figure on it was real; the pairing was invented.

    Rebuilding it honestly would mean re-implementing the membership rule from
    the domain model (expense kind, no `transfer_id`, category ∈ scope, wallet ∈
    scope, currency match) in the browser, where it would be a second copy of
    what `budget_spend` owns in SQL — the exact drift invariant the budgets work
    avoided by having one definition. It is removed rather than patched; a row's
    budget context belongs on the budget detail screen that is still undesigned
    (item 21), reading the same relation the rest of the app does.

    **The category history says what it means.** The six-month block at
    the foot of the transaction detail screen was a row of bars, a peak figure
    and nothing else; it is now quoted per bar and carries one sentence saying
    whether the month being shown was a normal one.

    **Every bar carries its own figure** — whole units, no sign, but the unit
    named. Grosze and a leading minus would double the width of every quote to
    repeat what the category and the sentence below already say; the currency
    would not, and a bare number in a money app is the one thing worth spelling
    out. It rides at 9px in a dimmer ink so the figure reads first. The size is
    decided by the widest month in the real import — Salary at 34 046 zł, about
    41px of a 47px column at 10px — which is also why the columns dropped from
    `gap-2.5` to `gap-2`. What the card used to say instead
    was "peak 738,00 zł", which had a bug in it: the peak was taken over *every*
    month the category had ever seen while the bars drew six, so the number
    routinely named a height no bar on screen had. It is gone rather than fixed
    — the tallest bar is the one thing a bar chart never needed help saying.

    **The window ends at the row's own month, not at today's.** A transaction
    from 2024 was being shown beside the last six months of *now*, which contain
    neither it nor anything near it: the block claimed to be context and was
    about a different year. It is capped at the current month, because
    `monthly_category_totals` is settled-only and a planned row's month has
    nothing in it yet — so the sentence **names its month out loud**, and the cap
    can never be read as the row's own month.

    **A month still running is stated, never judged.** Comparing 21 days against
    five whole months would report nearly everything as under — the partial
    period trap `spending_pace` already documents — so the current month gets its
    figure and the typical one beside it and no verdict, while a finished month
    gets the full comparison. `medianOf`, `verdict` and the ±10% `LEVEL_BAND`
    come from `src/lib/insights.ts` rather than being recomputed, so this card
    and the Insight tab's Categories block cannot disagree about what counts as
    normal. Fewer than two recorded prior months says so instead of comparing; a
    typical of zero says "most months before it had none", which is the honest
    reading for an occasional category rather than a division by nothing.

    **A month the records do not reach shows an em dash, not a zero** — the same
    distinction `bucketFlow` draws, and the reason `useEarliestTransactionDate`
    now has a third caller. A recorded month with no spend in this category is a
    real zero and keeps its 3px stub.

    **`useMonthlyTotals` became `useCategoryMonthlyTotals(category, from, to)`,
    and that was a latent bug, not tidying.** The screen pulled every category's
    monthly totals for the currency and filtered in the browser: measured at
    **979 rows against PostgREST's 1000-row cap**, twenty-one rows of headroom
    on a table growing by about sixty a month. Truncation is silent (invariant
    2) and the rows arrive ordered by month, so it would have dropped the
    *newest* ones — the chart would have started drawing empty bars for recent
    months while looking perfectly well-formed. Scoped, the answer is six rows.

21. **Design-system reference — DONE.** `/dev/design-system`, with
    `/tokens`, `/components`, `/layout` and `/audit` as real addresses rather
    than anchors. `src/screens/dev/`.

    **Not reachable from the UI**, by request and by decision: no tab, no link,
    no row in More. It is a document for whoever is building the app, and a
    route a user can stumble into is a screen that has to be designed,
    explained and kept out of the way. It is still **behind the auth gate**,
    since `App` returns `<LoginPage />` before the router exists — nothing on
    the page touches data, so lifting it above that gate is a decision
    available later, not a rewrite.

    **Lazy, and that is load-bearing.** The page imports every component in the
    system so it can show them, which is precisely the import graph the initial
    chunk must not grow. Behind a `lazy()` it is its own **14 kB gzipped**
    chunk and the initial figure is unmoved at ~208. What it does cost everyone
    is **~0.4 kB of CSS**: Tailwind emits one stylesheet, so the grid,
    breakpoint and mono utilities this page introduces ship to the phone too.
    That is the honest price of keeping it in the app rather than in a separate
    build, and it buys a reference that cannot go stale.

    **Verified in a browser**, which is new for this project — the page was
    opened at `localhost`, all four panels read in both modes, and one bug
    caught that way: the header's accent swatches reached for `--color-gold`
    and `--color-copper`, which are not tokens (accents are literals in
    `ACCENTS`, and only the selected one is ever on `<html>`), so the two
    swatches whose names are not also category slots painted as nothing.

    **It reads the live tokens rather than restating them.** Every colour comes
    back out of `getComputedStyle` through `readToken` (newly exported from
    `theme/tokens.ts` for exactly this), so the page re-themes with Appearance
    and cannot drift from index.css the way a hand-written table would. Each
    swatch shows the declaration *and* the resolved sRGB, which is the fastest
    way to catch a colour defined in only one mode. The page carries its own
    mode/accent/tint switcher for that reason.

    **The one thing it restates is the type scale — because there is nothing to
    read.** That is the audit's first finding, not a shortcut.

    **It is the only screen not capped at `max-w-lg`.** A reference read on a
    desktop while building a desktop layout should not be squeezed into the
    phone frame it documents, and it is the only place in the app where a
    `sm:` breakpoint appears at all.

22. **The type scale, and the audit it came from — DONE.** The design-system
    reference (item 21) turned up eight findings; the six that stood between
    this design and a second form factor are fixed.

    **Type had no names, and that was the blocker.** It was set two ways —
    `text-[12.5px]` utilities (17 distinct values, ~300 uses) and inline
    `fontSize: 42` (14 more) — so there was nothing to *change*: a tablet
    wanting body text a point larger meant editing several hundred call sites.
    Every size now resolves through a token in `index.css` and nowhere else,
    **348 class literals and every inline size** rewritten.

    **The mechanism is the point.** Tailwind compiles `text-row` to
    `font-size: var(--text-row)`, so a second form factor re-sizes the app from
    one media query rather than a search-and-replace. Verified in the built
    stylesheet, not assumed.

    **`--text-label` would have collided with `--color-label`** — both compile
    to `.text-label` and one silently wins. The 11px step is `--text-kicker`,
    the name the app used before the refresh. Any future size token has to be
    checked against the colour namespace the same way.

    **Every inline `fontSize` was half of an "amount block"** — a figure and its
    unit — copied between nine screens with slightly different numbers. They are
    paired tokens now (`--text-figure` / `--text-figure-unit`, seven steps) so
    the two cannot scale apart. **Extracting the shared `<Amount>` component is
    deliberately not done**: tokenising buys the whole form-factor win, and a
    nine-screen extraction is a refactor with real regression risk that earns
    only DRY.

    **Near-duplicates were deliberately not collapsed.** 13.5 and 14 are still
    two names. Naming first is the right order — merging two named steps is now
    one line in index.css, where merging two literals would mean finding all 348
    sites again. Only two 1px unit sizes moved, on the 30px step, where Budgets
    used 17 and Appearance 15 against the other two's 16; a step cannot mean
    three things.

    **`max-w-lg` was written literally in three places** and is now
    `max-w-frame` against `--container-frame`.

    Two real bugs, both from the audit. **Two `<select>`s sat below the 16px iOS
    floor** (`AddScreen`) — the element-selector floor in index.css cannot catch
    a Tailwind utility, so focusing either zoomed the viewport with no way back;
    both take `--text-field`, which is named for that rule. And **`Tile`'s solid
    variant knocked its glyph out in `#fff`** — fine at light mode's ~50%
    lightness, about **2.2:1** at dark mode's ~70% — now `--color-accent-fg`,
    the token `Button` already uses for the same pairing, at about **6.4:1**.

    Three pieces of drift closed: `Button`'s `scrim` variant (used nowhere, and
    hardcoding the dark values of tokens that exist) is deleted; `LoginPage`'s
    `h-dvh` is `h-svh`, matching the frame's own fallback; the appearance
    swatch's `rounded-xl` is `rounded-tile-sm`.

    **Left open, on the page and on purpose.** Three radii are still outside the
    set (`rounded-lg` on the history bars, `borderRadius: 12` on the two
    drag-lifts) — they want names, and naming a radius is a design decision
    about what those things are. And there is still no breakpoint anywhere,
    which is correct until there is a second form factor to serve; what changed
    is that there is now something for one to *do*.

    **Verified in a browser**, on the real database at localhost: Home, the
    entry screen and its category sheet, a transaction detail, Insight, Wallets
    and the reference page itself, in dark mode. Every step lands where it
    should, including the three that only appear at one size — the 52/22 entry
    figure, the 44/20 hero and the 26px wallets total. Checked statically as
    well, since a rename that silently emits nothing is the failure mode here:
    all 41 `text-*` references, 27 as utilities and 14 as `var()`, resolve
    against the built stylesheet, and no literal remains in the source.

23. **Next:** hard-deleting a transaction-free wallet is still unbuilt — the FK
    already permits exactly that case and nothing else. Tag CRUD has no design
    yet, which is why `/tags` is a list and not an editor. The **budget detail
    screen** is named by the budgets handoff and deliberately left undesigned;
    until it exists, a list row and a rail card both open the editor, which is
    the only thing there is to do with a budget.
24. Deferred by explicit decision: split transactions, FX conversion in charts
   (`exchange_rates`), MCP/AI entry.

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
