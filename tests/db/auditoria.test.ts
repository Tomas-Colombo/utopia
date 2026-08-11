import { describe, expect, it } from 'vitest'
import { createTenantWithUser, hasTestDb, signInAs } from './_helpers'

describe.skipIf(!hasTestDb)('auditoria — 00007 immutability', () => {
  it('authenticated with matching claim: INSERT works, SELECT own tenant works (REQ-AL-01/06)', async () => {
    const user = await createTenantWithUser('audit-own')
    const authenticated = await signInAs(user)

    const insert = await authenticated.from('auditoria').insert({
      id_tenant: user.tenantId,
      id_usuario: user.userId,
      entidad: 'fixture',
      entidad_id: user.userId,
      accion: 'crear',
      cambios: { fixture: true },
    })
    expect(insert.error).toBeNull()

    const { data, error } = await authenticated
      .from('auditoria')
      .select('entidad, accion')
      .eq('entidad', 'fixture')

    expect(error).toBeNull()
    expect(data).toEqual([{ entidad: 'fixture', accion: 'crear' }])
  })

  it('authenticated UPDATE/DELETE rejected — no permissive policy exists (REQ-AL-05, threat-matrix audit tampering)', async () => {
    const user = await createTenantWithUser('audit-tamper')
    const authenticated = await signInAs(user)

    const row = await authenticated
      .from('auditoria')
      .insert({
        id_tenant: user.tenantId,
        id_usuario: user.userId,
        entidad: 'tamper-target',
        entidad_id: user.userId,
        accion: 'crear',
        cambios: {},
      })
      .select('id_auditoria')
      .single()
    expect(row.error).toBeNull()

    const id = row.data?.id_auditoria

    // RLS does NOT raise on UPDATE/DELETE — it makes the rows invisible, so
    // the statement matches zero rows and PostgREST answers 200. Asserting
    // `error !== null` (as this test used to) waits for a signal Postgres
    // never sends. The property that actually matters is that the row did not
    // change, so assert THAT, at the source, with a client that can see it.
    const update = await authenticated
      .from('auditoria')
      .update({ accion: 'tampered' })
      .eq('id_auditoria', id)
      .select('id_auditoria')
    expect(update.error).toBeNull()
    expect(update.data).toEqual([])

    const del = await authenticated
      .from('auditoria')
      .delete()
      .eq('id_auditoria', id)
      .select('id_auditoria')
    expect(del.error).toBeNull()
    expect(del.data).toEqual([])

    const after = await user.serviceRole
      .from('auditoria')
      .select('accion')
      .eq('id_auditoria', id)
      .maybeSingle()
    expect(after.data).not.toBeNull()
    expect(after.data?.accion).toBe('crear')
  })

  it('cross-tenant SELECT returns zero rows (REQ-AL-06)', async () => {
    const userA = await createTenantWithUser('audit-cross-a')
    const tenantB = await createTenantWithUser('audit-cross-b')

    await tenantB.serviceRole.from('auditoria').insert({
      id_tenant: tenantB.tenantId,
      id_usuario: tenantB.userId,
      entidad: 'cross-tenant-marker',
      entidad_id: tenantB.userId,
      accion: 'crear',
      cambios: {},
    })

    const asUserA = await signInAs(userA)
    const { data, error } = await asUserA
      .from('auditoria')
      .select('id_auditoria')
      .eq('entidad', 'cross-tenant-marker')

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('service_role UPDATE/DELETE are NOT blocked — immutability guards `authenticated`, not the trusted role', async () => {
    const user = await createTenantWithUser('audit-servicerole')

    const row = await user.serviceRole
      .from('auditoria')
      .insert({
        id_tenant: user.tenantId,
        id_usuario: user.userId,
        entidad: 'service-role-target',
        entidad_id: user.userId,
        accion: 'crear',
        cambios: {},
      })
      .select('id_auditoria')
      .single()
    expect(row.error).toBeNull()

    // Documents the actual boundary. service_role bypasses RLS entirely, so
    // audit immutability is a guarantee against logged-in USERS; it is not a
    // safe against a server-side key. The previous version of this test
    // asserted nothing about service_role at all — it inserted a tenant and
    // checked the id was truthy, under a name that promised the opposite.
    const update = await user.serviceRole
      .from('auditoria')
      .update({ accion: 'editar' })
      .eq('id_auditoria', row.data?.id_auditoria)
    expect(update.error).toBeNull()
  })
})
