'use server'

import { AuthorizationError } from '@/lib/dal/errors'
import { verifySession } from '@/lib/dal/session'
import { createServerClient } from '@/lib/dal/supabase'
import type { Theme } from './ThemeProvider'
import { buildThemeConfiguracionPayload } from './themeConfiguracionPayload'

export type PersistThemeResult = { ok: true } | { ok: false; reason: string }

/**
 * Theme persistence is best-effort UX, not critical data, so every failure
 * mode (no session, DB error, unexpected throw) resolves to
 * `{ ok: false, reason }` instead of throwing — the fire-and-forget caller in
 * `ThemeToggle` must never crash the UI over a colour preference.
 *
 * That is also why the unit test mocks Supabase rather than hitting a real
 * project: what matters here is that no failure path escapes, and each one is
 * cheaper to force with a mock than with a live database.
 */
export async function persistThemePreference(theme: Theme): Promise<PersistThemeResult> {
  let session: Awaited<ReturnType<typeof verifySession>>
  try {
    session = await verifySession()
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return { ok: false, reason: error.reason }
    }
    return { ok: false, reason: 'no-session' }
  }

  try {
    const supabase = await createServerClient()
    const { error } = await supabase
      .from('configuracion')
      .upsert({
        ...buildThemeConfiguracionPayload(theme),
        id_tenant: session.tenantId,
        tipo: 'string',
      })
      .select()
      .single()

    if (error) {
      return { ok: false, reason: error.message }
    }
    return { ok: true }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'unknown-error' }
  }
}
