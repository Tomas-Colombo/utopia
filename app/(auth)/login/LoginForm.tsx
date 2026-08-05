'use client'

import { useActionState } from 'react'
import { loginAction, type LoginActionState } from './actions'

const initialState: LoginActionState = { ok: false }

/**
 * Fields float directly on the animated backdrop now that the auth card is
 * gone, so they carry their own surface: a translucent panel over a blur,
 * plus the stronger border token. That keeps the input affordance readable
 * against whatever the shader happens to be drawing underneath.
 */
const FIELD_CLASS =
  'rounded-md border border-border-2 bg-panel/70 px-3 py-2 text-sm text-text backdrop-blur-sm transition-colors focus-visible:border-rosa focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rosa-bg'

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
          Correo electrónico
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className={FIELD_CLASS}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="text-sm font-medium text-text">
          Contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={FIELD_CLASS}
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
        {pending ? 'Ingresando…' : 'Ingresar'}
      </button>
    </form>
  )
}
