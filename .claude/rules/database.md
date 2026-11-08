---
paths:
  - "supabase/**"
  - "src/data/**"
  - "src/lib/db.ts"
  - "src/lib/supabase.ts"
  - "src/lib/export.ts"
---

# Database: functions, views, seeding, verification

The authoritative schema is `supabase/migrations/`. This file is the map of
what lives *outside* the DDL and the traps around it. Per-feature detail lives
in the feature's own rules file (`budgets.md`, `schedules.md`, `wallets.md`).

## Writing migrations

- **Enum values need two migrations.** Postgres refuses to *use* an enum value
  added in the same transaction — every `budget_period` addition (weekly,
  yearly, daily, once) needed its own two-line file first.
- `settled_transactions` is `select *` from `transactions`, and `*` is expanded
  at creation. Adding a column to `transactions` means a `create or replace` of
  the view too (legal, since a view may only append columns).
- New references between user-owned tables are **composite** —
  `(x_id, user_id) references parent(id, user_id)` — see the security model in
  the root CLAUDE.md.
- Views are `with (security_invoker = on)`. Functions that take "today" take it
  as a parameter defaulting to `current_date`: the server's day is UTC, and the
  phone's day is what a calendar boundary means (invariant 3).

## Relations and functions outside the DDL

- `create_transfer(...)` / `delete_transfer(...)` — the only way a transfer
  pair is written or removed (invariant 5). Guards: two different wallets;
  same-currency legs must balance.
- `settled_transactions` view — rows dated today or earlier. The one definition
  of "has happened" (invariant 3b).
- `wallet_balances(today = current_date)` — **a function**, not a view: settled
  balance per wallet plus a `planned` column.
- `monthly_category_totals` view — month/category/currency totals, transfer
  legs excluded, settled only.
- `monthly_cash_flow` view — money in and money out per month per currency,
  kept apart rather than netted (a refund would otherwise vanish into a smaller
  total).
- `wallet_monthly_net` view — net movement per wallet per month; client
  accumulates it into sparklines and deltas. Its earliest row is the wallet's
  first month of movement, which is how the wallet feed's stepper finds its
  floor without a query.
- `category_usage` view — transaction count per category.
- `loan_progress` view — see `wallets.md`.
- `balance_history(currency, from, to, max_points = 400, anchor = null)` —
  running total wealth per day, for the Home chart, its compare overlay and its
  forecast. Reads `transactions` (not settled) on purpose: planned rows *are*
  the forecast. Thins to `max_points` by taking every Nth day counting back from
  `to`, keeping `from` and `anchor` unconditionally. `anchor` is *today*, which
  is an interior point once the range runs a month past it; without it today
  falls out of the sample. A wallet enters on `opened_on` (see `wallets.md`).
- `budget_progress`, `budget_period_bounds`, `budget_month_anchor`,
  `budget_transactions`, `budget_spend`, `budget_history` — see `budgets.md`.
- `schedule_occurrences`, `materialise_schedules`, `reschedule`,
  `set_schedule_active`, `delete_schedule` — see `schedules.md`.
- `spending_pace(currency, start, step, periods = 6, max_points = 120)` and
  `category_period_totals(currency, start, step, periods = 6)` — see
  `feed-and-insights.md`.
- `delete_category(id, reassign_to)` — moves a category's transactions to
  another and deletes it in one statement; raises rather than orphaning rows.
- `archive_wallet(id)` / `restore_wallet(id)` — see `wallets.md`.

## The 1000-row cap

PostgREST truncates every response at 1000 rows **silently**. Anything that can
pass that must aggregate, bucket or paginate. `src/lib/export.ts` pages for this
reason; the budget feed asks for a bounded page with `count: 'exact'` and says
when the bound bites. Scope queries server-side rather than filtering in the
browser — `useCategoryMonthlyTotals` exists because the unscoped version sat at
979 rows and would have dropped the *newest* months first.

## Types

`src/lib/database.types.ts` is generated (`npm run db:types`) — never hand-edit
it. Domain aliases live in `src/lib/db.ts`. View and function columns come back
**nullable** (Postgres cannot prove non-null through an aggregate), so guard
them.

## Seeding and the real data

The database holds the real legacy import (Spendee via bank exports, starting
2023-10-15). Exports and generated SQL live in `supabase/legacy_data_export/`
and `supabase/seed/`, both **gitignored** — never commit them, or anything that
names real categories. The seed is one transaction and resolves `user_id` from
the single `auth.users` row, raising unless there is exactly one.

- **Never `npx supabase db reset --linked`.** It drops `auth.users`, so the
  account is gone before the seed's guard runs, and every later reset deletes a
  hand-recreated account again.
- Run seeds and probes with `npx supabase db query --linked -f <file>` (or an
  inline query). It goes over the Management API, needs no Docker, and touches
  only what the file touches. After a long import it may report a duplicate-key
  error from a retried request that already succeeded — check row counts before
  assuming failure.
- **The Management API mangles `OFFSET`**: `offset 1 limit 1` returned the same
  row as `limit 1`. Pick probe rows by name.
- `supabase/seed/normalise_category_appearance.sql` (gitignored) gives every
  imported category a real glyph and palette slot, matched on `name + kind`
  (names repeat across kinds). Idempotent, ends in a guard.

## Verifying a change against the live data

There is no test database. Verify inside a transaction that ends in
`raise exception` (or `rollback`), so nothing is left behind:

- For RLS-dependent code (anything calling `create_transfer`, or the editor's
  writes), `set local role authenticated` with a real JWT subject so
  `auth.uid()` resolves and RLS is the boundary it is in the browser.
- When rewriting an aggregate, the strongest check is that the old and new
  outputs are **byte-identical** over the real history.
- After any change to policies, views or functions, re-run the second-user
  impersonation check: 0 rows from every table, view and function.
