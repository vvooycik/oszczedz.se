import { NavLink, useNavigate } from 'react-router'
import { Ellipsis, List, Plus, Target, TrendingUp, Wallet } from 'lucide-react'

const TABS = [
  { to: '/', label: 'Feed', Icon: List, end: true },
  { to: '/wallets', label: 'Wallets', Icon: Wallet },
  { to: '/insights', label: 'Insights', Icon: TrendingUp },
  { to: '/budgets', label: 'Budgets', Icon: Target },
  { to: '/more', label: 'More', Icon: Ellipsis },
]

/**
 * Five evenly spaced tabs with the add button floating above them.
 *
 * The FAB is deliberately not a bar child: five tabs leave no natural centre
 * gap to notch it into, so it sits above the bar as its own element.
 */
export function TabBar() {
  const navigate = useNavigate()

  return (
    <>
      <button
        aria-label="Add transaction"
        onClick={() => navigate('/add')}
        className="absolute left-1/2 z-20 flex size-14 -translate-x-1/2 items-center justify-center rounded-full bg-bg text-accent"
        style={{
          bottom: 'calc(64px + env(safe-area-inset-bottom, 0px))',
          border: '1px solid var(--color-accent)',
          boxShadow: '0 3px 10px rgba(45,43,43,.16)',
        }}
      >
        <Plus size={24} strokeWidth={1.5} />
      </button>

      <nav
        className="z-10 flex flex-none bg-bg px-1.5 pt-2.5"
        style={{
          borderTop: '1px solid var(--color-line)',
          paddingBottom: 'calc(10px + env(safe-area-inset-bottom, 0px))',
        }}
      >
        {TABS.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className="flex flex-1 flex-col items-center gap-1 py-1"
          >
            {({ isActive }) => (
              <span
                className="flex flex-col items-center gap-1"
                style={{ color: isActive ? 'var(--color-accent)' : 'var(--color-ink-faint)' }}
              >
                <Icon size={21} strokeWidth={1.5} />
                <span
                  className="font-sans uppercase"
                  style={{ fontSize: 9.5, letterSpacing: '.08em' }}
                >
                  {label}
                </span>
              </span>
            )}
          </NavLink>
        ))}
      </nav>
    </>
  )
}
