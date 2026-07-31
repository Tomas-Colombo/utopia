import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * DAL-focused unit test for the half-wire (task 4.7): real `verifySession`
 * + `createServerClient` code paths, both fully mocked since the real
 * `configuracion` table only exists once Slice 4's migrations are applied
 * to a live Supabase project (postponed — see apply-progress). The
 * component-level "click toggles theme" behavior is covered separately in
 * `ThemeToggle.test.tsx`, which never mocks this module.
 */
const { verifySessionMock, createServerClientMock, singleMock, upsertMock, fromMock } = vi.hoisted(
  () => {
    const singleMock = vi.fn()
    const selectMock = vi.fn(() => ({ single: singleMock }))
    const upsertMock = vi.fn(() => ({ select: selectMock }))
    const fromMock = vi.fn(() => ({ upsert: upsertMock }))
    return {
      verifySessionMock: vi.fn(),
      createServerClientMock: vi.fn(),
      singleMock,
      upsertMock,
      fromMock,
    }
  },
)

vi.mock('@/lib/dal/session', () => ({ verifySession: verifySessionMock }))
vi.mock('@/lib/dal/supabase', () => ({ createServerClient: createServerClientMock }))

beforeEach(() => {
  vi.clearAllMocks()
  createServerClientMock.mockResolvedValue({ from: fromMock })
  singleMock.mockResolvedValue({ data: { id_tenant: 'tenant-1' }, error: null })
})

describe('persistThemePreference — half-wire real DAL call (task 4.7, mocked Supabase)', () => {
  it('upserts configuracion with the exact buildThemeConfiguracionPayload shape and the session tenantId', async () => {
    verifySessionMock.mockResolvedValue({
      user: { id: 'user-1', email: 'a@b.com' },
      tenantId: 'tenant-1',
    })

    const { persistThemePreference } = await import('./persistThemePreference')
    const { buildThemeConfiguracionPayload } = await import('./themeConfiguracionPayload')

    const result = await persistThemePreference('dark')

    expect(verifySessionMock).toHaveBeenCalledTimes(1)
    expect(fromMock).toHaveBeenCalledWith('configuracion')
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        ...buildThemeConfiguracionPayload('dark'),
        id_tenant: 'tenant-1',
      }),
    )
    expect(result).toEqual({ ok: true })
  })

  it('returns {ok:false, reason:"no-session"} without throwing when there is no session', async () => {
    const { AuthorizationError } = await import('@/lib/dal/errors')
    verifySessionMock.mockRejectedValue(new AuthorizationError('no-session'))

    const { persistThemePreference } = await import('./persistThemePreference')

    await expect(persistThemePreference('light')).resolves.toEqual({
      ok: false,
      reason: 'no-session',
    })
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('returns {ok:false, reason} instead of throwing when the upsert itself fails', async () => {
    verifySessionMock.mockResolvedValue({
      user: { id: 'user-1', email: 'a@b.com' },
      tenantId: 'tenant-1',
    })
    singleMock.mockResolvedValue({ data: null, error: { message: 'db-write-failed' } })

    const { persistThemePreference } = await import('./persistThemePreference')

    await expect(persistThemePreference('dark')).resolves.toEqual({
      ok: false,
      reason: 'db-write-failed',
    })
  })
})
