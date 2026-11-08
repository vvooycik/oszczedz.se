---
paths:
  - "src/screens/FeedScreen.tsx"
  - "src/components/TransactionFeed.tsx"
  - "src/components/MonthStepper.tsx"
  - "src/screens/insights/**"
  - "src/lib/insights.ts"
  - "src/data/queries.ts"
---

# Home feed and the Insight tab

## Home

Budget rail, total wealth, balance chart (`charts.md`), then the month feed.

**Chart range and list month are independent controls**, by decision. The chart
is a trailing balance window ending a month past today (`1M / 1Q / 1Y / All`,
default `1Q`, local state); the list is a calendar month you page.

- All time's left edge comes from `useEarliestTransactionDate`, never from the
  feed's rows. Compare is inert on All time.
- `MonthStepper` owns both bounds: forward stops at the current month (lists are
  settled rows; future months are empty by construction); back stops at the
  first activity *the caller knows* — whole history on Home, the wallet's first
  `wallet_monthly_net` month on the wallet screen. `earliest={null}` disables
  the chevron until known. The month name is the heading.
- `useMonthTransactions(month)` and `useWalletTransactions(…, month)` clamp to
  the phone's `today()`; a fully future month makes no request. No paging — the
  busiest month is ~224 rows.
- `TransactionFeed` is shared by Home and the wallet screen; never fork it.
  Transfers collapse to one "source → target" row (needs both legs). Dashed
  outline = not a purchase (transfers, adjustments); planned rows get a faint
  amount and a clock/repeat mark.

## Insight tab (`src/screens/insights/`)

Four blocks — **Pace, Cash flow, Categories, Balances** — under **one sticky
period control** that owns all four. Periods are calendar-aligned and
steppable (`src/lib/insights.ts`), with **no All time**. No currency picker.

- **Nothing here is ECharts** — hand-rolled SVG scaled uniformly
  (`width: 100%; height: auto`), never `preserveAspectRatio: none`.
- `spending_pace` counts a prior period only if it **starts on or after the
  first transaction**; partial and empty periods are dropped. If none survive,
  `typical` is null and the card drops its chip and projection. `bucketFlow`
  draws the same line client-side and marks unrecorded columns with an em dash.
- The pace chip reads *now*, the sentence reads *the finish*; they may disagree
  and are coloured by their own verdicts.
- **Delta colour is judgement**: over the median expense-red, under
  income-green, within ±10% (`LEVEL_BAND`) uncoloured. Shared with the
  transaction screen's history.
- Cash flow: both bars rise from a shared baseline; heights are a floor, never
  normalised per column.
- Balances: trend lines share a **span**, centred on each series' mean
  (`Sparkline`'s `span`), and cover the wallet's whole monthly history.
- "All N categories" expands in place.
- A sticky header inside `AppShell` is pulled up by `--safe-top` (negative
  margin, same value back as padding) — `<main>` carries the inset as padding
  and sticky offsets measure from the padding box.
- Not yet designed for wide layouts (open question: a two-column grid that keeps
  the single period control true).
