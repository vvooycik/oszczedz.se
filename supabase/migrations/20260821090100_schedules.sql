-- Schedules: the rules that make planned transactions.
--
-- A schedule is not a transaction. It is a recurrence — "Netflix, 43 zł, every
-- month on the 14th" — and it *generates* rows into `transactions` ahead of
-- time, out to a rolling horizon. Because the previous migration made a planned
-- row harmless to every aggregate, generating early costs nothing and buys a
-- great deal: an occurrence is a real row weeks before it charges, so it can be
-- skipped by deleting it and amended by editing it, the Upcoming list is
-- tappable, and the home chart's dotted tail needs no projection SQL at all —
-- it is the same `balance_history` call, run a month further.
--
-- The whole file is one transaction, and that is safe even though it creates an
-- enum and uses it: the restriction that split the budget migrations is on
-- ALTER TYPE ADD VALUE, not on CREATE TYPE.

create type schedule_frequency as enum ('daily', 'weekly', 'monthly', 'yearly');

-- `anchor` is the first occurrence and carries everything positional about the
-- rule — day of month for a monthly, weekday for a weekly, month-and-day for a
-- yearly. That is why there is no `resets_on` here the way budgets have one:
-- a budget period is a window that has to be found for an arbitrary day, and an
-- occurrence is just counted off from a known start.
--
-- `amount` is signed, in minor units, exactly like `transactions.amount`
-- (invariants 1 and 4). For a transfer schedule the sign is meaningless —
-- direction is which wallet is which — and the materialiser passes its
-- magnitude to `create_transfer`, which applies both signs itself (invariant 5).
--
-- `materialised_through` is the high-water mark, and it is what makes a
-- deliberately deleted occurrence stay deleted: generation only ever fills the
-- range beyond it, so a row you removed is never reconsidered. Null means
-- nothing has been generated yet.
create table schedules (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) default auth.uid(),
  name                 text not null,
  wallet_id            uuid not null references wallets(id),
  target_wallet_id     uuid references wallets(id),
  category_id          uuid not null references categories(id),
  amount               bigint not null,
  note                 text,
  frequency            schedule_frequency not null,
  every_n              integer not null default 1,
  anchor               date not null,
  ends_on              date,
  active               boolean not null default true,
  materialised_through date,
  created_at           timestamptz not null default now(),
  constraint every_n_check check (every_n between 1 and 365),
  -- Mirrors `create_transfer`'s own first guard, so a pair that could never be
  -- written cannot be scheduled either.
  constraint transfer_target_check check (
    target_wallet_id is null or target_wallet_id <> wallet_id
  ),
  constraint ends_after_anchor_check check (
    ends_on is null or ends_on >= anchor
  )
);

alter table schedules enable row level security;

create policy owner_all on schedules
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- A generated row knows where it came from. `on delete set null` is the point:
-- deleting a subscription must not delete the nine months it already charged —
-- those are history, and they carry on as ordinary transactions.
alter table transactions
  add column schedule_id uuid references schedules(id) on delete set null;

create index idx_transactions_schedule on transactions (schedule_id)
  where schedule_id is not null;

-- `select *` is expanded when a view is created, not when it runs, so the view
-- written one migration ago does not have the column added four lines ago.
-- CREATE OR REPLACE may append columns to the end of a view's list, which is
-- exactly what this is.
create or replace view settled_transactions with (security_invoker = on) as
  select * from transactions where date <= current_date;

-- ----------------------------------------------------------- FX is deferred
--
-- `create_transfer` takes two independent leg amounts precisely so a currency
-- exchange can carry a different figure on each side, and a schedule stores one
-- amount. Rather than invent a second column for a rate nobody can supply
-- (invariant 8 defers FX entirely), a cross-currency schedule is refused at the
-- point it would be written. A CHECK constraint cannot reach another table, so
-- this is a trigger.
create function public.schedule_currency_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_source char(3);
  v_target char(3);
begin
  if new.target_wallet_id is null then
    return new;
  end if;

  select currency into v_source from public.wallets where id = new.wallet_id;
  select currency into v_target from public.wallets where id = new.target_wallet_id;

  if v_source is distinct from v_target then
    raise exception 'A scheduled transfer needs both wallets in one currency (% and %); exchange rates are not modelled', v_source, v_target;
  end if;

  return new;
end;
$$;

create trigger schedule_currency_guard
  before insert or update on schedules
  for each row execute function public.schedule_currency_guard();

-- ------------------------------------------------------------- occurrences
--
-- The one generator. Every date is `anchor + n·step`, and the arithmetic really
-- is done from the anchor each time — which is the whole reason this is a
-- generate_series over *ordinals* rather than the far shorter
-- `generate_series(anchor, hi, '1 month')`.
--
-- That shorter form walks: it adds the step to the previous value, so a
-- subscription anchored on the 31st gives 31 Jan, 28 Feb, and then 28 March,
-- 28 April — the charge date slides backwards permanently the first time it
-- meets a short month, and a yearly anchored on 29 February never sees another
-- leap day. Measured, not assumed: that is what the first version of this
-- function returned.
--
-- Counting from the anchor instead, `2026-01-31 + 2 months` is 31 March, and
-- Postgres does the clamping — nothing here has to know about short months.
--
-- `steps` is an upper bound on how many fit before the end, computed per
-- frequency; occurrence *i* always lands in month(anchor) + i, so a month
-- difference can overshoot but never undercount. Anything past the end is
-- filtered.
create function public.schedule_occurrences(
  p_anchor    date,
  p_frequency public.schedule_frequency,
  p_every_n   integer,
  p_ends_on   date,
  p_from      date,
  p_to        date
)
returns setof date
language sql
immutable
set search_path = ''
as $$
  with bound as (
    select
      least(p_to, coalesce(p_ends_on, p_to)) as hi,
      -- A zero step would not error, it would hang. The CHECK constraint says
      -- the same thing; this is the copy that matters, because a stale row is
      -- still read here.
      greatest(p_every_n, 1) as n
  ),
  span as (
    select
      b.hi,
      b.n,
      case p_frequency
        when 'daily'   then (b.hi - p_anchor) / b.n
        when 'weekly'  then (b.hi - p_anchor) / (7 * b.n)
        when 'monthly' then ((
            (extract(year  from b.hi) - extract(year  from p_anchor)) * 12
          + (extract(month from b.hi) - extract(month from p_anchor))
        )::int) / b.n
        when 'yearly'  then ((
            extract(year from b.hi) - extract(year from p_anchor)
        )::int) / b.n
      end as steps
    from bound b
  )
  select x.d
    from span s,
         generate_series(0, greatest(s.steps, 0)) as g(i),
         lateral (
           select (p_anchor + (g.i * s.n) * case p_frequency
             when 'daily'   then interval '1 day'
             when 'weekly'  then interval '1 week'
             when 'monthly' then interval '1 month'
             when 'yearly'  then interval '1 year'
           end)::date as d
         ) x
   where x.d >= p_from
     and x.d <= s.hi;
$$;

-- ------------------------------------------------------------ materialising
--
-- Called by the app on open, with the phone's day (invariant 3 again — the
-- boundary is a calendar day and the server sits in UTC).
--
-- Idempotent by construction: generation runs over
-- `(materialised_through, today + horizon]` and the mark is advanced at the
-- end, so a second call within the same horizon inserts nothing. If the app is
-- not opened for six months, the missed occurrences all land at once with their
-- true dates — late to appear, never wrong about when they happened.
--
-- A transfer schedule goes through `create_transfer` so the pair is written by
-- the one statement that owns invariant 5, and the legs are stamped afterwards.
-- Adding a parameter to `create_transfer` would have meant dropping and
-- recreating it, which is how a call becomes ambiguous.
--
-- Returns how many rows were created, so the client can skip invalidating every
-- derived query on the overwhelmingly common "nothing was due" open.
create function public.materialise_schedules(
  p_today        date default current_date,
  p_horizon_days integer default 120
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_horizon  date := p_today + greatest(p_horizon_days, 0);
  v_created  integer := 0;
  v_transfer uuid;
  r          record;
  d          date;
begin
  -- RLS scopes this to the caller's own schedules.
  for r in
    select * from public.schedules
     where active
       and (materialised_through is null or materialised_through < v_horizon)
     order by created_at
  loop
    for d in
      select o
        from public.schedule_occurrences(
          r.anchor, r.frequency, r.every_n, r.ends_on,
          coalesce(r.materialised_through + 1, r.anchor), v_horizon) o
    loop
      if r.target_wallet_id is null then
        insert into public.transactions
          (user_id, wallet_id, category_id, amount, date, note, schedule_id)
        values
          (r.user_id, r.wallet_id, r.category_id, r.amount, d, r.note, r.id);
      else
        v_transfer := public.create_transfer(
          r.wallet_id, r.target_wallet_id,
          abs(r.amount), abs(r.amount),
          d, r.category_id, r.note);

        update public.transactions
           set schedule_id = r.id
         where transfer_id = v_transfer;
      end if;

      v_created := v_created + 1;
    end loop;

    update public.schedules
       set materialised_through = v_horizon,
           -- A rule whose end date has passed has produced everything it ever
           -- will, so it stops being active rather than being read forever to
           -- generate nothing. Measured against *today*, not the horizon: a
           -- schedule ending in two months still has occurrences pending, and
           -- retiring it now would show it as finished while it is still due.
           active = (r.ends_on is null or r.ends_on >= p_today)
     where id = r.id;
  end loop;

  return v_created;
end;
$$;

-- ------------------------------------------------------------- rule changes
--
-- Editing a subscription changes what it *will* charge, never what it charged.
-- So the future is thrown away and regenerated while the past is left exactly
-- as it is — including occurrences that were edited by hand after they landed.
--
-- Resetting the mark to `p_today` rather than to null is what draws that line:
-- null would regenerate the rule's whole history on top of itself.
create function public.reschedule(
  p_id    uuid,
  p_today date default current_date
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.transactions
   where schedule_id = p_id and date > p_today;

  update public.schedules
     set materialised_through = p_today
   where id = p_id;

  if not found then
    raise exception 'Schedule not found';
  end if;

  return public.materialise_schedules(p_today);
end;
$$;

create function public.set_schedule_active(
  p_id     uuid,
  p_active boolean,
  p_today  date default current_date
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Pausing has to take the already-generated future with it, or a paused
  -- subscription would keep charging for another four months.
  delete from public.transactions
   where schedule_id = p_id and date > p_today;

  update public.schedules
     set active = p_active,
         materialised_through = p_today
   where id = p_id;

  if not found then
    raise exception 'Schedule not found';
  end if;

  return case when p_active then public.materialise_schedules(p_today) else 0 end;
end;
$$;

-- Deleting a schedule cancels what is still coming and keeps what already
-- happened — the FK's `on delete set null` turns those rows back into ordinary
-- transactions.
create function public.delete_schedule(
  p_id    uuid,
  p_today date default current_date
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.transactions
   where schedule_id = p_id and date > p_today;

  delete from public.schedules where id = p_id;

  if not found then
    raise exception 'Schedule not found';
  end if;
end;
$$;
