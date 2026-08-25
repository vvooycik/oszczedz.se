-- When a wallet's starting balance enters the record.
--
-- `balance_history` folded every wallet's `starting_balance` into its opening
-- figure with no date on it, so a wallet created today was treated as having
-- held that money since before the first transaction ever recorded. Creating a
-- loan for 20 000 therefore did not step the total wealth line down *today* —
-- it dropped the whole line, 2023 included, and quietly restated three years of
-- history as poorer than they were.
--
-- `opened_on` is the day that balance lands. **Null means "from before the
-- records begin"**, which is exactly what every imported wallet is: its
-- `starting_balance` is the position it held at the first row of the import,
-- and there is no earlier day for it to arrive on. The column defaults to null,
-- so every chart drawn today is unchanged, byte for byte.
--
-- Not loan-only, though a loan is what found it: a savings account added in
-- 2026 with 30 000 already in it has the identical problem, and one column
-- meaning "when this balance starts counting" beats two that can disagree.
--
-- No CHECK ties it to a type for the same reason — every type opens somewhere.
-- Deliberately *not* constrained to be on or before today either: the value is
-- a fact about the account, and the client caps its picker instead (a future
-- opening would make `wallet_balances`, which is a balance *now* and cannot
-- take a date, disagree with the chart until the day arrived).

alter table wallets add column opened_on date;

comment on column wallets.opened_on is
  'Day the starting balance enters the record. Null = before the records begin.';

-- ------------------------------------------------------------ balance chart
--
-- Two changes, and they are the same change seen from either side of `p_from`:
--
--   * the opening figure counts a wallet only if it had already opened before
--     the window started (null still counts — it opened before everything);
--   * inside the window, a wallet's `starting_balance` is an ordinary event on
--     its `opened_on` day, summed alongside the transactions of that day.
--
-- So the line steps on the day the wallet arrives and is flat behind it, which
-- is what a new loan is: nothing, and then a debt.
--
-- Everything else — the thinning, `p_anchor`, the half-open-ness of nothing —
-- is untouched. Signature unchanged, so this replaces in place.

create or replace function public.balance_history(
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
        where w.currency = p_currency
          and (w.opened_on is null or w.opened_on < p_from))
      +
      (select coalesce(sum(t.amount), 0)
         from public.transactions t
         join public.wallets w on w.id = t.wallet_id
        where w.currency = p_currency
          and t.date < p_from) as amount
  ),
  events as (
    select t.date as day, t.amount as amount
      from public.transactions t
      join public.wallets w on w.id = t.wallet_id
     where w.currency = p_currency
       and t.date between p_from and p_to
    union all
    select w.opened_on, w.starting_balance
      from public.wallets w
     where w.currency = p_currency
       and w.opened_on between p_from and p_to
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
   where (p_to - r.day) % s.n = 0
      or r.day = p_from
      or r.day = p_anchor
   order by r.day;
$$;
