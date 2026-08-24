-- One-off budgets: a limit over a run of days that is chosen rather than found.
--
-- Every period until now has been a *rule* — a day of the month, a weekday, an
-- anniversary — and `budget_period_bounds` existed to search for the window
-- containing a given day. A holiday, a kitchen, a wedding has no rule behind
-- it: it starts on the 12th, it ends on the 26th, and then it is over. So the
-- window stops being derived and becomes two columns.
--
-- ## The window is a fact about the row, not a search
--
-- For every other period, "the period containing `p_on`" always has an answer,
-- because the rule can be run backwards from any day. For `once` it may not —
-- ask about a day after the run finished and there is no next window, because
-- there is no next anything.
--
-- So the function returns **the row's own window whatever day is asked about**.
-- That is what keeps every caller working unchanged: `budget_progress` still
-- reports one row per budget with a start and an end, `budget_spend` still
-- clamps that range against today, and the client can see that the window has
-- passed because it can read the dates. The alternative — returning no row for
-- a finished budget — would make it vanish from the list that is the only place
-- it can be deleted from.
--
-- ## What that does to the arithmetic upstream, which is nothing
--
--   * **`spent`** is `budget_spend(start, least(end, today + 1))`. After the run
--     it is the whole window, permanently: a finished budget's figure is final,
--     which is the honest reading. Before the run it is an empty range, so 0.
--   * **`planned`** is the mirror, `[greatest(start, today + 1), end)`. A run
--     entirely in the future is *all* planned, which is exactly what a booked
--     flight sitting in a holiday budget should say.
--   * **`rolled_over`** is 0, because rollover is refused for this period — see
--     below.
--
-- ## Three things a one-off may not hold
--
--   * **`rollover`.** It means "carry the last period's remainder into this
--     one", and there is no last period. Refused by CHECK rather than ignored,
--     so the column can never disagree with what the screen draws.
--   * **`resets_on`.** Pinned to 1, the same treatment 'daily' gets and for the
--     same reason: the column is not-null and shared by all five periods, and
--     the old `case` has no `else` — an unlisted period evaluates to NULL, and a
--     NULL check *passes*, so a budget switched from monthly would silently keep
--     carrying the 25th.
--   * **A window that is not a window.** `ends_on >= starts_on`, so the shortest
--     legal run is one day — which is a daily budget that happens once, and a
--     perfectly reasonable thing to want.
--
-- `ends_on` is stored **inclusive**, because that is what is picked on a
-- calendar: a run ending on the 26th includes the 26th. It becomes the
-- half-open `period_end` on the way out, once, here.

-- ------------------------------------------------------------------ columns

alter table budgets
  add column starts_on date,
  add column ends_on   date;

-- Two-way, like the wallet type constraints: the dates are present iff the
-- period is 'once', so a budget switched away from it cannot carry a stale run
-- into a monthly row.
alter table budgets
  add constraint budget_run_dates_check check (
    (period = 'once') = (starts_on is not null)
    and (starts_on is null) = (ends_on is null)
    and (ends_on is null or ends_on >= starts_on)
  );

alter table budgets
  add constraint budget_once_never_rolls check (
    period <> 'once' or rollover = false
  );

alter table budgets drop constraint budget_resets_on_check;

alter table budgets
  add constraint budget_resets_on_check check (
    case period
      when 'once'    then resets_on = 1
      when 'daily'   then resets_on = 1
      when 'monthly' then resets_on between 1 and 31
      when 'weekly'  then resets_on between 0 and 6
      when 'yearly'  then resets_on between 1 and 365
    end
  );

-- ------------------------------------------------------------ period bounds

-- Dropped rather than replaced: adding two defaulted parameters makes a *new*
-- function, and the old three-argument call would then be ambiguous between the
-- two. Postgres does not track function-to-function dependencies, so the drop
-- is safe as long as `budget_progress` is recreated below — which it is.
drop function public.budget_period_bounds(public.budget_period, integer, date);

-- The period containing `p_on`, as a half-open range: `period_start` is in it,
-- `period_end` is the next period's first day.
--
-- Everything about periods is answered here, once, so no caller has to know
-- that months clamp, years do not, a day is simply itself, and a one-off run is
-- not looked for at all — it is handed in.
create function public.budget_period_bounds(
  p_period    public.budget_period,
  p_resets_on integer,
  p_on        date,
  p_starts_on date default null,
  p_ends_on   date default null
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
  if p_period = 'once' then
    -- `p_on` is deliberately unread: the run is the row's, and asking about a
    -- day outside it still answers with the run rather than with nothing.
    -- `ends_on` is inclusive on the row and exclusive here, hence the + 1.
    period_start := coalesce(p_starts_on, p_on);
    period_end   := coalesce(p_ends_on, p_on) + 1;

  elsif p_period = 'daily' then
    -- No anchor to find: `p_resets_on` is not read for this period.
    period_start := p_on;
    period_end   := p_on + 1;

  elsif p_period = 'weekly' then
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

-- ---------------------------------------------------------------- progress

-- Unchanged in shape — same columns, same order, same meanings — and rewritten
-- only because both of its bounds calls now carry the run. The rollover's
-- lateral still runs for a one-off and returns that same run, which costs one
-- more `budget_spend` over a range whose answer is then discarded by the
-- `case`: `rollover` is false for this period by CHECK, so `rolled_over` is 0.
-- Left as one uniform join rather than branched, because a `case` around a
-- lateral would put the period model back into this body, which is the thing
-- `budget_period_bounds` exists to prevent.
create or replace function public.budget_progress(p_today date default current_date)
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
  cross join lateral public.budget_period_bounds(
    b.period, b.resets_on, p_today, b.starts_on, b.ends_on
  ) win
  cross join lateral public.budget_period_bounds(
    b.period, b.resets_on, win.period_start - 1, b.starts_on, b.ends_on
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
