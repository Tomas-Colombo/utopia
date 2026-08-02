import { cache } from 'react'
import { headers } from 'next/headers'
import { AuthorizationError } from './errors'
import { verifySession } from './session'

/**
 * Reads the proxy-injected, UNVERIFIED tenant subdomain hint
 * (`x-utopia-tenant-subdomain`, design §6) from the current request's
 * headers. Returns `null` when absent (e.g. reserved subdomain, bare root
 * domain, or a Server Action invoked on a path the proxy matcher excludes —
 * design §6 execution-order note).
 */
export async function getTenantSubdomainFromHeaders(): Promise<string | null> {
  const headerStore = await headers()
  return headerStore.get('x-utopia-tenant-subdomain')
}

/**
 * Authoritative tenant check (design §7, REQ-TR-05/06). The proxy header is
 * only a hint — this function independently confirms the authenticated
 * user's session `tenantId` actually belongs to the tenant identified by
 * `subdomainFromHeader`, never trusting the header alone.
 *
 * Fail-closed on every branch (missing header, unknown subdomain, or a
 * subdomain that resolves to a DIFFERENT tenant than the session) via
 * `AuthorizationError('tenant-mismatch')` (spec tenant-resolution.md 3.4,
 * threat-matrix "subdomain spoofing").
 *
 * La confirmación contra la DB ya viene resuelta en `verifySession()`
 * (`sp_session_context`, 00041): `subdominioOk` es true solo si existe un
 * tenant con ESE subdominio cuyo id coincide con el `tenant_id` del JWT —
 * la misma condición que se comparaba acá con un query aparte. Esta función
 * ya no pega a la DB; el chequeo no se debilitó, se movió.
 *
 * Wrapped in React's `cache()` so repeated calls within the same request
 * render pass share one verified result.
 */
export const verifyTenantMatch = cache(
  async (subdomainFromHeader: string | null): Promise<void> => {
    if (!subdomainFromHeader) {
      throw new AuthorizationError('tenant-mismatch')
    }

    const { subdominioOk } = await verifySession()
    if (!subdominioOk) {
      throw new AuthorizationError('tenant-mismatch')
    }
  },
)
