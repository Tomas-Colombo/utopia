import { beforeEach, describe, expect, it, vi } from 'vitest'

const { verifySessionMock, createServerClientMock, headersMock } = vi.hoisted(() => ({
  verifySessionMock: vi.fn(),
  createServerClientMock: vi.fn(),
  headersMock: vi.fn(),
}))

vi.mock('./session', () => ({
  verifySession: verifySessionMock,
}))

vi.mock('./supabase', () => ({
  createServerClient: createServerClientMock,
}))

vi.mock('next/headers', () => ({
  headers: headersMock,
}))

/** Builds a mocked `.from('tenant').select().eq().single()` chain. */
function tenantQueryResult(data: { id_tenant: string } | null) {
  const single = vi.fn().mockResolvedValue({ data, error: null })
  const eq = vi.fn().mockReturnValue({ single })
  const select = vi.fn().mockReturnValue({ eq })
  const from = vi.fn().mockReturnValue({ select })
  return { from, select, eq, single }
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
    verifySessionMock.mockResolvedValue({ user: { id: 'u1', email: 'a@b.com' }, tenantId: 'tenant-a' })
    const query = tenantQueryResult(null)
    createServerClientMock.mockResolvedValue({ from: query.from })

    const { verifyTenantMatch } = await import('./tenant')

    await expect(verifyTenantMatch('unknown-sub')).rejects.toMatchObject({ reason: 'tenant-mismatch' })
    expect(query.from).toHaveBeenCalledWith('tenant')
    expect(query.eq).toHaveBeenCalledWith('subdominio', 'unknown-sub')
  })

  it('throws tenant-mismatch when the resolved tenant does not match the session tenantId (spoofing, spec 3.4)', async () => {
    verifySessionMock.mockResolvedValue({ user: { id: 'u1', email: 'a@b.com' }, tenantId: 'tenant-a' })
    const query = tenantQueryResult({ id_tenant: 'tenant-b' })
    createServerClientMock.mockResolvedValue({ from: query.from })

    const { verifyTenantMatch } = await import('./tenant')

    await expect(verifyTenantMatch('other-tenant-sub')).rejects.toMatchObject({ reason: 'tenant-mismatch' })
  })

  it('passes (resolves void) when the resolved tenant matches the session tenantId', async () => {
    verifySessionMock.mockResolvedValue({ user: { id: 'u1', email: 'a@b.com' }, tenantId: 'tenant-a' })
    const query = tenantQueryResult({ id_tenant: 'tenant-a' })
    createServerClientMock.mockResolvedValue({ from: query.from })

    const { verifyTenantMatch } = await import('./tenant')

    await expect(verifyTenantMatch('acme')).resolves.toBeUndefined()
  })
})

describe('getTenantSubdomainFromHeaders', () => {
  it('returns the x-utopia-tenant-subdomain header value when present', async () => {
    headersMock.mockResolvedValue({ get: (key: string) => (key === 'x-utopia-tenant-subdomain' ? 'acme' : null) })

    const { getTenantSubdomainFromHeaders } = await import('./tenant')
    await expect(getTenantSubdomainFromHeaders()).resolves.toBe('acme')
  })

  it('returns null when the header is absent', async () => {
    headersMock.mockResolvedValue({ get: () => null })

    const { getTenantSubdomainFromHeaders } = await import('./tenant')
    await expect(getTenantSubdomainFromHeaders()).resolves.toBeNull()
  })
})
