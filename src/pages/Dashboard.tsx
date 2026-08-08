import { lazy, Suspense } from 'react'
import { supabase } from '@/lib/supabase'
import {
  useCategories,
  useMonthlyTotals,
  useRecentTransactions,
  useWalletBalances,
  useWallets,
} from '@/data/queries'
import { AddTransactionForm } from '@/components/AddTransactionForm'
import { TransactionList } from '@/components/TransactionList'
import { WalletStrip } from '@/components/WalletStrip'
import { FirstRunSetup } from '@/components/FirstRunSetup'

// Charts are per-currency in v1 — no FX conversion. PLN is the default view.
const DEFAULT_CURRENCY = 'PLN'

// ECharts is by far the largest dependency (~600 kB of the bundle). Splitting
// it out keeps it off the login screen and off the critical path for the first
// paint, which matters on a phone on mobile data.
const MonthlySpendChart = lazy(() =>
  import('@/charts/MonthlySpendChart').then((m) => ({
    default: m.MonthlySpendChart,
  })),
)

export function Dashboard() {
  const wallets = useWallets()
  const categories = useCategories()
  const balances = useWalletBalances()
  const transactions = useRecentTransactions()
  const totals = useMonthlyTotals(DEFAULT_CURRENCY)

  const failed = [wallets, categories, balances, transactions, totals].find(
    (q) => q.error,
  )
  if (failed?.error) {
    return (
      <Shell>
        <p className="text-sm text-expense">
          {failed.error instanceof Error
            ? failed.error.message
            : 'Something went wrong'}
        </p>
      </Shell>
    )
  }

  if (!wallets.data || !categories.data) {
    return (
      <Shell>
        <p className="text-sm text-ink-muted">Loading…</p>
      </Shell>
    )
  }

  if (wallets.data.length === 0 || categories.data.length === 0) {
    return (
      <Shell>
        <FirstRunSetup />
      </Shell>
    )
  }

  return (
    <Shell>
      <WalletStrip wallets={wallets.data} balances={balances.data ?? []} />

      <section>
        <h2 className="mb-2 text-sm font-medium text-ink-muted">
          Spending per month ({DEFAULT_CURRENCY})
        </h2>
        <Suspense fallback={<div className="h-56 w-full" />}>
          <MonthlySpendChart
            totals={totals.data ?? []}
            currency={DEFAULT_CURRENCY}
          />
        </Suspense>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-ink-muted">Add</h2>
        <AddTransactionForm
          wallets={wallets.data}
          categories={categories.data}
        />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-ink-muted">Recent</h2>
        <TransactionList
          transactions={transactions.data ?? []}
          wallets={wallets.data}
          categories={categories.data}
        />
      </section>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-lg space-y-6 p-4 pb-16">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">oszczędź.se</h1>
        <button
          onClick={() => supabase.auth.signOut()}
          className="text-sm text-ink-muted underline"
        >
          Sign out
        </button>
      </header>
      {children}
    </div>
  )
}
