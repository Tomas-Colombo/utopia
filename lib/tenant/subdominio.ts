/**
 * Subdomain rules — the SINGLE source of truth shared by the proxy (which
 * decides whether a host resolves to a tenant) and tenant provisioning
 * (which decides whether a subdomain may be handed to a customer).
 *
 * These two MUST agree. If provisioning accepted a subdomain the proxy
 * treats as reserved, the tenant would be created and then be permanently
 * unreachable — no header injected, so `verifyTenantMatch` fails closed on
 * every request. That failure only shows up in production, on a paying
 * customer's first login.
 *
 * Deliberately dependency-free: `proxy.ts` may be deployed separately from
 * the app runtime, so anything it imports must carry no transitive weight.
 */

/**
 * Subdomains the platform keeps for itself. `admin` is reserved even though
 * no platform surface exists yet — reserving it now costs nothing, and
 * reclaiming it from a customer later costs a migration plus their bookmarks.
 */
export const RESERVED_SUBDOMINIOS = ['www', 'admin', 'api', 'app'] as const

/** Max length of a single DNS label (RFC 1035). */
const MAX_LEN = 63
const MIN_LEN = 3

/**
 * Lowercase alphanumerics and hyphens, starting and ending with an
 * alphanumeric. Rejects the leading/trailing hyphen that would make an
 * invalid DNS label, and uppercase, which would not round-trip through a
 * case-insensitive Host header.
 */
const SHAPE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/

export type SubdominioCheck =
  | { ok: true }
  | { ok: false; reason: 'vacio' | 'muy-corto' | 'muy-largo' | 'formato' | 'reservado' }

/**
 * Validates a subdomain for tenant provisioning. Callers should pass the
 * raw user input — normalization is NOT applied here on purpose, so a value
 * that only differs by case or whitespace is rejected loudly instead of
 * being silently rewritten into something the operator did not type.
 */
export function validarSubdominio(subdominio: string): SubdominioCheck {
  if (!subdominio) return { ok: false, reason: 'vacio' }
  if (subdominio.length < MIN_LEN) return { ok: false, reason: 'muy-corto' }
  if (subdominio.length > MAX_LEN) return { ok: false, reason: 'muy-largo' }
  if (!SHAPE.test(subdominio)) return { ok: false, reason: 'formato' }
  if ((RESERVED_SUBDOMINIOS as readonly string[]).includes(subdominio)) {
    return { ok: false, reason: 'reservado' }
  }
  return { ok: true }
}

export const SUBDOMINIO_REASON_LABEL: Record<
  Extract<SubdominioCheck, { ok: false }>['reason'],
  string
> = {
  vacio: 'El subdominio es obligatorio',
  'muy-corto': `El subdominio debe tener al menos ${MIN_LEN} caracteres`,
  'muy-largo': `El subdominio no puede superar los ${MAX_LEN} caracteres`,
  formato:
    'Solo minúsculas, números y guiones; debe empezar y terminar con letra o número',
  reservado: `Ese subdominio está reservado por la plataforma (${RESERVED_SUBDOMINIOS.join(', ')})`,
}
