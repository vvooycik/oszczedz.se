import { Card } from '@/components/ui/Card'
import { LabelRow } from '@/components/ui/Label'
import { asMinor, currencySymbol, formatAmountMoney, formatSigned } from '@/lib/money'
import type { FlowBucket } from '@/lib/insights'

/**
 * Compact money for the six labels under the bars — "1,3k", "980".
 *
 * Six columns share 326px, so the full "4 021,80 zł" does not fit and
 * `formatMoneyShort`'s "4 022" is still five glyphs of noise where one
 * significant figure is the whole message. This is display-only and never feeds
 * back into arithmetic, which is the rule `money.ts` sets for every formatter.
 */
const compact = (minor: number): string => {
  const zl = Math.abs(minor) / 100
  return zl >= 1000
    ? `${(zl / 1000).toFixed(1).replace('.', ',')}k`
    : String(Math.round(zl))
}

const W = 326
const H = 112
const BASE = 104
const BAR = 15

/**
 * What came in against what went out, six periods at a time.
 *
 * **Both bars are drawn upward from a shared baseline**, per the handoff, and
 * that is the decision worth defending: a diverging chart — income up, expense
 * down — spends half its height saying something the colour already says, and
 * makes the two impossible to compare because neither starts where the other
 * does. Here they share a scale and sit side by side, so "did I earn more than
 * I spent" is a question about which bar is taller. The sign lives in the
 * colour and in the net figure under each pair.
 *
 * The selected period is outlined rather than filled differently, and a period
 * still running says so — its bars are partial and reading them as final would
 * make every current month look like a collapse.
 */
export function CashFlowCard({
  buckets,
  currency,
  loading,
}: {
  buckets: FlowBucket[]
  currency: string
  loading: boolean
}) {
  const current = buckets[buckets.length - 1]
  const net = current?.net ?? 0

  // The average counts only finished periods the records actually cover. Two
  // weeks of a month against five whole ones would drag it down and say nothing
  // true, and a year from before the first transaction would drag it further
  // while looking like a year of perfect thrift.
  const settled = buckets.filter((b) => !b.partial && !b.unrecorded)
  const average = settled.length
    ? Math.round(settled.reduce((sum, b) => sum + b.net, 0) / settled.length)
    : 0

  const peak = Math.max(1, ...buckets.flatMap((b) => [b.inflow, b.outflow]))
  const slot = W / Math.max(1, buckets.length)
  const heightOf = (value: number) => (value / peak) * (BASE - 8)

  const netColour = net >= 0 ? 'var(--color-income)' : 'var(--color-expense)'

  return (
    <section className="flex flex-col gap-2">
      <LabelRow
        trailing={
          <span className="flex items-center gap-3 text-[11.5px] text-ink-muted">
            <Key colour="var(--color-income)" label="In" />
            <Key colour="var(--color-expense)" label="Out" />
          </span>
        }
      >
        Cash flow
      </LabelRow>

      <Card className="px-[18px] pt-[18px] pb-3.5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div
              className="tnum"
              style={{
                fontSize: 30,
                fontWeight: 600,
                lineHeight: 1,
                letterSpacing: '-.03em',
                color: netColour,
              }}
            >
              {formatSigned(asMinor(net))}
              <span
                className="text-ink-faint"
                style={{ fontSize: 16, fontWeight: 500, letterSpacing: 0 }}
              >
                {' '}
                {currencySymbol(currency)}
              </span>
            </div>
            <div className="mt-1.5 text-[13px] text-ink-muted">
              net in {current?.label ?? '—'}
              {current?.partial ? ', so far' : ''}
            </div>
          </div>

          <div className="text-right">
            <div className="tnum text-[14px] font-semibold text-ink-muted">
              {formatSigned(asMinor(average))} {currencySymbol(currency)}
            </div>
            <div className="mt-0.5 text-[11.5px] text-ink-muted">
              {settled.length}-period average
            </div>
          </div>
        </div>

        {loading ? (
          <div className="mt-4 w-full" style={{ aspectRatio: `${W} / ${H}` }} />
        ) : (
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="mt-4 block w-full"
            style={{ height: 'auto' }}
            aria-hidden="true"
          >
            <line
              x1="0"
              y1={BASE}
              x2={W}
              y2={BASE}
              stroke="var(--color-divider)"
              strokeWidth="1"
            />
            {buckets.map((b, i) => {
              const centre = slot * i + slot / 2
              // A floor, not a rescale. This data is genuinely lumpy — a month
              // with no income at all next to one at ten times the outflow —
              // and normalising each column away would destroy the one
              // comparison the chart exists to make. The stub keeps an empty
              // month visible; the net figure under it carries the number.
              const inH = Math.max(3, heightOf(b.inflow))
              const outH = Math.max(3, heightOf(b.outflow))
              return (
                <g key={b.start}>
                  {b.selected && (
                    <rect
                      x={centre - BAR - 6}
                      y={BASE - (BASE - 8) - 6}
                      width={BAR * 2 + 12}
                      height={BASE - 8 + 10}
                      rx="10"
                      fill="none"
                      stroke="var(--color-dash)"
                      strokeWidth="1"
                    />
                  )}
                  <rect
                    x={centre - BAR - 1}
                    y={BASE - inH}
                    width={BAR}
                    height={inH}
                    rx="4"
                    fill="var(--color-income)"
                  />
                  <rect
                    x={centre + 1}
                    y={BASE - outH}
                    width={BAR}
                    height={outH}
                    rx="4"
                    fill="var(--color-expense)"
                    fillOpacity="0.85"
                  />
                </g>
              )
            })}
          </svg>
        )}

        <div
          className="tnum mt-2 grid"
          style={{ gridTemplateColumns: `repeat(${Math.max(1, buckets.length)}, 1fr)` }}
        >
          {buckets.map((b) => (
            <div key={b.start} className="text-center">
              <div
                className="text-[11px]"
                style={{
                  color: b.selected ? 'var(--color-ink)' : 'var(--color-ink-muted)',
                  fontWeight: b.selected ? 600 : 400,
                  opacity: b.unrecorded ? 0.45 : 1,
                }}
              >
                {b.label}
              </div>
              {/* An em dash, not a zero: the app has no records for this period
                  and printing "+0" would claim it broke even. */}
              <div
                className="mt-[3px] text-[11.5px] font-semibold"
                style={{
                  color: b.unrecorded
                    ? 'var(--color-ink-dim)'
                    : b.net >= 0
                      ? 'var(--color-income)'
                      : 'var(--color-expense)',
                }}
              >
                {b.unrecorded ? '—' : `${b.net >= 0 ? '+' : '−'}${compact(b.net)}`}
              </div>
            </div>
          ))}
        </div>

        {current && (
          <div className="mt-3 flex justify-between text-[12px] text-ink-muted">
            <span className="tnum">
              In {formatAmountMoney(asMinor(current.inflow), currency)}
            </span>
            <span className="tnum">
              Out {formatAmountMoney(asMinor(current.outflow), currency)}
            </span>
          </div>
        )}
      </Card>
    </section>
  )
}

/** A legend swatch — a square, not a dot, matching the bars it stands for. */
function Key({ colour, label }: { colour: string; label: string }) {
  return (
    <span className="flex items-center gap-[5px]">
      <span
        className="size-2 rounded-[2px]"
        style={{ background: colour }}
        aria-hidden="true"
      />
      {label}
    </span>
  )
}
