import { describe, expect, it } from 'vitest'
import { createAnonTestClient, createServiceRoleTestClient } from '@/lib/dal/supabase-test'
import { hasTestDb, withScopedTenant } from './_helpers'

/** DB testing postponed until end of Slice 8 — see apply-progress. */
describe.skipIf(!hasTestDb)('tenant_modulo — 00003 (needs Supabase test project)', () => {
  it('cross-tenant SELECT returns zero rows (REQ-MTD-06/07)', async () => {
    const otherTenantJwt = 'fixture-jwt-for-tenant-b'
    const authenticated = createAnonTestClient(otherTenantJwt)

    const { data, error } = await authenticated.from('tenant_modulo').select('id_tenant, id_modulo')
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('duplicate (id_tenant, id_modulo) INSERT fails on the composite PK (spec 3.4)', async () => {
    const serviceRole = createServiceRoleTestClient()

    const { data: tenant } = await serviceRole
      .from('tenant')
      .insert({ nombre_comercial: 'PK dup', subdominio: withScopedTenant('pk-dup') })
      .select('id_tenant')
      .single()
    const { data: modulo } = await serviceRole
      .from('modulo')
      .select('id_modulo')
      .eq('codigo', 'inventario')
      .single()
    if (!tenant) throw new Error('fixture insert failed: tenant is null')
    if (!modulo) throw new Error('fixture lookup failed: modulo is null')

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
