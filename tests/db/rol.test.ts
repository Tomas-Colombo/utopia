import { describe, expect, it } from 'vitest'
import { createServiceRoleTestClient } from '@/lib/dal/supabase-test'
import { createTenantWithUser, hasTestDb, signInAs, unwrapFixture, withScopedTenant } from './_helpers'

describe.skipIf(!hasTestDb)('rol — 00005', () => {
  it('cross-tenant SELECT returns zero rows (REQ-AG-01)', async () => {
    const userA = await createTenantWithUser('rol-cross-a')
    const tenantB = await createTenantWithUser('rol-cross-b')

    const asUserA = await signInAs(userA)
    const { data, error } = await asUserA.from('rol').select('id_rol, nombre, permisos')

    expect(error).toBeNull()
    // `createTenantWithUser` gives every tenant an 'Administrador' rol, so B's
    // rol exists and is deliberately excluded here — while A's own rol IS
    // visible. An assertion of `[]` would have been wrong: it would pass on a
    // policy that hides everything, including your own rows.
    expect(data?.map((r) => r.id_rol)).toEqual([userA.rolId])
    expect(data?.map((r) => r.id_rol)).not.toContain(tenantB.rolId)
  })

  it('INSERT accepts the { [moduloCodigo]: string[] } permisos shape (REQ-AG-02)', async () => {
    const serviceRole = createServiceRoleTestClient()

    const tenant = unwrapFixture(
      'tenant insert',
      await serviceRole
        .from('tenant')
        .insert({ nombre_comercial: 'Rol shape', subdominio: withScopedTenant('rol-shape') })
        .select('id_tenant')
        .single(),
    )

    const permisos = { inventario: ['ver', 'crear', 'editar'], administracion: ['ver'] }
    const { data: rol, error } = await serviceRole
      .from('rol')
      .insert({ id_tenant: tenant.id_tenant, nombre: 'Administrador', permisos })
      .select('permisos')
      .single()

    expect(error).toBeNull()
    expect(rol?.permisos).toEqual(permisos)
  })

  it("jsonb-path query permisos->'inventario' ? 'crear' returns true (REQ-AG-02)", async () => {
    const serviceRole = createServiceRoleTestClient()

    const tenant = unwrapFixture(
      'tenant insert',
      await serviceRole
        .from('tenant')
        .insert({ nombre_comercial: 'Rol jsonb path', subdominio: withScopedTenant('rol-jsonb') })
        .select('id_tenant')
        .single(),
    )

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
