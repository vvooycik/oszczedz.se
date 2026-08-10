-- balance_history: cap the number of rows returned.
--
-- PostgREST refuses to return more than `db-max-rows` (1000 on this project) and
-- does it by *silently truncating* — no error, no header the client checks. The
-- All time range asks for one row per day since 2023-10-15, which is 1031, so
-- the response stopped 31 days short and the chart's right edge sat a month in
-- the past while looking perfectly well-formed. Anything that can exceed a
-- thousand rows has this failure mode; it is not specific to this function.
--
-- Fewer rows is the right answer regardless. The chart is ~360px wide, so a
-- daily series was about three points per pixel — payload the phone pays for and
-- cannot resolve.
--
-- Balance is a point-in-time running total, not something to re-aggregate, so
-- thinning is just taking every Nth day. Two anchors matter:
--   * the modulus counts back from `p_to`, so the final day always survives —
--     the right edge is the whole point of a balance chart;
--   * `p_from` is kept unconditionally, so the range still reads full width.
--
-- With the default the shape is unchanged for every range shorter than
-- `p_max_points` days: step collapses to 1 and every day passes through.
--
-- CREATE OR REPLACE cannot add a parameter — it would leave the 3-arg version in
-- place and make a 3-arg call ambiguous ("function is not unique"), so the old
-- one is dropped first.

drop function if exists public.balance_history(char(3), date, date);

create function public.balance_history(
  p_currency   char(3),
  p_from       date,
  p_to         date,
  p_max_points int default 400
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
  ),
  -- The running total is still computed over every day; only the rows that
  -- leave are thinned, so a sampled day carries its true balance.
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
   order by r.day;
$$;
