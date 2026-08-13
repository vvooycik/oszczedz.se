/**
 * Generates every app icon from one source of truth.
 *
 * Run with `npm run icons`. Not part of `npm run build` — these are committed
 * assets that change once a year, and rasterising them on every deploy would be
 * a dependency the app does not otherwise need.
 *
 * The geometry is from `design/design_handoff_icon_login/README.md`, which is
 * gitignored (the design bundles are). **That is why the path data lives here
 * rather than being read from a file**: this script is the only copy of the mark
 * that is actually in the repository, and a set of PNGs nobody can regenerate is
 * worse than no PNGs at all.
 *
 * The mark is the app's own balance chart, cropped to a rounded tile: red while
 * the balance is below zero, green above it, with the fill sitting **between the
 * zero line and the line itself** rather than running to the bottom edge — the
 * same rule `BalanceChart` follows, and the reason zero is never drawn. It ends
 * on the chart's white last-point dot just above zero, so the mark reads as a
 * recovery.
 */
import { Resvg } from '@resvg/resvg-js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

/**
 * Colours resolved to sRGB hex, not left as `oklch()`.
 *
 * Every raster exporter in this chain — resvg included — ignores oklch and
 * falls back to black. The handoff calls this out; the values are the app's own
 * `--c-expense` / `--c-income` at their dark-theme lightness, converted once.
 *
 * The mark is a **fixed brand asset**: it does not re-theme in light mode or
 * follow the accent, because it is baked into the home screen at install time
 * and cannot follow a user who later picks Copper.
 */
const TILE = '#1e1f21' // oklch(24% 0.004 262)
const DOWN = '#d7654b' // oklch(64% 0.15 34)   — --c-expense, dark
const UP = '#7cbd89' // oklch(74% 0.1 150)     — --c-income, dark
const DOT = '#f4f4f6' // --c-ink, dark

/** The two line segments, meeting on the zero line at x=42. */
const DOWN_LINE = 'M0 86 L12 92 L24 76 L34 82 L42 68'
const UP_LINE = 'M42 68 L52 44 L62 52 L70 30 L80 46 L94 60'
/** The same paths closed back onto y=68 — the undrawn zero line. */
const DOWN_FILL = 'M0 68 L0 86 L12 92 L24 76 L34 82 L42 68 Z'
const UP_FILL = 'M42 68 L52 44 L62 52 L70 30 L80 46 L94 60 L94 68 Z'

/**
 * @param {object} o
 * @param {boolean} [o.dot]     Draw the terminal dot. Off below ~24px, where the
 *                              white ring closes up and reads as a blob.
 * @param {boolean} [o.rounded] Draw the tile's own corner radius. Off for
 *                              maskable and Apple, which apply their own.
 * @param {number}  [o.inset]   Shrinks the artwork towards the centre, in grid
 *                              units, for the maskable safe area.
 */
function markSvg({ dot = true, rounded = true, inset = 0 } = {}) {
  const clip = rounded
    ? '<clipPath id="t"><rect width="112" height="112" rx="26"/></clipPath>'
    : '<clipPath id="t"><rect width="112" height="112"/></clipPath>'

  // Scale about the centre so the line keeps its position relative to the tile.
  const k = (112 - inset * 2) / 112
  const art = `<g transform="translate(${inset} ${inset}) scale(${k})">
      <path d="${DOWN_FILL}" fill="url(#d)"/>
      <path d="${UP_FILL}" fill="url(#u)"/>
      <path d="${DOWN_LINE}" fill="none" stroke="${DOWN}" stroke-width="9" stroke-linejoin="round"/>
      <path d="${UP_LINE}" fill="none" stroke="${UP}" stroke-width="9" stroke-linejoin="round"/>
      ${dot ? `<circle cx="94" cy="60" r="10" fill="${DOT}" stroke="${TILE}" stroke-width="3.5"/>` : ''}
    </g>`

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 112 112" role="img" aria-label="oszczędź.se">
  <title>oszczędź.se</title>
  <defs>
    ${clip}
    <linearGradient id="u" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${UP}" stop-opacity=".45"/>
      <stop offset="1" stop-color="${UP}" stop-opacity=".04"/>
    </linearGradient>
    <linearGradient id="d" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${DOWN}" stop-opacity=".4"/>
      <stop offset="1" stop-color="${DOWN}" stop-opacity=".1"/>
    </linearGradient>
  </defs>
  <g clip-path="url(#t)">
    <rect width="112" height="112" fill="${TILE}"/>
    ${art}
  </g>
</svg>`
}

const png = (svg, size) =>
  new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng()

/**
 * A minimal ICO container around PNG frames.
 *
 * PNG-in-ICO is understood by every browser and by Windows Vista onward, which
 * makes the encoder six fields long instead of a BMP writer. Sizes of 256 or
 * more are stored as 0 in the byte-wide width/height fields; nothing here is
 * that large, but the clamp keeps that from being a silent surprise later.
 */
function ico(frames) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(frames.length, 4)

  let offset = 6 + frames.length * 16
  const entries = []
  for (const { size, data } of frames) {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(size >= 256 ? 0 : size, 0)
    entry.writeUInt8(size >= 256 ? 0 : size, 1)
    entry.writeUInt8(0, 2) // palette
    entry.writeUInt8(0, 3) // reserved
    entry.writeUInt16LE(1, 4) // colour planes
    entry.writeUInt16LE(32, 6) // bits per pixel
    entry.writeUInt32LE(data.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += data.length
    entries.push(entry)
  }

  return Buffer.concat([header, ...entries, ...frames.map((f) => f.data)])
}

mkdirSync(OUT, { recursive: true })
const write = (name, data) => {
  writeFileSync(join(OUT, name), data)
  console.log(`  ${name.padEnd(26)} ${(data.length / 1024).toFixed(1)} kB`)
}

console.log('Icons →', OUT)

// The favicon keeps the full mark: a 16px slot is 32 device pixels on a retina
// display, where the dot is still legible.
write('favicon.svg', Buffer.from(markSvg(), 'utf8'))

// …but the raster favicons drop it, because they really are 16 and 32.
const small = markSvg({ dot: false })
write('favicon-16.png', png(small, 16))
write('favicon-32.png', png(small, 32))
write(
  'favicon.ico',
  ico([
    { size: 16, data: png(small, 16) },
    { size: 32, data: png(small, 32) },
  ]),
)

const full = markSvg()
for (const size of [192, 256, 384, 512]) write(`icon-${size}.png`, png(full, size))

// Maskable: the platform crops to a circle and applies its own corners, so the
// tile's radius goes and the artwork pulls into the inner 80%.
write('icon-512-maskable.png', png(markSvg({ rounded: false, inset: 11 }), 512))

// Apple applies its own mask too, and dislikes transparency.
write('icon-180.png', png(markSvg({ rounded: false }), 180))
