import { useRef } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router'
import { AppShell } from './AppShell'
import { ModalScreen } from './ModalScreen'
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
import { EditWalletScreen } from '@/screens/wallets/EditWalletScreen'
import { AddScreen } from '@/screens/add/AddScreen'
import { SchedulesScreen } from '@/screens/schedules/SchedulesScreen'
import { ScheduleEditScreen } from '@/screens/schedules/ScheduleEditScreen'
import { DesignSystemRoute } from '@/screens/dev/DesignSystemRoute'

/**
 * Routes that present as a dialog *over* the page they were started from,
 * rather than replacing it.
 *
 * Every one of them is a form or a settings list — a thing you finish and come
 * back from. `/tx/:id` is deliberately absent: a transaction is a *view*, and
 * on a wide window it is the detail pane rather than anything over it.
 */
const MODAL = [
  /^\/add$/,
  /^\/tx\/[^/]+\/edit$/,
  /^\/appearance$/,
  /^\/categories$/,
  /^\/tags$/,
  /^\/scheduled$/,
  /^\/scheduled\/[^/]+\/edit$/,
  /^\/budgets\/new$/,
  /^\/budgets\/order$/,
  /^\/budgets\/[^/]+\/edit$/,
  /^\/wallets\/new$/,
  /^\/wallets\/[^/]+\/edit$/,
]

const isModal = (pathname: string) => MODAL.some((r) => r.test(pathname))

/**
 * A scrolling page for the three screens that are not master-detail.
 *
 * At a wide layout `AppShell` stops providing a `<main>` — Home and Wallets own
 * their scrolling, because each of their two columns scrolls separately. These
 * three still want one column and a scrollbar, and a cap: a list of settings
 * rows stretched to 1176px is not a use of the width, it is an absence of one.
 */
function Page({ children, max = 834 }: { children: React.ReactNode; max?: number }) {
  return (
    <main className="no-scrollbar flex-1 overflow-y-auto py-6">
      <div className="mx-auto w-full" style={{ maxWidth: max }}>
        {children}
      </div>
    </main>
  )
}

/**
 * The 1024px-and-up routing.
 *
 * Two things make it different from the phone's tree, and both come out of the
 * same idea — that a wide window can show two things at once.
 *
 * **A detail route renders its master.** `/tx/:id` and `/` are the same element,
 * because on this layout they are the same screen with and without something
 * open in its right-hand pane; `FeedScreen` reads the route param and decides.
 * The route is still the selection, which is what keeps deep links, the back
 * button and `useGoBack` working exactly as they did.
 *
 * **A modal route keeps the page behind it mounted.** `<Routes location>` is
 * given the last non-modal address, so opening the entry form leaves the feed
 * where it was — visible through the scrim, and still there when the form
 * closes rather than remounted with its month reset and its scroll at the top.
 */
export function WideRoutes() {
  const location = useLocation()
  const modal = isModal(location.pathname)

  /**
   * The address the page behind the scrim is drawn at.
   *
   * A ref written during render, which is the deliberate part: this is derived
   * state, not an effect, and an effect would paint one frame of the *modal's*
   * own route underneath itself before correcting. It starts at `/` so a cold
   * load straight onto `/add` — a deep link, a refresh — opens the form over
   * the home screen instead of over nothing.
   */
  const behind = useRef('/')
  if (!modal) behind.current = location.pathname + location.search

  return (
    <>
      <Routes location={behind.current}>
        <Route element={<AppShell />}>
          <Route index element={<FeedScreen />} />
          <Route path="tx/:id" element={<FeedScreen />} />
          <Route path="wallets" element={<WalletsScreen />} />
          <Route path="wallets/:id" element={<WalletsScreen />} />
          <Route
            path="insights"
            element={
              <Page>
                <InsightsScreen />
              </Page>
            }
          />
          {/* Wider, because the budget groups run two columns from 1024. */}
          <Route
            path="budgets"
            element={
              <Page max={1080}>
                <BudgetsScreen />
              </Page>
            }
          />
          {/* Still a route, and still reachable by typing it, though nothing
              links here once the sidebar draws its rows directly. */}
          <Route
            path="more"
            element={
              <Page>
                <MoreScreen />
              </Page>
            }
          />
        </Route>

        {/* Outside the shell and outside the sidebar: it is a document about
            the app, not a screen of it, and it is the one page here that is not
            capped at the frame width. */}
        <Route path="/dev/design-system/:section?" element={<DesignSystemRoute />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {modal && (
        <Routes location={location}>
          {/* The entry form is the one dialog with a composition of its own —
              720px, hero beside fields — so it draws its own scrim. */}
          <Route path="/add" element={<AddScreen />} />
          <Route path="/tx/:id/edit" element={<AddScreen />} />

          <Route
            path="/appearance"
            element={
              <ModalScreen width={560}>
                <AppearanceScreen />
              </ModalScreen>
            }
          />
          <Route
            path="/categories"
            element={
              <ModalScreen>
                <CategoriesScreen />
              </ModalScreen>
            }
          />
          <Route
            path="/tags"
            element={
              <ModalScreen width={560}>
                <TagsScreen />
              </ModalScreen>
            }
          />
          <Route
            path="/scheduled"
            element={
              <ModalScreen>
                <SchedulesScreen />
              </ModalScreen>
            }
          />
          <Route
            path="/scheduled/:id/edit"
            element={
              <ModalScreen width={620}>
                <ScheduleEditScreen />
              </ModalScreen>
            }
          />
          <Route
            path="/budgets/new"
            element={
              <ModalScreen width={620}>
                <BudgetEditScreen />
              </ModalScreen>
            }
          />
          <Route
            path="/budgets/order"
            element={
              <ModalScreen width={560}>
                <HomeOrderScreen />
              </ModalScreen>
            }
          />
          <Route
            path="/budgets/:id/edit"
            element={
              <ModalScreen width={620}>
                <BudgetEditScreen />
              </ModalScreen>
            }
          />
          <Route
            path="/wallets/new"
            element={
              <ModalScreen width={620}>
                <NewWalletScreen />
              </ModalScreen>
            }
          />
          <Route
            path="/wallets/:id/edit"
            element={
              <ModalScreen width={620}>
                <EditWalletScreen />
              </ModalScreen>
            }
          />
        </Routes>
      )}
    </>
  )
}
