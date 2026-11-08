# Budget Tracker — Project Context

Personal budget tracker (single real user), mobile-first PWA with tablet and
desktop layouts on top. Core differentiator: rich, non-generic data
visualization (spending history, balance over time, budgets). No bank
integrations — transactions are entered manually.

Live at **https://oszczedz-se.pages.dev** — deploys automatically from `main`.

## Where the detail lives

This file is what every session needs. Area-specific rules live in
`.claude/rules/` and load automatically when a matching file is read. **Read
the relevant one before planning work in that area**, even before opening code:

| Area | File |
|---|---|
| Migrations, SQL functions/views, seeding, verifying against live data | `.claude/rules/database.md` |
| Budgets (periods, membership, list/detail/editor, rail) | `.claude/rules/budgets.md` |
| Schedules and planned transactions | `.claude/rules/schedules.md` |
| Wallets (types, `opened_on`, loans, archiving, adjustments, category sets) | `.claude/rules/wallets.md` |
| Entry form, keypad, transfers, transaction detail, categories, tags | `.claude/rules/entry-form.md` |
| Home feed, month stepper, Insight tab | `.claude/rules/feed-and-insights.md` |
| ECharts, balance chart, sparklines, small SVG marks | `.claude/rules/charts.md` |
| Tokens, type scale, palette, tiles, design-system page | `.claude/rules/design-system.md` |
| Glyph map, app icon, login | `.claude/rules/icons.md` |
| iOS standalone quirks (status bar, viewport, keyboard, taps, haptics) | `.claude/rules/ios-pwa.md` |
| Tablet/desktop layouts, navigation, modal and pane routing | `.claude/rules/wide-layouts.md` |

The history of *why* each feature was built the way it was is in git: commit
messages carry the reasoning and the verification done at the time.

## Stack (decided — do not substitute without discussion)

- **Frontend:** React + TypeScript + Vite, Tailwind CSS v4, TanStack Query,
  **ECharts** (used directly, no React wrapper), `react-router`,
  `@tabler/icons-react` (only via `src/lib/icons.ts`)
- **Type:** Instrument Sans 400/500/600 for words and figures; figures use
  `tabular-nums` (`.tnum`)
- **Backend:** Supabase (Postgres + Auth + supabase-js). No custom server.
- **Hosting:** Cloudflare Pages; installed on iPhone as a PWA
- **Migrations:** Supabase CLI, files in `supabase/migrations/`. Never change
  schema through the dashboard SQL editor.
- **Tooling:** Supabase CLI is a devDependency, always `npx supabase ...` —
  never a global install. Claude Code is never a project dependency.

## Environment

**Node 24 is required.** It comes from nvm (default alias 24.22.2); `.nvmrc`
pins the major, `.node-version` pins the exact version Cloudflare builds with —
keep it equal to the local one when updating. If a shell ever resolves an older
`node` (check `node --version`), prefix commands with:

```
export PATH="$HOME/.nvm/versions/node/v24.22.2/bin:$PATH"
```

**Typecheck with `npx tsc -b`, never `npx tsc --noEmit`.** The root tsconfig is
a solution file of references only, so `--noEmit` checks zero files and exits 0
on broken code. `npm run build` runs `tsc -b && vite build`. Lint is `oxlint`.

Supabase project ref `abjvwdqutznmoeosnjnz` (Postgres 17, eu-north-1), linked:
`npx supabase db push` applies migrations over the network. Docker is only
needed for the local stack.

The Chrome extension (`claude-in-chrome`) can drive the app at `localhost` when
connected; when it is not, verification falls back to the database method in
`database.md` plus a build.

## Security model

- All data access is from the browser with the anon key; **Row Level Security
  is the boundary**.
- Every table with `user_id`: `for all using (user_id = auth.uid()) with check
  (user_id = auth.uid())`. Join tables check ownership through the parent via
  `exists (...)`, on both sides.
- Views are `with (security_invoker = on)` — without it a view bypasses RLS.
- "Enable automatic RLS" is on: new tables deny everything until a policy
  exists. Never disable RLS to fix access — write the policy.
- **A foreign key bypasses RLS**, so references between user-owned tables are
  **composite**: `(wallet_id, user_id) references wallets(id, user_id)`, backed
  by `unique (id, user_id)`. A nullable `on delete set null` reference names its
  column — `set null (schedule_id)` — or it nulls `user_id` too.
- `anon` holds no privileges on `public` (including defaults for future
  objects); EXECUTE is revoked from `PUBLIC`; `TRUNCATE` is off
  `authenticated`.
- The query cache is cleared when the signed-in user changes (`AuthProvider`).
- After any change to policies, views or functions, re-run the second-user
  impersonation check inside a statement ending in `raise exception`: 0 rows
  from every table, view and function.
- Public sign-ups are disabled; the one account was created by hand. For a
  "login is broken" report, check the user exists first.

## Hard invariants (never violate)

1. **Money is `bigint` in minor units.** Never floats or decimals in app code.
   Format only in `src/lib/money.ts`. In TypeScript it is an integer `number`
   behind a branded `Minor` type.
2. **Balances are derived, never stored.** Balance = `starting_balance +
   sum(transactions.amount)`. Use `wallet_balances(today)` (a function) and the
   aggregate views; the phone fetches aggregates, not raw rows.
   **PostgREST silently truncates every response at 1000 rows** — any query
   that can pass that must aggregate, bucket or paginate.
3. **Transaction `date` is `DATE`.** No timezone math. Functions that need
   "today" take it as a parameter from the phone, because the server's
   `current_date` is UTC.
   3b. **A transaction dated after today has not happened.** Settled = today or
   earlier; planned = later; a schedule writes planned rows. Balances, budgets,
   cash flow, category totals and installment counts read the
   `settled_transactions` view — never a copied `date <= current_date`.
   `balance_history` reads `transactions` on purpose (it draws the forecast);
   `spending_pace` is safe by construction.
4. **Amounts are signed:** negative leaves the wallet, positive enters.
   Category `kind` only picks a default sign in the form.
5. **Transfers are two rows sharing `transfer_id`** (source negative, target
   positive), created and deleted only via `create_transfer(...)` /
   `delete_transfer(...)`. Transfer legs are excluded from income/expense charts
   and budgets.
6. **A transaction has exactly one category.** Tags are the M2M dimension. No
   M2M transaction↔category (split transactions are a possible future
   migration).
7. **Currency lives on the wallet.** Exchange is a transfer with independent
   leg amounts; legs must sum to zero only when both wallets share a currency.
8. **Charts are per-currency.** No FX logic; expense charts default to PLN.
   Future path: a small manual `exchange_rates` table.
9. `user_id` is on every top-level table and defaults to `auth.uid()`; clients
   omit it.

## Domain model (summary)

- **Wallets:** one table, `wallet_type` = `account | savings | credit_card |
  loan`. Debt is a negative balance. `opened_on` dates when the starting
  balance enters history (null = before the records). Archived only at zero
  balance. Theming: `glyph` (null = type default) + `color_scheme` (palette
  slot). → `wallets.md`
- **Categories:** `kind` = `expense | income | transfer`. `wallet_categories`
  filters and orders the picker per wallet (empty = all).
- **Budgets:** named envelope; limit per period (`daily | weekly | monthly |
  yearly | once`) over a category set and a wallet set, expense categories only,
  transfers excluded, refunds reduce spend. Membership exists once, in
  `budget_transactions`. → `budgets.md`
- **Schedules:** a recurrence rule that materialises planned transactions to a
  120-day horizon on app open. → `schedules.md`
- **Balance adjustments:** setting a wallet's balance records a transaction in a
  "Balance adjustment" category; it never edits `starting_balance`.
- `user_settings`: one row per user for appearance.

## Data

The database holds the **real legacy import** (Spendee via bank exports, from
2023-10-15), not test rows. Exports and seed SQL are **gitignored** and must
never be committed. **Never `npx supabase db reset --linked`** — it deletes the
account. Seeding and probing rules are in `database.md`.

## Types

`src/lib/database.types.ts` is generated (`npm run db:types`) — never
hand-edit. App code imports domain aliases from `src/lib/db.ts`. View/function
columns come back nullable; guard them.

## Build and deploy

Cloudflare Pages builds `main`: `npm run build`, output `dist`, Node from
`.node-version`. `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` must be set
for **Production and Preview**; they are read at build time, so adding one needs
a redeploy.

`vite.config.ts` **fails the build when they are missing — keep that guard.**
Without it Vite inlines `undefined`, the supabase guard folds to a constant, and
the bundler strips supabase-js and every chart: a successful build of an app
that throws on load.

Bundle: ECharts is code-split off the login path. Current size ≈ **221 kB
gzipped initial**, ≈ **189 kB chart chunk**. Check the initial figure after
every feature and record it in the commit message. Known contributors: every
glyph in the icon map (~86 B each) and every eagerly imported screen; the
design-system page is lazy and must stay so.

`__APP_VERSION__` comes from `package.json` (bump it there).

## Roadmap

Done (details in the rules files and git history):

1. Walking skeleton  2. Redesign (feed, wallets, quick-add, detail, Appearance)
3. Categories CRUD  4. Editing a transaction  5. Calculator keypad
6. Creating a wallet  7. Per-wallet category sets  8. Loan installments
9. Wallets list  10. Wallet detail  11. Editing a wallet / adjusting a balance
12. Transfers  13. Archiving a wallet  14. Visual refresh  15. Icon and login
16. Insight tab  17. Budgets  18. Scheduled and planned transactions
19. Month-at-a-time feeds  20. Transaction detail lower half
21. Design-system reference  22. Type scale  23. Daily budgets
24. Tablet and desktop  25. One-off budgets  26. Wallet `opened_on`
27. Budget detail

Next / open:

- Hard-deleting a transaction-free wallet (the FK already permits exactly that
  case).
- Tag CRUD — no design yet; `/tags` is a read-only list.
- Insight, More and Login at tablet/desktop widths. Insight's open question:
  a two-column grid that keeps the single period control true.
- Extract the shared calendar grid from `DateSheet`, `RunDateSheet` and
  `OpenedOnSheet`.
- One archived loan created 2026-08-11 still has `opened_on = null`, so its
  starting balance counts from the start of history. Only the owner knows when
  it was taken.
- Unconfirmed from item 1: Supabase Auth Site URL set to the pages.dev domain,
  and session persistence on the iPhone after a force-quit.
- The cross-currency transfer path cannot be exercised while every wallet is
  PLN.

Deferred by decision: split transactions, FX conversion (`exchange_rates`),
MCP/AI entry (e.g. parsing transaction screenshots).

Feature ideas go into a scratch file in the repo, not into the roadmap, until
validated by actual use.

## Working conventions

- Deploy early and continuously; the app must always work from the phone.
- Design changes (schema, invariants) are decided first, then this file or the
  relevant rules file is updated — these files are the source of truth over code
  comments or memory.
- Keep rules files forward-looking: state the rule and the reason it exists.
  Verification logs, measurements taken once and size history belong in the
  commit message.
- Honest trade-off notes over silent cleverness; flag uncertainty instead of
  guessing.
