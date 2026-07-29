import { describe, expect, it } from 'vitest'
import { createAnonTestClient, createServiceRoleTestClient } from '@/lib/dal/supabase-test'
import { hasTestDb } from './_helpers'

/** DB testing postponed until end of Slice 8 — see apply-progress. */
describe.skipIf(!hasTestDb)('modulo — 00003 (needs Supabase test project)', () => {
  it('authenticated SELECT returns rows (REQ-MTD-08, spec 3.3)', async () => {
    const authenticated = createAnonTestClient('fixture-authenticated-jwt')
    const { data, error } = await authenticated.from('modulo').select('id_modulo, codigo')

    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it('authenticated INSERT/UPDATE/DELETE are rejected by RLS (spec 3.3)', async () => {
    const authenticated = createAnonTestClient('fixture-authenticated-jwt')

    const insertResult = await authenticated
      .from('modulo')
      .insert({ codigo: 'no-permitido', nombre: 'No permitido' })
    expect(insertResult.error).not.toBeNull()

    const updateResult = await authenticated
      .from('modulo')
      .update({ nombre: 'Renombrado' })
      .eq('codigo', 'inventario')
    expect(updateResult.error).not.toBeNull()

    const deleteResult = await authenticated.from('modulo').delete().eq('codigo', 'inventario')
    expect(deleteResult.error).not.toBeNull()
  })

  it('service_role writes succeed (writes are service-role only, REQ-MTD-08)', async () => {
    const serviceRole = createServiceRoleTestClient()
    const { error } = await serviceRole
      .from('modulo')
      .insert({ codigo: 'test_modulo_write', nombre: 'Test modulo write' })

    expect(error).toBeNull()
  })
})
