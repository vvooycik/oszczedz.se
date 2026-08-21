import { useEffect, useRef, useState } from 'react'
import {
  IconCheck,
  IconEye,
  IconEyeOff,
  IconLoader2,
  IconLock,
  IconMail,
} from '@tabler/icons-react'
import { supabase } from '@/lib/supabase'
import { Label } from '@/components/ui/Label'
import { keepFocus } from '@/lib/touch'
import { AppMark } from './AppMark'

/** Good enough to catch a typo on blur; the server is the real judge. */
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type Field = {
  icon: React.ReactNode
  label: string
  invalid: boolean
  children: React.ReactNode
}

/**
 * A labelled input on a card-coloured well.
 *
 * The ring is a `box-shadow` rather than a border so focus does not move the
 * text by a pixel, and it is `inset` on dark where the card already carries an
 * inner top highlight to sit against.
 */
function FormField({ icon, label, invalid, children }: Field) {
  return (
    <div className="flex flex-col gap-[7px]">
      <Label>{label}</Label>
      <div
        className={`flex items-center gap-3 rounded-field bg-card px-4 py-[15px] ${
          invalid ? '' : 'shadow-card'
        }`}
        style={
          invalid
            ? { boxShadow: '0 0 0 1.5px var(--color-expense)' }
            : undefined
        }
      >
        <span className="flex-none text-ink-faint">{icon}</span>
        {children}
      </div>
    </div>
  )
}

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [reveal, setReveal] = useState(false)
  const [stayIn, setStayIn] = useState(true)
  const [emailTouched, setEmailTouched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const emailRef = useRef<HTMLInputElement>(null)
  useEffect(() => emailRef.current?.focus(), [])

  const emailBad = emailTouched && email.trim() !== '' && !LOOKS_LIKE_EMAIL.test(email)
  const ready = email.trim() !== '' && password !== '' && !busy

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ready) return
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    // Supabase says "Invalid login credentials"; the screen says which two
    // things to check. Anything else is a real fault and is shown as it came.
    if (error) {
      setError(
        error.message.toLowerCase().includes('invalid login')
          ? 'Wrong email or password.'
          : error.message,
      )
    }
    setBusy(false)
  }

  const input =
    'min-w-0 flex-1 bg-transparent text-field outline-none placeholder:text-ink-faint'

  return (
    <div className="relative mx-auto flex h-svh max-w-frame flex-col justify-center px-6">
      <form onSubmit={submit} className="w-full">
        <div className="flex flex-col gap-5">
          <AppMark size={64} radius={20} />
          <div>
            <h1
              className="text-title font-semibold"
              style={{ letterSpacing: '-0.025em', lineHeight: 1.15 }}
            >
              Sign in
            </h1>
            <p className="mt-2 text-action leading-[1.55] text-ink-muted">
              Your wallets, categories and history are where you left them.
            </p>
          </div>
        </div>

        <div className="mt-[30px] flex flex-col gap-3.5">
          <FormField
            label="Email"
            invalid={emailBad || Boolean(error)}
            icon={<IconMail size={19} stroke={2} />}
          >
            <input
              ref={emailRef}
              type="email"
              inputMode="email"
              autoComplete="username"
              enterKeyHint="next"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="you@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                // The message names the pair, so any edit to either clears it.
                setError(null)
              }}
              onBlur={() => setEmailTouched(true)}
              className={input}
            />
          </FormField>

          <div>
            <FormField
              label="Password"
              invalid={Boolean(error)}
              icon={<IconLock size={19} stroke={2} />}
            >
              <input
                type={reveal ? 'text' : 'password'}
                autoComplete="current-password"
                enterKeyHint="go"
                placeholder="••••••••"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setError(null)
                }}
                className={input}
                style={reveal ? undefined : { letterSpacing: '.18em' }}
              />
              {/* 44px of hit area around a 19px glyph, and it holds focus so the
                  tap is not spent dismissing the keyboard. */}
              <button
                type="button"
                aria-label={reveal ? 'Hide password' : 'Show password'}
                aria-pressed={reveal}
                onMouseDown={keepFocus}
                onClick={() => setReveal((r) => !r)}
                className="relative flex-none text-ink-faint after:absolute after:-inset-3 after:content-['']"
              >
                {reveal ? <IconEyeOff size={19} stroke={2} /> : <IconEye size={19} stroke={2} />}
              </button>
            </FormField>

            {error && (
              <p role="alert" className="mt-2 px-1 text-value text-expense">
                {error}
              </p>
            )}
            {!error && emailBad && (
              <p role="alert" className="mt-2 px-1 text-value text-expense">
                That does not look like an email address.
              </p>
            )}
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={stayIn}
            onClick={() => setStayIn((s) => !s)}
            className="relative flex size-[22px] flex-none items-center justify-center rounded-[7px] after:absolute after:-inset-[11px] after:content-['']"
            style={
              stayIn
                ? { background: 'var(--color-accent)', color: 'var(--color-accent-fg)' }
                : { border: '1.5px solid var(--color-ink-dim)' }
            }
          >
            {stayIn && <IconCheck size={14} stroke={2.5} />}
          </button>
          <span className="flex-1 text-prose text-ink-muted">Keep me signed in</span>
        </div>

        <button
          type="submit"
          disabled={!ready}
          className="mt-5 flex w-full items-center justify-center rounded-field py-4 text-row font-semibold transition-transform duration-[90ms] active:scale-[.98] disabled:opacity-45 disabled:active:scale-100"
          style={{ background: 'var(--color-accent)', color: 'var(--color-accent-fg)' }}
        >
          {busy ? (
            <IconLoader2 size={20} stroke={2.5} className="motion-safe:animate-spin" />
          ) : (
            'Sign in'
          )}
        </button>
      </form>

      {/* Sign-ups are disabled — there is one account, made by hand. Saying so
          is more use than a "Create one" link that cannot work. */}
      <p
        className="absolute inset-x-0 text-center text-prose text-ink-faint"
        style={{ bottom: 'max(env(safe-area-inset-bottom, 0px), 34px)' }}
      >
        A single-account app. Sign-ups are closed.
      </p>
    </div>
  )
}
