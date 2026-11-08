---
paths:
  - "src/screens/budgets/**"
  - "src/lib/budgets.ts"
  - "src/components/BudgetRail.tsx"
  - "supabase/migrations/*budget*"
---

# Budgets

A budget is a **named envelope**: a limit per period with its own `color` and
`glyph`, spent against a set of categories and a set of wallets.

## Membership — one copy, in SQL

A transaction counts iff its category is of kind `expense` AND it has no
`transfer_id` AND its category ∈ `budget_categories` (empty = any) AND its
wallet ∈ `budget_wallets` (empty = any) AND its wallet's currency = the
budget's.

- **The sign is not filtered**: rows are summed negated, so a refund (positive
  under an expense category) reduces spend.
- The kind filter is what makes an empty category set safe — "any expense
  category", never salary.
- Balance adjustments are not excluded by name, deliberately (the string would
  then live in SQL and in `src/lib/adjustments.ts` with nothing keeping them in
  step; the editor requires a category and nobody picks that one).
- `budget_transactions(budget, from, to)` is **the only copy of this rule**.
  `budget_spend` sums it; the detail screen's feed pages it. Never re-implement
  membership in the browser — the old "Against the budget" block on the
  transaction screen did, paired an mBank row with a credit-card budget, and was
  deleted for it.

## Periods

`period` is `daily | weekly | monthly | yearly | once`; `resets_on` is one
integer read three ways:

- monthly: day of month 1–31, clamped to short months (a budget on the 31st
  runs 31 Jan → 28 Feb);
- weekly: weekday 0–6, 0 = Sunday (matches `extract(dow)` and `getDay()`);
- yearly: ordinal 1–365 against a fixed **non-leap** reference year, so an
  anniversary does not drift every February.

`daily` and `once` do not read it; the CHECK **pins it to 1** for both (an
unlisted period in a `case` with no `else` is NULL, which a CHECK passes).
`hasResetChoice` in `src/lib/budgets.ts` is the client's copy of that fact.

**`once`** is the period that is not a rule. Its window is two columns,
`starts_on` and `ends_on` (**inclusive**), present iff `period = 'once'` (a
two-way CHECK); `rollover` is refused. `budget_period_bounds` returns the row's
own window whatever day it is asked about, so every caller stays unchanged.

`budget_period_bounds(period, resets_on, on, starts_on, ends_on)` /
`budget_month_anchor(month, day)` answer every period question once and return
a half-open range. The day before a period started is by definition in the
previous one — that is how the rollover window and `budget_history` walk back.

## Phases (one-offs)

`phaseOf` returns `upcoming | running | finished`. It asks the *period* before
comparing dates — otherwise a row fetched before midnight reports a daily budget
as finished after it. Consequences, in `groupOf`:

- the list groups on phase before verdict; a finished run sits under
  **Finished** even if it ended over (its overspend stays red on the row);
- the summary card and the sidebar over-badge count **running** budgets only;
- the Home rail drops finished runs by itself and keeps upcoming ones.

## Figures

- `rollover` adds the previous period's unspent remainder — one period, never
  compounding, overspend never carried. The **effective limit**
  (`amount + rolled_over`) is what every ring, bar and percentage is drawn
  against.
- `planned` (booked later in the period, not yet charged) is a ghost segment
  and counts in **no** verdict, share or projection.
- `budget_spend` clamps for settled vs planned: settled is
  `[start, least(end, today + 1))`, planned `[greatest(start, today + 1), end)`.
- `budget_progress(today)` is a function so the phone says which day it is.
  Verdict, share, projection and days-left are **not columns** — they change
  with no write behind them; `src/lib/budgets.ts` owns them.
- "At risk" is a **straight-line projection** (`spend / day × days`) and cannot
  know a month usually spends late. Nothing is at risk before day 3
  (`RATE_SETTLES_ON_DAY`). A daily budget can never be at risk — the projection
  is the spend.
- `dailyAllowance` = remaining over days left **including today**, floored to
  the grosz. Silent when the window is closed, the limit is spent, or one day is
  left (it would repeat the "left" figure). `planned` is not subtracted.

## `budget_history(budget, periods = 12, today)`

One row per period, oldest first, ending with today's. It **stops where the
records do** (a period starting before the first transaction is the data's
edge, not a quiet month), clamps its newest window at `today + 1` so the last
bar equals `budget_progress`, and collects one window more than it returns so
the oldest row can inherit a rollover. A one-off returns exactly one row.

## Screens

- **List** (`/budgets`): groups over → at risk → on track (→ upcoming,
  finished), sorted inside a group by **share of limit**, not size. Empty groups
  are omitted. Each row's two lines both lead with a percentage
  (`21% of 6 600` / `6% · day 2 of 33`) so they align. A daily row drops the
  time track; a one-off outside its run drops it too.
- **Summary card** names a month only when every budget is in it, otherwise
  "Budgeted now". Its chip is the soonest reset; zero reads "Resets today".
- **Detail** (`/budgets/:id`, `BudgetScreen.tsx`): tapping a budget anywhere
  opens this, not the editor; the pencil edits. The history strip is a
  **control** — selecting a bar sets the feed's window, so there is no stepper.
  Strip depth is per period (daily 30, yearly 6, one-off none). The limit is a
  notch per bar (rollover makes limits differ). `historyScale` is never below
  the largest limit and never more than 3× it; a clipped bar loses its rounded
  cap, the footnote counts them, and each bar's `title` carries the exact
  figure. The feed shows the whole window, planned included, while the header
  quotes settled. At ≥1024 this is a page, not a pane — the list already uses
  the full width for its two-column groups.
  The strip's scroller must **be** the flex row; a nested flex box takes the
  scrollport's width and the trailing padding never scrolls into view.
- **Editor** (`/budgets/new`, `/budgets/:id/edit`): period track is
  Daily/Weekly/Monthly/Yearly; one-off is a **Repeats** switch, not a fifth
  segment. Off shows Starts/Ends rows; moving the start carries the end and
  keeps the length. The end sheet floors on the start (days before drawn dim).
  `resetsOn` is a grid to 28 plus "Last day of the month", not a wheel. The
  identity (name/colour/glyph) follows the **first** category picked until
  edited by hand. Picker screens replace the editor's tree rather than
  overlaying it, so the draft survives.
  `LimitSheet` takes typed keys via the shared `keypadKeyFor`/`applyKey`, with
  a window-level listener (the figure is a display, not an `<input>`); the
  drawer blurs whatever had focus, or digits land in the name field. The pad is
  hidden by default at `desktop`; the Show/Hide toggle exists only at wide
  layouts.
- **Home rail** (`BudgetRail.tsx`): hand-rolled SVG **rings**. Animate
  `stroke-dashoffset` with a fixed dasharray. Entry duration is **state**, not a
  ref read during render. The scroller aligns with the content column and pads
  `pt-4 pb-9` (with matching negative margins) to hold `--sh-card`'s shadows,
  since `overflow-x: auto` also clips y.
- **Home order** is a route, not a sheet (drag inside a drawer fights its
  scroll and dismiss). `useSetHomeOrder` sends one request per budget rather than
  an upsert, which would have to carry every not-null column and could
  overwrite an edit made elsewhere.
