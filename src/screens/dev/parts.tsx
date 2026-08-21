import { useEffect, useState, type ReactNode } from 'react'
import { useTheme } from '@/theme/ThemeProvider'
import { readToken } from '@/theme/tokens'

/**
 * Shared furniture for the design-system reference.
 *
 * This page is **not** built from the app's own components where the app's
 * components are the subject: a specimen has to be able to show a Card without
 * being wrapped in one, and a reference that documents `Label` by rendering
 * `Label` cannot show what it looks like when it is wrong. So the chrome here
 * is deliberately plain and local — the only shared tokens it borrows are the
 * colours, because the page must re-theme with the app it documents.
 */

/**
 * Re-reads a custom property whenever the appearance changes.
 *
 * `getComputedStyle` is a live read, but React has no reason to re-render when
 * `applyTheme` writes a new value onto `<html>`, so the page would keep showing
 * the previous mode's numbers. The effect bumps a counter on every input the
 * theme has: mode, accent, and the surface-tint switch.
 */
export function useTokens(): number {
  const { prefs, resolvedMode } = useTheme()
  const [tick, bump] = useState(0)

  useEffect(() => {
    bump((n) => n + 1)
  }, [prefs.accent, prefs.tintSurfaces, resolvedMode])

  return tick
}

/** The literal index.css declared, `var()` resolved but colour functions intact. */
export const declared = (name: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim()

/** The same property as sRGB, through the canvas path `tokens.ts` uses. */
export const resolved = (name: string): string => readToken(name)

export function Section({
  id,
  title,
  lead,
  children,
}: {
  id: string
  title: string
  lead?: ReactNode
  children: ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-20 border-t border-divider pt-8 pb-2">
      <h2 className="text-heading font-semibold tracking-[-0.01em]">{title}</h2>
      {lead && (
        <p className="mt-1.5 max-w-[62ch] text-value leading-[1.6] text-ink-muted">
          {lead}
        </p>
      )}
      <div className="mt-5 flex flex-col gap-6">{children}</div>
    </section>
  )
}

export function Block({
  title,
  note,
  children,
}: {
  title: string
  note?: ReactNode
  children: ReactNode
}) {
  return (
    <div>
      <h3 className="text-kicker font-semibold tracking-[0.06em] text-label uppercase">
        {title}
      </h3>
      {note && (
        <p className="mt-1 max-w-[62ch] text-meta leading-[1.55] text-ink-muted">
          {note}
        </p>
      )}
      <div className="mt-3">{children}</div>
    </div>
  )
}

/** Monospace inline code — the page's only non-Instrument type. */
export function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-[5px] bg-inset px-[5px] py-[1px] font-mono text-micro break-words">
      {children}
    </code>
  )
}

/**
 * A specimen and its spec, side by side. The grid collapses to one column on a
 * phone — this page is written for a desktop browser but must stay readable on
 * the device it documents.
 */
export function Spec({
  label,
  spec,
  children,
}: {
  label: ReactNode
  spec?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="grid grid-cols-1 gap-3 border-b border-divider py-3 last:border-b-0 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] sm:items-center sm:gap-6">
      <div className="min-w-0">
        <div className="text-value font-medium">{label}</div>
        {spec && <div className="mt-0.5 text-meta-sm text-ink-muted">{spec}</div>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/** One colour token: the chip, what it is declared as, and what it resolves to. */
export function Swatch({ name, note }: { name: string; note?: string }) {
  useTokens()
  const raw = declared(name)
  const hex = resolved(name)

  return (
    <div className="flex items-center gap-3 border-b border-divider py-2.5 last:border-b-0">
      <span
        className="size-9 flex-none rounded-tile-sm"
        style={{
          background: `var(${name})`,
          // Translucent ink tokens are invisible without something behind them,
          // and the ring is what makes a near-ground surface visible at all.
          boxShadow: 'inset 0 0 0 1px var(--color-divider)',
        }}
      />
      <div className="min-w-0 flex-1">
        <div className="font-mono text-micro">{name}</div>
        {note && <div className="mt-px text-micro text-ink-muted">{note}</div>}
      </div>
      <div className="hidden min-w-0 flex-1 truncate font-mono text-kicker text-ink-muted sm:block">
        {raw}
      </div>
      <div className="tnum flex-none font-mono text-kicker text-ink-dim">{hex}</div>
    </div>
  )
}
