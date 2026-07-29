import { describe, expect, it } from 'vitest'
import { createAnonTestClient, createServiceRoleTestClient } from '@/lib/dal/supabase-test'
import { hasTestDb, withScopedTenant } from './_helpers'

/** DB testing postponed until end of Slice 8 — see apply-progress. */
describe.skipIf(!hasTestDb)('rol — 00005 (needs Supabase test project)', () => {
  it('cross-tenant SELECT returns zero rows (REQ-AG-01)', async () => {
    const otherTenantJwt = 'fixture-jwt-for-tenant-b'
    const authenticated = createAnonTestClient(otherTenantJwt)

    const { data, error } = await authenticated.from('rol').select('id_rol, nombre, permisos')
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('INSERT accepts the { [moduloCodigo]: string[] } permisos shape (REQ-AG-02)', async () => {
    const serviceRole = createServiceRoleTestClient()

    const { data: tenant } = await serviceRole
      .from('tenant')
      .insert({ nombre_comercial: 'Rol shape', subdominio: withScopedTenant('rol-shape') })
      .select('id_tenant')
      .single()
    if (!tenant) throw new Error('fixture insert failed: tenant is null')

    const permisos = { inventario: ['ver', 'crear', 'editar'], administracion: ['ver'] }
    const { data: rol, error } = await serviceRole
      .from('rol')
      .insert({ id_tenant: tenant.id_tenant, nombre: 'Administrador', permisos })
      .select('permisos')
      .single()

    expect(error).toBeNull()
    expect(rol?.permisos).toEqual(permisos)
  })

  it('jsonb-path query permisos->\'inventario\' ? \'crear\' returns true (REQ-AG-02)', async () => {
    const serviceRole = createServiceRoleTestClient()

    const { data: tenant } = await serviceRole
      .from('tenant')
      .insert({ nombre_comercial: 'Rol jsonb path', subdominio: withScopedTenant('rol-jsonb') })
      .select('id_tenant')
      .single()
    if (!tenant) throw new Error('fixture insert failed: tenant is null')

    await serviceRole.from('rol').insert({
      id_tenant: tenant.id_tenant,
      nombre: 'Administrador',
      permisos: { inventario: ['ver', 'crear'] },
    })

    const { data, error } = await serviceRole
      .from('rol')
      .select('id_rol')
      .eq('id_tenant', tenant.id_tenant)
      .filter('permisos->inventario', 'cs', '["crear"]')

    expect(error).toBeNull()
    expect((data ?? []).length).toBeGreaterThan(0)
  })
})
