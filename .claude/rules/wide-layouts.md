---
paths:
  - "src/app/**"
  - "src/screens/FeedScreen.tsx"
  - "src/screens/WalletsScreen.tsx"
  - "src/screens/TransactionScreen.tsx"
  - "src/screens/wallets/WalletScreen.tsx"
  - "src/screens/budgets/BudgetsScreen.tsx"
  - "src/screens/budgets/BudgetScreen.tsx"
---

# Tablet and desktop layouts

`src/app/layout.ts`, `Sidebar.tsx`, `MasterDetail.tsx`, `Modal.tsx`,
`ModalScreen.tsx`, `WideRoutes.tsx`, `TabBar.tsx`, `navigation.ts`.

## Four arrangements

- `mobile` (<768) — floating dock with the add button beside it.
- `tablet` (768–1023) — same dock, 32px gutters, a four-card budget rail.
- `rail` (1024–1279) — 76px icon rail, 512px feed column, pane takes the rest.
- `desktop` (≥1280) — 264px labelled sidebar, fluid master, 440px pane.

**1024 is the real line**: below it master-detail does not fit. Type re-sizes
from index.css's unlayered media queries; components never branch on width for
type.

## Navigation

Tabs come from `TABS` in `src/app/navigation.ts` for the dock, the rail and the
sidebar. The dock labels only the active tab (an accent-washed pill; the other
cells share what is left — no room for a sixth tab). The rail keeps all five tabs
including More (it has no Data group); the desktop sidebar draws those rows
itself and drops More. The rail's account tile is an avatar, not a logout
button.

The add button is one control whose destination depends on the route:
`CREATES` maps `/wallets` → New wallet and `/budgets` → New budget; everything
else is `DEFAULT_CREATE` (New transaction). The dock and sidebar read the same
map. It is a circle, as is the wallet screen's coloured copy — one shape.

## Routing

- **Selection is a URL, never state.** On wide layouts `/tx/:id` and `/` are the
  same route element, as are `/wallets/:id` and `/wallets`; the screen reads
  `useParams()`. Nothing auto-selects.
- Two route trees chosen by width (`WideRoutes.tsx`); crossing 1024 remounts.
- **Modal routes keep the page behind mounted** via `<Routes location={behind}>`,
  `behind` being the last non-modal address held in a ref written during render
  (an effect would paint one wrong frame). It starts at `/`.
- `useInModal` and `FullScreen`'s `pane` mean screens become dialogs or panes
  without knowing it — read the context in `FullScreen`, do not thread props.
- The budget detail screen is a page, not a pane (see `budgets.md`).

## Behaviour

- One hover state: `hover:bg-press` on navigating rows, plus edit/duplicate
  ghost buttons on a hovered feed row (**never delete**). They fade on `opacity`
  and also show on `focus-within`.
- Arrow up/down walk a master list, Enter opens; the listener bails while a
  `[role="dialog"]` is present.
- Panes cross-fade contents over 120ms; `ScreenTransition` is not used.
- A pane sits on plain ground — `FullScreen`'s pane branch ignores the colour
  field `style`.
- Budgets grid runs two columns only when both Over and At risk exist; every
  other group spans.
- The entry modal's Amount field is read-only and driven by `applyKey`.
- `useWalletMonthlyNet` takes `enabled`, because only the desktop wealth card's
  stat tiles read it on Home.

Not yet designed at these widths: Insight, More, Login (mobile compositions in a
capped column).
