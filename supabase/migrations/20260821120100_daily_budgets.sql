-- Daily budgets: a limit that starts again every morning.
--
-- The shortest period the model can express, and the only one of the four whose
-- window needs nothing found: a day *is* the period. `transactions.date` is a
-- DATE (invariant 3), so a daily budget sits exactly on the grain the data is
-- already recorded at — no clock, no timezone, no partial-period question.
--
-- ## `resets_on` is unread here, and pinned rather than left loose
--
-- The other three periods each have somewhere to start from — a day of the
-- month, a weekday, an anniversary — and `resets_on` is that one integer read
-- three ways. A day has no such freedom: it begins when it begins. The column
-- stays (it is not-null and shared by all four) and is pinned to 1, the value
-- the client already writes whenever the period changes.
--
-- Pinned rather than left unconstrained because the old `case` has no `else`:
-- an unlisted period evaluates to NULL, and a NULL check *passes*. So 'daily'
-- would already have accepted any integer at all, silently carrying whatever
-- the row held before it was switched. One legal value means the column can
-- never disagree with itself about a period that does not read it.
--
-- ## What a one-day period does to the arithmetic upstream
--
-- Nothing that needed changing, which is worth stating because it was checked
-- rather than assumed:
--
--   * **Rollover still works, and is the reason to want this.** The rollover
--     window is `budget_period_bounds(period_start - 1)` — yesterday — so an
--     unspent day adds its remainder to today. One period, never compounding,
--     exactly as before.
--   * **Verdict cannot say "at risk", and should not.** A projection is
--     `spend / dayOfPeriod × daysInPeriod`, which over a single day is the
--     spend itself; anything it could flag, `over` has already caught.
--   * **`budget_spend` needs no change.** Its settled/planned split is a clamp
--     of a half-open range against today, and for a range that *is* today the
--     clamp gives the whole day to settled and nothing to planned — which is
--     right: there is no "later this period" inside a day.

alter table budgets drop constraint budget_resets_on_check;

alter table budgets
  add constraint budget_resets_on_check check (
    case period
      when 'daily'   then resets_on = 1
      when 'monthly' then resets_on between 1 and 31
      when 'weekly'  then resets_on between 0 and 6
      when 'yearly'  then resets_on between 1 and 365
    end
  );

-- The period containing `p_on`, as a half-open range: `period_start` is in it,
-- `period_end` is the next period's first day.
--
-- Everything about periods is answered here, once, so no caller has to know
-- that months clamp, years do not, and a day is simply itself.
create or replace function public.budget_period_bounds(
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
  if p_period = 'daily' then
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
