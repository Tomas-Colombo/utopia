import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn().mockReturnValue({ from: vi.fn() }),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: createClientMock,
}))

const ORIGINAL_ENV = { ...process.env }
const MISSING_ENV_MESSAGE =
  'Missing NEXT_PUBLIC_SUPABASE_URL_TEST or SUPABASE_SERVICE_ROLE_KEY_TEST — set them in .env.local before running tests/db/*'

beforeEach(() => {
  vi.clearAllMocks()
  process.env = { ...ORIGINAL_ENV }
})

describe('lib/dal/supabase-test — Supabase cloud TEST-project factory (task 4.1)', () => {
  it('createServiceRoleTestClient reads ONLY the _TEST service-role vars', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL_TEST = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY_TEST = 'service-role-key-test'

    const { createServiceRoleTestClient } = await import('./supabase-test')
    expect(() => createServiceRoleTestClient()).not.toThrow()
    expect(createClientMock).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'service-role-key-test',
    )
  })

  it('createServiceRoleTestClient throws the exact missing-env message when the URL is absent', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL_TEST
    process.env.SUPABASE_SERVICE_ROLE_KEY_TEST = 'service-role-key-test'

    const { createServiceRoleTestClient } = await import('./supabase-test')
    expect(() => createServiceRoleTestClient()).toThrow(MISSING_ENV_MESSAGE)
  })

  it('createServiceRoleTestClient throws the exact missing-env message when the service-role key is absent', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL_TEST = 'https://test.supabase.co'
    delete process.env.SUPABASE_SERVICE_ROLE_KEY_TEST

    const { createServiceRoleTestClient } = await import('./supabase-test')
    expect(() => createServiceRoleTestClient()).toThrow(MISSING_ENV_MESSAGE)
  })

  it('createAnonTestClient reads the _TEST anon vars and does not attach an Authorization header without a jwt', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL_TEST = 'https://test.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_TEST = 'anon-key-test'

    const { createAnonTestClient } = await import('./supabase-test')
    expect(() => createAnonTestClient()).not.toThrow()
    expect(createClientMock).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'anon-key-test',
      undefined,
    )
  })

  it('createAnonTestClient(jwt) attaches the JWT as a Bearer Authorization header', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL_TEST = 'https://test.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_TEST = 'anon-key-test'

    const { createAnonTestClient } = await import('./supabase-test')
    createAnonTestClient('user-jwt-123')

    expect(createClientMock).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'anon-key-test',
      expect.objectContaining({
        global: { headers: { Authorization: 'Bearer user-jwt-123' } },
      }),
    )
  })

  it('createAnonTestClient throws the exact missing-env message when the URL is absent', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL_TEST
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_TEST = 'anon-key-test'

    const { createAnonTestClient } = await import('./supabase-test')
    expect(() => createAnonTestClient()).toThrow(MISSING_ENV_MESSAGE)
  })
})
