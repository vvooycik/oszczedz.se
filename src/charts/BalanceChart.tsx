import { useMemo } from 'react'
import type { EChartsOption } from 'echarts'
import { EChart } from './EChart'
import { token } from '@/theme/tokens'
import { useTheme } from '@/theme/ThemeProvider'
import { asMinor, formatMoney, formatMoneyShort } from '@/lib/money'
import { formatDayHeader } from '@/lib/dates'

export type BalancePoint = { day: string; balance: number }

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
    const accent = token.accent()
    const last = current.length - 1

    return {
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
            .filter((r) => r.value !== null && r.value !== undefined)
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
          showSymbol: true,
          // Marker on the final point only. Padding on the grid keeps it inside
          // the plot rather than clipped at the edge.
          symbolSize: (_v: unknown, params: { dataIndex: number }) =>
            params.dataIndex === last ? 7 : 0,
          itemStyle: { color: token.bg(), borderColor: accent, borderWidth: 2 },
          lineStyle: { color: accent, width: 2 },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: accent },
                { offset: 1, color: accent },
              ],
              global: false,
            },
            opacity: 0.16,
          },
          z: 2,
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
