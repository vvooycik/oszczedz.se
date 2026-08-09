# Budget Tracker — Project Context

Personal budget tracker (single real user), mobile-first PWA. Core differentiator:
rich, non-generic data visualization (spending history, balance over time, budgets).
No bank integrations — transactions entered manually. Possible future: MCP server for
AI-assisted entry (e.g. parsing transaction screenshots).

Live at **https://oszczedz-se.pages.dev** — deploys automatically from `main`.

## Stack (decided — do not substitute without discussion)

- **Frontend:** React + TypeScript + Vite, Tailwind CSS v4, TanStack Query, **ECharts** for all charts
- **Backend:** Supabase (Postgres + Auth + auto-generated REST API via supabase-js). No custom server.
- **Hosting:** Cloudflare Pages (static deploy from GitHub), app installed on iPhone as PWA ("Add to Home Screen")
- **Migrations:** Supabase CLI, files in `supabase/migrations/` committed to git. Never apply schema changes through the dashboard SQL editor.
- **Tooling:** Supabase CLI is a **devDependency**, always invoked as `npx supabase ...` — never assume a globally installed `supabase` binary, and never `npm install -g supabase` (unsupported by design). Claude Code itself is a machine-level tool (native installer), never a project dependency — it must not appear in `package.json`.

ECharts is used directly (`echarts/core` + explicit registration), not via a React
wrapper package — wrapper libraries lag React majors. `src/charts/EChart.tsx` is the
one place that touches the ECharts lifecycle.

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
- `loan` — starts at 0, goes negative via a transfer that credits a regular account; `interest_rate` and `installment_count` are informational metadata only, no logic uses them

Type-specific fields are nullable columns guarded by CHECK constraints (not JSONB — revisit only if type-specific fields multiply significantly).

Wallet↔Category M2M (`wallet_categories`) filters the category picker per wallet. **Empty set = all categories allowed.** UX-only; DB accepts any category on any wallet.

Budgets: limit on expenses per period. A transaction counts against a budget iff: it is an expense AND not part of a transfer AND its category ∈ `budget_categories` (empty = any) AND its wallet ∈ `budget_wallets` (empty = any) AND its wallet's currency = budget's currency. "Reset" is not stored — it is just grouping by calendar period in queries.

Wallet theming: `glyph` (icon name string) + `color_scheme` (design token).

## Schema

**The authoritative schema is `supabase/migrations/`** — read it there rather than
keeping a copy in this file. Tables: `wallets`, `categories`, `tags`,
`transactions`, `budgets`, plus join tables `wallet_categories`,
`transaction_tags`, `budget_categories`, `budget_wallets`.

Enforced outside the DDL:
- Transfer pairing/balancing → `create_transfer(...)`, deletion via `delete_transfer(...)`
- `wallet_balances` view — derived balance per wallet
- `monthly_category_totals` view — pre-aggregated month/category/currency totals for charts, transfer legs excluded

## Types

`src/lib/database.types.ts` is **generated** (`npm run db:types`) and is overwritten
wholesale — never hand-edit it. Domain aliases live in `src/lib/db.ts`, which is the
seam that survives regeneration; app code imports types from there.

Note that view columns come back **nullable** — Postgres cannot prove non-null
through an aggregate — so chart code must guard them.

## Design tokens

`src/index.css` is the single source. `@theme static` is load-bearing: a plain
`@theme` block only emits variables whose utility classes appear in the source, so a
token used solely from JS (every wallet colour, since the scheme name comes from the
database) would resolve to an empty string at runtime.

`src/theme/tokens.ts` reads those CSS custom properties back via `getComputedStyle`,
so Tailwind and ECharts cannot drift apart. Never hardcode a colour in a chart
config — add a token and read it.

**The current palette is a placeholder pending a design pass.** It was chosen to
satisfy constraints, not taste. Whatever replaces it should still be validated for
colour-vision deficiency: adjacent categorical slots need enough separation under
protanopia/deuteranopia, and income/expense must differ in **lightness**, not only
hue — red vs green at equal lightness is unreadable for ~8% of men.

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

ECharts is code-split so it stays off the login path (~127 kB gzipped initial,
~181 kB for the chart chunk). Keep an eye on this: a second charting library adds to
that budget rather than replacing it.

## Roadmap / current status

1. **Walking skeleton — DONE.** Deployed, and the full loop is verified: login,
   add transaction, integer minor units stored, derived balance, chart fed by the
   aggregate view, session surviving a reload. Remaining tail: set Supabase Auth
   Site URL to the pages.dev domain, and confirm session persistence on the actual
   iPhone after a force-quit (iOS evicts localStorage more aggressively than Chrome).
2. **Next:** wallets CRUD, categories/tags, transfers UI, budgets, chart suite.
   Wallets first — everything else needs more than one wallet to be meaningful.
3. Deferred by explicit decision: split transactions, FX conversion in charts
   (`exchange_rates`), non-monthly budget periods, MCP/AI entry.

Open design questions, unresolved: the icon set backing `glyph`; whether light mode
is worth a second validated palette; navigation shape (no router yet — the app is
one scrolling page).

Known untested: `create_transfer` / `delete_transfer` have no UI and have never been
exercised. One test transaction ("Internet bill", −14999) sits in the database.

Feature ideas go into a scratch file in the repo, not into the roadmap, until validated by actual use.

## Working conventions

- Deploy early and continuously; the app must always work from the phone.
- Design changes (schema, invariants) get decided first, then this file is updated — this file is the source of truth over code comments or memory.
- Honest trade-off notes preferred over silent cleverness; flag uncertainty instead of guessing.
