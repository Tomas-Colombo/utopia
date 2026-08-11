import { describe, expect, it } from 'vitest'
import { createServiceRoleTestClient } from '@/lib/dal/supabase-test'
import { createTenantWithUser, hasTestDb, signInAs, unwrapFixture, withScopedTenant } from './_helpers'

describe.skipIf(!hasTestDb)('tenant_modulo — 00003', () => {
  it('cross-tenant SELECT returns zero rows (REQ-MTD-06/07)', async () => {
    const userA = await createTenantWithUser('tm-cross-a')
    const tenantB = await createTenantWithUser('tm-cross-b')

    const modulo = unwrapFixture(
      'modulo lookup',
      await tenantB.serviceRole.from('modulo').select('id_modulo').eq('codigo', 'inventario').single(),
    )
    // Enable a module for B only. A must not see the row.
    await tenantB.serviceRole
      .from('tenant_modulo')
      .insert({ id_tenant: tenantB.tenantId, id_modulo: modulo.id_modulo, habilitado: true })

    const asUserA = await signInAs(userA)
    const { data, error } = await asUserA.from('tenant_modulo').select('id_tenant, id_modulo')

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('duplicate (id_tenant, id_modulo) INSERT fails on the composite PK (spec 3.4)', async () => {
    const serviceRole = createServiceRoleTestClient()

    const tenant = unwrapFixture(
      'tenant insert',
      await serviceRole
        .from('tenant')
        .insert({ nombre_comercial: 'PK dup', subdominio: withScopedTenant('pk-dup') })
        .select('id_tenant')
        .single(),
    )
    const modulo = unwrapFixture(
      'modulo lookup',
      await serviceRole.from('modulo').select('id_modulo').eq('codigo', 'inventario').single(),
    )

    const first = await serviceRole
      .from('tenant_modulo')
      .insert({ id_tenant: tenant.id_tenant, id_modulo: modulo.id_modulo, habilitado: true })
    expect(first.error).toBeNull()

    const second = await serviceRole
      .from('tenant_modulo')
      .insert({ id_tenant: tenant.id_tenant, id_modulo: modulo.id_modulo, habilitado: false })
    expect(second.error).not.toBeNull()
  })
})
