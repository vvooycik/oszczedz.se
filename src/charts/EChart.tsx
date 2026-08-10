import { useEffect, useRef } from 'react'
import * as echarts from 'echarts/core'
import { BarChart, LineChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  VisualMapPiecewiseComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsOption } from 'echarts'

// Tree-shaken registration: importing all of `echarts` pulls ~1MB into the
// bundle, which is a real cost on a phone. Add renderers/charts here as the
// chart suite grows.
echarts.use([
  BarChart,
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  // Splits a series by value rather than by series — how BalanceChart paints
  // itself above and below zero.
  VisualMapPiecewiseComponent,
  CanvasRenderer,
])

export function EChart({
  option,
  className,
}: {
  option: EChartsOption
  className?: string
}) {
  const host = useRef<HTMLDivElement>(null)
  const chart = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    if (!host.current) return
    chart.current = echarts.init(host.current, null, { renderer: 'canvas' })

    const observer = new ResizeObserver(() => chart.current?.resize())
    observer.observe(host.current)

    return () => {
      observer.disconnect()
      chart.current?.dispose()
      chart.current = null
    }
  }, [])

  useEffect(() => {
    // notMerge: stale series must disappear when a filter narrows the data.
    chart.current?.setOption(option, { notMerge: true })
  }, [option])

  return <div ref={host} className={className} />
}
