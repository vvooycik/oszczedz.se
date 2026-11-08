---
paths:
  - "src/app/**"
  - "src/components/Sheet.tsx"
  - "src/lib/touch.ts"
  - "src/screens/add/**"
  - "index.html"
  - "public/manifest*"
  - "public/_redirects"
---

# iOS standalone PWA behaviour

Everything here was learned on the device; most of it cannot be seen in desktop
Safari.

## Status bar and viewport

- **`apple-mobile-web-app-status-bar-style` stays `default`**, never
  `black-translucent`. Translucent makes iOS treat the status bar as retractable
  chrome and hand the app a web view 62pt short (screen 956, `innerHeight` 894),
  stranding the tab bar above an unpaintable strip. With `default`, iOS paints
  the strip, so `<meta name="theme-color">` is kept at the resolved ground.
- **Changing standalone metadata requires deleting the app from the home screen
  and re-adding it** — iOS bakes it at install; a force-quit does not refresh it.
- The frame height comes from `useViewportHeight` (measured `innerHeight`,
  `100svh` as first-paint fallback). Never `100dvh` (stale on cold launch) and
  never a fixed box stretched to `bottom: 0`.
- `public/_redirects` is the Cloudflare SPA fallback for `react-router`.

## Keyboard

- The keyboard shows only in the **visual** viewport; `innerHeight` does not
  move. `useKeyboardInset` = `innerHeight − visualViewport.height − offsetTop`,
  ignoring < 80px. `Sheet` spends it on `bottom` and clamps height with
  `min(…, calc(100% - inset))`.
- `visualViewport` does not reliably report the keyboard in standalone, so
  **focus** (`useTextFieldFocused`) decides whether the keypad is drawn; the
  inset only decides how far to lift Save.
- Text inputs ≥ 16px or iOS zooms permanently (see `design-system.md`).

## Taps and focus

- A tap that blurs a text field is spent doing only that. `keepFocus`
  (`src/lib/touch.ts`) on **`onMouseDown`** — never `onPointerDown`, which React
  listens to non-passively and whose default is scrolling. Every control beside
  an input inside a sheet needs it.
- A drawer opened from a focused field should blur it, or the keyboard stays up
  and `Sheet` squashes itself to sit on top.

## Haptics

iOS has no Vibration API. `tapFeedback()` flips a hidden
`<input type="checkbox" switch>` through its `<label>` (Safari 17.4+ plays the
toggle haptic). It must keep a renderer — 1px, `opacity: 0`, never
`display: none` / `visibility: hidden`. Needs a user gesture on the stack, so it
fires from the keypad's `pointerdown` (where the key fill also goes on). Other
platforms fall through to `navigator.vibrate`.

## Screen transitions

`src/app/ScreenTransition.tsx` slides full-screen routes **in only** (right for
detail, bottom for forms), 240ms `cubic-bezier(.32,.72,0,1)`. No exit animation
(two live copies of a screen would double subscriptions and viewport listeners)
and **no animation on `POP`**. `prefers-reduced-motion` drops the transform.
Not used at wide layouts (see `wide-layouts.md`).

## Sheets in the shell

A sheet anchors to `AppShell`'s fixed root; `<main>` scrolls and is not
positioned. Prefer opening sheets from `FullScreen` routes (the proven
arrangement) over an `absolute inset-0` child of `<main>`.
