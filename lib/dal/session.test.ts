import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getUserMock, getSessionMock, createServerClientMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  getSessionMock: vi.fn(),
  createServerClientMock: vi.fn(),
}))

vi.mock('./supabase', () => ({
  createServerClient: createServerClientMock,
}))

/** Builds an unsigned-but-well-formed JWT string with the given claims. */
function fakeJwt(claims: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
  return `${header}.${payload}.fixture-signature`
}

beforeEach(() => {
  vi.clearAllMocks()
  // `verifySession` is wrapped in React's `cache()`, which memoizes across
  // calls with no request-scope teardown outside a real render. Reset the
  // module graph per test so each test gets a fresh, unmemoized function.
  vi.resetModules()
  createServerClientMock.mockResolvedValue({
    auth: { getUser: getUserMock, getSession: getSessionMock },
  })
})

describe('verifySession (design §5, Slice 5 — JWT tenant_id claim decoding)', () => {
  it('returns user + tenantId decoded from the JWT tenant_id claim (Auth Hook path)', async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'a@b.com', app_metadata: {} } },
    })
    getSessionMock.mockResolvedValue({
      data: { session: { access_token: fakeJwt({ tenant_id: 'tenant-1' }) } },
    })

    const { verifySession } = await import('./session')
    await expect(verifySession()).resolves.toEqual({
      user: { id: 'user-1', email: 'a@b.com' },
      tenantId: 'tenant-1',
    })
  })

  it('falls back to app_metadata.tenant_id when no session token / claim is present (backward compat)', async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'a@b.com', app_metadata: { tenant_id: 'tenant-legacy' } } },
    })
    getSessionMock.mockResolvedValue({ data: { session: null } })

    const { verifySession } = await import('./session')
    await expect(verifySession()).resolves.toEqual({
      user: { id: 'user-1', email: 'a@b.com' },
      tenantId: 'tenant-legacy',
    })
  })

  it('throws AuthorizationError("no-session") when getUser() resolves no user', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })

    const { verifySession } = await import('./session')
    await expect(verifySession()).rejects.toMatchObject({
      name: 'AuthorizationError',
      reason: 'no-session',
    })
  })

  it('throws AuthorizationError("no-session") when both the JWT claim and app_metadata are missing (fail-closed, REQ-AUTH-10)', async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'a@b.com', app_metadata: {} } },
    })
    getSessionMock.mockResolvedValue({ data: { session: null } })

    const { verifySession } = await import('./session')
    await expect(verifySession()).rejects.toMatchObject({ reason: 'no-session' })
  })
})
