-- `wallet_balance_history`: the Home balance chart for one wallet.
--
-- The iOS wallet screen draws the same chart as Home (range picker, compare
-- overlay, forecast) but for the wallet that is open. It is `balance_history`
-- with the currency filter swapped for a wallet one; every rule is unchanged:
--
--   * reads `transactions`, not settled — planned rows are the forecast;
--   * the starting balance counts in the opening figure if the wallet opened
--     before the window (null = before the records begin), and inside the
--     window it is an event on its `opened_on` day;
--   * thinned to `p_max_points` counting back from `p_to`, keeping `p_from`
--     and `p_anchor` (today) unconditionally.
--
-- A new function rather than a `p_wallet` argument on `balance_history`: an
-- extra argument changes the signature, which means drop-and-recreate and two
-- overloads PostgREST must tell apart. The web keeps calling the old one.
--
-- Security invoker, so RLS scopes both tables. A wallet the caller cannot see
-- returns **no rows** (not a line of zeros), so the isolation check reads 0.

create or replace function public.wallet_balance_history(
  p_wallet     uuid,
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
  with wallet as (
    select w.id, w.starting_balance, w.opened_on
      from public.wallets w
     where w.id = p_wallet
  ),
  step as (
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
         from wallet w
        where w.opened_on is null or w.opened_on < p_from)
      +
      (select coalesce(sum(t.amount), 0)
         from public.transactions t
        where t.wallet_id = p_wallet
          and t.date < p_from) as amount
  ),
  events as (
    select t.date as day, t.amount as amount
      from public.transactions t
     where t.wallet_id = p_wallet
       and t.date between p_from and p_to
    union all
    select w.opened_on, w.starting_balance
      from wallet w
     where w.opened_on between p_from and p_to
  ),
  daily as (
    select e.day, sum(e.amount) as amount
      from events e
     group by e.day
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
   where exists (select 1 from wallet)
     and ((p_to - r.day) % s.n = 0
          or r.day = p_from
          or r.day = p_anchor)
   order by r.day;
$$;

comment on function public.wallet_balance_history(uuid, date, date, int, date) is
  'balance_history for one wallet: running balance per day, planned rows included, thinned to p_max_points.';
