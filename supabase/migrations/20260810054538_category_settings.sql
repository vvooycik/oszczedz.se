-- Support for the category settings screen: how many transactions each category
-- carries, and a safe way to remove one.

-- ------------------------------------------------------------ category usage
--
-- The delete copy promises "482 transactions use Groceries", so the count has to
-- be real. Aggregated here rather than counted on the phone: the alternative is
-- pulling every transaction row just to group it.
--
-- A left join keeps unused categories in the result with a count of 0 — those
-- are exactly the ones that can be deleted without reassigning anything.

create view category_usage with (security_invoker = on) as
  select
    c.id      as category_id,
    c.user_id,
    count(t.id)::bigint as transaction_count
  from categories c
  left join transactions t on t.category_id = c.id
  group by c.id, c.user_id;

-- --------------------------------------------------------- delete a category
--
-- transactions.category_id references categories(id) with no cascade, so a
-- category with rows attached cannot simply be dropped — and it must not be,
-- because a transaction without a category is meaningless. Reassignment is the
-- required first step.
--
-- Both statements live in one function so a partial failure cannot leave rows
-- pointing at a category that is already gone.
--
-- p_reassign_to may be null only when nothing uses the category; passing null
-- with rows still attached raises rather than letting the foreign key decide,
-- so the caller gets a sentence instead of a constraint name.

create function delete_category(
  p_category_id uuid,
  p_reassign_to uuid default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_name        text;
  v_target_name text;
begin
  -- RLS means a category the caller does not own simply is not found.
  select name into v_name from public.categories where id = p_category_id;
  if v_name is null then
    raise exception 'Category not found';
  end if;

  if p_reassign_to is not null then
    if p_reassign_to = p_category_id then
      raise exception 'A category cannot be moved to itself';
    end if;

    select name into v_target_name from public.categories where id = p_reassign_to;
    if v_target_name is null then
      raise exception 'Target category not found';
    end if;

    update public.transactions
       set category_id = p_reassign_to
     where category_id = p_category_id;

  elsif exists (select 1 from public.transactions where category_id = p_category_id) then
    raise exception 'Transactions still use %; pick where they should land', v_name;
  end if;

  -- wallet_categories and budget_categories reference the row with
  -- `on delete cascade`, so their membership goes with it.
  delete from public.categories where id = p_category_id;
end;
$$;
