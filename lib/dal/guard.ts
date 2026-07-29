import { cache } from 'react'
import { AuthorizationError } from './errors'
import type { Session } from './session'
import { createServerClient } from './supabase'

/**
 * Double-check gate required by spec REQ-AG-03 / REQ-AG-06:
 *   1. `tenant_modulo.habilitado = true` for the current tenant and module.
 *   2. `session.permisos[moduloCodigo]` contains `accion`.
 *
 * Fails closed on any missing piece:
 *   - `module-disabled`  → module row absent OR `habilitado = false`
 *   - `no-permission`    → module OK, role has no permission for `accion`
 *   - `no-session`       → session has no `rolId` at all
 *
 * MUST be called on every tenant-scoped route/handler/server-action BEFORE
 * any read or write. RLS is a defense in depth, not a substitute.
 *
 * Cached per (tenantId, moduloCodigo) so multiple guards in the same render
 * pass share the DB round-trip. `accion` is checked in-memory from the
 * already-loaded session permisos, so it doesn't invalidate the cache.
 */
export async function requireModuleRole(
  session: Session,
  moduloCodigo: string,
  accion: string,
): Promise<void> {
  if (!session.rolId) {
    // Session verified but user has no role assigned yet — treat as
    // "no session" from a permissions standpoint. The UI should
    // redirect to an "awaiting-role" screen.
    throw new AuthorizationError('no-session')
  }

  const habilitado = await isModuloHabilitado(session.tenantId, moduloCodigo)
  if (!habilitado) {
    throw new AuthorizationError('module-disabled')
  }

  const acciones = session.permisos[moduloCodigo] ?? []
  if (!acciones.includes(accion)) {
    throw new AuthorizationError('no-permission')
  }
}

/**
 * Cached per (tenantId, moduloCodigo). RLS on `tenant_modulo` scopes the
 * query to the current tenant automatically; we still filter explicitly
 * as belt-and-suspenders.
 */
const isModuloHabilitado = cache(
  async (tenantId: string, moduloCodigo: string): Promise<boolean> => {
    const supabase = await createServerClient()
    const { data } = await supabase
      .from('tenant_modulo')
      .select('habilitado, modulo:modulo!inner(codigo)')
      .eq('id_tenant', tenantId)
      .eq('modulo.codigo', moduloCodigo)
      .maybeSingle<{ habilitado: boolean; modulo: { codigo: string } }>()

    return data?.habilitado === true
  },
)

/**
 * Convenience helper for UI layers that need to gate a button/link
 * WITHOUT throwing (e.g. hide "Nuevo producto" when the role lacks
 * `crear`). Server-side only — DO NOT trust for actual writes.
 */
export function hasPermission(
  session: Session,
  moduloCodigo: string,
  accion: string,
): boolean {
  const acciones = session.permisos[moduloCodigo] ?? []
  return acciones.includes(accion)
}

/**
 * Maps `AuthorizationError` to a stable HTTP-ish shape for Server Action
 * results (`{ ok: false, reason }`) and for `redirect()` targets in Server
 * Components. Callers decide what to do with the reason — this only
 * classifies it.
 */
export function classifyAuthError(error: unknown):
  | { kind: 'auth'; reason: AuthorizationError['reason'] }
  | { kind: 'unknown'; error: unknown } {
  if (error instanceof AuthorizationError) {
    return { kind: 'auth', reason: error.reason }
  }
  return { kind: 'unknown', error }
}
