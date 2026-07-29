import { describe, expect, it } from 'vitest'
import { createAnonTestClient, createServiceRoleTestClient } from '@/lib/dal/supabase-test'
import { hasTestDb, withScopedTenant } from './_helpers'

/**
 * End-to-end cross-tenant isolation via REAL sign-in (design §12, spec
 * tenant-resolution.md, REQ-TI-10). Etapa 1 closer proof: creates two real
 * Supabase Auth tenants/users, signs in as user A, and asserts the anon
 * client carrying user A's real session (with the Auth Hook's `tenant_id`
 * claim) cannot read or write tenant B's `configuracion` rows. This proves
 * the proxy header + `verifyTenantMatch` + RLS + Auth Hook chain together,
 * end to end — not any single layer in isolation.
 *
 * DB testing postponed until end of Slice 8 — see apply-progress.
 */
describe.skipIf(!hasTestDb)('cross-tenant isolation — real sign-in (REQ-TI-10, Etapa 1 closer)', () => {
  /** Creates a tenant + rol + real auth.users + usuario row via service_role. */
  async function createTenantWithUser(prefix: string) {
    const serviceRole = createServiceRoleTestClient()

    const { data: tenant } = await serviceRole
      .from('tenant')
      .insert({ nombre_comercial: `Isolation ${prefix}`, subdominio: withScopedTenant(prefix) })
      .select('id_tenant')
      .single()
    if (!tenant) throw new Error('fixture insert failed: tenant is null')

    const { data: rol } = await serviceRole
      .from('rol')
      .insert({ id_tenant: tenant.id_tenant, nombre: 'Administrador', permisos: {} })
      .select('id_rol')
      .single()
    if (!rol) throw new Error('fixture insert failed: rol is null')

    const email = `${withScopedTenant(prefix)}@example.com`
    const password = 'Fixture-Password-1!'
    const { data: authUser } = await serviceRole.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (!authUser?.user) throw new Error('fixture auth user creation failed')

    await serviceRole.from('usuario').insert({
      id_usuario: authUser.user.id,
      id_tenant: tenant.id_tenant,
      email,
      nombre_completo: `Fixture User ${prefix}`,
      id_rol: rol.id_rol,
    })

    return { serviceRole, tenantId: tenant.id_tenant as string, email, password }
  }

  /** Signs in as `email`/`password` and returns an anon client bearing the real, hook-issued JWT. */
  async function signInAsAnon(serviceRole: ReturnType<typeof createServiceRoleTestClient>, email: string, password: string) {
    const { data: signIn, error } = await serviceRole.auth.signInWithPassword({ email, password })
    expect(error).toBeNull()
    return createAnonTestClient(signIn?.session?.access_token ?? '')
  }

  it('user A cannot SELECT tenant B configuracion rows even with a real, hook-issued session', async () => {
    const userA = await createTenantWithUser('iso-select-a')
    const tenantB = await createTenantWithUser('iso-select-b')
    await tenantB.serviceRole
      .from('configuracion')
      .insert({ id_tenant: tenantB.tenantId, seccion: 'perfil', clave: 'theme', valor: 'dark', tipo: 'string' })

    const anonAsUserA = await signInAsAnon(userA.serviceRole, userA.email, userA.password)

    const { data, error } = await anonAsUserA
      .from('configuracion')
      .select('seccion, clave, valor')
      .eq('id_tenant', tenantB.tenantId)

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('user A cannot INSERT into tenant B configuracion even with a real, hook-issued session', async () => {
    const userA = await createTenantWithUser('iso-insert-a')
    const tenantB = await createTenantWithUser('iso-insert-b')

    const anonAsUserA = await signInAsAnon(userA.serviceRole, userA.email, userA.password)

    const { error } = await anonAsUserA.from('configuracion').insert({
      id_tenant: tenantB.tenantId,
      seccion: 'finanzas',
      clave: 'spoofed',
      valor: 'x',
      tipo: 'string',
    })

    expect(error).not.toBeNull()
  })
})
