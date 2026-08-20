import { useEffect, useRef } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { useAuth } from '@/auth/AuthProvider'
import { useMaterialiseSchedules } from '@/data/queries'
import { LoginPage } from '@/auth/LoginPage'
import { AppShell } from '@/app/AppShell'
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

export default function App() {
  const { session, loading } = useAuth()

  // Blank rather than a flash of the login screen: on a cold PWA start the
  // stored session takes a tick to come back out of localStorage.
  if (loading) return null
  if (!session) return <LoginPage />

  return (
    <BrowserRouter>
      <ScheduleCatchUp />
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

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
