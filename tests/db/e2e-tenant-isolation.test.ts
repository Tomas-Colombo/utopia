import { describe, expect, it } from 'vitest'
import { createTenantWithUser, hasTestDb, signInAs } from './_helpers'

/**
 * End-to-end cross-tenant isolation via REAL sign-in (design §12, spec
 * tenant-resolution.md, REQ-TI-10). Etapa 1 closer proof: creates two real
 * Supabase Auth tenants/users, signs in as user A, and asserts the anon
 * client carrying user A's real session (with the Auth Hook's `tenant_id`
 * claim) cannot read or write tenant B's `configuracion` rows. This proves
 * the proxy header + `verifyTenantMatch` + RLS + Auth Hook chain together,
 * end to end — not any single layer in isolation.
 *
 * The tenant/user fixture and the sign-in helper now live in `_helpers.ts`:
 * they were written here first, and every other suite in `tests/db/` needs
 * exactly the same real session.
 */
describe.skipIf(!hasTestDb)('cross-tenant isolation — real sign-in (REQ-TI-10, Etapa 1 closer)', () => {
  it('user A cannot SELECT tenant B configuracion rows even with a real, hook-issued session', async () => {
    const userA = await createTenantWithUser('iso-select-a')
    const tenantB = await createTenantWithUser('iso-select-b')
    await tenantB.serviceRole
      .from('configuracion')
      .insert({ id_tenant: tenantB.tenantId, seccion: 'perfil', clave: 'theme', valor: 'dark', tipo: 'string' })

    const anonAsUserA = await signInAs(userA)

    const { data, error } = await anonAsUserA
      .from('configuracion')
      .select('seccion, clave, valor')
      .eq('id_tenant', tenantB.tenantId)

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('user A cannot INSERT into tenant B configuracion even with a real, hook-issued session', async () => {
    const userA = await createTenantWithUser('iso-insert-a')
    const tenantB = await createTenantWithUser('iso-insert-b')

    const anonAsUserA = await signInAs(userA)

    const { error } = await anonAsUserA.from('configuracion').insert({
      id_tenant: tenantB.tenantId,
      seccion: 'finanzas',
      clave: 'spoofed',
      valor: 'x',
      tipo: 'string',
    })

    expect(error).not.toBeNull()
  })
})
