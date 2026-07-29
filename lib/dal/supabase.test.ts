import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createServerClientMock, createBrowserClientMock, cookiesMock } = vi.hoisted(() => ({
  createServerClientMock: vi.fn().mockReturnValue({ from: vi.fn() }),
  createBrowserClientMock: vi.fn().mockReturnValue({ from: vi.fn() }),
  cookiesMock: vi.fn(),
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: createServerClientMock,
  createBrowserClient: createBrowserClientMock,
}))

vi.mock('next/headers', () => ({
  cookies: cookiesMock,
}))

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  vi.clearAllMocks()
  process.env = { ...ORIGINAL_ENV }
  cookiesMock.mockResolvedValue({ getAll: () => [], set: vi.fn() })
})

describe('lib/dal/supabase — client factories (design §5)', () => {
  it('createServerClient resolves and forwards URL/anon key when env vars are present', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://dev.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'

    const { createServerClient } = await import('./supabase')
    await expect(createServerClient()).resolves.toBeDefined()

    expect(createServerClientMock).toHaveBeenCalledWith(
      'https://dev.supabase.co',
      'anon-key',
      expect.objectContaining({ cookies: expect.any(Object) }),
    )
  })

  it('createServerClient rejects with a clear message when NEXT_PUBLIC_SUPABASE_URL is missing', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'

    const { createServerClient } = await import('./supabase')
    await expect(createServerClient()).rejects.toThrow(/NEXT_PUBLIC_SUPABASE_URL/)
  })

  it('createBrowserClient does not throw when env vars are present', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://dev.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'

    const { createBrowserClient } = await import('./supabase')
    expect(() => createBrowserClient()).not.toThrow()
    expect(createBrowserClientMock).toHaveBeenCalledWith('https://dev.supabase.co', 'anon-key')
  })

  it('createBrowserClient throws a clear message when NEXT_PUBLIC_SUPABASE_ANON_KEY is missing', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://dev.supabase.co'
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    const { createBrowserClient } = await import('./supabase')
    expect(() => createBrowserClient()).toThrow(/NEXT_PUBLIC_SUPABASE_ANON_KEY/)
  })

  it('createServiceClient does not throw when the service role key is present', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://dev.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'

    const { createServiceClient } = await import('./supabase')
    expect(() => createServiceClient()).not.toThrow()
    expect(createServerClientMock).toHaveBeenCalledWith(
      'https://dev.supabase.co',
      'service-role-key',
      expect.any(Object),
    )
  })

  it('createServiceClient throws a clear message when SUPABASE_SERVICE_ROLE_KEY is missing', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://dev.supabase.co'
    delete process.env.SUPABASE_SERVICE_ROLE_KEY

    const { createServiceClient } = await import('./supabase')
    expect(() => createServiceClient()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/)
  })
})
