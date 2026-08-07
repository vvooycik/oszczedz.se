# Budget Tracker — Project Context

Personal budget tracker (single real user), mobile-first PWA. Core differentiator:
rich, non-generic data visualization (spending history, balance over time, budgets).
No bank integrations — transactions entered manually. Possible future: MCP server for
AI-assisted entry (e.g. parsing transaction screenshots).

## Stack (decided — do not substitute without discussion)

- **Frontend:** React + TypeScript + Vite, Tailwind CSS, TanStack Query, **ECharts** for all charts
- **Backend:** Supabase (Postgres + Auth + auto-generated REST API via supabase-js). No custom server.
- **Hosting:** Cloudflare Pages (static deploy from GitHub), app installed on iPhone as PWA ("Add to Home Screen")
- **Migrations:** Supabase CLI, files in `supabase/migrations/` committed to git. Never apply schema changes through the dashboard SQL editor.
- **Tooling:** Supabase CLI is a **devDependency**, always invoked as `npx supabase ...` — never assume a globally installed `supabase` binary, and never `npm install -g supabase` (unsupported by design). Claude Code itself is a machine-level tool (native installer), never a project dependency — it must not appear in `package.json`.

## Security model

- All data access from the browser with the public anon key; **Row Level Security is the security boundary**.
- Every table with `user_id` has policy: `for all using (user_id = auth.uid()) with check (user_id = auth.uid())`.
- Join tables (no `user_id`) check ownership through the parent row via `exists (...)`.
- Project setting "Enable automatic RLS" is ON: new tables deny everything until a policy is written. Never disable RLS to "fix" an access problem — write the policy.
- Public sign-ups are disabled in Supabase Auth; the only account is the owner's.

## Hard invariants (never violate)

1. **Money is `bigint` in minor units** (grosze/cents). Never floats, never decimals in app code. Format at the display layer only.
2. **Balances are always derived, never stored.** Balance = `starting_balance + sum(transactions.amount)`. Use the `wallet_balances` view / SQL aggregation views for charts; the phone should fetch aggregates, not all raw rows.
3. **Transaction `date` is `DATE`, not timestamptz.** A purchase belongs to a calendar day; no timezone math on it.
4. **Amounts are signed:** negative = money leaves the wallet, positive = enters. Category `kind` is UX guidance only, never the source of truth for direction.
5. **Transfers are two transaction rows sharing `transfer_id`** (source negative, target positive). Created/deleted as a pair via a Postgres function (e.g. `create_transfer(...)`), never as loose inserts. Transfer-linked rows are **excluded** from income/expense charts and from budgets.
6. **A transaction has exactly one category** (many-to-one). Multi-dimension labeling is what tags are for (M2M). Split transactions (parent/child with per-child category) are a possible future migration — do not add M2M transaction↔category.
7. **Currency lives on the wallet**; a transaction's amount is implicitly in its wallet's currency. Currency exchange = a normal transfer between wallets of different currencies with independent leg amounts (rate is derivable, not stored). Transfer legs must sum to zero **only** when both wallets share a currency.
8. **Charts are per-currency (option 1).** No FX conversion logic in v1. Aggregate charts show separate series per currency; expense charts default to a PLN filter. Future upgrade path: small `exchange_rates` table with manual snapshot rates — nothing else changes.
9. `user_id` stays on every top-level table even though there is one user (RLS keys off it).

## Domain model

Wallet types (single `wallets` table + `wallet_type` enum, NOT four tables):
- `account` — regular account
- `savings` — savings account
- `credit_card` — behaves like an account with negative balance; has `credit_limit`; UI shows remaining = `credit_limit + balance` (e.g. "2000 zł remaining" instead of "−18 000 zł")
- `loan` — starts at 0, goes negative via a transfer that credits a regular account; `interest_rate` and `installment_count` are informational metadata only, no logic uses them

Type-specific fields are nullable columns guarded by CHECK constraints (not JSONB — revisit only if type-specific fields multiply significantly).

Wallet↔Category M2M (`wallet_categories`) filters the category picker per wallet. **Empty set = all categories allowed.** UX-only; DB accepts any category on any wallet.

Budgets: limit on expenses per period. A transaction counts against a budget iff: it is an expense AND not part of a transfer AND its category ∈ `budget_categories` (empty = any) AND its wallet ∈ `budget_wallets` (empty = any) AND its wallet's currency = budget's currency. "Reset" is not stored — it is just grouping by calendar period in queries.

Wallet theming: `glyph` (icon name string) + `color_scheme` (design token). Tailwind theme and ECharts theme map tokens to actual colors from one shared source of design tokens.

## Schema (authoritative DDL)

```sql
create type wallet_type as enum ('account', 'savings', 'credit_card', 'loan');
create type category_kind as enum ('income', 'expense', 'transfer');
create type budget_period as enum ('monthly'); -- extend with 'weekly', 'yearly' later

create table wallets (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id),
  name             text not null,
  type             wallet_type not null,
  glyph            text not null,
  color_scheme     text not null,
  currency         char(3) not null default 'PLN',
  starting_balance bigint not null default 0,
  credit_limit      bigint,       -- credit_card only
  interest_rate     numeric(6,3), -- loan only
  installment_count integer,      -- loan only
  created_at       timestamptz not null default now(),
  constraint credit_fields_check check (
    (type = 'credit_card') = (credit_limit is not null)
  ),
  constraint loan_fields_check check (
    type = 'loan' or (interest_rate is null and installment_count is null)
  )
);

create table categories (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  name    text not null,
  kind    category_kind not null,
  glyph   text not null,
  color   text not null
);

create table wallet_categories (
  wallet_id   uuid not null references wallets(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  primary key (wallet_id, category_id)
);

create table tags (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  name    text not null,
  unique (user_id, name)
);

create table transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id),
  wallet_id   uuid not null references wallets(id),
  category_id uuid not null references categories(id),
  amount      bigint not null,   -- signed, minor units
  date        date not null,
  note        text,
  transfer_id uuid,              -- both legs of a transfer share it
  created_at  timestamptz not null default now()
);

create index idx_transactions_wallet_date on transactions (wallet_id, date);
create index idx_transactions_user_date   on transactions (user_id, date);
create index idx_transactions_transfer    on transactions (transfer_id)
  where transfer_id is not null;

create table transaction_tags (
  transaction_id uuid not null references transactions(id) on delete cascade,
  tag_id         uuid not null references tags(id) on delete cascade,
  primary key (transaction_id, tag_id)
);

create table budgets (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null references auth.users(id),
  name     text not null,
  amount   bigint not null,
  currency char(3) not null default 'PLN',
  period   budget_period not null default 'monthly'
);

create table budget_categories (
  budget_id   uuid not null references budgets(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  primary key (budget_id, category_id)
);

create table budget_wallets (
  budget_id uuid not null references budgets(id) on delete cascade,
  wallet_id uuid not null references wallets(id) on delete cascade,
  primary key (budget_id, wallet_id)
);
```

Enforced outside the DDL:
- Transfer pairing/balancing → Postgres function `create_transfer(...)` (single statement inserting both rows; deletion also paired)
- `wallet_balances` view: `starting_balance + coalesce(sum(amount), 0)` per wallet — first migration after the tables
- Aggregation views/functions for charts (monthly totals per category, balance-over-time) so the client fetches pre-aggregated rows

## Roadmap / current status

1. **Walking skeleton (current milestone):** Vite+React+TS+Tailwind scaffold → Supabase connection → initial migration (schema above + RLS + `wallet_balances`) → minimal page: log in, add transaction, see list + one chart → deployed to Cloudflare Pages, installed as PWA on iPhone. Styling can be ugly; the goal is proving the full loop (esp. iOS PWA auth persistence).
2. Then iterate: wallets CRUD, categories/tags, transfers, budgets, chart suite.
3. Deferred by explicit decision: split transactions, FX conversion in charts (`exchange_rates`), non-monthly budget periods, MCP/AI entry.

Feature ideas go into a scratch file in the repo, not into the roadmap, until validated by actual use.

## Working conventions

- Deploy early and continuously; the app must always work from the phone.
- Design changes (schema, invariants) get decided first, then this file is updated — this file is the source of truth over code comments or memory.
- Honest trade-off notes preferred over silent cleverness; flag uncertainty instead of guessing.
