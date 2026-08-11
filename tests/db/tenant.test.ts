import { describe, expect, it } from 'vitest'
import { createServiceRoleTestClient } from '@/lib/dal/supabase-test'
import {
  createTenantWithUser,
  createUserWithoutTenant,
  hasTestDb,
  signInAs,
  withScopedTenant,
} from './_helpers'

describe.skipIf(!hasTestDb)('tenant — 00002', () => {
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

  it("SELECT returns only the requesting user's own tenant (REQ-MTD-09)", async () => {
    const userA = await createTenantWithUser('tenant-select-a')
    const tenantB = await createTenantWithUser('tenant-select-b')

    const asUserA = await signInAs(userA)
    const { data, error } = await asUserA.from('tenant').select('id_tenant')

    expect(error).toBeNull()
    // Exactly one row, and it is A's — not "an array", which the previous
    // version asserted and which a totally broken policy would also satisfy.
    expect(data).toEqual([{ id_tenant: userA.tenantId }])
    expect(data?.map((r) => r.id_tenant)).not.toContain(tenantB.tenantId)
  })

  it('SELECT returns zero rows for a session whose claims carry no tenant', async () => {
    // A real, signed-in user with no `usuario` row: the Auth Hook finds
    // nothing to read and strips `tenant_id` entirely, so `tenant_select_own`
    // has no claim to match.
    await createTenantWithUser('tenant-noclaim-neighbour')
    const stranger = await createUserWithoutTenant('tenant-noclaim')

    const asStranger = await signInAs(stranger)
    const { data, error } = await asStranger.from('tenant').select('id_tenant')

    expect(error).toBeNull()
    expect(data).toEqual([])
  })
})
