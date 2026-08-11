import { describe, expect, it } from 'vitest'
import { createServiceRoleTestClient } from '@/lib/dal/supabase-test'
import { createTenantWithUser, hasTestDb, signInAs, unwrapFixture, withScopedTenant } from './_helpers'

describe.skipIf(!hasTestDb)('configuracion — 00004', () => {
  it('cross-tenant SELECT returns zero rows (REQ-MTD-07, spec 3.2)', async () => {
    const userA = await createTenantWithUser('config-cross-a')
    const tenantB = await createTenantWithUser('config-cross-b')

    // A row that exists and would be visible to B, so an empty result proves
    // the policy filtered it rather than the table simply being empty.
    await tenantB.serviceRole.from('configuracion').insert({
      id_tenant: tenantB.tenantId,
      seccion: 'finanzas',
      clave: 'moneda',
      valor: 'ARS',
      tipo: 'string',
    })

    const asUserA = await signInAs(userA)
    const { data, error } = await asUserA
      .from('configuracion')
      .select('seccion, clave, valor')
      .eq('seccion', 'finanzas')

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('own-tenant SELECT returns own rows (spec 3.2)', async () => {
    const userA = await createTenantWithUser('config-own')
    await userA.serviceRole.from('configuracion').insert({
      id_tenant: userA.tenantId,
      seccion: 'perfil',
      clave: 'theme',
      valor: 'dark',
      tipo: 'string',
    })

    const asUserA = await signInAs(userA)
    const { data, error } = await asUserA
      .from('configuracion')
      .select('seccion, clave, valor')
      .eq('seccion', 'perfil')

    expect(error).toBeNull()
    expect(data).toEqual([{ seccion: 'perfil', clave: 'theme', valor: 'dark' }])
  })

  it('duplicate (id_tenant, seccion, clave) INSERT fails on the composite PK (REQ-MTD-05)', async () => {
    const serviceRole = createServiceRoleTestClient()

    const tenant = unwrapFixture(
      'tenant insert',
      await serviceRole
        .from('tenant')
        .insert({ nombre_comercial: 'Configuracion PK dup', subdominio: withScopedTenant('config-pk-dup') })
        .select('id_tenant')
        .single(),
    )

    const row = {
      id_tenant: tenant.id_tenant,
      seccion: 'perfil',
      clave: 'theme',
      valor: 'dark',
      tipo: 'string',
    }

    const first = await serviceRole.from('configuracion').insert(row)
    expect(first.error).toBeNull()

    const second = await serviceRole.from('configuracion').insert(row)
    expect(second.error).not.toBeNull()
  })
})
