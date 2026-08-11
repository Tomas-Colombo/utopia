import { describe, expect, it } from 'vitest'
import { createServiceRoleTestClient } from '@/lib/dal/supabase-test'
import { createTenantWithUser, hasTestDb, signInAs, withScopedTenant } from './_helpers'

describe.skipIf(!hasTestDb)('modulo — 00003', () => {
  it('authenticated SELECT returns rows (REQ-MTD-08, spec 3.3)', async () => {
    // `modulo` is the platform-wide catalogue: unlike every other table here
    // it is NOT tenant-scoped, so any authenticated user sees the full list.
    const user = await createTenantWithUser('modulo-select')
    const authenticated = await signInAs(user)

    const { data, error } = await authenticated.from('modulo').select('id_modulo, codigo')

    expect(error).toBeNull()
    expect((data ?? []).length).toBeGreaterThan(0)
    expect(data?.map((m) => m.codigo)).toContain('inventario')
  })

  it('authenticated INSERT/UPDATE/DELETE are rejected by RLS (spec 3.3)', async () => {
    // Only a SELECT policy exists for `authenticated` (modulo_select_authenticated),
    // so writes have no permissive policy to satisfy.
    const user = await createTenantWithUser('modulo-write-denied')
    const authenticated = await signInAs(user)

    // INSERT is the one that really raises: there is no permissive policy, so
    // the WITH CHECK fails outright with 42501.
    const insertResult = await authenticated
      .from('modulo')
      .insert({ codigo: 'no-permitido', nombre: 'No permitido' })
    expect(insertResult.error).not.toBeNull()
    expect(insertResult.error?.code).toBe('42501')

    // UPDATE and DELETE do NOT raise. RLS hides the rows instead, so the
    // statement matches nothing and returns 200 with an empty set. Assert the
    // catalogue is untouched rather than waiting for an error that never comes.
    const updateResult = await authenticated
      .from('modulo')
      .update({ nombre: 'Renombrado' })
      .eq('codigo', 'inventario')
      .select('codigo')
    expect(updateResult.error).toBeNull()
    expect(updateResult.data).toEqual([])

    const deleteResult = await authenticated
      .from('modulo')
      .delete()
      .eq('codigo', 'inventario')
      .select('codigo')
    expect(deleteResult.error).toBeNull()
    expect(deleteResult.data).toEqual([])

    const survivor = await user.serviceRole
      .from('modulo')
      .select('codigo, nombre')
      .eq('codigo', 'inventario')
      .single()
    expect(survivor.data?.nombre).not.toBe('Renombrado')
  })

  it('service_role writes succeed (writes are service-role only, REQ-MTD-08)', async () => {
    const serviceRole = createServiceRoleTestClient()
    // Scoped codigo: `modulo.codigo` is UNIQUE and the table is not reset
    // between runs, so a fixed literal passed once and then failed on 23505
    // for every run after it.
    const codigo = withScopedTenant('modulo-write')

    const { error } = await serviceRole
      .from('modulo')
      .insert({ codigo, nombre: 'Test modulo write' })
    expect(error).toBeNull()

    // Deleted again, unlike every other fixture in this suite. `modulo` is the
    // PLATFORM-WIDE catalogue, not tenant-scoped data: rows left behind here
    // are handed to every tenant created afterwards, and they showed up as
    // bogus entries in `provision-tenant`'s module list on a dev machine.
    const cleanup = await serviceRole.from('modulo').delete().eq('codigo', codigo)
    expect(cleanup.error).toBeNull()
  })
})
