-- Support for the redesign: persisted appearance settings, plus the aggregates
-- the new feed, wallets and detail screens need. Charts keep reading
-- pre-aggregated rows rather than pulling raw transactions to the phone.

-- ------------------------------------------------------- appearance settings
--
-- One row per user. localStorage is the fast path on the client; this is the
-- durable copy, read only when the cache is cold.

create table user_settings (
  user_id    uuid primary key references auth.users(id) default auth.uid(),
  mode       text not null default 'system'
             check (mode in ('light', 'dark', 'system')),
  accent     text not null default 'gold'
             check (accent in ('gold', 'copper', 'claret', 'olive', 'ink', 'plum')),
  -- Ground tint intensity (chroma applied to the dark ground). Constrained to
  -- the four design-sanctioned steps; above ~0.02 it reads as a coloured
  -- screen rather than a warm black.
  tint       numeric(5,4) not null default 0.008
             check (tint in (0, 0.008, 0.014, 0.026)),
  updated_at timestamptz not null default now()
);

alter table user_settings enable row level security;

create policy owner_all on user_settings
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------- balance history
--
-- Running total wealth per day for one currency, so the feed chart can draw a
-- period and its comparable prior period from two cheap calls.
--
-- The running balance on any day is: every wallet's starting balance, plus
-- every transaction up to and including that day. Days with no activity still
-- need a point, hence generate_series rather than grouping transactions.

create function balance_history(
  p_currency char(3),
  p_from     date,
  p_to       date
)
returns table (day date, balance bigint)
language sql
security invoker
stable
set search_path = ''
as $$
  with days as (
    select generate_series(p_from, p_to, interval '1 day')::date as day
  ),
  -- Everything before the window, collapsed into the opening balance.
  opening as (
    select
      (select coalesce(sum(w.starting_balance), 0)
         from public.wallets w
        where w.currency = p_currency)
      +
      (select coalesce(sum(t.amount), 0)
         from public.transactions t
         join public.wallets w on w.id = t.wallet_id
        where w.currency = p_currency
          and t.date < p_from) as amount
  ),
  daily as (
    select t.date as day, sum(t.amount) as amount
      from public.transactions t
      join public.wallets w on w.id = t.wallet_id
     where w.currency = p_currency
       and t.date between p_from and p_to
     group by t.date
  )
  select
    d.day,
    ((select amount from opening)
      + coalesce(sum(dl.amount) over (order by d.day rows unbounded preceding), 0)
    )::bigint as balance
  from days d
  left join daily dl on dl.day = d.day
  order by d.day;
$$;

-- ---------------------------------------------------------- budget progress
--
-- One row per budget for the current calendar period, with the spend that
-- counts against it. The membership rules are the CLAUDE.md invariant: an
-- expense, not part of a transfer, matching currency, and within the budget's
-- category and wallet sets — where an *empty* set means "any".

create view budget_progress with (security_invoker = on) as
  select
    b.id       as budget_id,
    b.user_id,
    b.name,
    b.amount   as limit_amount,
    b.currency,
    b.period,
    date_trunc('month', current_date)::date as period_start,
    s.spent,
    cat.glyph  as glyph,
    cat.color  as color
  from budgets b
  left join lateral (
    select coalesce(sum(-t.amount), 0)::bigint as spent
      from public.transactions t
      join public.wallets w on w.id = t.wallet_id
     where t.user_id = b.user_id
       and t.transfer_id is null          -- transfers never count
       and t.amount < 0                   -- expenses only
       and w.currency = b.currency
       and t.date >= date_trunc('month', current_date)::date
       and t.date <  (date_trunc('month', current_date) + interval '1 month')::date
       and (
         not exists (select 1 from public.budget_categories bc where bc.budget_id = b.id)
         or exists (select 1 from public.budget_categories bc
                     where bc.budget_id = b.id and bc.category_id = t.category_id)
       )
       and (
         not exists (select 1 from public.budget_wallets bw where bw.budget_id = b.id)
         or exists (select 1 from public.budget_wallets bw
                     where bw.budget_id = b.id and bw.wallet_id = t.wallet_id)
       )
  ) s on true
  -- A budget can span several categories; the rail shows one glyph, so take a
  -- stable representative rather than leaving it to row order.
  left join lateral (
    select c.glyph, c.color
      from public.budget_categories bc
      join public.categories c on c.id = bc.category_id
     where bc.budget_id = b.id
     order by c.name
     limit 1
  ) cat on true;

-- ------------------------------------------------------- wallet monthly net
--
-- Feeds the per-wallet sparkline and the "↑ N this month/year" delta. Net
-- movement per wallet per month; the client accumulates it into a running
-- balance rather than us materialising every day for every wallet.

create view wallet_monthly_net with (security_invoker = on) as
  select
    w.id      as wallet_id,
    w.user_id,
    w.currency,
    date_trunc('month', t.date)::date as month,
    sum(t.amount)::bigint as net
  from wallets w
  join transactions t on t.wallet_id = w.id
  group by w.id, w.user_id, w.currency, date_trunc('month', t.date);
