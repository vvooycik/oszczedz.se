import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { useAuth } from '@/auth/AuthProvider'
import { LoginPage } from '@/auth/LoginPage'
import { AppShell } from '@/app/AppShell'
import { FeedScreen } from '@/screens/FeedScreen'
import { WalletsScreen } from '@/screens/WalletsScreen'
import { ComingSoonScreen, MoreScreen } from '@/screens/MoreScreen'
import { AppearanceScreen } from '@/screens/AppearanceScreen'
import { CategoriesScreen } from '@/screens/categories/CategoriesScreen'
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
          <Route
            path="insights"
            element={
              <ComingSoonScreen
                title="Insights"
                blurb="Where spending patterns will live — by category, by tag, and over time. The aggregate views behind it already exist; the screen is not designed yet."
              />
            }
          />
          <Route
            path="budgets"
            element={
              <ComingSoonScreen
                title="Budgets"
                blurb="Creating and editing budgets. The schema and the progress view are in place, so the rings on the feed will fill in as soon as this screen can create one."
              />
            }
          />
          <Route path="more" element={<MoreScreen />} />
        </Route>

        {/* Screens that cover the tabs entirely. */}
        <Route path="/add" element={<AddScreen />} />
        <Route path="/tx/:id" element={<TransactionScreen />} />
        {/* Same form as /add, seeded from the row it names. */}
        <Route path="/tx/:id/edit" element={<AddScreen />} />
        <Route path="/appearance" element={<AppearanceScreen />} />
        <Route path="/categories" element={<CategoriesScreen />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
