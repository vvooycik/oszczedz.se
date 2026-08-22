import { useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router'
import { IconLogout, IconPlus } from '@tabler/icons-react'
import { AppMark } from '@/auth/AppMark'
import { useAuth } from '@/auth/AuthProvider'
import { useTheme } from '@/theme/ThemeProvider'
import { supabase } from '@/lib/supabase'
import { buildTransactionsCsv, downloadCsv } from '@/lib/export'
import { today } from '@/lib/dates'
import { verdictOf } from '@/lib/budgets'
import {
  useBudgetProgress,
  useCategories,
  useSchedules,
  useTags,
  useWallets,
} from '@/data/queries'
import {
  APPEARANCE,
  CREATES,
  DATA_LINKS,
  DEFAULT_CREATE,
  EXPORT_GLYPH,
  SIDEBAR_TABS,
  TABS,
} from './navigation'
import { RAIL_W, SIDEBAR_W } from './layout'

/** The 16% accent wash the dock's active pill uses, so selection reads the same at every size. */
const ACTIVE_WASH = 'color-mix(in oklab, var(--color-accent) 16%, transparent)'

/**
 * How many budgets are over their limit — the sidebar's one red number.
 *
 * `verdictOf` rather than a second reading of `spend > limit`: the list screen
 * groups by exactly this call, and a badge that counted differently from the
 * group it opens would be worse than no badge.
 */
function useOverCount(): number {
  const budgets = useBudgetProgress()
  return (budgets.data ?? []).filter((b) => verdictOf(b) === 'over').length
}

/** Export, which is a button rather than a destination, wherever it is drawn. */
function useExport() {
  const wallets = useWallets()
  const categories = useCategories()
  const [busy, setBusy] = useState(false)

  return {
    busy,
    run: async () => {
      setBusy(true)
      try {
        const csv = await buildTransactionsCsv(
          wallets.data ?? [],
          categories.data ?? [],
        )
        downloadCsv(csv, `oszczedz-se-${today()}.csv`)
      } finally {
        setBusy(false)
      }
    },
  }
}

/**
 * The dock, unfolded.
 *
 * Same `TABS`, same `CREATES`, drawn as rows instead of as a pill — which is
 * the whole reason those moved out of `TabBar` into `navigation.ts`. The plus
 * becomes the sidebar's first item, a real labelled button, because a floating
 * circle over a 1440px window is a phone gesture with nothing to float over.
 *
 * **More stops being a destination here.** A sidebar is precisely what More was
 * standing in for, so its rows are drawn directly in a `Data` group and the
 * fifth tab is not offered — following it would open a screen listing the three
 * links already above it.
 */
export function Sidebar() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { session } = useAuth()
  const { prefs } = useTheme()

  const categories = useCategories()
  const tags = useTags()
  const schedules = useSchedules()
  const wallets = useWallets()
  const over = useOverCount()
  const exporter = useExport()

  const create = CREATES[pathname] ?? DEFAULT_CREATE
  const email = session?.user.email ?? ''

  const counts = {
    categories: categories.data?.length,
    tags: tags.data?.length,
    // Active only, matching the More screen: a paused rule writes nothing, and
    // a figure counting it would disagree with the list it opens.
    schedules: schedules.data?.filter((s) => s.active).length,
  }

  return (
    <aside
      className="flex flex-none flex-col gap-5 overflow-y-auto border-r border-divider bg-dock px-4 py-[22px]"
      style={{ width: SIDEBAR_W }}
    >
      <div className="flex items-center gap-2.5 px-1.5">
        <AppMark size={32} radius={10} />
        <span className="text-field font-semibold tracking-[-0.01em]">oszczędź.se</span>
      </div>

      <button
        type="button"
        onClick={() => navigate(create.to)}
        className="flex w-full items-center justify-center gap-2 rounded-field py-3.5 text-action font-semibold shadow-fab transition-transform duration-[90ms] active:scale-[.99]"
        style={{
          background: 'var(--color-accent)',
          color: 'var(--color-accent-fg)',
        }}
      >
        <IconPlus size={19} stroke={2} />
        {create.label}
      </button>

      <nav className="flex flex-col gap-0.5">
        {SIDEBAR_TABS.map(({ to, label, Icon, end }) => (
          <NavRow key={to} to={to} label={label} Icon={Icon} end={end}>
            {to === '/wallets' && wallets.data ? (
              <Count>{wallets.data.length}</Count>
            ) : null}
            {/* Drawn only when something is over — a permanent 0 in red is an
                alarm that has learned to mean nothing. */}
            {to === '/budgets' && over > 0 ? <OverBadge>{over}</OverBadge> : null}
          </NavRow>
        ))}
      </nav>

      <div className="mx-1.5 h-px bg-divider" />

      <div className="flex flex-col gap-0.5">
        <span className="px-3.5 pb-1.5 text-kicker font-semibold tracking-[0.06em] text-label uppercase">
          Data
        </span>
        {DATA_LINKS.map(({ to, label, Icon, count }) => (
          <NavRow key={to} to={to} label={label} Icon={Icon} small>
            {counts[count] != null ? <Count>{counts[count]}</Count> : null}
          </NavRow>
        ))}
      </div>

      <div className="flex-1" />

      <div className="flex flex-col gap-0.5">
        <NavRow
          to={APPEARANCE.to}
          label={APPEARANCE.label}
          Icon={APPEARANCE.Icon}
          small
        >
          <span
            aria-hidden
            className="ml-auto size-4 rounded-md"
            style={{ background: 'var(--color-accent)' }}
            title={prefs.accent}
          />
        </NavRow>
        <button
          type="button"
          onClick={exporter.run}
          className="flex h-10 items-center gap-3 rounded-tile px-3.5 text-left text-value font-medium text-ink-muted hover:bg-press"
        >
          <EXPORT_GLYPH size={18} stroke={2} />
          {exporter.busy ? 'Preparing…' : 'Export data'}
        </button>
      </div>

      <div className="flex items-center gap-[11px] rounded-field bg-inset px-3 py-2.5">
        <span className="flex size-8 flex-none items-center justify-center rounded-xl bg-tile text-meta font-semibold text-ink-muted uppercase">
          {email.slice(0, 1) || '?'}
        </span>
        <span
          className="min-w-0 flex-1 truncate text-meta text-ink-muted"
          title={email}
        >
          {email || 'Signed in'}
        </span>
        <button
          type="button"
          aria-label="Sign out"
          onClick={() => supabase.auth.signOut()}
          className="flex-none text-ink-dim hover:text-ink-muted"
        >
          <IconLogout size={17} stroke={2} />
        </button>
      </div>
    </aside>
  )
}

function Count({ children }: { children: React.ReactNode }) {
  return <span className="tnum ml-auto text-meta-sm text-ink-dim">{children}</span>
}

function OverBadge({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="tnum ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-badge font-semibold"
      style={{
        background: 'color-mix(in oklab, var(--color-expense) 22%, transparent)',
        color: 'var(--color-expense)',
      }}
    >
      {children}
    </span>
  )
}

function NavRow({
  to,
  label,
  Icon,
  end,
  small = false,
  children,
}: {
  to: string
  label: string
  Icon: (typeof TABS)[number]['Icon']
  end?: boolean
  /** The Data and foot groups: 40px and one type step down from a tab. */
  small?: boolean
  children?: React.ReactNode
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={`flex items-center gap-3 rounded-tile px-3.5 ${
        small ? 'h-10 text-value' : 'h-[46px] text-row'
      } hover:bg-press`}
      style={({ isActive }) =>
        isActive
          ? {
              fontWeight: 600,
              color: 'var(--color-accent)',
              background: ACTIVE_WASH,
            }
          : { fontWeight: 500, color: 'var(--color-ink-muted)' }
      }
    >
      <Icon size={small ? 18 : 20} stroke={2} />
      {label}
      {children}
    </NavLink>
  )
}

/**
 * The tablet-landscape rail: the same navigation with the words taken away.
 *
 * **It keeps all five tabs, More included**, which is the one place this
 * deviates from the reference file — that draws Scheduled as the fifth cell.
 * The rail has no room for a Data group, so dropping More would leave
 * Categories, Tags and Export with nothing anywhere that reaches them. The
 * desktop sidebar can drop More precisely because it draws those rows itself.
 *
 * The Budgets cell carries a dot rather than a count: there is no room for a
 * numeral at 52px, and "something is over" is the whole question the badge
 * answers anyway.
 */
export function IconRail() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { session } = useAuth()
  const over = useOverCount()

  const create = CREATES[pathname] ?? DEFAULT_CREATE
  const email = session?.user.email ?? ''

  return (
    <aside
      className="flex flex-none flex-col items-center gap-2.5 border-r border-divider bg-dock py-[18px]"
      style={{ width: RAIL_W }}
    >
      <AppMark size={34} radius={11} />

      <button
        type="button"
        aria-label={create.label}
        onClick={() => navigate(create.to)}
        className="mt-2 flex size-[52px] items-center justify-center rounded-tile-lg shadow-fab transition-transform duration-[90ms] active:scale-[.97]"
        style={{
          background: 'var(--color-accent)',
          color: 'var(--color-accent-fg)',
        }}
      >
        <IconPlus size={24} stroke={2} />
      </button>

      <nav className="mt-2.5 flex flex-col items-center gap-1.5">
        {TABS.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            aria-label={label}
            title={label}
            className="relative flex h-11 w-[52px] items-center justify-center rounded-field hover:bg-press"
            style={({ isActive }) =>
              isActive
                ? { color: 'var(--color-accent)', background: ACTIVE_WASH }
                : { color: 'var(--color-ink-muted)' }
            }
          >
            <Icon size={22} stroke={1.8} />
            {to === '/budgets' && over > 0 && (
              <span
                aria-hidden
                className="absolute top-1.5 right-2.5 size-2 rounded-full"
                style={{ background: 'var(--color-expense)' }}
              />
            )}
          </NavLink>
        ))}
      </nav>

      <div className="flex-1" />

      <NavLink
        to={APPEARANCE.to}
        aria-label={APPEARANCE.label}
        title={APPEARANCE.label}
        className="flex h-11 w-[52px] items-center justify-center rounded-field text-ink-muted hover:bg-press"
      >
        <APPEARANCE.Icon size={22} stroke={1.8} />
      </NavLink>
      {/* An avatar, not a button. Signing out is one tap from More and a
          mis-tap here would end the session with nothing asked. */}
      <span
        title={email}
        className="flex size-9 items-center justify-center rounded-tile-sm bg-tile text-value font-semibold text-ink-muted uppercase"
      >
        {email.slice(0, 1) || '?'}
      </span>
    </aside>
  )
}
