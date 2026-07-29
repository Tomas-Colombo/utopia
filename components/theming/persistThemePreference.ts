'use server'

import { AuthorizationError } from '@/lib/dal/errors'
import { verifySession } from '@/lib/dal/session'
import { createServerClient } from '@/lib/dal/supabase'
import type { Theme } from './ThemeProvider'

export interface ThemeConfiguracionPayload {
  seccion: 'perfil'
  clave: 'theme'
  valor: Theme
}

/**
 * Builds the exact payload shape the `configuracion` DAL write consumes:
 * `configuracion(seccion='perfil', clave='theme', valor=theme)`
 * (design §8.6, REQ-DS-06). Pure and DB-free so the contract stays
 * unit-testable independent of the Supabase round-trip below.
 */
export function buildThemeConfiguracionPayload(theme: Theme): ThemeConfiguracionPayload {
  return { seccion: 'perfil', clave: 'theme', valor: theme }
}

export type PersistThemeResult = { ok: true } | { ok: false; reason: string }

/**
 * Half-wire (task 4.7): the code path is complete, typed, and tested with a
 * mocked Supabase client — but the real end-to-end write only happens once
 * Slice 4's migrations exist on a live project (postponed to end of
 * Slice 8, see apply-progress). Theme persistence is best-effort UX, not
 * critical data, so every failure mode (no session, DB error, unexpected
 * throw) resolves to `{ ok: false, reason }` instead of throwing — the
 * fire-and-forget caller in `ThemeToggle` must never crash the UI.
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
