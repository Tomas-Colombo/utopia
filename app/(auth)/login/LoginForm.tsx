'use client'

import { useActionState } from 'react'
import { loginAction, type LoginActionState } from './actions'

const initialState: LoginActionState = { ok: false }

/**
 * Login form (design §5, spec 3.1/3.2). `useActionState` is React 19's
 * current API (replaces the deprecated `useFormState`, see Next.js 16
 * upgrade guide) — exposes `[state, formAction, pending]`.
 */
export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState)

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-sm font-medium text-text">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-text"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="text-sm font-medium text-text">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-text"
        />
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-pink-strong">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-accent-pink px-4 py-2 text-sm font-semibold text-sidebar disabled:opacity-60"
      >
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}
