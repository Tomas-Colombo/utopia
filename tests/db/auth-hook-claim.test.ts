import { describe, expect, it } from 'vitest'
import { createServiceRoleTestClient } from '@/lib/dal/supabase-test'
import { hasTestDb, withScopedTenant } from './_helpers'

/**
 * Manually decodes the middle (payload) segment of a JWT — no `jose`
 * dependency available and this slice may not add new deps (per apply
 * instructions). Mirrors the approach used by `lib/dal/session.ts`.
 */
function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const payload = jwt.split('.')[1]
  const json = Buffer.from(payload, 'base64url').toString('utf8')
  return JSON.parse(json) as Record<string, unknown>
}

describe.skipIf(!hasTestDb)('auth hook — 00008 tenant_id claim (needs Supabase test project + hook registered)', () => {
  it('signed-in user with a matching usuario row gets tenant_id claim on the JWT (REQ-AUTH-02/03)', async () => {
    const serviceRole = createServiceRoleTestClient()

    const { data: tenant } = await serviceRole
      .from('tenant')
      .insert({ nombre_comercial: 'Auth hook claim', subdominio: withScopedTenant('auth-hook') })
      .select('id_tenant')
      .single()
    if (!tenant) throw new Error('fixture insert failed: tenant is null')

    const email = `${withScopedTenant('user')}@example.com`
    const { data: authUser } = await serviceRole.auth.admin.createUser({
      email,
      password: 'Fixture-Password-1!',
      email_confirm: true,
    })
    if (!authUser?.user) throw new Error('fixture auth user creation failed')

    const { data: rol } = await serviceRole
      .from('rol')
      .insert({ id_tenant: tenant.id_tenant, nombre: 'Administrador', permisos: {} })
      .select('id_rol')
      .single()
    if (!rol) throw new Error('fixture insert failed: rol is null')

    await serviceRole.from('usuario').insert({
      id_usuario: authUser.user.id,
      id_tenant: tenant.id_tenant,
      email,
      nombre_completo: 'Fixture User',
      id_rol: rol.id_rol,
    })

    const { data: signIn, error } = await serviceRole.auth.signInWithPassword({
      email,
      password: 'Fixture-Password-1!',
    })

    expect(error).toBeNull()
    const claims = decodeJwtPayload(signIn?.session?.access_token ?? '')
    expect(claims.tenant_id).toBe(tenant.id_tenant)
  })

  it('signed-in user WITHOUT a matching usuario row has no tenant_id claim', async () => {
    const serviceRole = createServiceRoleTestClient()

    const email = `${withScopedTenant('orphan')}@example.com`
    const { data: authUser } = await serviceRole.auth.admin.createUser({
      email,
      password: 'Fixture-Password-1!',
      email_confirm: true,
    })
    if (!authUser?.user) throw new Error('fixture auth user creation failed')

    const { data: signIn, error } = await serviceRole.auth.signInWithPassword({
      email,
      password: 'Fixture-Password-1!',
    })

    expect(error).toBeNull()
    const claims = decodeJwtPayload(signIn?.session?.access_token ?? '')
    expect(claims.tenant_id).toBeUndefined()
  })
})
