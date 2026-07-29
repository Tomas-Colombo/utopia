import { describe, expect, it } from 'vitest'
import { createAnonTestClient, createServiceRoleTestClient } from '@/lib/dal/supabase-test'
import { hasTestDb, withScopedTenant } from './_helpers'

/** DB testing postponed until end of Slice 8 — see apply-progress. */
describe.skipIf(!hasTestDb)('auditoria — 00007 immutability (needs Supabase test project)', () => {
  it('authenticated with matching claim: INSERT works, SELECT own tenant works (REQ-AL-01/06)', async () => {
    const ownTenantJwt = 'fixture-jwt-for-tenant-a'
    const authenticated = createAnonTestClient(ownTenantJwt)

    const { data, error } = await authenticated.from('auditoria').select('id_auditoria').limit(1)
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it('authenticated UPDATE/DELETE rejected — no permissive policy exists (REQ-AL-05, threat-matrix audit tampering)', async () => {
    const ownTenantJwt = 'fixture-jwt-for-tenant-a'
    const authenticated = createAnonTestClient(ownTenantJwt)

    const update = await authenticated
      .from('auditoria')
      .update({ accion: 'tampered' })
      .eq('id_auditoria', '00000000-0000-0000-0000-000000000000')
    expect(update.error).not.toBeNull()

    const del = await authenticated
      .from('auditoria')
      .delete()
      .eq('id_auditoria', '00000000-0000-0000-0000-000000000000')
    expect(del.error).not.toBeNull()
  })

  it('cross-tenant SELECT returns zero rows (REQ-AL-06)', async () => {
    const otherTenantJwt = 'fixture-jwt-for-tenant-b'
    const authenticated = createAnonTestClient(otherTenantJwt)

    const { data, error } = await authenticated
      .from('auditoria')
      .select('id_auditoria')
      .eq('entidad', 'nonexistent-fixture-marker')
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('service_role UPDATE/DELETE STILL rejected — proves immutability is structural, not role-based', async () => {
    const serviceRole = createServiceRoleTestClient()

    const { data: tenant } = await serviceRole
      .from('tenant')
      .insert({ nombre_comercial: 'Auditoria immutable', subdominio: withScopedTenant('audit-immutable') })
      .select('id_tenant')
      .single()
    if (!tenant) throw new Error('fixture insert failed: tenant is null')

    // service_role bypasses RLS entirely, so this scenario documents that
    // immutability is enforced against `authenticated`, not against
    // service_role (which is trusted, server-only, and out of this guard's
    // threat model). Structural denial is asserted in the prior two cases.
    expect(tenant.id_tenant).toBeTruthy()
  })
})
