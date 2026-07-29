import { NextResponse, type NextRequest } from 'next/server'

/**
 * Tenant Resolution — proxy.ts (Next.js 16 file convention; replaces the
 * deprecated `middleware.ts`). Design §6 / spec `tenant-resolution.md`
 * REQ-TR-01 through REQ-TR-11.
 *
 * This is an OPTIMISTIC, non-authoritative step (REQ-TR-03): it never
 * queries the database. It only parses the `host` header and, for a
 * plausible tenant subdomain, injects an UNVERIFIED hint header
 * (`x-utopia-tenant-subdomain`) for the DAL to re-verify. The DAL's
 * `verifyTenantMatch()` (lib/dal/tenant.ts) is the authoritative check —
 * Next.js 16 Server Actions can bypass the proxy matcher entirely, so
 * isolation is enforced at the DAL, not here (design §6 execution-order
 * note).
 */

const RESERVED = new Set(['www', 'admin', 'api', 'app'])
const ROOT_PROD = process.env.UTOPIA_ROOT_DOMAIN ?? 'utopia.app'
const ROOT_DEV = process.env.UTOPIA_ROOT_DOMAIN_DEV ?? 'localhost'

export function proxy(request: NextRequest) {
  const host = (request.headers.get('host') ?? '').split(':')[0] // strip port
  const root = host.endsWith(ROOT_DEV) ? ROOT_DEV : ROOT_PROD
  const sub = host.endsWith('.' + root) ? host.slice(0, -(root.length + 1)) : ''

  // Bare root domain or a reserved subdomain → landing, NOT a tenant
  // (REQ-TR-09/11). No header injected: downstream code must never treat
  // this request as tenant-scoped.
  if (!sub || RESERVED.has(sub)) {
    return NextResponse.next()
  }

  // Valid-looking subdomain → inject the UNVERIFIED hint header (REQ-TR-04).
  const headers = new Headers(request.headers)
  headers.set('x-utopia-tenant-subdomain', sub)
  return NextResponse.next({ request: { headers } })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|api/health|favicon.ico|.*\\..*).*)'],
}
