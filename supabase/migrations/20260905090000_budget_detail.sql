-- A budget detail screen needs two things the database could not answer:
-- **which rows** counted against a budget, and **what the periods before this
-- one did**.
--
-- ## The membership rule stops being a copy
--
-- Until now the rule that decides whether a transaction counts — not a transfer
-- leg, an expense category, the wallet's currency, and inside both scopes —
-- lived once, inside `budget_spend`, as a `where` clause around a `sum`. A feed
-- needs the same rule to return *rows*, and re-implementing it in the browser
-- is exactly the drift that removed the transaction screen's old "Against the
-- budget" block: every figure on that card was real and the pairing behind it
-- was invented.
--
-- So the rule moves out into `budget_transactions`, which is the rows, and
-- `budget_spend` becomes a `sum` over it. One definition, two readings, and a
-- future change to what counts cannot reach one and miss the other.
--
-- `budget_spend` loses its `p_user` and `p_currency` parameters in the move:
-- both are facts about the budget row, which `budget_transactions` now reads
-- for itself. They were there to save `budget_progress` a lookup it was already
-- holding, and the price was two callers who could disagree about whose budget
-- it was.
--
-- ## The history is a walk, not a window
--
-- `budget_history` steps `budget_period_bounds` backwards from the period
-- containing today — the day before a period started is by definition in the
-- previous one, which is the same move `budget_progress` makes to find its
-- rollover — and reports each window's spend against the same limit. That is
-- the whole of "how often do I go over".
--
-- Three things it is careful about:
--
--   * **It stops where the records do.** A period beginning before the first
--     transaction is not a quiet month, it is the edge of the data, and a bar
--     at zero there would read as the one period this budget was never broken.
--     The same rule `spending_pace` learned the hard way.
--   * **The newest bar matches the screen above it.** Its window is clamped at
--     `today + 1`, exactly as `budget_progress.spent` is, so the current period
--     counts settled rows only and the strip's last bar is the figure the
--     header is quoting.
--   * **It collects one window more than it returns.** A period's rollover is
--     the unspent remainder of the one before it, so the oldest window walked
--     to exists only to be read and then dropped — unless the records ran out
--     first, in which case the oldest returned has nothing behind it and rolls
--     over nothing, which is the honest answer rather than a guess.
--
-- It carries a row **count** per period as well as a total. The feed below the
-- strip shows one period at a time and a yearly budget over every category is
-- the one window whose row count can pass PostgREST's silent 1000-row cap
-- (invariant 2) — so the screen asks for a bounded page and needs the true
-- count to be able to say that is what it did.

-- --------------------------------------------------------------- what counts

-- Every transaction that counts against one budget over a half-open day range.
--
-- Deliberately unordered and unbounded: this is the *rule*, and the two callers
-- want different things from it. `budget_spend` sums the lot; the detail
-- screen's feed asks PostgREST for the newest page of it with an exact count.
create function public.budget_transactions(
  p_budget uuid,
  p_from   date,
  p_to     date
)
returns setof public.transactions
language sql
security invoker
stable
set search_path = ''
as $$
  select t.*
    from public.budgets b
    join public.transactions t on t.user_id = b.user_id
    join public.wallets w      on w.id = t.wallet_id
    join public.categories c   on c.id = t.category_id
   where b.id           = p_budget
     and t.transfer_id is null
     and c.kind         = 'expense'
     and w.currency     = b.currency
     and t.date        >= p_from
     and t.date        <  p_to
     and (
       not exists (select 1 from public.budget_categories bc where bc.budget_id = b.id)
       or exists (select 1 from public.budget_categories bc
                   where bc.budget_id = b.id and bc.category_id = t.category_id)
     )
     and (
       not exists (select 1 from public.budget_wallets bw where bw.budget_id = b.id)
       or exists (select 1 from public.budget_wallets bw
                   where bw.budget_id = b.id and bw.wallet_id = t.wallet_id)
     );
$$;

-- --------------------------------------------------------------------- spend

-- What one budget spent over a half-open day range: the same rows, summed.
--
-- **Negated, and the sign is not filtered.** A refund is a positive amount
-- under an expense category, and it *reduces* the spend rather than being
-- ignored — the money came back.
--
-- Dropped and recreated rather than replaced, because the signature changes:
-- the user and the currency are the budget's own and are read from it now.
drop function public.budget_spend(uuid, uuid, char(3), date, date);

create function public.budget_spend(
  p_budget uuid,
  p_from   date,
  p_to     date
)
returns bigint
language sql
security invoker
stable
set search_path = ''
as $$
  select coalesce(sum(-t.amount), 0)::bigint
    from public.budget_transactions(p_budget, p_from, p_to) t;
$$;

-- ------------------------------------------------------------------ progress

-- Unchanged in shape — same columns, same order, same meanings — and rewritten
-- only because `budget_spend` takes three arguments now.
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
    select public.budget_spend(b.id, win.period_start,
                               least(win.period_end, p_today + 1)) as spend
  ) cur
  cross join lateral (
    select public.budget_spend(b.id, greatest(win.period_start, p_today + 1),
                               win.period_end) as spend
  ) soon
  cross join lateral (
    select public.budget_spend(b.id, ago.period_start, ago.period_end) as spend
  ) prev
  order by b.home_order, b.name;
$$;

-- ------------------------------------------------------------------- history

-- One row per period, oldest first, ending with the period containing
-- `p_today`.
--
-- A **one-off** has exactly one window and `budget_period_bounds` answers with
-- it whatever day it is asked about, so walking back from it would repeat the
-- same run forever. It returns a single row, which is the truth about a budget
-- that runs once and the reason the screen drops the strip for one.
create function public.budget_history(
  p_budget  uuid,
  p_periods integer default 12,
  p_today   date default current_date
)
returns table (
  period_start date,
  period_end   date,
  limit_amount bigint,
  rolled_over  bigint,
  spent        bigint,
  txns         integer
)
language plpgsql
security invoker
stable
set search_path = ''
as $$
declare
  b          public.budgets%rowtype;
  want       integer := greatest(1, least(coalesce(p_periods, 12), 60));
  floor_day  date;
  cursor_day date;
  win        record;
  tally      record;
  starts     date[]    := '{}';
  ends       date[]    := '{}';
  spends     bigint[]  := '{}';
  counts     integer[] := '{}';
  collected  integer;
  i          integer;
begin
  select * into b from public.budgets where id = p_budget;
  if not found then return; end if;

  select min(t.date) into floor_day
    from public.transactions t
   where t.user_id = b.user_id;

  cursor_day := p_today;
  for i in 1 .. want + 1 loop
    select w.period_start, w.period_end into win
      from public.budget_period_bounds(
        b.period, b.resets_on, cursor_day, b.starts_on, b.ends_on
      ) w;

    -- A run that was chosen is drawn whether or not the records reach it: it is
    -- the budget itself, not one sample of a repeating rule.
    exit when b.period <> 'once'
          and floor_day is not null
          and win.period_start < floor_day;

    starts := array_prepend(win.period_start, starts);
    ends   := array_prepend(win.period_end,   ends);
    cursor_day := win.period_start - 1;
    exit when b.period = 'once';
  end loop;

  collected := coalesce(array_length(starts, 1), 0);
  if collected = 0 then return; end if;

  for i in 1 .. collected loop
    select coalesce(sum(-t.amount), 0)::bigint as total, count(*)::int as rows
      into tally
      from public.budget_transactions(
        p_budget, starts[i], least(ends[i], p_today + 1)
      ) t;
    spends[i] := tally.total;
    counts[i] := tally.rows;
  end loop;

  for i in 1 .. collected loop
    -- The extra window at the far end exists only to supply the next one's
    -- rollover. It is dropped unless the records ran out first, in which case
    -- there is no extra window and every one collected is a real answer.
    continue when i = 1 and collected > want;

    period_start := starts[i];
    period_end   := ends[i];
    limit_amount := b.amount;
    rolled_over  := case
      when b.rollover and i > 1 then greatest(b.amount - spends[i - 1], 0)::bigint
      else 0::bigint
    end;
    spent := spends[i];
    txns  := counts[i];
    return next;
  end loop;
end;
$$;
