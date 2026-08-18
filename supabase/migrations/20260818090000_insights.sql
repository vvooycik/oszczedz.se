-- Aggregates for the Insight tab.
--
-- Four blocks — pace, cash flow, categories, balances — all reading the same
-- calendar period. Balances and the total line are already answerable
-- (`wallet_balances`, `wallet_monthly_net`, `balance_history`); the other three
-- are not, and the reason they are server-side rather than derived in the
-- browser is the same one that shaped `balance_history`: **PostgREST caps a
-- response at 1000 rows and enforces it by silently truncating.** A daily
-- expense series over seven years is 2 500 rows and would arrive looking
-- perfectly well-formed with two years missing.
--
-- So every object here is bounded by construction, not by hope:
--   * spending_pace           — thinned to p_max_points, ~120
--   * category_period_totals  — 7 periods x 59 categories = 413 at the ceiling
--   * monthly_cash_flow       — one row per month per currency, ~35 today
--
-- ## What counts as spending
--
-- `amount < 0 and transfer_id is null`, negated to a positive magnitude. The
-- **sign is the truth and the category's kind is not** (invariant 4): a refund
-- filed under an expense category is money coming back and must not read as
-- spending, and an expense filed under an income category still left the
-- account. Transfer legs are excluded because they move money rather than spend
-- it (invariant 5), which is the same rule `monthly_category_totals` follows.
--
-- Balance adjustments *are* counted. They have no `transfer_id`, the money
-- genuinely moved, and hiding them would make these charts disagree with the
-- balances block on the same screen.
--
-- ## Periods
--
-- Two arguments carry the whole period model: `p_start`, a calendar-aligned
-- day, and `p_step`, an interval. Period k is `p_start - p_step * k` for one
-- step. Passing an interval rather than a day count is what makes the
-- comparison calendar-correct — the six months before August are July, June,
-- May, April, March and February, not six 31-day windows drifting backwards
-- through the year.

-- ---------------------------------------------------------------- cash flow
--
-- Money in and money out, kept apart. Not derivable from
-- `monthly_category_totals`: that view sums signed amounts *per category*, so a
-- category with a refund in it reports a smaller total rather than an inflow
-- and an outflow, and there is no way back to the two figures. It is also the
-- widest view in the app already (months x categories) and the closest thing
-- here to the 1000-row cliff, so building on it would inherit that.
--
-- One row per month per currency, and the client rolls months up into quarters
-- and years. That is why this is a view and not a third function: the bucketing
-- is cheap, the row count is tiny, and one query serves all three ranges.

create view monthly_cash_flow with (security_invoker = on) as
  select
    t.user_id,
    date_trunc('month', t.date)::date as month,
    w.currency,
    coalesce(sum(t.amount) filter (where t.amount > 0), 0)::bigint  as inflow,
    coalesce(-sum(t.amount) filter (where t.amount < 0), 0)::bigint as outflow
  from transactions t
  join wallets w on w.id = t.wallet_id
  where t.transfer_id is null
  group by t.user_id, date_trunc('month', t.date), w.currency;

-- --------------------------------------------------------------------- pace
--
-- Cumulative spend through the period against what is normal for it.
--
-- Returns one row per drawn point: how much had been spent by that day this
-- time, and the median of the same day across the preceding periods. Both
-- halves computed here rather than shipping seven daily series to the phone —
-- that is the 2 500-row response this file exists to avoid, and the client
-- would only reduce it to these two numbers anyway.
--
-- `spent` goes null once the day passes today. That null is load-bearing: it is
-- what stops the solid line at the present and leaves the rest of the period to
-- the projected tail, without the client having to know today's date relative
-- to a period it did not choose.
--
-- ## Aligning periods of different lengths
--
-- Months are 28 to 31 days, so "day 31 of a 30-day February" has to mean
-- something. Each period is accumulated over **its own** length and then sampled
-- at `least(day_index, its own length)`, which carries the final value forward:
-- day 31 against February is February's total, not a hole that would drag the
-- median down. The same clamp reads a longer prior period correctly at every
-- day the current one has.
--
-- ## Thinning
--
-- Same rule as `balance_history`, for the same reason — the chart is ~326px
-- wide and a year of daily points is payload the phone cannot resolve. The
-- modulus counts back from the end so the final day always survives, and day 1
-- is kept unconditionally so the line starts at the period's edge.

create function public.spending_pace(
  p_currency   char(3),
  p_start      date,
  p_step       interval,
  p_periods    int default 6,
  p_max_points int default 120
)
returns table (day_index int, spent bigint, typical bigint)
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
  ),
  sized as (
    select k, p_from, p_to, (p_to - p_from + 1) as n_days from periods
  ),
  -- Spending per day, per period. A transaction falls in exactly one period,
  -- so this join fans out by nothing.
  daily as (
    select
      s.k,
      (t.date - s.p_from + 1) as d,
      sum(-t.amount)::bigint  as amount
    from sized s
    join public.transactions t on t.date between s.p_from and s.p_to
    join public.wallets w      on w.id = t.wallet_id
    where w.currency     = p_currency
      and t.transfer_id is null
      and t.amount       < 0
    group by s.k, (t.date - s.p_from + 1)
  ),
  -- Every day of every period, so a day with no spending still carries the
  -- running total forward instead of leaving a gap in it.
  grid as (
    select s.k, s.n_days, g.d
    from sized s, generate_series(1, s.n_days) as g(d)
  ),
  running as (
    select
      g.k,
      g.d,
      g.n_days,
      sum(coalesce(dl.amount, 0)) over (partition by g.k order by g.d) as cum
    from grid g
    left join daily dl on dl.k = g.k and dl.d = g.d
  ),
  current_period as (select * from sized where k = 0),
  -- The clamp: each period read at its own last day once the current one runs
  -- past its end.
  sampled as (
    select i.i, r.k, r.cum
    from current_period c,
         generate_series(1, c.n_days) as i(i)
    join running r on r.d = least(i.i, r.n_days)
  ),
  folded as (
    select
      i,
      max(cum) filter (where k = 0) as spent,
      round(
        percentile_cont(0.5) within group (order by cum) filter (where k > 0)
      )::bigint as typical
    from sampled
    group by i
  ),
  step as (
    select greatest(
      1,
      ceil((select n_days from current_period)::numeric / greatest(p_max_points, 2))::int
    ) as n
  )
  select
    f.i::int,
    case
      when (c.p_from + f.i - 1) <= current_date then f.spent
      else null
    end,
    f.typical
  from folded f, current_period c, step
  where (c.n_days - f.i) % step.n = 0
     or f.i = 1
  order by f.i
$$;

-- ------------------------------------------------------------- by category
--
-- Spend per category for the selected period and the ones before it, in one
-- call, because the block needs both: the current figures to list and the
-- median of the earlier ones to judge them against.
--
-- Absent categories are absent rather than zero. A category with nothing in a
-- prior period has no row, and the client fills the zero — which is the correct
-- reading and cannot be done here without a cross join of every category
-- against every period.

create function public.category_period_totals(
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
  join public.transactions t on t.date between p.p_from and p.p_to
  join public.wallets w      on w.id = t.wallet_id
  where w.currency     = p_currency
    and t.transfer_id is null
    and t.amount       < 0
  group by p.k, t.category_id
$$;
