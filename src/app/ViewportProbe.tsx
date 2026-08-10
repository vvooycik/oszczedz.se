import { useEffect, useState } from 'react'

/**
 * TEMPORARY. Reads back every measurement of "how tall is the window" that iOS
 * offers, because a standalone PWA cannot be attached to devtools and the tab
 * bar bug has already cost two guess-and-deploy cycles.
 *
 * Delete this file, its route on MoreScreen, and nothing else, once the frame
 * height is confirmed on the device.
 */

// CSS lengths measured by probing a hidden element, since there is no way to ask
// for the computed value of a unit directly.
const LENGTHS: [string, string][] = [
  ['100vh (large)', '100vh'],
  ['100lvh', '100lvh'],
  ['100svh (small)', '100svh'],
  ['100dvh', '100dvh'],
  ['inset top', 'env(safe-area-inset-top, 0px)'],
  ['inset bottom', 'env(safe-area-inset-bottom, 0px)'],
]

export function ViewportProbe() {
  const [rows, setRows] = useState<[string, string][]>([])

  useEffect(() => {
    const read = () => {
      const probe = document.createElement('div')
      probe.style.cssText =
        'position:absolute;top:0;left:0;width:1px;visibility:hidden;pointer-events:none'
      document.body.appendChild(probe)

      const next: [string, string][] = LENGTHS.map(([label, value]) => {
        probe.style.height = value
        return [label, String(Math.round(probe.getBoundingClientRect().height * 10) / 10)]
      })

      document.body.removeChild(probe)

      const nav = navigator as Navigator & { standalone?: boolean }
      next.push(
        ['innerHeight', String(window.innerHeight)],
        ['clientHeight', String(document.documentElement.clientHeight)],
        ['screen.height', String(window.screen.height)],
        ['visualViewport', String(Math.round(window.visualViewport?.height ?? 0))],
        ['display-mode', window.matchMedia('(display-mode: standalone)').matches ? 'standalone' : 'browser'],
        ['navigator.standalone', String(nav.standalone)],
        ['dpr', String(window.devicePixelRatio)],
      )
      setRows(next)
    }

    read()
    window.addEventListener('resize', read)
    window.addEventListener('pageshow', read)
    return () => {
      window.removeEventListener('resize', read)
      window.removeEventListener('pageshow', read)
    }
  }, [])

  return (
    <div className="mt-8">
      <div className="kicker pb-2 text-ink-muted">Viewport (temporary)</div>
      <div
        className="rounded-[4px] px-3 py-2"
        style={{ border: '1px solid var(--color-line)' }}
      >
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-baseline justify-between py-[3px] font-sans text-[11.5px]"
          >
            <span className="text-ink-muted">{label}</span>
            <span className="tnum">{value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
