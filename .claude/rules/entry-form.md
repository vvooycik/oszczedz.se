---
paths:
  - "src/screens/add/**"
  - "src/screens/categories/**"
  - "src/screens/TransactionScreen.tsx"
  - "src/screens/TagsScreen.tsx"
---

# Entry form, transaction detail, categories

## AddScreen is both create and edit

`/add` inserts; `/tx/:id/edit` is the same component, switched by `:id`. Fields
are seeded once, on the render where the transaction, its tags and the
categories have all arrived; a `hydrated` flag stops background refetches from
undoing typing. `useUpdateTransaction` reconciles `transaction_tags` as a
**diff**, never wipe-and-rewrite.

Starting wallet: `?wallet=<id>` outranks `useLastUsedWallet` (and is checked
against `activeWallets`). `useLastUsedWallet` orders by `created_at` then
`amount desc` — the second sort resolves a transfer to its positive (target)
leg, since both legs share a `created_at`.

## Keypad is a calculator

`÷ × − +`, **only the result is stored**. A running total (`acc`, pending `op`,
digits), not an expression: strictly **left to right** (`2 + 3 × 4` = 20). No
`=` key — the big figure is always what Save writes; the tape above shows the
working. A plain amount echoes raw ("12," stays "12,"). `×`/`÷` take a plain
multiplier, not money. Division rounds to the grosz; ÷0 leaves the total alone.

`keypadKeyFor` and `applyKey` live in `Keypad.tsx` and are the one vocabulary
for typed and tapped keys (the modal's read-only Amount field and `LimitSheet`
use them too). At wide layouts the pad is off by default at `desktop`, on at
tablet.

## Transfers

The **category's kind is the mode switch** — picking a transfer category reveals
the second wallet select, hides the sign toggle and tags. Choosing the other
side's wallet **swaps** the pair rather than being refused; the far side is
seeded the moment the form becomes a transfer. `isTransfer` is declared above
the handlers and effects that read it (temporal dead zone — dependency arrays
evaluate during render). A second "amount received" field appears only when
currencies differ. Transfers have no tags (`create_transfer` returns the pair
id, not row ids).

Editing excludes transfers at both ends: no pencil on one, the route refuses by
hand, and the picker gets `allowTransfer={false}`.

The category picker keeps the row's **current** category even if the wallet's
set excludes it. The sheet resets its search and tab on every open (during
render, so no stale frame paints).

## Keyboards

The system keyboard and the keypad are never up together:
`useTextFieldFocused` (document-level focusin/focusout) hides the pad while a
text field has focus. `focusout` fires before focus lands, so that read is
deferred a task. `useKeyboardInset` decides only how far to lift Save. See
`ios-pwa.md`.

## Transaction detail

- The six-month category history ends at **the row's own month** (capped at the
  current month, and the sentence names its month). Every bar carries its
  figure (whole units, unit named, no sign). A running month is stated, never
  judged; `medianOf`, `verdict` and `LEVEL_BAND` come from `src/lib/insights.ts`.
  A month before the records shows an em dash; a recorded zero keeps a 3px stub.
  Data comes from `useCategoryMonthlyTotals(category, from, to)` — scoped.
- "Balance now" is the wallet's balance now, not as of the transaction; the
  label says so.
- No budget block here; a row's budget context is the budget detail screen.
- `delete_transfer` is reached only from this screen's delete.

## Categories (`/categories`)

List by kind with counts, 72% editor sheet re-tinting live, delete via
`delete_category` with **same-kind targets only** (moving an expense into
income would flip every chart). The screen normalises a row's colour/glyph on
open. Controls beside the sheet's inputs carry `keepFocus`.

## Tags

`/tags` is read-only. Tag CRUD has no design yet.
