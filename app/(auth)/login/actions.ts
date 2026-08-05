'use server'

import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/dal/supabase'

export interface LoginActionState {
  ok: boolean
  error?: string
}

/**
 * Login Server Action (design §5, REQ-AUTH-01/02). Delegates to Supabase
 * Auth's cookie-based `signInWithPassword` via the `@supabase/ssr` server
 * client — the Auth Hook (migration `00008`) stamps the `tenant_id` claim
 * on the resulting JWT, so nothing tenant-specific happens here.
 *
 * On failure, the raw Supabase error is never surfaced to the client (it
 * can reveal whether an email exists) — always a generic message
 * (spec 3.2).
 */
export async function loginAction(
  _prevState: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')

  if (!email || !password) {
    return { ok: false, error: 'El correo electrónico y la contraseña son obligatorios' }
  }

  const supabase = await createServerClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { ok: false, error: 'Credenciales inválidas' }
  }

  // El vendedor arranca en su módulo de trabajo, no en un dashboard.
  redirect('/ventas')
}
