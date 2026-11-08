---
paths:
  - "src/screens/wallets/**"
  - "src/screens/WalletsScreen.tsx"
  - "src/lib/wallets.ts"
  - "src/lib/adjustments.ts"
  - "supabase/migrations/*wallet*"
---

# Wallets

## Types and their numbers

One `wallets` table, `wallet_type` enum. Type-specific fields are nullable
columns behind **two-way** CHECKs (`credit_limit` present iff `credit_card`;
loan columns null off a loan). Forms therefore **null the columns the type does
not use** rather than trusting the form to have cleared them.

- `credit_card` — negative balance; UI shows remaining = `credit_limit + balance`.
- `loan` — goes negative and is repaid towards 0. A loan already being repaid is
  created with the total to repay as a **negative `starting_balance`**;
  repayments are transfers in. `interest_rate` is informational only.
- One balance field on the create screen, three labels and sign rules: "Opening
  balance" (signed), "Owed right now" and "Total to repay" (both negated).
- **Type is not editable**, by decision — delete and re-make.
- Currency takes the column default (one currency today).

## `opened_on`

The day a wallet's `starting_balance` enters the record; **null = before the
records begin**. `balance_history` counts a wallet in its opening figure only if
it opened before `p_from` (null always does) and otherwise adds the starting
balance as an event on `opened_on`, so a loan steps the line down on the day it
was taken instead of restating all history. Creation defaults to today; the
imported wallets are null. Nothing else reads it — `wallet_balances` is a
balance now. The **picker** caps at today (no CHECK), since a future opening
would count today in the balance while the chart showed nothing. The row reads
"Taken on" for a loan; "Before my records" is a real answer with its own button.

`OpenedOnSheet` is the third hand-rolled calendar (with `DateSheet` and
`RunDateSheet`); extracting the shared grid belongs to all three at once.

## Loan progress

`loan_progress` counts repayments: rows on the loan that are **part of a
transfer and positive**. Counted, never decremented — a decrementing trigger
would be a stored balance (invariant 2). Counts over all history.
`installment_count` is nullable; the bar then falls back to money cleared
(`starting_balance` → 0), and only a loan opened at zero falls back to the
sparkline. A loan's bar fills in the income colour (it grows as things get
better); a card's utilisation bar in expense.

## Archiving

`archived_at` via `archive_wallet` / `restore_wallet`. **Only at zero balance**,
enforced in the function (the client holds an anon key; a form check is a hint).
Archived wallets stay in `useWallets` so old rows resolve names;
`isArchived` / `activeWallets` in `src/lib/wallets.ts` define "hidden". The
entry form keeps an archived wallet the edited row already uses. **Wallets
screen totals run over every wallet, archived included.** No add button on an
archived wallet's detail screen. Hard delete of a transaction-free wallet is
not built (item 28).

## Appearance

`color_scheme` is a palette slot (all ten offered). `glyph` is nullable:
`walletGlyph()` = `glyph ?? glyphForWalletType(type)`, so null means "the
type's icon". The import's `'wallet'` strings were nulled by the visual-refresh
migration.

## Category sets (`wallet_categories`)

Filters **and orders** the entry picker per wallet; empty = all, in name order.
`position` lives on the join because order is a fact about the pair. Ordering
means selecting; wanting order without filtering means selecting all.
The sheet is one top-down list (chosen first, then search), reordered with
**buttons, not drag**. `useSetWalletCategories` **upserts then deletes** so a
failure leaves a stale category offered rather than dropping an arrangement. On
the create screen the set is buffered and written after the insert; if that
fails the wallet exists, so Save locks rather than inviting a duplicate.

## Setting a balance

**Records a transaction, never writes the balance.** `AdjustBalanceSheet` opens
on the current value; the user types what the bank says and never computes the
gap. The row uses a "Balance adjustment" category found or created per
direction (income/expense). `src/lib/adjustments.ts` holds the name and
predicate — renaming the category makes rows stop reading as adjustments.
Adjustments are drawn like transfers in the feed (dashed neutral ring, faint
amount) but **are counted** in spending charts.

Credit cards get a Remaining/Owed segment; switching re-seeds the field
**during render**, keyed on open-plus-reading (not on the balance, so a refetch
cannot overwrite typing). Seeding must restore the sign for readings that can go
negative (overdrawn account, card past limit) — `toRawAmount` is unsigned.

## Detail screen (`/wallets/:id`)

Balance, the type's bar, sparkline, Categories row, the wallet's month feed.
`useWalletTransactions` fetches **both legs of every transfer** so the shared
`TransactionFeed` can collapse pairs (two round trips; siblings appended, safe
because `collapseTransfers` emits at the first leg seen). Its add button is the
dock's shape painted in the wallet's colour and goes to `/add?wallet=<id>` (URL,
so reloads keep it; a starting value that outranks `useLastUsedWallet`, still
checked against `activeWallets`). At wide layouts it is a pane: Adjust balance
moves to the header, and the feed becomes a four-column table at desktop.
