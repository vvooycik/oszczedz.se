-- A fourth budget period: daily.
--
-- Alone in a file for the same reason 'weekly' and 'yearly' were: Postgres will
-- add an enum value inside a transaction, but nothing in that *same*
-- transaction may use it — a CHECK constraint or a function body naming 'daily'
-- fails with "unsafe use of new value". The Supabase CLI runs each migration
-- file as its own transaction, so splitting the file is what makes the next one
-- legal.

alter type budget_period add value if not exists 'daily';
