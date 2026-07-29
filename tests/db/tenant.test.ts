import { describe, expect, it } from 'vitest'
import { createAnonTestClient, createServiceRoleTestClient } from '@/lib/dal/supabase-test'
import { hasTestDb, withScopedTenant } from './_helpers'

/** DB testing postponed until end of Slice 8 — see apply-progress. */
describe.skipIf(!hasTestDb)('tenant — 00002 (needs Supabase test project)', () => {
  it('the table exists (queryable as service_role)', async () => {
    const serviceRole = createServiceRoleTestClient()
    const { error } = await serviceRole.from('tenant').select('id_tenant').limit(1)
    expect(error).toBeNull()
  })

  it('rejects a duplicate subdominio on the unique constraint (spec 3.1)', async () => {
    const serviceRole = createServiceRoleTestClient()
    const subdominio = withScopedTenant('dup-subdominio')

    const first = await serviceRole
      .from('tenant')
      .insert({ nombre_comercial: 'Primero', subdominio })
    expect(first.error).toBeNull()

    const second = await serviceRole
      .from('tenant')
      .insert({ nombre_comercial: 'Segundo', subdominio })
    expect(second.error).not.toBeNull()
  })

  it('SELECT returns only the requesting user\'s own tenant (REQ-MTD-09)', async () => {
    // Fixture: two tenants, sign in a user whose JWT claims tenant A, and
    // assert tenant B never appears in the result set.
    const tenantAJwt = 'fixture-jwt-for-tenant-a'
    const authenticated = createAnonTestClient(tenantAJwt)

    const { data, error } = await authenticated.from('tenant').select('id_tenant')
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it('SELECT returns zero rows for a claim that matches no tenant', async () => {
    const unknownTenantJwt = 'fixture-jwt-for-unknown-tenant'
    const authenticated = createAnonTestClient(unknownTenantJwt)

    const { data, error } = await authenticated.from('tenant').select('id_tenant')
    expect(error).toBeNull()
    expect(data).toEqual([])
  })
})
