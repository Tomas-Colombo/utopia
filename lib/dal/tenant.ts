import { cache } from 'react'
import { headers } from 'next/headers'
import { AuthorizationError } from './errors'
import { createServerClient } from './supabase'
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
 * Wrapped in React's `cache()` so repeated calls within the same request
 * render pass share one verified result instead of re-querying the DB.
 */
export const verifyTenantMatch = cache(
  async (subdomainFromHeader: string | null): Promise<void> => {
    if (!subdomainFromHeader) {
      throw new AuthorizationError('tenant-mismatch')
    }

    const { tenantId } = await verifySession()
    const supabase = await createServerClient()
    const { data } = await supabase
      .from('tenant')
      .select('id_tenant')
      .eq('subdominio', subdomainFromHeader)
      .single()

    if (!data || data.id_tenant !== tenantId) {
      throw new AuthorizationError('tenant-mismatch')
    }
  },
)
