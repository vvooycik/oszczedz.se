-- Retiring a wallet without destroying what it did.
--
-- A closed account or a paid-off loan stops being useful *going forward*, but
-- its history is load-bearing: the account you closed in 2025 was still part of
-- your net worth in 2024, and every chart that looks back has to keep saying so.
-- Deleting is therefore the wrong verb, and the foreign key from `transactions`
-- already refuses it. Archiving hides the wallet from the places where you pick
-- one — the list, the entry form, transfer targets — and changes nothing else.
--
-- `archived_at timestamptz` rather than `is_archived boolean`: the same storage,
-- and it answers "when" instead of throwing that away. Null means active.
alter table wallets add column archived_at timestamptz;

-- ------------------------------------------------------- archive / restore
--
-- **A wallet may only be archived at a zero balance**, and that is enforced here
-- rather than in the form because the browser holds an anon key and can update
-- any column RLS lets it reach — a client-side check is a hint, not a rule.
--
-- The rule earns its keep by making a question disappear: an archived wallet
-- contributes nothing to total wealth either way, so there is never a doubt
-- about whether hidden wallets are counted. It also stops the app from hiding
-- money, which is how a budget tracker starts lying. Real life agrees — you
-- empty an account before you close it, and a loan ends when it is paid.
--
-- Balance is recomputed here rather than read from `wallet_balances`: the view
-- is `security_invoker` and would work, but this keeps the guard honest about
-- the definition in invariant 2 instead of depending on a view that could later
-- filter something out.
create function archive_wallet(p_wallet_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_name    text;
  v_balance bigint;
begin
  -- RLS means a wallet the caller does not own simply is not found.
  select w.name,
         w.starting_balance + coalesce(
           (select sum(t.amount) from public.transactions t where t.wallet_id = w.id),
           0)
    into v_name, v_balance
    from public.wallets w
   where w.id = p_wallet_id;

  if v_name is null then
    raise exception 'Wallet not found';
  end if;

  if v_balance <> 0 then
    raise exception
      '% still holds a balance of %; move it out before archiving',
      v_name, v_balance;
  end if;

  update public.wallets set archived_at = now() where id = p_wallet_id;
end;
$$;

-- No guard on the way back: a restored wallet is simply active again, and its
-- balance is whatever its transactions say.
create function restore_wallet(p_wallet_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.wallets set archived_at = null where id = p_wallet_id;
  if not found then
    raise exception 'Wallet not found';
  end if;
end;
$$;
