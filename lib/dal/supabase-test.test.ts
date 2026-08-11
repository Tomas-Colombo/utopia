import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn().mockReturnValue({ from: vi.fn() }),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: createClientMock,
}))

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  vi.clearAllMocks()
  process.env = { ...ORIGINAL_ENV }
})

describe('lib/dal/supabase-test — test-database client factory', () => {
  it('createServiceRoleTestClient reads ONLY the _TEST service-role vars', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL_TEST = 'http://127.0.0.1:54321'
    process.env.SUPABASE_SERVICE_ROLE_KEY_TEST = 'service-role-key-test'

    const { createServiceRoleTestClient } = await import('./supabase-test')
    expect(() => createServiceRoleTestClient()).not.toThrow()
    expect(createClientMock).toHaveBeenCalledWith(
      'http://127.0.0.1:54321',
      'service-role-key-test',
      expect.anything(),
    )
  })

  it('names the variable that is actually missing, not a fixed pair', async () => {
    // A single hard-coded message that always blamed the URL and the
    // service-role key sent readers looking for variables that were already
    // set, when the absent one was the anon key.
    process.env.NEXT_PUBLIC_SUPABASE_URL_TEST = 'http://127.0.0.1:54321'
    process.env.SUPABASE_SERVICE_ROLE_KEY_TEST = 'service-role-key-test'
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_TEST

    const { createAnonTestClient } = await import('./supabase-test')
    expect(() => createAnonTestClient()).toThrow(/Missing NEXT_PUBLIC_SUPABASE_ANON_KEY_TEST/)
  })

  it('createServiceRoleTestClient throws naming the URL when it is absent', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL_TEST
    process.env.SUPABASE_SERVICE_ROLE_KEY_TEST = 'service-role-key-test'

    const { createServiceRoleTestClient } = await import('./supabase-test')
    expect(() => createServiceRoleTestClient()).toThrow(/Missing NEXT_PUBLIC_SUPABASE_URL_TEST/)
  })

  it('createServiceRoleTestClient throws naming the service-role key when it is absent', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL_TEST = 'http://127.0.0.1:54321'
    delete process.env.SUPABASE_SERVICE_ROLE_KEY_TEST

    const { createServiceRoleTestClient } = await import('./supabase-test')
    expect(() => createServiceRoleTestClient()).toThrow(/Missing SUPABASE_SERVICE_ROLE_KEY_TEST/)
  })

  it('every client disables session persistence', async () => {
    // Regression guard. These suites run under jsdom, where supabase-js finds
    // a real `localStorage` and, left at its defaults, persists any session it
    // creates. One `signInWithPassword` then leaked the user's token into
    // every client built afterwards — the service_role client included, which
    // quietly stopped bypassing RLS and failed with 42501 in an unrelated test.
    process.env.NEXT_PUBLIC_SUPABASE_URL_TEST = 'http://127.0.0.1:54321'
    process.env.SUPABASE_SERVICE_ROLE_KEY_TEST = 'service-role-key-test'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_TEST = 'anon-key-test'

    const { createAnonTestClient, createServiceRoleTestClient } = await import('./supabase-test')

    createServiceRoleTestClient()
    createAnonTestClient()
    createAnonTestClient('user-jwt-123')

    expect(createClientMock).toHaveBeenCalledTimes(3)
    for (const call of createClientMock.mock.calls) {
      expect(call[2]).toMatchObject({
        auth: { persistSession: false, autoRefreshToken: false },
      })
    }
  })

  it('createAnonTestClient does not attach an Authorization header without a jwt', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL_TEST = 'http://127.0.0.1:54321'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_TEST = 'anon-key-test'

    const { createAnonTestClient } = await import('./supabase-test')
    createAnonTestClient()

    expect(createClientMock).toHaveBeenCalledWith(
      'http://127.0.0.1:54321',
      'anon-key-test',
      expect.not.objectContaining({ global: expect.anything() }),
    )
  })

  it('createAnonTestClient(jwt) attaches the JWT as a Bearer Authorization header', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL_TEST = 'http://127.0.0.1:54321'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_TEST = 'anon-key-test'

    const { createAnonTestClient } = await import('./supabase-test')
    createAnonTestClient('user-jwt-123')

    expect(createClientMock).toHaveBeenCalledWith(
      'http://127.0.0.1:54321',
      'anon-key-test',
      expect.objectContaining({
        global: { headers: { Authorization: 'Bearer user-jwt-123' } },
      }),
    )
  })

  it('createAnonTestClient throws naming the URL when it is absent', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL_TEST
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_TEST = 'anon-key-test'

    const { createAnonTestClient } = await import('./supabase-test')
    expect(() => createAnonTestClient()).toThrow(/Missing NEXT_PUBLIC_SUPABASE_URL_TEST/)
  })
})
