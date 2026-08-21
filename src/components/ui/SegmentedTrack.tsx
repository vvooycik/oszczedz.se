import { useLayoutEffect, useRef, useState } from 'react'
import { keepFocus } from '@/lib/touch'

/**
 * One inset track with a filled selection, replacing the row of outlined pills
 * the app used for ranges and kind filters. Four outlined buttons read as four
 * objects; this reads as one control with a position.
 *
 * The selection is a single absolutely-positioned pill that *slides*, rather
 * than a background on the active segment — which is the whole reason the
 * control is worth having as a component. Its geometry is measured from the
 * segment elements instead of computed as `100 / n` percent, because segments
 * are not always equal width (the range track is, the kind filter is not once
 * one label is longer).
 *
 * Sits beside search fields in the picker drawer, so the segments hold focus on
 * press — see `keepFocus`. Without it the first tap after typing is spent
 * dismissing the keyboard.
 */
export function SegmentedTrack<T extends string | number | boolean>({
  options,
  value,
  onChange,
  className = '',
}: {
  options: { key: T; label: string }[]
  value: T
  onChange: (next: T) => void
  className?: string
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null)

  const index = options.findIndex((o) => o.key === value)

  // Measured after layout so the pill is correct on the first paint rather than
  // sliding in from zero. Re-measured when the selection or the labels change,
  // and on resize, since the track is width-driven.
  useLayoutEffect(() => {
    const track = trackRef.current
    if (!track || index < 0) return setPill(null)

    const measure = () => {
      // The segments, not `children` — the pill is itself a child of the track,
      // so indexing children puts every segment one place to the left the
      // moment the pill exists. It measured correctly on the very first pass
      // (no pill yet) and then slid one segment over when the ResizeObserver
      // fired, which is exactly the kind of bug that looks like a race.
      const el = track.querySelectorAll<HTMLElement>('button')[index]
      if (!el) return
      setPill({ left: el.offsetLeft, width: el.offsetWidth })
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(track)
    return () => observer.disconnect()
  }, [index, options.length])

  return (
    <div
      ref={trackRef}
      className={`relative flex gap-[2px] rounded-full bg-inset p-[3px] ${className}`}
    >
      {pill && (
        <span
          aria-hidden
          className="absolute top-[3px] bottom-[3px] rounded-full bg-accent transition-[left,width] duration-200 ease-out"
          style={{ left: pill.left, width: pill.width }}
        />
      )}
      {options.map((option) => {
        const active = option.key === value
        return (
          <button
            key={String(option.key)}
            type="button"
            onMouseDown={keepFocus}
            onClick={() => onChange(option.key)}
            // Above the sliding pill, and with its own colour rather than a
            // background, so the label crosses the pill instead of blinking.
            className="relative z-10 min-h-[34px] flex-1 rounded-full px-3 text-meta whitespace-nowrap"
            style={{
              fontWeight: active ? 600 : 500,
              color: active ? 'var(--color-accent-fg)' : 'var(--color-ink-muted)',
            }}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
