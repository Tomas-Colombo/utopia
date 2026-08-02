import { beforeEach, describe, expect, it, vi } from 'vitest'

const { verifySessionMock, headersMock } = vi.hoisted(() => ({
  verifySessionMock: vi.fn(),
  headersMock: vi.fn(),
}))

vi.mock('./session', () => ({
  verifySession: verifySessionMock,
}))

vi.mock('next/headers', () => ({
  headers: headersMock,
}))

/**
 * Since 00041 the subdomain→tenant confirmation happens inside
 * `sp_session_context` and arrives on the session as `subdominioOk`
 * (see lib/dal/session.ts). `verifyTenantMatch` no longer queries the
 * `tenant` table itself — it enforces the already-verified flag.
 */
function sessionWith(subdominioOk: boolean) {
  return {
    user: { id: 'u1', email: 'a@b.com' },
    tenantId: 'tenant-a',
    rolId: null,
    rolNombre: null,
    permisos: {},
    modulosHabilitados: [],
    subdominioOk,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  // verifyTenantMatch is wrapped in React's cache() — reset the module graph
  // per test so each test gets a fresh, unmemoized function (same reason as
  // lib/dal/session.test.ts).
  vi.resetModules()
})

describe('verifyTenantMatch (design §7, REQ-TR-05, spec tenant-resolution.md 3.4)', () => {
  it('throws tenant-mismatch when the subdomain header is null', async () => {
    const { verifyTenantMatch } = await import('./tenant')

    await expect(verifyTenantMatch(null)).rejects.toMatchObject({
      name: 'AuthorizationError',
      reason: 'tenant-mismatch',
    })
    expect(verifySessionMock).not.toHaveBeenCalled()
  })

  it('throws tenant-mismatch when the subdomain header is an empty string', async () => {
    const { verifyTenantMatch } = await import('./tenant')

    await expect(verifyTenantMatch('')).rejects.toMatchObject({ reason: 'tenant-mismatch' })
  })

  it('throws tenant-mismatch when no tenant matches the subdomain', async () => {
    verifySessionMock.mockResolvedValue(sessionWith(false))

    const { verifyTenantMatch } = await import('./tenant')

    await expect(verifyTenantMatch('unknown-sub')).rejects.toMatchObject({
      reason: 'tenant-mismatch',
    })
  })

  it('throws tenant-mismatch when the resolved tenant does not match the session tenantId (spoofing, spec 3.4)', async () => {
    // A subdomain belonging to ANOTHER tenant never sets `subdominioOk`:
    // sp_session_context only returns true when the tenant row matching the
    // subdomain is the SAME tenant as the JWT claim.
    verifySessionMock.mockResolvedValue(sessionWith(false))

    const { verifyTenantMatch } = await import('./tenant')

    await expect(verifyTenantMatch('other-tenant-sub')).rejects.toMatchObject({
      reason: 'tenant-mismatch',
    })
  })

  it('passes (resolves void) when the resolved tenant matches the session tenantId', async () => {
    verifySessionMock.mockResolvedValue(sessionWith(true))

    const { verifyTenantMatch } = await import('./tenant')

    await expect(verifyTenantMatch('acme')).resolves.toBeUndefined()
  })
})

describe('getTenantSubdomainFromHeaders', () => {
  it('returns the x-utopia-tenant-subdomain header value when present', async () => {
    headersMock.mockResolvedValue({
      get: (key: string) => (key === 'x-utopia-tenant-subdomain' ? 'acme' : null),
    })

    const { getTenantSubdomainFromHeaders } = await import('./tenant')
    await expect(getTenantSubdomainFromHeaders()).resolves.toBe('acme')
  })

  it('returns null when the header is absent', async () => {
    headersMock.mockResolvedValue({ get: () => null })

    const { getTenantSubdomainFromHeaders } = await import('./tenant')
    await expect(getTenantSubdomainFromHeaders()).resolves.toBeNull()
  })
})
