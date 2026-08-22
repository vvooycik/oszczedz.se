import { useEffect, useRef } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { useAuth } from '@/auth/AuthProvider'
import { useMaterialiseSchedules } from '@/data/queries'
import { LoginPage } from '@/auth/LoginPage'
import { AppShell } from '@/app/AppShell'
import { isWide, useLayoutMode } from '@/app/layout'
import { WideRoutes } from '@/app/WideRoutes'
import { ScreenTransition } from '@/app/ScreenTransition'
import { FeedScreen } from '@/screens/FeedScreen'
import { WalletsScreen } from '@/screens/WalletsScreen'
import { MoreScreen } from '@/screens/MoreScreen'
import { AppearanceScreen } from '@/screens/AppearanceScreen'
import { CategoriesScreen } from '@/screens/categories/CategoriesScreen'
import { InsightsScreen } from '@/screens/insights/InsightsScreen'
import { BudgetsScreen } from '@/screens/budgets/BudgetsScreen'
import { BudgetEditScreen } from '@/screens/budgets/BudgetEditScreen'
import { HomeOrderScreen } from '@/screens/budgets/HomeOrderSheet'
import { TagsScreen } from '@/screens/TagsScreen'
import { NewWalletScreen } from '@/screens/wallets/NewWalletScreen'
import { WalletScreen } from '@/screens/wallets/WalletScreen'
import { EditWalletScreen } from '@/screens/wallets/EditWalletScreen'
import { AddScreen } from '@/screens/add/AddScreen'
import { SchedulesScreen } from '@/screens/schedules/SchedulesScreen'
import { ScheduleEditScreen } from '@/screens/schedules/ScheduleEditScreen'
import { TransactionScreen } from '@/screens/TransactionScreen'
import { DesignSystemRoute } from '@/screens/dev/DesignSystemRoute'

/**
 * Schedules catch up on launch, and this is the entire mechanism behind "it
 * appears by itself" — there is no cron and no server, so the one moment the
 * app is certainly running is the moment it starts.
 *
 * Renders nothing and blocks nothing: the RPC is idempotent, the overwhelmingly
 * common answer is "nothing was due", and a rule that *did* come due
 * invalidates the derived queries when it lands rather than holding the first
 * paint. The ref is for StrictMode's double mount in development — the server
 * would shrug it off, but there is no reason to send it twice.
 */
function ScheduleCatchUp() {
  const materialise = useMaterialiseSchedules()
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true
    materialise.mutate()
    // Once per mount, deliberately: `materialise` is a fresh object each render.
    // oxlint-disable-next-line exhaustive-deps
  }, [])

  return null
}

/**
 * The design system is readable without a session, deliberately.
 *
 * It has to be reachable on a desktop browser that has never signed in, which
 * is exactly where a desktop layout gets designed, and there is nothing to
 * protect: the page reads CSS custom properties and renders components with
 * hardcoded specimen values. No query runs, no wallet, category or transaction
 * is named, and supabase-js is not even in its chunk.
 *
 * It sits above the gate rather than inside the router because the gate returns
 * `<LoginPage />` *before* `<BrowserRouter />` exists — so a route could not
 * have caught this path however it was ordered. Its own router, matching one
 * address and nothing else, is the whole of it.
 */
function PublicRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/dev/design-system/:section?" element={<DesignSystemRoute />} />
        <Route path="*" element={<LoginPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default function App() {
  const { session, loading } = useAuth()

  // Blank rather than a flash of the login screen: on a cold PWA start the
  // stored session takes a tick to come back out of localStorage.
  if (loading) return null
  if (!session) return <PublicRoutes />

  return (
    <BrowserRouter>
      <ScheduleCatchUp />
      <AppRoutes />
    </BrowserRouter>
  )
}

/**
 * Which of the two route trees is in force.
 *
 * Two trees rather than one with conditionals, because they disagree about
 * something structural: below 1024 a transaction detail *covers* the tabs and
 * is its own route element, and at 1024 and up it is a pane belonging to the
 * feed. One tree trying to be both would need a branch at every route element,
 * which is the version that quietly goes wrong.
 *
 * Crossing the boundary remounts the tree, and that is accepted rather than
 * worked around: it is a layout at a width, not a transition, and dragging a
 * window edge across 1024px is a thing that happens once, not continuously.
 */
function AppRoutes() {
  const mode = useLayoutMode()

  if (isWide(mode)) return <WideRoutes />

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<FeedScreen />} />
        <Route path="wallets" element={<WalletsScreen />} />
        <Route path="insights" element={<InsightsScreen />} />
        <Route path="budgets" element={<BudgetsScreen />} />
        <Route path="more" element={<MoreScreen />} />
      </Route>

      {/* Screens that cover the tabs entirely. Each arrives through
          `ScreenTransition`: detail screens push in from the right, the
          entry and creation forms present from the bottom. */}
      <Route
        path="/add"
        element={
          <ScreenTransition>
            <AddScreen />
          </ScreenTransition>
        }
      />
      <Route
        path="/tx/:id"
        element={
          <ScreenTransition>
            <TransactionScreen />
          </ScreenTransition>
        }
      />
      {/* Same form as /add, seeded from the row it names. */}
      <Route
        path="/tx/:id/edit"
        element={
          <ScreenTransition>
            <AddScreen />
          </ScreenTransition>
        }
      />
      <Route
        path="/appearance"
        element={
          <ScreenTransition>
            <AppearanceScreen />
          </ScreenTransition>
        }
      />
      <Route
        path="/categories"
        element={
          <ScreenTransition>
            <CategoriesScreen />
          </ScreenTransition>
        }
      />
      <Route
        path="/tags"
        element={
          <ScreenTransition>
            <TagsScreen />
          </ScreenTransition>
        }
      />
      {/* Static before dynamic, by route ranking rather than source order. */}
      <Route
        path="/scheduled"
        element={
          <ScreenTransition>
            <SchedulesScreen />
          </ScreenTransition>
        }
      />
      <Route
        path="/scheduled/:id/edit"
        element={
          <ScreenTransition>
            <ScheduleEditScreen />
          </ScreenTransition>
        }
      />
      {/* `/budgets/new`, `/budgets/order` and `/wallets/new` stay above their
          dynamic siblings by route *ranking*, not by source order — a static
          segment always outranks a param. */}
      <Route
        path="/budgets/new"
        element={
          <ScreenTransition>
            <BudgetEditScreen />
          </ScreenTransition>
        }
      />
      <Route
        path="/budgets/order"
        element={
          <ScreenTransition>
            <HomeOrderScreen />
          </ScreenTransition>
        }
      />
      <Route
        path="/budgets/:id/edit"
        element={
          <ScreenTransition>
            <BudgetEditScreen />
          </ScreenTransition>
        }
      />
      <Route
        path="/wallets/new"
        element={
          <ScreenTransition>
            <NewWalletScreen />
          </ScreenTransition>
        }
      />
      <Route
        path="/wallets/:id"
        element={
          <ScreenTransition>
            <WalletScreen />
          </ScreenTransition>
        }
      />
      <Route
        path="/wallets/:id/edit"
        element={
          <ScreenTransition>
            <EditWalletScreen />
          </ScreenTransition>
        }
      />

      {/* Not in the tab bar and not linked from anywhere — typed in. The
          optional segment is what makes `/dev/design-system/tokens` a real
          address rather than an anchor. Declared three times now — here, in
          `PublicRoutes` and in `WideRoutes` — because a signed-in reader must
          reach it too and no two of those routers ever both exist. */}
      <Route path="/dev/design-system/:section?" element={<DesignSystemRoute />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
