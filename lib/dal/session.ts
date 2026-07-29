import { cache } from 'react'
import { AuthorizationError } from './errors'
import { createServerClient } from './supabase'

/**
 * Shape of `rol.permisos` (JSONB in DB):
 *   { [moduloCodigo: string]: string[] }
 * e.g. { inventario: ['ver', 'crear'], ventas: ['ver'] }.
 * `undefined` means the role row was not loaded yet (fail-closed callers
 * MUST treat it as "no permissions").
 */
export type RolePermissions = Record<string, string[]>

export interface Session {
  user: { id: string; email: string }
  tenantId: string
  /** `rol.id_rol` for the authenticated user; null if the user has no role assigned yet. */
  rolId: string | null
  /** `rol.nombre` for display purposes; null when `rolId` is null. */
  rolNombre: string | null
  /** `rol.permisos` JSONB, normalized to an object. Empty object if role has none. */
  permisos: RolePermissions
}

/**
 * Decodes the middle (payload) segment of a JWT and returns its claims.
 * No `jose` dependency is available and this slice may not add new deps
 * (per Slice 5 apply instructions), so this is a plain base64url decode —
 * sufficient here because `getUser()` (below) already re-validated the
 * token against Supabase server-side before this ever runs; this function
 * only needs to READ the already-trusted `tenant_id` claim, not verify a
 * signature.
 */
function decodeJwtClaims(jwt: string): Record<string, unknown> {
  const payload = jwt.split('.')[1]
  if (!payload) return {}
  try {
    const json = Buffer.from(payload, 'base64url').toString('utf8')
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    return {}
  }
}

/**
 * Slice 5 version (design §5). The Auth Hook (`00008_auth_hook_tenant_id.sql`)
 * sets `tenant_id` as a top-level JWT CLAIM, not `app_metadata` — so the
 * primary path decodes the session's access token. `user.app_metadata?.tenant_id`
 * is kept as a backward-compat fallback (e.g. stale cached sessions issued
 * before this slice); if BOTH are missing, fail closed via
 * `AuthorizationError('no-session')` (REQ-AUTH-10) — callers decide whether
 * to redirect or degrade gracefully.
 *
 * Wrapped in React's `cache()` so multiple Server Components/Actions in the
 * same request render pass share one verified session instead of hitting
 * Supabase auth repeatedly.
 */
export const verifySession = cache(async (): Promise<Session> => {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new AuthorizationError('no-session')
  }

  const {
    data: { session },
  } = await supabase.auth.getSession()

  const claimTenantId = session?.access_token
    ? (decodeJwtClaims(session.access_token).tenant_id as string | undefined)
    : undefined

  const tenantId = claimTenantId ?? (user.app_metadata?.tenant_id as string | undefined)
  if (!tenantId) {
    throw new AuthorizationError('no-session')
  }

  // Load role + permissions in the same session-verification pass so the
  // guard (`requireModuleRole`) never needs a second round-trip. RLS on
  // `usuario` + `rol` scopes this to the current tenant automatically.
  //
  // If the user row is missing or has no role, we DO NOT fail here — the
  // session is valid, just unprivileged. The guard fails-closed later when
  // any protected action is attempted.
  let rolId: string | null = null
  let rolNombre: string | null = null
  let permisos: RolePermissions = {}

  const { data: usuarioRow } = await supabase
    .from('usuario')
    .select('id_rol, rol:rol(id_rol, nombre, permisos)')
    .eq('id_usuario', user.id)
    .maybeSingle<{
      id_rol: string | null
      rol: { id_rol: string; nombre: string; permisos: RolePermissions | null } | null
    }>()

  if (usuarioRow?.rol) {
    rolId = usuarioRow.rol.id_rol
    rolNombre = usuarioRow.rol.nombre
    permisos = usuarioRow.rol.permisos ?? {}
  } else if (usuarioRow?.id_rol) {
    // Row exists but the join returned null (RLS on `rol` denied it?).
    // Record the id but treat as no permissions.
    rolId = usuarioRow.id_rol
  }

  return {
    user: { id: user.id, email: user.email ?? '' },
    tenantId,
    rolId,
    rolNombre,
    permisos,
  }
})
