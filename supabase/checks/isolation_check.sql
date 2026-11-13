-- Tenant isolation check: acts as one user ("attacker", default the demo
-- account) against another ("victim", the other account with the most
-- transactions) and proves the attacker can neither see nor touch the victim's
-- data, through every table, view and function the API exposes.
--
-- Everything runs inside one DO block that always ends in an exception, so
-- Postgres rolls back every row it wrote — including any write that wrongly
-- succeeded. Success reads "ISOLATION CHECK OK"; anything else is a finding.
--
--   npx supabase db query --linked -f supabase/checks/isolation_check.sql
--
-- Checks:
--   reads   – every table and view shows the attacker exactly their own rows;
--             functions return only the attacker's ids and money
--   writes  – inserts/updates that point at the victim's rows, or claim the
--             victim's user_id, are rejected (FK, RLS with-check)
--   no-ops  – updates, deletes and RPCs aimed at the victim's rows change
--             nothing; a fingerprint of all victim rows is identical after
--   anon    – the logged-out role cannot read anything
do $check$
declare
  attacker_email constant text := 'demo@oszczedz.se';
  today constant date := current_date;
  a uuid; v uuid;                         -- attacker, victim
  -- attacker fixtures (created as the attacker, rolled back at the end)
  aw1 uuid; aw2 uuid; acat uuid; atcat uuid; atag uuid; atx uuid; atr uuid; abud uuid; asch uuid;
  -- victim ids (read as superuser)
  vw uuid; vcat uuid; vtag uuid; vtx uuid; vtr uuid; vbud uuid; vsch uuid;
  fp_before text; fp_after text;
  rel text; expected bigint; actual bigint; foreign_rows bigint; n bigint;
  ok_rejects text[] := '{}';
  findings text[] := '{}';
  broken text[] := '{}';
  attempt record;
  -- SQLSTATEs that mean "the database refused": FK, check, RLS/privilege,
  -- not-null, unique, raised by a function, no row found.
  refused constant text[] := array['23503','23514','42501','23502','23505','P0001','P0002'];
  sqlstate_ text;
  own_budgets uuid[]; own_categories uuid[]; expected_balance bigint; own_spend bigint;
begin
  -- ----------------------------------------------------------------- setup
  select id into a from auth.users where email = attacker_email;
  if a is null then raise exception 'attacker % not found', attacker_email; end if;
  select u.id into v from auth.users u left join public.transactions t on t.user_id = u.id
   where u.id <> a group by u.id order by count(t.id) desc limit 1;
  if v is null then raise exception 'no second user to protect'; end if;

  select id into vw   from public.wallets      where user_id = v order by created_at limit 1;
  select id into vcat from public.categories   where user_id = v order by name limit 1;
  select id into vtag from public.tags         where user_id = v order by name limit 1;
  select id into vtx  from public.transactions where user_id = v and transfer_id is null order by date desc limit 1;
  select transfer_id into vtr from public.transactions where user_id = v and transfer_id is not null limit 1;
  select id into vbud from public.budgets      where user_id = v limit 1;
  select id into vsch from public.schedules    where user_id = v limit 1;

  -- Fingerprint of every victim row, to prove nothing changed.
  select string_agg(h, ',' order by t) into fp_before from (
    select 'wallets' t, md5(coalesce(string_agg(x::text, '|' order by x.id), '')) h from public.wallets x where user_id = v
    union all select 'categories', md5(coalesce(string_agg(x::text, '|' order by x.id), '')) from public.categories x where user_id = v
    union all select 'tags', md5(coalesce(string_agg(x::text, '|' order by x.id), '')) from public.tags x where user_id = v
    union all select 'transactions', md5(coalesce(string_agg(x::text, '|' order by x.id), '')) from public.transactions x where user_id = v
    union all select 'transaction_tags', md5(coalesce(string_agg(x::text, '|' order by x.transaction_id, x.tag_id), '')) from public.transaction_tags x join public.transactions p on p.id = x.transaction_id where p.user_id = v
    union all select 'wallet_categories', md5(coalesce(string_agg(x::text, '|' order by x.wallet_id, x.category_id), '')) from public.wallet_categories x join public.wallets p on p.id = x.wallet_id where p.user_id = v
    union all select 'budgets', md5(coalesce(string_agg(x::text, '|' order by x.id), '')) from public.budgets x where user_id = v
    union all select 'budget_categories', md5(coalesce(string_agg(x::text, '|' order by x.budget_id, x.category_id), '')) from public.budget_categories x join public.budgets p on p.id = x.budget_id where p.user_id = v
    union all select 'budget_wallets', md5(coalesce(string_agg(x::text, '|' order by x.budget_id, x.wallet_id), '')) from public.budget_wallets x join public.budgets p on p.id = x.budget_id where p.user_id = v
    union all select 'schedules', md5(coalesce(string_agg(x::text, '|' order by x.id), '')) from public.schedules x where user_id = v
    union all select 'user_settings', md5(coalesce(string_agg(x::text, '|'), '')) from public.user_settings x where user_id = v
  ) s;

  -- ------------------------------------------- attacker fixtures, as attacker
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  insert into public.wallets (name, type, color_scheme) values ('iso-a1', 'account', 'slate') returning id into aw1;
  insert into public.wallets (name, type, color_scheme) values ('iso-a2', 'savings', 'moss') returning id into aw2;
  insert into public.categories (name, kind, glyph, color) values ('iso-cat', 'expense', 'tag', 'slate') returning id into acat;
  insert into public.categories (name, kind, glyph, color) values ('iso-transfer', 'transfer', 'transfer', 'slate') returning id into atcat;
  insert into public.tags (name) values ('iso-tag') returning id into atag;
  insert into public.transactions (wallet_id, category_id, amount, date) values (aw1, acat, -100, today) returning id into atx;
  insert into public.transaction_tags (transaction_id, tag_id) values (atx, atag);
  atr := public.create_transfer(aw1, aw2, 500, 500, today, atcat, null);
  insert into public.budgets (name, amount) values ('iso-budget', 1000) returning id into abud;
  insert into public.budget_categories (budget_id, category_id) values (abud, acat);
  insert into public.budget_wallets (budget_id, wallet_id) values (abud, aw1);
  insert into public.schedules (name, wallet_id, category_id, amount, frequency, anchor)
    values ('iso-schedule', aw1, acat, -50, 'monthly', today) returning id into asch;
  insert into public.wallet_categories (wallet_id, category_id, position) values (aw1, acat, 0);

  -- ---------------------------------------------------------------- reads
  -- For each relation: rows the attacker owns (counted as superuser) must be
  -- exactly what the attacker sees through RLS.
  for rel, expected in
    select r, c from (
      values
        ('wallets'),('categories'),('tags'),('transactions'),('budgets'),('schedules'),('user_settings'),
        ('transaction_tags'),('wallet_categories'),('budget_categories'),('budget_wallets'),
        ('settled_transactions'),('category_usage'),('loan_progress'),('monthly_cash_flow'),
        ('monthly_category_totals'),('wallet_monthly_net')
    ) rels(r), lateral (select 0::bigint c) z
  loop
    execute 'reset role';
    execute case rel
      when 'transaction_tags'  then 'select count(*) from public.transaction_tags x join public.transactions p on p.id = x.transaction_id where p.user_id = $1'
      when 'wallet_categories' then 'select count(*) from public.wallet_categories x join public.wallets p on p.id = x.wallet_id where p.user_id = $1'
      when 'budget_categories' then 'select count(*) from public.budget_categories x join public.budgets p on p.id = x.budget_id where p.user_id = $1'
      when 'budget_wallets'    then 'select count(*) from public.budget_wallets x join public.budgets p on p.id = x.budget_id where p.user_id = $1'
      else format('select count(*) from public.%I where user_id = $1', rel)
    end into expected using a;
    execute 'set local role authenticated';
    execute format('select count(*) from public.%I', rel) into actual;
    if actual <> expected then
      findings := findings || format('READ %s: sees %s rows, owns %s', rel, actual, expected);
    end if;
    if rel not in ('transaction_tags','wallet_categories','budget_categories','budget_wallets') then
      execute format('select count(*) from public.%I where user_id is distinct from $1', rel) into foreign_rows using a;
      if foreign_rows > 0 then findings := findings || format('READ %s: %s rows of another user', rel, foreign_rows); end if;
    end if;
  end loop;

  -- Functions: only the attacker's ids and money come back. Expected figures
  -- are computed as superuser over the attacker's rows alone.
  execute 'reset role';
  select coalesce(array_agg(id), '{}') into own_budgets from public.budgets where user_id = a;
  select coalesce(array_agg(id), '{}') into own_categories from public.categories where user_id = a;
  select coalesce(sum(starting_balance), 0) into expected_balance from public.wallets where user_id = a and currency = 'PLN';
  select expected_balance + coalesce(sum(t.amount), 0) into expected_balance
    from public.transactions t join public.wallets w on w.id = t.wallet_id
   where t.user_id = a and w.currency = 'PLN' and t.date <= today;
  select coalesce(sum(-t.amount), 0) into own_spend
    from public.transactions t join public.wallets w on w.id = t.wallet_id
   where t.user_id = a and w.currency = 'PLN' and t.amount < 0 and t.transfer_id is null
     and t.date between date_trunc('month', today)::date and today;
  execute 'set local role authenticated';

  select count(*) into n from public.wallet_balances(today) b where not exists (select 1 from public.wallets w where w.id = b.wallet_id and w.user_id = a) or b.user_id <> a;
  if n > 0 then findings := findings || format('FUNC wallet_balances: %s foreign rows', n); end if;
  select count(*) into n from public.budget_progress(today) b where not (b.budget_id = any(own_budgets));
  if n > 0 then findings := findings || format('FUNC budget_progress: %s foreign budgets', n); end if;
  select count(*) into n from public.category_period_totals('PLN', date_trunc('month', today)::date, '1 month', 6) c where not (c.category_id = any(own_categories));
  if n > 0 then findings := findings || format('FUNC category_period_totals: %s foreign categories', n); end if;
  select balance into n from public.balance_history('PLN', today - 400, today) order by day desc limit 1;
  if n is distinct from expected_balance then findings := findings || format('FUNC balance_history: final balance %s, attacker owns %s', n, expected_balance); end if;
  select count(*) into n from public.wallet_balance_history(vw, today - 400, today);
  if n > 0 then findings := findings || format('FUNC wallet_balance_history(victim): %s rows', n); end if;
  select coalesce(max(spent), 0) into n from public.spending_pace('PLN', date_trunc('month', today)::date, '1 month', 6, 120);
  if n > own_spend then findings := findings || format('FUNC spending_pace: spent %s exceeds attacker''s %s', n, own_spend); end if;
  if vbud is not null then
    select count(*) into n from public.budget_history(vbud, 24, today);
    if n > 0 then findings := findings || format('FUNC budget_history(victim): %s rows', n); end if;
    select count(*) into n from public.budget_transactions(vbud, today - 3650, today + 365);
    if n > 0 then findings := findings || format('FUNC budget_transactions(victim): %s rows', n); end if;
    select coalesce(public.budget_spend(vbud, today - 3650, today + 365), 0) into n;
    if n <> 0 then findings := findings || format('FUNC budget_spend(victim): %s', n); end if;
  end if;
  perform public.materialise_schedules(today, 120); -- must only touch the attacker's schedule

  -- ------------------------------------------------- writes that must fail
  for attempt in
    select * from (values
      ('insert tx: own wallet, victim category', format('insert into public.transactions (wallet_id, category_id, amount, date) values (%L, %L, -1, %L)', aw1, vcat, today)),
      ('insert tx: victim wallet, own category', format('insert into public.transactions (wallet_id, category_id, amount, date) values (%L, %L, -1, %L)', vw, acat, today)),
      ('insert tx: claim victim user_id', format('insert into public.transactions (user_id, wallet_id, category_id, amount, date) values (%L, %L, %L, -1, %L)', v, vw, vcat, today)),
      ('update own tx: move to victim wallet', format('update public.transactions set wallet_id = %L where id = %L', vw, atx)),
      ('update own tx: give to victim', format('update public.transactions set user_id = %L where id = %L', v, atx)),
      ('tag own tx with victim tag', format('insert into public.transaction_tags values (%L, %L)', atx, vtag)),
      ('tag victim tx with own tag', format('insert into public.transaction_tags values (%L, %L)', vtx, atag)),
      ('wallet_categories: own wallet, victim category', format('insert into public.wallet_categories (wallet_id, category_id, position) values (%L, %L, 1)', aw1, vcat)),
      ('wallet_categories: victim wallet, own category', format('insert into public.wallet_categories (wallet_id, category_id, position) values (%L, %L, 1)', vw, acat)),
      ('budget_categories: own budget, victim category', format('insert into public.budget_categories values (%L, %L)', abud, vcat)),
      ('budget_categories: victim budget, own category', format('insert into public.budget_categories values (%L, %L)', vbud, acat)),
      ('budget_wallets: own budget, victim wallet', format('insert into public.budget_wallets values (%L, %L)', abud, vw)),
      ('budget_wallets: victim budget, own wallet', format('insert into public.budget_wallets values (%L, %L)', vbud, aw1)),
      ('schedule on victim category', format('insert into public.schedules (name, wallet_id, category_id, amount, frequency, anchor) values (''x'', %L, %L, -1, ''monthly'', %L)', aw1, vcat, today)),
      ('schedule targeting victim wallet', format('insert into public.schedules (name, wallet_id, target_wallet_id, category_id, amount, frequency, anchor) values (''x'', %L, %L, %L, 1, ''monthly'', %L)', aw1, vw, atcat, today)),
      ('create_transfer into victim wallet', format('select public.create_transfer(%L, %L, 1, 1, %L, %L, null)', aw1, vw, today, atcat)),
      ('create_transfer out of victim wallet', format('select public.create_transfer(%L, %L, 1, 1, %L, %L, null)', vw, aw1, today, atcat)),
      ('insert wallet as victim', format('insert into public.wallets (user_id, name, type, color_scheme) values (%L, ''x'', ''account'', ''slate'')', v)),
      ('insert category as victim', format('insert into public.categories (user_id, name, kind, glyph, color) values (%L, ''x'', ''expense'', ''tag'', ''slate'')', v)),
      ('insert budget as victim', format('insert into public.budgets (user_id, name, amount) values (%L, ''x'', 1)', v)),
      ('insert settings as victim', format('insert into public.user_settings (user_id) values (%L)', v))
    ) t(label, stmt)
  loop
    begin
      execute attempt.stmt;
      findings := findings || ('WRITE allowed: ' || attempt.label);
    exception when others then
      sqlstate_ := SQLSTATE;
      if sqlstate_ = any(refused) then
        ok_rejects := ok_rejects || (attempt.label || ' [' || sqlstate_ || ']');
      else
        broken := broken || format('%s: %s %s', attempt.label, sqlstate_, SQLERRM);
      end if;
    end;
  end loop;

  -- ------------------------------------- aimed at victim rows: change nothing
  for attempt in
    select * from (values
      ('update victim transactions', 'update public.transactions set amount = amount + 1 where user_id = ' || quote_literal(v)),
      ('delete victim transaction', format('delete from public.transactions where id = %L', vtx)),
      ('update victim wallets', format('update public.wallets set name = ''pwned'' where user_id = %L', v)),
      ('delete victim categories', format('delete from public.categories where user_id = %L', v)),
      ('delete victim tags', format('delete from public.tags where user_id = %L', v)),
      ('delete victim budgets', format('delete from public.budgets where user_id = %L', v)),
      ('update victim schedules', format('update public.schedules set active = false where user_id = %L', v)),
      ('update victim settings', format('update public.user_settings set accent = ''plum'' where user_id = %L', v)),
      ('delete victim join rows', format('delete from public.wallet_categories where wallet_id = %L', vw)),
      ('delete_transfer(victim)', format('select public.delete_transfer(%L)', vtr)),
      ('archive_wallet(victim)', format('select public.archive_wallet(%L)', vw)),
      ('restore_wallet(victim)', format('select public.restore_wallet(%L)', vw)),
      ('delete_category(victim -> own)', format('select public.delete_category(%L, %L)', vcat, acat)),
      ('delete_schedule(victim)', format('select public.delete_schedule(%L, %L)', vsch, today)),
      ('set_schedule_active(victim)', format('select public.set_schedule_active(%L, false, %L)', vsch, today)),
      ('reschedule(victim)', format('select public.reschedule(%L, %L)', vsch, today))
    ) t(label, stmt)
  loop
    begin
      execute attempt.stmt;
    exception when others then
      sqlstate_ := SQLSTATE;
      if not (sqlstate_ = any(refused) or sqlstate_ = '22004') then -- 22004: null id (victim has none)
        broken := broken || format('%s: %s %s', attempt.label, sqlstate_, SQLERRM);
      end if;
    end;
  end loop;

  -- ------------------------------------------------------------------ anon
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
  for rel in select unnest(array['wallets','transactions','categories','budgets','schedules','monthly_cash_flow']) loop
    begin
      execute format('select count(*) from public.%I', rel) into n;
      findings := findings || format('ANON can read %s (%s rows)', rel, n);
    exception when insufficient_privilege then null;
    end;
  end loop;
  begin
    perform public.wallet_balances(today);
    findings := findings || 'ANON can call wallet_balances';
  exception when insufficient_privilege then null;
  end;

  -- ------------------------------------------- victim data must be untouched
  execute 'reset role';
  select string_agg(h, ',' order by t) into fp_after from (
    select 'wallets' t, md5(coalesce(string_agg(x::text, '|' order by x.id), '')) h from public.wallets x where user_id = v
    union all select 'categories', md5(coalesce(string_agg(x::text, '|' order by x.id), '')) from public.categories x where user_id = v
    union all select 'tags', md5(coalesce(string_agg(x::text, '|' order by x.id), '')) from public.tags x where user_id = v
    union all select 'transactions', md5(coalesce(string_agg(x::text, '|' order by x.id), '')) from public.transactions x where user_id = v
    union all select 'transaction_tags', md5(coalesce(string_agg(x::text, '|' order by x.transaction_id, x.tag_id), '')) from public.transaction_tags x join public.transactions p on p.id = x.transaction_id where p.user_id = v
    union all select 'wallet_categories', md5(coalesce(string_agg(x::text, '|' order by x.wallet_id, x.category_id), '')) from public.wallet_categories x join public.wallets p on p.id = x.wallet_id where p.user_id = v
    union all select 'budgets', md5(coalesce(string_agg(x::text, '|' order by x.id), '')) from public.budgets x where user_id = v
    union all select 'budget_categories', md5(coalesce(string_agg(x::text, '|' order by x.budget_id, x.category_id), '')) from public.budget_categories x join public.budgets p on p.id = x.budget_id where p.user_id = v
    union all select 'budget_wallets', md5(coalesce(string_agg(x::text, '|' order by x.budget_id, x.wallet_id), '')) from public.budget_wallets x join public.budgets p on p.id = x.budget_id where p.user_id = v
    union all select 'schedules', md5(coalesce(string_agg(x::text, '|' order by x.id), '')) from public.schedules x where user_id = v
    union all select 'user_settings', md5(coalesce(string_agg(x::text, '|'), '')) from public.user_settings x where user_id = v
  ) s;
  if fp_after <> fp_before then findings := findings || 'VICTIM DATA CHANGED'; end if;

  -- ---------------------------------------------------------------- report
  if cardinality(findings) = 0 and cardinality(broken) = 0 then
    raise exception 'ISOLATION CHECK OK: 17 relations, 8 function checks, % writes refused, 16 attacks on victim rows had no effect, anon locked out, victim fingerprint unchanged',
      cardinality(ok_rejects);
  end if;
  raise exception 'ISOLATION CHECK FAILED | findings: % | broken attempts: %',
    array_to_string(findings, ' ; '), array_to_string(broken, ' ; ');
end
$check$;
