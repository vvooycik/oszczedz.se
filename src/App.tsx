import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { useAuth } from '@/auth/AuthProvider'
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
import { TransactionScreen } from '@/screens/TransactionScreen'

export default function App() {
  const { session, loading } = useAuth()

  // Blank rather than a flash of the login screen: on a cold PWA start the
  // stored session takes a tick to come back out of localStorage.
  if (loading) return null
  if (!session) return <LoginPage />

  return (
    <BrowserRouter>
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
