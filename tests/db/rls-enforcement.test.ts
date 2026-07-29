import { describe, expect, it } from 'vitest'
import { createAnonTestClient } from '@/lib/dal/supabase-test'
import { hasTestDb } from './_helpers'

/**
 * Regression gate (design §12/§15, REQ-TI-09) — for every foundation table,
 * as `authenticated` with NO `tenant_id` claim, every SELECT MUST return 0
 * rows and every write MUST be rejected (except `modulo` SELECT, which is
 * open to all authenticated users by design §4.2). Locks in the effect of
 * every RLS policy authored across Slices 4-5 in one place.
 */
const TENANT_SCOPED_TABLES = [
  'tenant',
  'tenant_modulo',
  'configuracion',
  'rol',
  'usuario',
  'auditoria',
] as const

/** DB testing postponed until end of Slice 8 — see apply-progress. */
describe.skipIf(!hasTestDb)('RLS enforcement — no tenant_id claim (needs Supabase test project)', () => {
  // Created lazily inside each test (not at describe-body scope) so this
  // module still imports + collects cleanly when `hasTestDb` is false and
  // no `_TEST` env vars exist — `describe.skipIf` still EXECUTES the
  // describe callback body to collect test cases, only the `it()` bodies
  // are skipped.
  function noClaimClient() {
    return createAnonTestClient(/* no jwt -> anon, no tenant_id claim */)
  }

  it.each(TENANT_SCOPED_TABLES)('%s: SELECT returns 0 rows without a tenant_id claim', async (table) => {
    const { data, error } = await noClaimClient().from(table).select('*')
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('modulo: SELECT is permitted to all authenticated users (design §4.2)', async () => {
    const { error } = await noClaimClient().from('modulo').select('*')
    expect(error).toBeNull()
  })

  it('modulo: writes are service-role only, rejected without a tenant claim', async () => {
    const { error } = await noClaimClient().from('modulo').insert({ codigo: 'x', nombre: 'x' })
    expect(error).not.toBeNull()
  })

  it.each(TENANT_SCOPED_TABLES)('%s: INSERT is rejected without a tenant_id claim', async (table) => {
    const { error } = await noClaimClient().from(table).insert({})
    expect(error).not.toBeNull()
  })
})
