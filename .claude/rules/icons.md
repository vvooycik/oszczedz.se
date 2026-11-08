---
paths:
  - "src/lib/icons.ts"
  - "scripts/build-icons.mjs"
  - "src/auth/**"
  - "public/**"
  - "src/components/FirstRunSetup.tsx"
---

# Icons, the app icon, and the login screen

## Glyphs (`src/lib/icons.ts`)

Maps the kebab-case names stored in `glyph` columns onto **explicitly imported**
Tabler components. Never index the library namespace — that would pull all
~6 000 icons into the bundle (a namespace index cost 180 kB gzipped even under
Lucide).

- **Each glyph costs ~86 bytes gzipped**, and everything in the map is in the
  initial chunk (login included): `iconFor` must answer synchronously because a
  feed row's glyph arrives with the row. A few hundred is comfortable; a
  thousand would be the largest single thing the app ships.
- **The keys are data and did not change** when the app moved from Lucide to
  Tabler: rows hold Lucide-flavoured names, so the map swapped values and left
  rows alone. Hence `utensils` → `IconToolsKitchen2`, `shopping-basket` →
  `IconBasket`, `sigma` → `IconSum`. Do not "fix" the keys.
- Tabler has no taxi: `car-taxi-front` draws `IconCarSuv`, deliberately unlike
  `car`. The picker search matches keys.
- Weight via `stroke`, not `strokeWidth`: 2 at row size, 1.8 in the dock.
- `iconFor` / `resolveCategoryColor` fall back deterministically for unknown
  free-text values.
- `FirstRunSetup.tsx`'s starter glyph names are keys of this map (its comment
  still says "Lucide"; the names are the same keys).

## App icon

The app's own balance chart on a rounded tile: red below zero, green above,
fill between the line and an undrawn zero, ending on a white dot just above
zero. Colours are the **dark-theme** expense/income resolved to hex
(`#d7654b`, `#7cbd89`) on a fixed `#1e1f21` tile. It never re-themes (baked in
at install).

`scripts/build-icons.mjs` is the source of truth (`npm run icons`, on demand,
**not** part of `npm run build`; `@resvg/resvg-js` is a devDependency for this
alone). The geometry lives in the script because `design/` is gitignored. It
emits: `favicon.svg` (full mark), 16/32 PNGs and a two-frame `favicon.ico` with
the dot dropped, 192/256/384/512 manifest icons, a maskable 512 (square,
artwork in the inner 80%), and an Apple 180 with no radius.

`src/auth/AppMark.tsx` is the same artwork inline so it paints with the first
frame; gradient ids come from `useId` (hardcoded ids collide across two marks).

## Login (`src/auth/LoginPage.tsx`)

Single-account app: no "Forgot password?", no sign-up footer (sign-ups are
disabled; the footer says so), no invented lock-out timer. "Invalid login
credentials" reads "Wrong email or password." and clears on the next keystroke;
any other error is shown as it came. Focus ring is a `box-shadow` (a border
would shift text). Uses `h-svh`. Not yet designed for wide layouts.
