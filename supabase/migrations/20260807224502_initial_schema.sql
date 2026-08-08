-- Initial schema for the budget tracker.
--
-- Security model: every access from the browser uses the public anon key, so
-- RLS is the only security boundary. Every table gets an explicit policy; the
-- join tables (which carry no user_id) check ownership through their parent.

-- ---------------------------------------------------------------- enum types

create type wallet_type as enum ('account', 'savings', 'credit_card', 'loan');
create type category_kind as enum ('income', 'expense', 'transfer');
create type budget_period as enum ('monthly'); -- extend with 'weekly', 'yearly' later

-- --------------------------------------------------------------------- tables

create table wallets (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) default auth.uid(),
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
  user_id uuid not null references auth.users(id) default auth.uid(),
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
  user_id uuid not null references auth.users(id) default auth.uid(),
  name    text not null,
  unique (user_id, name)
);

create table transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) default auth.uid(),
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
  user_id  uuid not null references auth.users(id) default auth.uid(),
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

-- ------------------------------------------------------------------------ RLS

alter table wallets            enable row level security;
alter table categories         enable row level security;
alter table wallet_categories  enable row level security;
alter table tags               enable row level security;
alter table transactions       enable row level security;
alter table transaction_tags   enable row level security;
alter table budgets            enable row level security;
alter table budget_categories  enable row level security;
alter table budget_wallets     enable row level security;

-- Top-level tables: ownership is the user_id column.
create policy owner_all on wallets
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy owner_all on categories
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy owner_all on tags
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy owner_all on transactions
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy owner_all on budgets
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Join tables: ownership is reached through the parent row. Both sides are
-- checked so a row can never link two different users' records.
create policy owner_all on wallet_categories
  for all to authenticated
  using (
    exists (select 1 from wallets w where w.id = wallet_id and w.user_id = auth.uid())
    and exists (select 1 from categories c where c.id = category_id and c.user_id = auth.uid())
  )
  with check (
    exists (select 1 from wallets w where w.id = wallet_id and w.user_id = auth.uid())
    and exists (select 1 from categories c where c.id = category_id and c.user_id = auth.uid())
  );

create policy owner_all on transaction_tags
  for all to authenticated
  using (
    exists (select 1 from transactions t where t.id = transaction_id and t.user_id = auth.uid())
    and exists (select 1 from tags g where g.id = tag_id and g.user_id = auth.uid())
  )
  with check (
    exists (select 1 from transactions t where t.id = transaction_id and t.user_id = auth.uid())
    and exists (select 1 from tags g where g.id = tag_id and g.user_id = auth.uid())
  );

create policy owner_all on budget_categories
  for all to authenticated
  using (
    exists (select 1 from budgets b where b.id = budget_id and b.user_id = auth.uid())
    and exists (select 1 from categories c where c.id = category_id and c.user_id = auth.uid())
  )
  with check (
    exists (select 1 from budgets b where b.id = budget_id and b.user_id = auth.uid())
    and exists (select 1 from categories c where c.id = category_id and c.user_id = auth.uid())
  );

create policy owner_all on budget_wallets
  for all to authenticated
  using (
    exists (select 1 from budgets b where b.id = budget_id and b.user_id = auth.uid())
    and exists (select 1 from wallets w where w.id = wallet_id and w.user_id = auth.uid())
  )
  with check (
    exists (select 1 from budgets b where b.id = budget_id and b.user_id = auth.uid())
    and exists (select 1 from wallets w where w.id = wallet_id and w.user_id = auth.uid())
  );

-- ---------------------------------------------------------------------- views
--
-- security_invoker = on makes these views run with the caller's permissions, so
-- the RLS policies above still apply. Without it a view would bypass RLS.

-- Balances are derived, never stored.
create view wallet_balances with (security_invoker = on) as
  select
    w.id            as wallet_id,
    w.user_id,
    w.currency,
    w.starting_balance + coalesce(sum(t.amount), 0) as balance
  from wallets w
  left join transactions t on t.wallet_id = w.id
  group by w.id, w.user_id, w.currency, w.starting_balance;

-- Pre-aggregated rows for charts: the phone fetches these, not raw rows.
-- Transfer legs are excluded — they move money, they are not income/expense.
create view monthly_category_totals with (security_invoker = on) as
  select
    t.user_id,
    date_trunc('month', t.date)::date as month,
    t.category_id,
    c.name     as category_name,
    c.kind     as category_kind,
    w.currency,
    sum(t.amount) as total
  from transactions t
  join categories c on c.id = t.category_id
  join wallets w    on w.id = t.wallet_id
  where t.transfer_id is null
  group by t.user_id, date_trunc('month', t.date), t.category_id, c.name, c.kind, w.currency;

-- ------------------------------------------------------------------ functions

-- Transfers are always two rows sharing a transfer_id, created as a pair.
-- Never insert transfer legs as loose inserts.
--
-- p_source_amount / p_target_amount are positive magnitudes; the function
-- applies the signs. They may differ only when the wallets hold different
-- currencies (that is the FX case — the rate stays derivable, not stored).
create function create_transfer(
  p_source_wallet_id uuid,
  p_target_wallet_id uuid,
  p_source_amount    bigint,
  p_target_amount    bigint,
  p_date             date,
  p_category_id      uuid,
  p_note             text default null
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_transfer_id uuid := gen_random_uuid();
  v_source_currency char(3);
  v_target_currency char(3);
begin
  if p_source_wallet_id = p_target_wallet_id then
    raise exception 'A transfer needs two different wallets';
  end if;

  if p_source_amount <= 0 or p_target_amount <= 0 then
    raise exception 'Transfer amounts must be positive magnitudes';
  end if;

  -- RLS on wallets means a wallet the caller does not own simply is not found.
  select currency into v_source_currency
    from public.wallets where id = p_source_wallet_id;
  select currency into v_target_currency
    from public.wallets where id = p_target_wallet_id;

  if v_source_currency is null or v_target_currency is null then
    raise exception 'Wallet not found';
  end if;

  if v_source_currency = v_target_currency
     and p_source_amount <> p_target_amount then
    raise exception
      'Legs of a same-currency transfer must balance (% vs %)',
      p_source_amount, p_target_amount;
  end if;

  insert into public.transactions
    (wallet_id, category_id, amount, date, note, transfer_id)
  values
    (p_source_wallet_id, p_category_id, -p_source_amount, p_date, p_note, v_transfer_id),
    (p_target_wallet_id, p_category_id,  p_target_amount, p_date, p_note, v_transfer_id);

  return v_transfer_id;
end;
$$;

-- Deletion is paired too, so a transfer can never be left half-present.
create function delete_transfer(p_transfer_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.transactions where transfer_id = p_transfer_id;
end;
$$;
