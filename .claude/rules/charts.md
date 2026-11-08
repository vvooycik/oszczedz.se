---
paths:
  - "src/charts/**"
  - "src/components/Sparkline.tsx"
  - "src/components/BudgetRail.tsx"
  - "src/screens/budgets/BudgetHistoryStrip.tsx"
  - "src/screens/insights/**"
---

# Charts

## ECharts or hand-rolled

ECharts is used directly (`echarts/core` + explicit registration), not through a
React wrapper. `src/charts/EChart.tsx` is the only place that touches the
lifecycle. It is code-split off the login path. Today it draws one thing: the
Home balance chart (`BalanceChart.tsx`).

Everything small is **hand-rolled SVG/CSS**: sparklines, six-month bars, the
budget rail's rings, budget list bars, the budget history strip, and all four
Insight blocks. With no axes or tooltip, an engine costs more than the mark.
Adding a second charting library adds to the bundle rather than replacing one.

Never hardcode a colour in a chart config — read tokens through
`src/theme/tokens.ts` on demand (never cached). zrender cannot parse `oklch()`
or `color-mix()`; `tokens.ts` normalises them (see `design-system.md`). Any
gradient, `visualMap` or colour animation depends on that.

## Balance chart (Total Wealth)

Painted **by sign**, not by accent: `--color-expense` below zero,
`--color-income` above, via a piecewise `visualMap` on y (register
`VisualMapPiecewiseComponent`, not `VisualMapComponent`, which adds 4 kB of the
continuous variant).

- Pieces must be **bounded on both sides** (`{ lt: 0 }` throws in the line
  renderer); pad past the data extent to cover `scale: true` headroom.
- An **empty series must omit `visualMap`** entirely — same crash.
- The fill anchors to **zero**, never `areaStyle.origin: 'start'` (that draws a
  red shadow under a positive balance). It is named explicitly in the option.
  One-sided series are handled by opacity (0.16), not by the anchor.
- The **end dot is its own series** (`seriesIndex` keeps visualMap off it, which
  would otherwise recolour its fill and border).
- The prior-period overlay sets `symbol: 'none'` — `showSymbol: false` and
  `symbolSize: 0` still emphasise a dot on hover, in ECharts' default blue,
  because colour set only via `lineStyle` leaves `itemStyle` unset.
- **The compare windows share a boundary day**: the prior range ends *on* the
  current `from`, so index i is the same distance into both and
  `prior[last] === current[0]` (the tooltip difference and the delta chip agree).
- The forecast is a second series over planned rows, a fixed month past today on
  every range; `balance_history`'s `anchor` keeps today in the sample.

## Wallet sparkline

Also painted by sign, with a `linearGradient` in **`userSpaceOnUse`** carrying
two stops at the **same offset** (a hard edge) placed at the y where the data
puts zero. **Omit the gradient entirely when the series never crosses zero.**
Colours go in as `var()` — DOM, not canvas, so it re-tints on mode change.
`span` (optional) gives a set of sparklines one shared range centred on each
series' own mean.

## Small marks

- Rail rings: animate `stroke-dashoffset` with a fixed dasharray; entry duration
  is state, not a ref read during render. `prefers-reduced-motion` is handled
  globally in index.css.
- Budget history strip: see `budgets.md` (`historyScale`, clipped caps, the
  scroller must be the flex row).
