-- A fifth budget period: once.
--
-- Alone in a file for the third time, and for the same reason 'weekly',
-- 'yearly' and 'daily' were: Postgres will add an enum value inside a
-- transaction, but nothing in that *same* transaction may use it — a CHECK
-- constraint or a function body naming 'once' fails with "unsafe use of new
-- value". The Supabase CLI runs each migration file as its own transaction, so
-- splitting the file is what makes the next one legal.

alter type budget_period add value if not exists 'once';
