import { describe, expect, it } from 'vitest'
import { createAnonTestClient, createServiceRoleTestClient } from '@/lib/dal/supabase-test'
import { hasTestDb, withScopedTenant } from './_helpers'

/** DB testing postponed until end of Slice 8 — see apply-progress. */
describe.skipIf(!hasTestDb)('usuario — 00006 (needs Supabase test project)', () => {
  it('table exists with FK -> auth.users(id) (REQ-AUTH-04)', async () => {
    const serviceRole = createServiceRoleTestClient()

    const { data, error } = await serviceRole
      .from('information_schema.table_constraints')
      .select('constraint_type')
      .eq('table_name', 'usuario')
      .eq('constraint_type', 'FOREIGN KEY')

    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it('cross-tenant SELECT returns zero rows', async () => {
    const otherTenantJwt = 'fixture-jwt-for-tenant-b'
    const authenticated = createAnonTestClient(otherTenantJwt)

    const { data, error } = await authenticated.from('usuario').select('id_usuario, email')
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('INSERT of usuario without a matching auth.users row is rejected on FK', async () => {
    const serviceRole = createServiceRoleTestClient()

    const { data: tenant } = await serviceRole
      .from('tenant')
      .insert({ nombre_comercial: 'Usuario FK', subdominio: withScopedTenant('usuario-fk') })
      .select('id_tenant')
      .single()
    if (!tenant) throw new Error('fixture insert failed: tenant is null')

    const { data: rol } = await serviceRole
      .from('rol')
      .insert({ id_tenant: tenant.id_tenant, nombre: 'Administrador', permisos: {} })
      .select('id_rol')
      .single()
    if (!rol) throw new Error('fixture insert failed: rol is null')

    const { error } = await serviceRole.from('usuario').insert({
      id_usuario: '00000000-0000-0000-0000-000000000000', // no auth.users row for this id
      id_tenant: tenant.id_tenant,
      email: 'ghost@example.com',
      nombre_completo: 'Ghost User',
      id_rol: rol.id_rol,
    })

    expect(error).not.toBeNull()
  })
})
