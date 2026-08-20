-- Budgets, as the handoff specifies them.
--
-- The tables have been here since the initial schema and were never reachable:
-- nothing in the app could make a budget, so `budget_progress` had only its own
-- dashed placeholder to feed. This migration gives a budget the five things it
-- was missing — an identity of its own, a period that is not always the
-- calendar month, and a rollover — and rewrites the progress view accordingly.
--
-- ## Identity moves onto the budget
--
-- The old view borrowed a glyph and a colour from the budget's alphabetically
-- first category, because there was nowhere else to get them. That is fine for
-- a single-category budget and arbitrary for a group: "Eating out" over three
-- categories would wear whichever of the three sorted first. `color` and
-- `glyph` are columns now, free text like the ones on `categories` and resolved
-- the same way on the client.
--
-- ## `resets_on` carries the whole period model
--
-- One integer, read differently per period, which is what removes the need for
-- a separate "custom" period:
--
--   * monthly — day of month 1–31, clamped to the last day of shorter months,
--     so a payday budget resetting on the 31st runs 31 Jan → 28 Feb.
--   * weekly  — weekday 0–6, 0 = Sunday, matching both `extract(dow)` and
--     JavaScript's `getDay()` so the client and the database cannot disagree.
--   * yearly  — day of a *non-leap* year, 1–365, which is a month/day pair in
--     disguise. Storing the ordinal against a fixed 365-day reference year is
--     what stops the anniversary sliding by a day every leap year, which is
--     what a naive day-of-year would do to everything after February.
--
-- ## What counts, and the one rule that changed
--
-- Still: not a transfer leg, wallet currency matches, category and wallet in
-- the budget's sets (an *empty* set meaning "any", as before). Two changes:
--
--   * **The category must be of kind `expense`.** An empty category set used to
--     mean "every category including income", which was harmless only because
--     the sign filter below hid it.
--   * **The sign filter is gone.** Every row in a counted category is summed
--     negated, so a refund — a positive amount filed under an expense category
--     — *reduces* the spend instead of being ignored. That is what the handoff
--     asks for, and it is the honest reading: the money came back.
--
-- Balance adjustments are not excluded by name, and deliberately so. The
-- alternative is a copy of the string in `src/lib/adjustments.ts` living in SQL
-- where nothing keeps the two in step, and it buys nothing: "Balance
-- adjustment" is an ordinary category, the editor requires at least one
-- category to be picked, and nobody picks that one. It counts if it is chosen,
-- which is the same rule every other category follows.

-- ------------------------------------------------------------------ columns

alter table budgets
  add column color        text    not null default 'slate',
  add column glyph        text    not null default 'target',
  add column resets_on    integer not null default 1,
  add column rollover     boolean not null default false,
  add column show_on_home boolean not null default true,
  add column home_order   integer not null default 0;

-- Legal only now that the enum values are committed — see the previous
-- migration for why that is its own file.
alter table budgets
  add constraint budget_resets_on_check check (
    case period
      when 'monthly' then resets_on between 1 and 31
      when 'weekly'  then resets_on between 0 and 6
      when 'yearly'  then resets_on between 1 and 365
    end
  );

alter table budgets
  add constraint budget_amount_positive check (amount > 0);

-- ------------------------------------------------------------ period bounds

-- The day of `p_month` a monthly budget resets on, clamped to the month's own
-- length. `p_month` is the first of a month.
create function public.budget_month_anchor(p_month date, p_day integer)
returns date
language sql
immutable
set search_path = ''
as $$
  select p_month + (
    least(
      greatest(coalesce(p_day, 1), 1),
      extract(day from (p_month + interval '1 month' - interval '1 day'))::int
    ) - 1
  );
$$;

-- The period containing `p_on`, as a half-open range: `period_start` is in it,
-- `period_end` is the next period's first day.
--
-- Everything about periods is answered here, once, so no caller has to know
-- that months clamp and years do not.
create function public.budget_period_bounds(
  p_period    public.budget_period,
  p_resets_on integer,
  p_on        date
)
returns table (period_start date, period_end date)
language plpgsql
immutable
set search_path = ''
as $$
declare
  anchor_month date;
  md           date;
  y            int;
begin
  if p_period = 'weekly' then
    period_start := p_on - (
      (extract(dow from p_on)::int - (coalesce(p_resets_on, 0) % 7) + 7) % 7
    );
    period_end := period_start + 7;

  elsif p_period = 'yearly' then
    -- 2001 is not a leap year, so ordinal 1–365 is a stable month/day pair.
    md := date '2000-12-31' + greatest(least(coalesce(p_resets_on, 1), 365), 1);
    y  := extract(year from p_on)::int;

    period_start := make_date(y, extract(month from md)::int, extract(day from md)::int);
    if period_start > p_on then
      y := y - 1;
      period_start := make_date(y, extract(month from md)::int, extract(day from md)::int);
    end if;
    period_end := make_date(y + 1, extract(month from md)::int, extract(day from md)::int);

  else -- monthly
    anchor_month := date_trunc('month', p_on)::date;
    period_start := public.budget_month_anchor(anchor_month, p_resets_on);
    if period_start > p_on then
      anchor_month := (anchor_month - interval '1 month')::date;
      period_start := public.budget_month_anchor(anchor_month, p_resets_on);
    end if;
    period_end := public.budget_month_anchor(
      (anchor_month + interval '1 month')::date, p_resets_on
    );
  end if;

  return next;
end;
$$;

-- ------------------------------------------------------------------- spend

-- What one budget has spent over a half-open day range. Split out because the
-- rollover needs the same answer for the period *before* the current one, and
-- two copies of these membership rules is exactly how a budget starts
-- disagreeing with itself.
create function public.budget_spend(
  p_budget   uuid,
  p_user     uuid,
  p_currency char(3),
  p_from     date,
  p_to       date
)
returns bigint
language sql
security invoker
stable
set search_path = ''
as $$
  select coalesce(sum(-t.amount), 0)::bigint
    from public.transactions t
    join public.wallets w    on w.id = t.wallet_id
    join public.categories c on c.id = t.category_id
   where t.user_id      = p_user
     and t.transfer_id is null
     and c.kind         = 'expense'
     and w.currency     = p_currency
     and t.date        >= p_from
     and t.date        <  p_to
     and (
       not exists (select 1 from public.budget_categories bc where bc.budget_id = p_budget)
       or exists (select 1 from public.budget_categories bc
                   where bc.budget_id = p_budget and bc.category_id = t.category_id)
     )
     and (
       not exists (select 1 from public.budget_wallets bw where bw.budget_id = p_budget)
       or exists (select 1 from public.budget_wallets bw
                   where bw.budget_id = p_budget and bw.wallet_id = t.wallet_id)
     );
$$;

-- ---------------------------------------------------------------- progress

-- One row per budget for the period containing `p_today`.
--
-- A **function** rather than the view it replaces, and the argument is the
-- point: `current_date` is the *server's* day, and every period boundary here
-- is a calendar day the way `transactions.date` is (invariant 3). Letting the
-- phone say which day it is keeps a budget from resetting an hour early or
-- late; the default keeps a bare call honest.
--
-- Verdict, projection and days-left are not columns. They are arithmetic over
-- what is here, they change with no write behind them, and the client already
-- has to compute them per frame for the ring animation.
--
-- **Rollover carries one period, never two.** The unspent remainder of the
-- period immediately before is added to this one's limit; that period's own
-- rollover is not folded in, so a budget left untouched for a year does not
-- accumulate twelve months of headroom. Overspend does not carry as a debt —
-- hence the `greatest(..., 0)`.
drop view if exists budget_progress;

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
    (select count(*) from public.budget_categories bc where bc.budget_id = b.id)::int,
    (select count(*) from public.budget_wallets   bw where bw.budget_id = b.id)::int
  from public.budgets b
  cross join lateral public.budget_period_bounds(b.period, b.resets_on, p_today) win
  -- The day before this period started is, by definition, the last day of the
  -- one before it — so the same function answers "which period was that".
  cross join lateral public.budget_period_bounds(
    b.period, b.resets_on, win.period_start - 1
  ) ago
  cross join lateral (
    select public.budget_spend(b.id, b.user_id, b.currency,
                               win.period_start, win.period_end) as spend
  ) cur
  cross join lateral (
    select public.budget_spend(b.id, b.user_id, b.currency,
                               ago.period_start, ago.period_end) as spend
  ) prev
  order by b.home_order, b.name;
$$;
