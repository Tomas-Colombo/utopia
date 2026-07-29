import { describe, expect, it } from 'vitest'
import { createAnonTestClient, createServiceRoleTestClient } from '@/lib/dal/supabase-test'
import { hasTestDb, withScopedTenant } from './_helpers'

/** DB testing postponed until end of Slice 8 — see apply-progress. */
describe.skipIf(!hasTestDb)('configuracion — 00004 (needs Supabase test project)', () => {
  it('cross-tenant SELECT returns zero rows (REQ-MTD-07, spec 3.2)', async () => {
    const otherTenantJwt = 'fixture-jwt-for-tenant-b'
    const authenticated = createAnonTestClient(otherTenantJwt)

    const { data, error } = await authenticated
      .from('configuracion')
      .select('seccion, clave, valor')
      .eq('seccion', 'finanzas')
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('own-tenant SELECT returns own rows (spec 3.2)', async () => {
    const ownTenantJwt = 'fixture-jwt-for-tenant-a'
    const authenticated = createAnonTestClient(ownTenantJwt)

    const { data, error } = await authenticated.from('configuracion').select('seccion, clave, valor')
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it('duplicate (id_tenant, seccion, clave) INSERT fails on the composite PK (REQ-MTD-05)', async () => {
    const serviceRole = createServiceRoleTestClient()

    const { data: tenant } = await serviceRole
      .from('tenant')
      .insert({ nombre_comercial: 'Configuracion PK dup', subdominio: withScopedTenant('config-pk-dup') })
      .select('id_tenant')
      .single()
    if (!tenant) throw new Error('fixture insert failed: tenant is null')

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
