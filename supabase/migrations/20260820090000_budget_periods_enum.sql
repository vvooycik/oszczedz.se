-- Weekly and yearly budget periods.
--
-- Alone in a file on purpose. Postgres will add an enum value inside a
-- transaction, but nothing in that *same* transaction may use it — a CHECK
-- constraint or a function body naming 'weekly' fails with "unsafe use of new
-- value". The Supabase CLI runs each migration file as its own transaction, so
-- splitting the file is what makes the next one legal, and this is the whole
-- reason for a two-line migration.

alter type budget_period add value if not exists 'weekly';
alter type budget_period add value if not exists 'yearly';
