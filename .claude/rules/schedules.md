---
paths:
  - "src/screens/schedules/**"
  - "src/lib/schedules.ts"
  - "src/screens/add/RepeatSheet.tsx"
  - "supabase/migrations/*schedul*"
  - "supabase/migrations/*planned*"
---

# Schedules and planned transactions

Vocabulary (invariant 3b): **settled** = dated today or earlier, **planned** =
dated later, **schedule** = the recurrence rule that writes planned rows. A
planned row is an ordinary transaction — editable, deletable — and becomes
settled by the calendar moving.

## The rule

- `anchor` is the first occurrence and carries everything positional (day of
  month, weekday, month-and-day). The entry form asks no extra date — the
  transaction's own date is the anchor.
- `target_wallet_id` non-null makes a transfer schedule, written through
  `create_transfer` and both legs stamped with `schedule_id`. A **trigger
  refuses a cross-currency pair** (one stored amount, no rate — invariant 8).
- Occurrences are **written ahead** to a rolling 120-day horizon, not projected.
  Planned rows are harmless to every aggregate by construction, so the forecast
  is just `balance_history` run further, and a charge can be skipped by deleting
  its row.

## Functions

- `schedule_occurrences(anchor, frequency, every_n, ends_on, from, to)` — the
  one generator. A `generate_series` over **ordinals**, every date
  `anchor + n·step`. Never `generate_series(anchor, hi, '1 month')`: it walks
  from the previous value, so the 31st slides to the 28th forever after
  February. `src/lib/schedules.ts` mirrors this and must keep agreeing.
- `materialise_schedules(today, horizon_days = 120)` — fills
  `(materialised_through, today + horizon]`, advances the mark, returns the row
  count. The mark makes a repeat call a no-op and keeps a deleted occurrence
  deleted. Called by the app **on open** (no cron, no server); a month unopened
  means late-arriving rows with true dates.
- `reschedule`, `set_schedule_active`, `delete_schedule` (all take `today`) —
  drop the rule's rows **after today** only. Deleting leaves the past as
  ordinary transactions (`on delete set null (schedule_id)`).

## UI

- Creation is the entry screen's **Repeats** row (asks only how often).
  `/scheduled`'s plus routes to `/add?repeat=1`; `/scheduled/:id/edit` edits
  only.
- The list is ordered by next charge; paused/finished rules sink and are
  dimmed, not hidden.
- Planned mark: **not** the dashed ring (that means "not a purchase"). The glyph
  stays, the amount drops to `ink-faint`, and a small mark says why — a clock
  for a hand-dated row, a repeat arrow for a schedule's (deleting the latter
  skips one charge).
- The Home forecast is a fixed month on every range.
- `useLastUsedWallet` skips schedule-written rows, or every cold start would
  answer with whichever wallet a subscription charges.
- Not built, deliberately: cross-currency schedules, tags on schedules,
  notifications.
