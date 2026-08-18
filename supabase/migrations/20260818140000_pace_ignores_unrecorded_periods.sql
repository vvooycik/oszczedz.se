-- The pace median must not average in periods that predate the records.
--
-- `spending_pace` took the median over the six preceding periods
-- unconditionally, which is right for a month and wrong for a year: the history
-- starts 2023-10-15, so the six years before 2026 are 2020, 2021, 2022 — three
-- of which contain nothing at all. A period with no rows is not a period of
-- careful spending, it is a period with no records, and folding it in as a zero
-- pulled the median down to 29,55 zł a day against a real 781,46. The chart
-- said the year was catastrophically over budget; what it had actually found
-- was the edge of the data.
--
-- A **partial** period is the same mistake in smaller print. 2023 holds ten
-- weeks of records and reads as a very cheap year. So the rule is not "drop
-- periods with no rows" but the stricter and more honest one: a prior period
-- counts only if it starts on or after the first transaction, i.e. only if the
-- records cover the whole of it. October 2023 goes; November 2023 onwards stay.
--
-- The selected period itself (k = 0) is always kept — it is what is being
-- asked about, and a period with nothing in it is a real answer.
--
-- When nothing survives, `percentile_cont` over the empty set returns null and
-- `typical` comes back null the whole way down. That is the correct shape for
-- "there is nothing to compare this to", and the client already reads it as no
-- chip and no projection sentence rather than as a zero.
--
-- Everything else is unchanged from 20260818090000_insights.sql.

create or replace function public.spending_pace(
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
  -- Where the records begin, in this currency.
  first_day as (
    select min(t.date) as day
    from public.transactions t
    join public.wallets w on w.id = t.wallet_id
    where w.currency = p_currency
  ),
  sized as (
    select p.k, p.p_from, p.p_to, (p.p_to - p.p_from + 1) as n_days
    from periods p, first_day f
    where p.k = 0
       or f.day is null
       or p.p_from >= f.day
  ),
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
