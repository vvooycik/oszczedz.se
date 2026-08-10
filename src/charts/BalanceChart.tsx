import { useMemo } from 'react'
import type { EChartsOption } from 'echarts'
import { EChart } from './EChart'
import { token } from '@/theme/tokens'
import { useTheme } from '@/theme/ThemeProvider'
import { asMinor, formatMoney, formatMoneyShort } from '@/lib/money'
import { formatDayHeader } from '@/lib/dates'

export type BalancePoint = { day: string; balance: number }

/**
 * The end-dot series. Named so the tooltip can drop it: it carries the same
 * value as `Balance`, so on an axis trigger it would print the final figure
 * twice.
 */
const MARKER_SERIES = '__marker'

/**
 * Total wealth over the selected range, with the comparable prior range drawn
 * behind it as a dashed overlay.
 *
 * The two ranges are plotted against a shared index rather than shared dates —
 * "this month vs last month" only lines up if day 1 sits above day 1, and
 * months are different lengths.
 */
export function BalanceChart({
  current,
  prior,
  currency,
  compare,
}: {
  current: BalancePoint[]
  prior: BalancePoint[]
  currency: string
  compare: boolean
}) {
  // Accent and ground both change at runtime; without these in the dep list the
  // chart keeps the colours it was first painted with.
  const { prefs, resolvedMode } = useTheme()

  const option = useMemo<EChartsOption>(() => {
    const last = current.length - 1

    // Total wealth crosses zero — a loan can outweigh the accounts — so the line
    // carries a sign, and the sign is worth more than the accent here. These are
    // the same two tokens the amounts use, which is the point: a red stretch of
    // chart and a red figure in the list mean the same thing.
    //
    // Not a raw red/green pair: `--color-expense` and `--color-income` are
    // separated by lightness as well as hue, so the split survives the ~8% of
    // men who cannot take the hue difference.
    const below = token.expense()
    const above = token.income()
    const signOf = (v: number | undefined) => ((v ?? 0) < 0 ? below : above)

    // visualMap addresses series by index, and the prior-period overlay only
    // exists when comparing.
    const balanceIndex = compare && prior.length ? 1 : 0

    const values = current.map((p) => p.balance)
    const lo = values.length ? Math.min(...values) : 0
    const hi = values.length ? Math.max(...values) : 0

    // Each piece needs a finite min *and* max: ECharts turns them into gradient
    // stops positioned along the axis, and an open-ended piece has no coordinate
    // to place — `{ lt: 0 }` throws inside the line renderer rather than
    // defaulting. Padding past the data covers the headroom `scale: true` adds,
    // so no drawn pixel falls outside a piece.
    const pad = Math.max(Math.abs(lo), Math.abs(hi), 1)
    const pieces = [
      ...(lo < 0 ? [{ min: lo - pad, max: 0, color: below }] : []),
      ...(hi >= 0 ? [{ min: 0, max: hi + pad, color: above }] : []),
    ]

    return {
      // An empty series has no extent to build pieces from, and a visualMap with
      // none crashes the line renderer. Nothing is drawn in that case anyway.
      ...(pieces.length
        ? {
            visualMap: {
              show: false,
              type: 'piecewise' as const,
              // 1 = the y value. Splitting on x would colour by date.
              dimension: 1,
              seriesIndex: balanceIndex,
              pieces,
              outOfRange: { color: hi < 0 ? below : above },
            },
          }
        : {}),
      animationDuration: 300,
      grid: { top: 12, right: 10, bottom: 22, left: 8, containLabel: false },
      tooltip: {
        trigger: 'axis',
        backgroundColor: token.surface(),
        borderColor: token.line(),
        textStyle: { color: token.ink(), fontFamily: 'IBM Plex Sans' },
        axisPointer: { type: 'line', lineStyle: { color: token.line() } },
        formatter: (params) => {
          const rows = Array.isArray(params) ? params : [params]
          const head = rows[0]
          if (!head) return ''
          const day = current[head.dataIndex as number]?.day
          const lines = rows
            .filter(
              (r) =>
                r.seriesName !== MARKER_SERIES &&
                r.value !== null &&
                r.value !== undefined,
            )
            .map(
              (r) =>
                `${r.seriesName}: <strong>${formatMoney(
                  asMinor(Number(r.value)),
                  currency,
                )}</strong>`,
            )
          return `${day ? formatDayHeader(day) : ''}<br/>${lines.join('<br/>')}`
        },
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: current.map((p) => p.day),
        axisLine: { show: false },
        axisTick: { show: false },
        // The design labels only the ends of the range.
        axisLabel: {
          color: token.inkFaint(),
          fontFamily: 'IBM Plex Sans',
          fontSize: 10,
          showMinLabel: true,
          showMaxLabel: true,
          interval: Math.max(current.length - 2, 1),
          formatter: (value: string) => value.slice(0, 7),
        },
      },
      yAxis: {
        type: 'value',
        scale: true,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { show: false },
        splitLine: { lineStyle: { color: token.lineSoft() } },
      },
      series: [
        ...(compare && prior.length
          ? [
              {
                name: 'Prior period',
                type: 'line' as const,
                data: prior.map((p) => p.balance),
                // `showSymbol: false` only hides the resting symbol — hovering
                // still emphasises one, and `symbolSize: 0` does not stop it
                // either, because emphasis rescales from its own size. Only
                // `symbol: 'none'` keeps the overlay free of a dot, which is
                // what it should be: the hover dot belongs to the series being
                // read, not to the ghost behind it.
                //
                // It also drew that dot in ECharts' default palette blue, since
                // the series sets `lineStyle.color` but no `itemStyle` — a
                // colour from outside the token system.
                symbol: 'none' as const,
                showSymbol: false,
                lineStyle: {
                  color: token.inkFaint(),
                  width: 1.25,
                  type: [3, 4] as number[],
                },
                z: 1,
              },
            ]
          : []),
        {
          name: 'Balance',
          type: 'line',
          data: current.map((p) => p.balance),
          smooth: false,
          showSymbol: false,
          lineStyle: { width: 2 },
          // Both the line and this fill take their colour from visualMap, which
          // splits them at zero. Only the opacity is set here.
          areaStyle: { opacity: 0.16 },
          z: 2,
        },
        // The end marker is its own series because visualMap overrides the
        // symbol's `color` *and* `borderColor` on any series it touches — it
        // would paint a white disc on the dark ground instead of a hollow one.
        // A single-point series it does not target keeps the design's dot: the
        // ground colour, ringed in the sign of the value it sits on.
        //
        // Padding on the grid keeps it inside the plot rather than clipped.
        {
          name: MARKER_SERIES,
          type: 'line',
          data: current.map((p, i) => (i === last ? p.balance : null)),
          showSymbol: true,
          symbolSize: 7,
          itemStyle: {
            color: token.bg(),
            borderColor: signOf(current[last]?.balance),
            borderWidth: 2,
          },
          silent: true,
          z: 3,
        },
      ],
    }
    // prefs.accent and resolvedMode look unused to the linter because the
    // colours come from getComputedStyle, not from these values. They are the
    // signal that those computed colours have changed.
    // oxlint-disable-next-line exhaustive-deps
  }, [current, prior, compare, currency, prefs.accent, resolvedMode])

  if (current.length === 0) {
    return (
      <div className="flex h-44 items-center justify-center text-[13px] text-ink-muted">
        No balance history yet
      </div>
    )
  }

  return <EChart option={option} className="h-44 w-full" />
}

export const formatAxisMoney = (v: number) => formatMoneyShort(asMinor(v))
