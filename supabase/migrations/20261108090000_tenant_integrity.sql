-- Multi-user hardening: a row may only point at rows owned by the same user,
-- and the logged-out role holds no privileges at all.
--
-- Reading was already isolated — verified against the live data by
-- impersonating a second user, who got 0 rows from every table, view and
-- function. Two gaps were on the *write* side, plus one layer of defence that
-- was missing.
--
-- ## 1. Foreign keys carry the owner
--
-- The policies on `transactions` and `schedules` check `user_id` and nothing
-- else, and **a foreign key check bypasses RLS** — Postgres runs it as the
-- table owner. So a user could insert their own transaction pointing at
-- someone else's wallet or category, given its id. Measured: allowed.
--
-- Nobody could *read* anything through it (the victim's RLS hides the row; the
-- attacker's joins find no wallet), but it was still three real problems: an
-- existence oracle on ids, a row that blocks the victim deleting their own
-- category (`delete_category` reassigns only the rows RLS lets it see, then
-- trips the FK on the attacker's), and an invariant — a transaction's wallet
-- belongs to its owner — that held only because nobody had broken it.
--
-- The fix is in the key, not in the policy: `(wallet_id, user_id)` references
-- `wallets(id, user_id)`, so the database refuses a mismatched pair whichever
-- role writes it, the service role and SQL editor included. A policy `exists`
-- would only bind the API roles. The join tables needed nothing: their
-- policies already check both sides.
--
-- Constraint names are kept, so PostgREST's relationship hints and the
-- generated types still resolve to the same names.
--
-- `schedule_id` is `on delete set null`, and a plain SET NULL on a composite
-- key would null `user_id` too — which is not-null, so deleting a schedule
-- would fail. Postgres 15+ takes a column list: only `schedule_id` is cleared.
--
-- `target_wallet_id` is nullable, and a composite key with any null column is
-- not checked (MATCH SIMPLE), so a non-transfer schedule is unaffected.
--
-- Checked before writing: zero existing rows disagree with their wallet,
-- category or schedule about who owns them, so every key validates.

alter table wallets    add constraint wallets_id_user_key    unique (id, user_id);
alter table categories add constraint categories_id_user_key unique (id, user_id);
alter table schedules  add constraint schedules_id_user_key  unique (id, user_id);

alter table transactions
  drop constraint transactions_wallet_id_fkey,
  add  constraint transactions_wallet_id_fkey
       foreign key (wallet_id, user_id) references wallets (id, user_id),
  drop constraint transactions_category_id_fkey,
  add  constraint transactions_category_id_fkey
       foreign key (category_id, user_id) references categories (id, user_id),
  drop constraint transactions_schedule_id_fkey,
  add  constraint transactions_schedule_id_fkey
       foreign key (schedule_id, user_id) references schedules (id, user_id)
       on delete set null (schedule_id);

alter table schedules
  drop constraint schedules_wallet_id_fkey,
  add  constraint schedules_wallet_id_fkey
       foreign key (wallet_id, user_id) references wallets (id, user_id),
  drop constraint schedules_target_wallet_id_fkey,
  add  constraint schedules_target_wallet_id_fkey
       foreign key (target_wallet_id, user_id) references wallets (id, user_id),
  drop constraint schedules_category_id_fkey,
  add  constraint schedules_category_id_fkey
       foreign key (category_id, user_id) references categories (id, user_id);

-- ## 2. The logged-out role gets nothing
--
-- Supabase grants `anon` every privilege on every table and function by
-- default, and RLS was the only thing stopping it — no policy names `anon`, so
-- it saw 0 rows. That is correct and fragile: one policy written `to public`
-- instead of `to authenticated`, or one view created without
-- `security_invoker`, and the logged-out internet reads it. Nothing in the app
-- queries before login (the auth gate renders `LoginPage` before any data
-- hook exists), so `anon` has no use for any of it.
--
-- `TRUNCATE`, `REFERENCES` and `TRIGGER` come off `authenticated` as well.
-- **TRUNCATE ignores RLS entirely.** PostgREST cannot issue it and no function
-- here does, so it was unreachable — but it is a delete-everything-for-everyone
-- privilege held by every signed-in user, and nothing needs it.
--
-- Functions: EXECUTE was granted to PUBLIC as well as to each role, so
-- revoking from `anon` alone would have left it callable through PUBLIC.
-- `authenticated` keeps its own explicit grant, which is what the app uses —
-- including for the functions that only other functions call
-- (`budget_spend`, `budget_period_bounds`), since every one is SECURITY
-- INVOKER and runs as the caller.

revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon, public;

revoke truncate, references, trigger on all tables in schema public from authenticated;

-- And for whatever later migrations create, which run as `postgres`.
alter default privileges for role postgres in schema public
  revoke all on tables from anon;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon;
alter default privileges for role postgres in schema public
  revoke all on functions from anon, public;
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger on tables from authenticated;
