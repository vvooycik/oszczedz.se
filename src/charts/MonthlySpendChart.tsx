import { useMemo } from 'react'
import type { EChartsOption } from 'echarts'
import { EChart } from './EChart'
import { token } from '@/theme/tokens'
import { formatMoney, formatMoneyShort, asMinor } from '@/lib/money'
import type { MonthlyCategoryTotal } from '@/lib/db'

const monthLabel = (iso: string) =>
  new Intl.DateTimeFormat('pl-PL', { month: 'short', year: '2-digit' }).format(
    // 'YYYY-MM-DD' from a DATE column. Parsed as UTC deliberately: appending
    // T00:00 would make it local and could slip a month backwards.
    new Date(`${iso}T00:00:00Z`),
  )

/**
 * Total spend per month, one bar per month.
 *
 * Form: magnitude over time with few periods -> columns, not a line. One
 * series, so no legend — the heading names it. Expenses are stored negative;
 * we plot the magnitude so "taller = spent more" reads the obvious way, and
 * the axis is labelled to say so.
 */
export function MonthlySpendChart({
  totals,
  currency,
}: {
  totals: MonthlyCategoryTotal[]
  currency: string
}) {
  const option = useMemo<EChartsOption>(() => {
    const byMonth = new Map<string, number>()
    for (const row of totals) {
      // Columns come back nullable: Postgres cannot prove non-null through an
      // aggregate view, so the generated types are honest about it.
      if (row.month === null || row.total === null) continue
      // Expenses only: income would cancel out spend into a meaningless net.
      if (row.total >= 0) continue
      byMonth.set(row.month, (byMonth.get(row.month) ?? 0) + -row.total)
    }

    const months = [...byMonth.keys()].sort()
    const values = months.map((m) => byMonth.get(m) ?? 0)

    return {
      animationDuration: 300,
      grid: { top: 16, right: 8, bottom: 24, left: 52 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: token.surfaceRaised(),
        borderColor: token.border(),
        textStyle: { color: token.ink() },
        formatter: (params) => {
          const p = Array.isArray(params) ? params[0] : params
          if (!p) return ''
          const value = Number(p.value)
          return `${p.name}<br/><strong>${formatMoney(
            asMinor(value),
            currency,
          )}</strong>`
        },
      },
      xAxis: {
        type: 'category',
        data: months.map(monthLabel),
        // Recessive axes: the data is the thing, not the frame.
        axisLine: { lineStyle: { color: token.border() } },
        axisTick: { show: false },
        axisLabel: { color: token.inkMuted() },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: token.border(), opacity: 0.4 } },
        axisLabel: {
          color: token.inkMuted(),
          formatter: (v: number) => formatMoneyShort(asMinor(v)),
        },
      },
      series: [
        {
          type: 'bar',
          data: values,
          itemStyle: {
            color: token.expense(),
            // Rounded data-end only; the baseline end stays square.
            borderRadius: [4, 4, 0, 0],
          },
          barMaxWidth: 40,
        },
      ],
    }
  }, [totals, currency])

  return <EChart option={option} className="h-56 w-full" />
}
