-- Planned transactions: a row dated after today is real, but has not happened.
--
-- `transactions.date` has always been a plain DATE, so a future date was always
-- *accepted*. The problem is that every aggregate treated such a row as settled:
-- rent entered for the 1st came straight off total wealth, counted against a
-- budget, and landed in the Insight tab's category totals. Being possible and
-- being wrong is worse than being impossible.
--
-- The split is derived from the date rather than stored, so one `Transaction`
-- type still runs through the feed, the detail screen, the edit form,
-- `delete_transfer` and the CSV. What that costs is a definition of "has
-- happened" in every aggregate — and a missed one is exactly the silent lie
-- invariant 2 warns about. So it is said **once**, here, as a named relation,
-- and every aggregate is rewritten to read it. Adding a future aggregate is then
-- a choice between two named tables, not a date predicate to remember.
--
-- Vocabulary, fixed so three near-synonyms cannot drift:
--   settled — dated today or earlier. The only thing that counts.
--   planned — dated after today. A real row: tappable, editable, deletable.
--   schedule — the recurrence rule that makes them (next migration).

create view settled_transactions with (security_invoker = on) as
  select * from transactions where date <= current_date;

-- `current_date` is the *server's* day and the phone's is Europe/Warsaw, so for
-- an hour or two after local midnight this view is a day behind. That is
-- invisible in a monthly chart and unacceptable in a balance, which is why
-- `wallet_balances` below takes the day as an argument instead — the same call
-- `budget_progress` already makes.

-- ------------------------------------------------- aggregates, settled only
--
-- Mechanical: `from transactions` becomes `from settled_transactions`. The
-- column lists are untouched, so `create or replace view` applies in place and
-- nothing that selects from these has to change.

create or replace view monthly_category_totals with (security_invoker = on) as
  select
    t.user_id,
    date_trunc('month', t.date)::date as month,
    t.category_id,
    c.name     as category_name,
    c.kind     as category_kind,
    w.currency,
    sum(t.amount) as total
  from settled_transactions t
  join categories c on c.id = t.category_id
  join wallets w    on w.id = t.wallet_id
  where t.transfer_id is null
  group by t.user_id, date_trunc('month', t.date), t.category_id, c.name, c.kind, w.currency;

create or replace view monthly_cash_flow with (security_invoker = on) as
  select
    t.user_id,
    date_trunc('month', t.date)::date as month,
    w.currency,
    coalesce(sum(t.amount) filter (where t.amount > 0), 0)::bigint  as inflow,
    coalesce(-sum(t.amount) filter (where t.amount < 0), 0)::bigint as outflow
  from settled_transactions t
  join wallets w on w.id = t.wallet_id
  where t.transfer_id is null
  group by t.user_id, date_trunc('month', t.date), w.currency;

create or replace view wallet_monthly_net with (security_invoker = on) as
  select
    w.id      as wallet_id,
    w.user_id,
    w.currency,
    date_trunc('month', t.date)::date as month,
    sum(t.amount)::bigint as net
  from wallets w
  join settled_transactions t on t.wallet_id = w.id
  group by w.id, w.user_id, w.currency, date_trunc('month', t.date);

create or replace view category_usage with (security_invoker = on) as
  select
    c.id      as category_id,
    c.user_id,
    count(t.id)::bigint as transaction_count
  from categories c
  left join settled_transactions t on t.category_id = c.id
  group by c.id, c.user_id;

-- Installments left are counted, never decremented — so a *scheduled* repayment
-- would otherwise mark an installment paid weeks before the money moved.
create or replace view loan_progress with (security_invoker = on) as
  select
    w.id      as wallet_id,
    w.user_id,
    w.installment_count,
    count(t.id)::bigint as paid_count
  from wallets w
  left join settled_transactions t
    on  t.wallet_id   = w.id
    and t.transfer_id is not null
    and t.amount      > 0
  where w.type = 'loan'
  group by w.id, w.user_id, w.installment_count;

create or replace function public.category_period_totals(
  p_currency char(3),
  p_start    date,
  p_step     interval,
  p_periods  int default 6
)
returns table (period_index int, category_id uuid, spent bigint)
language sql
security invoker
stable
set search_path = ''
as $$
  with periods as (
    select
      k,
      (p_start - (p_step * k))::date as p_from,
      ((p_start - (p_step * k)) + p_step - interval '1 day')::date as p_to
    from generate_series(0, p_periods) as g(k)
  )
  select
    p.k::int,
    t.category_id,
    sum(-t.amount)::bigint
  from periods p
  join public.settled_transactions t on t.date between p.p_from and p.p_to
  join public.wallets w              on w.id = t.wallet_id
  where w.currency     = p_currency
    and t.transfer_id is null
    and t.amount       < 0
  group by p.k, t.category_id
$$;

-- Two aggregates are deliberately left reading `transactions` directly.
--
-- `spending_pace` is already safe: its running total at day d only sums rows up
-- to d, and `spent` is null past today, which is what stops the solid line at
-- the present. Nothing planned can reach a day it reports.
--
-- `balance_history` **must** see planned rows — that is what draws the dotted
-- forecast past today. Its own p_from/p_to are the guard there, not a predicate
-- on the relation.

-- ---------------------------------------------------------- wallet balances
--
-- Was a view; is now a function, for the reason `budget_progress` became one.
-- The boundary between settled and planned is a calendar day the way
-- `transactions.date` is (invariant 3), and `current_date` is the *server's*.
-- Between local midnight and 02:00 a transaction entered for today would read
-- as planned and the balance would silently fail to move — so the phone says
-- which day it is, and the default keeps a bare call honest.
--
-- `planned` rides along because every screen that shows a balance is the screen
-- that wants it, and it is the same scan.
drop view if exists wallet_balances;

create function public.wallet_balances(p_today date default current_date)
returns table (
  wallet_id uuid,
  user_id   uuid,
  currency  char(3),
  balance   bigint,
  planned   bigint
)
language sql
security invoker
stable
set search_path = ''
as $$
  select
    w.id,
    w.user_id,
    w.currency,
    (w.starting_balance + coalesce(
      sum(t.amount) filter (where t.date <= p_today), 0))::bigint,
    coalesce(
      sum(t.amount) filter (where t.date > p_today), 0)::bigint
  from public.wallets w
  left join public.transactions t on t.wallet_id = w.id
  group by w.id, w.user_id, w.currency, w.starting_balance;
$$;

-- ------------------------------------------------------------ balance chart
--
-- `p_anchor` is a day kept unconditionally by the thinning, the way `p_from`
-- already is.
--
-- The chart now runs a month past today, and the modulus counts back from
-- `p_to` — so *today*, where the solid line stops, the fill's sign flips and
-- the end dot sits, is no longer guaranteed to survive the thin. Being a day
-- out on the join between what happened and what is coming is the one place on
-- this chart where a sampled point is not good enough.
--
-- CREATE OR REPLACE cannot add a parameter, so the 4-arg version is dropped
-- first — leaving it in place would make a 4-arg call ambiguous.

drop function if exists public.balance_history(char(3), date, date, int);

create function public.balance_history(
  p_currency   char(3),
  p_from       date,
  p_to         date,
  p_max_points int  default 400,
  p_anchor     date default null
)
returns table (day date, balance bigint)
language sql
security invoker
stable
set search_path = ''
as $$
  with step as (
    select greatest(
      1,
      ceil((p_to - p_from + 1)::numeric / greatest(p_max_points, 2))::int
    ) as n
  ),
  days as (
    select generate_series(p_from, p_to, interval '1 day')::date as day
  ),
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
  ),
  running as (
    select
      d.day,
      ((select amount from opening)
        + coalesce(sum(dl.amount) over (order by d.day rows unbounded preceding), 0)
      )::bigint as balance
    from days d
    left join daily dl on dl.day = d.day
  )
  select r.day, r.balance
    from running r, step s
   where (p_to - r.day) % s.n = 0
      or r.day = p_from
      or r.day = p_anchor
   order by r.day;
$$;

-- ------------------------------------------------------------------ budgets
--
-- `budget_spend` needs no change at all: its range is already half-open, so
-- clamping the caller's bounds is enough to split a period into what has been
-- spent and what is merely booked.
--
--   settled  [period_start, least(period_end, today + 1))
--   planned  [greatest(period_start, today + 1), period_end)
--
-- The rollover's window is the period *before* this one and therefore entirely
-- in the past, where nothing planned can live — so it keeps its own bounds.
--
-- `planned` is a new column, so the function is dropped rather than replaced.
drop function if exists public.budget_progress(date);

create function public.budget_progress(p_today date default current_date)
returns table (
  budget_id      uuid,
  name           text,
  limit_amount   bigint,
  rolled_over    bigint,
  currency       char(3),
  period         public.budget_period,
  resets_on      integer,
  rollover       boolean,
  show_on_home   boolean,
  home_order     integer,
  color          text,
  glyph          text,
  period_start   date,
  period_end     date,
  spent          bigint,
  planned        bigint,
  category_count integer,
  wallet_count   integer
)
language sql
security invoker
stable
set search_path = ''
as $$
  select
    b.id,
    b.name,
    b.amount,
    case when b.rollover then greatest(b.amount - prev.spend, 0)::bigint
         else 0::bigint end,
    b.currency,
    b.period,
    b.resets_on,
    b.rollover,
    b.show_on_home,
    b.home_order,
    b.color,
    b.glyph,
    win.period_start,
    win.period_end,
    cur.spend,
    soon.spend,
    (select count(*) from public.budget_categories bc where bc.budget_id = b.id)::int,
    (select count(*) from public.budget_wallets   bw where bw.budget_id = b.id)::int
  from public.budgets b
  cross join lateral public.budget_period_bounds(b.period, b.resets_on, p_today) win
  cross join lateral public.budget_period_bounds(
    b.period, b.resets_on, win.period_start - 1
  ) ago
  cross join lateral (
    select public.budget_spend(b.id, b.user_id, b.currency,
                               win.period_start,
                               least(win.period_end, p_today + 1)) as spend
  ) cur
  cross join lateral (
    select public.budget_spend(b.id, b.user_id, b.currency,
                               greatest(win.period_start, p_today + 1),
                               win.period_end) as spend
  ) soon
  cross join lateral (
    select public.budget_spend(b.id, b.user_id, b.currency,
                               ago.period_start, ago.period_end) as spend
  ) prev
  order by b.home_order, b.name;
$$;

-- ------------------------------------------------------------- archiving
--
-- The zero-balance rule is now a rule about *settled* money, so a wallet whose
-- planned rows happen to net to zero would slip through and then collect
-- transactions after being closed. Checked first, with its own sentence: the
-- fix is to cancel them, which is a different action from moving a balance out.
create or replace function archive_wallet(p_wallet_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_name    text;
  v_balance bigint;
  v_planned int;
begin
  -- RLS means a wallet the caller does not own simply is not found.
  select w.name,
         w.starting_balance + coalesce(
           (select sum(t.amount) from public.transactions t where t.wallet_id = w.id),
           0)
    into v_name, v_balance
    from public.wallets w
   where w.id = p_wallet_id;

  if v_name is null then
    raise exception 'Wallet not found';
  end if;

  select count(*) into v_planned
    from public.transactions t
   where t.wallet_id = p_wallet_id
     and t.date > current_date;

  if v_planned > 0 then
    raise exception
      '% still has % planned transaction(s); cancel them before archiving',
      v_name, v_planned;
  end if;

  if v_balance <> 0 then
    raise exception
      '% still holds a balance of %; move it out before archiving',
      v_name, v_balance;
  end if;

  update public.wallets set archived_at = now() where id = p_wallet_id;
end;
$$;
