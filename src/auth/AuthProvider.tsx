import { createContext, use, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

type AuthState = {
  session: Session | null
  /** True until the stored session has been read back from localStorage. */
  loading: boolean
}

const AuthContext = createContext<AuthState>({ session: null, loading: true })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    session: null,
    loading: true,
  })

  const queryClient = useQueryClient()
  // Whose data the query cache currently holds. `undefined` = not yet known.
  const cacheOwner = useRef<string | null | undefined>(undefined)

  useEffect(() => {
    // The query cache is keyed by query, not by user, so it would happily hand
    // one account's balances to the next one signed in on this device — and
    // with a 30s staleTime, without even refetching. Clear it whenever the
    // user changes, *before* the state update, so the next tree mounts on an
    // empty cache. A token refresh keeps the same user and clears nothing.
    const adopt = (session: Session | null) => {
      const user = session?.user.id ?? null
      if (cacheOwner.current !== undefined && cacheOwner.current !== user) {
        queryClient.clear()
      }
      cacheOwner.current = user
      setState({ session, loading: false })
    }

    supabase.auth.getSession().then(({ data }) => adopt(data.session))

    // Fires on sign in/out and on every token refresh, which is what keeps a
    // long-backgrounded PWA from waking up with a dead session.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => adopt(session))

    return () => sub.subscription.unsubscribe()
  }, [queryClient])

  return <AuthContext value={state}>{children}</AuthContext>
}

export const useAuth = () => use(AuthContext)
