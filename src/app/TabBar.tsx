import { NavLink, useLocation, useNavigate } from 'react-router'
import {
  IconDots,
  IconHome,
  IconPlus,
  IconTarget,
  IconTrendingUp,
  IconWallet,
} from '@tabler/icons-react'

const TABS = [
  { to: '/', label: 'Home', Icon: IconHome, end: true },
  { to: '/wallets', label: 'Wallets', Icon: IconWallet },
  { to: '/insights', label: 'Insights', Icon: IconTrendingUp },
  { to: '/budgets', label: 'Budgets', Icon: IconTarget },
  { to: '/more', label: 'More', Icon: IconDots },
]

/**
 * What the floating button makes, per tab.
 *
 * The button stays in one place and keeps one shape; only its destination
 * moves. A screen that is about wallets has no use for a transaction shortcut,
 * and swapping the target is cheaper than teaching every screen to draw its own
 * button in the same spot and hoping they agree — which is how the wallets
 * screen ended up with a bordered "Add a wallet" below the fold while a
 * transaction FAB floated over it.
 */
const CREATES: Record<string, { label: string; to: string }> = {
  '/wallets': { label: 'New wallet', to: '/wallets/new' },
}

const DEFAULT_CREATE = { label: 'Add transaction', to: '/add' }

/**
 * The height the scroll column has to reserve at its foot. The dock is 60 tall
 * and floats 26 above the bottom edge; 96 leaves ten more so the last row is
 * clear of it rather than tucked underneath.
 */
export const DOCK_SPACER = 96

/**
 * A floating pill of five tabs with the add button as a square beside it.
 *
 * Both are `position: absolute` inside a spacer at the foot of the scrolling
 * column, not a flex child of the frame. That is what makes the bar float clear
 * of the bottom edge, and — more importantly — what gets the plus button *out
 * of the feed*. The old one was centred over the list and permanently covered a
 * row; the new one has its own lane to the right of the dock.
 *
 * **Only the active tab carries a label**, in a pill tinted with the accent.
 * The old bar labelled all five at 9.5px, which is a size you squint at and
 * which said four things nobody needed. One legible label says where you are;
 * the other four glyphs are recognisable enough on their own.
 *
 * That makes the cells unequal by design: the active one takes the width its
 * word needs (`flex-none`) and the rest share what is left. A fixed five-way
 * split would have to reserve the widest label's room in every cell, which is
 * how the row loses its air.
 */
export function TabBar() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const create = CREATES[pathname] ?? DEFAULT_CREATE

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-20"
      style={{ height: DOCK_SPACER, paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <nav
        className="pointer-events-auto absolute flex h-[60px] items-center rounded-full bg-dock px-2 shadow-dock"
        style={{ left: 16, right: 86, bottom: 26 }}
      >
        {TABS.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            aria-label={label}
            className={({ isActive }) =>
              // Chrome gives a clicked link `:focus-visible`, so the default
              // outline shows on tap — as a rectangle over a pill. Shaped to
              // match rather than removed, since it is the only thing a
              // keyboard has to go on.
              `flex h-full items-center justify-center rounded-full outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent ${
                isActive ? 'flex-none' : 'flex-1'
              }`
            }
          >
            {({ isActive }) =>
              isActive ? (
                <span
                  className="flex h-11 items-center gap-2 rounded-full px-3.5 text-[14.5px] font-semibold whitespace-nowrap"
                  style={{
                    // A wash of the accent rather than the accent itself: the
                    // glyph and the word are what should read as selected, and
                    // a solid fill would make the pill the loudest thing in a
                    // bar that floats over the content.
                    background: 'color-mix(in oklab, var(--color-accent) 16%, transparent)',
                    color: 'var(--color-accent)',
                  }}
                >
                  <Icon size={20} stroke={1.8} />
                  {label}
                </span>
              ) : (
                <span className="text-ink-muted">
                  <Icon size={20} stroke={1.8} />
                </span>
              )
            }
          </NavLink>
        ))}
      </nav>

      <button
        aria-label={create.label}
        onClick={() => navigate(create.to)}
        className="pointer-events-auto absolute flex size-[60px] items-center justify-center rounded-card bg-accent text-accent-fg shadow-fab transition-transform duration-[90ms] active:scale-[.98]"
        style={{ right: 16, bottom: 26 }}
      >
        <IconPlus size={26} stroke={2} />
      </button>
    </div>
  )
}
