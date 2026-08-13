import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setBusy(false)
  }

  const field = 'w-full rounded-field bg-transparent px-3 py-2.5 text-[16px] outline-none'
  const border = { border: '1px solid var(--color-divider)' }

  return (
    <div className="mx-auto flex h-dvh max-w-lg items-center justify-center px-6">
      <form onSubmit={submit} className="w-full max-w-sm">
        <h1 className="text-[26px]">oszczędź.se</h1>
        <p className="mt-1.5 text-[13px] text-ink-muted">
          Sign-ups are disabled; this is a single-account app.
        </p>

        <div className="mt-6 flex flex-col gap-2.5">
          <input
            type="email"
            required
            autoComplete="username"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={field}
            style={border}
          />
          <input
            type="password"
            required
            autoComplete="current-password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={field}
            style={border}
          />
        </div>

        {error && <p className="mt-3 text-[12.5px] text-expense">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="mt-4 w-full rounded-field py-2.5 text-[14px] text-accent disabled:opacity-50"
          style={{ border: '1px solid var(--color-accent)' }}
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
