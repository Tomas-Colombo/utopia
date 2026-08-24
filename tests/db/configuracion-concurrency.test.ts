import { describe, expect, it } from 'vitest'
import { createServiceRoleTestClient } from '@/lib/dal/supabase-test'
import { hasTestDb, withScopedTenant } from './_helpers'

/**
 * Concurrency test (REQ-TI-11, spec test-infrastructure 3.3). Two concurrent
 * INSERTs targeting the same `(id_tenant, seccion, clave)` composite key
 * fired via `Promise.allSettled` — the composite PK on `configuracion`
 * (design §4.4) MUST let exactly one succeed and reject the other,
 * proving DB-level concurrency safety (no silent last-write-wins).
 */
describe.skipIf(!hasTestDb)('configuracion — concurrent duplicate INSERT (REQ-TI-11)', () => {
  it('exactly one of two concurrent INSERTs on the same (id_tenant, seccion, clave) succeeds', async () => {
    const serviceRole = createServiceRoleTestClient()

    const { data: tenant } = await serviceRole
      .from('tenant')
      .insert({ nombre_comercial: 'Concurrency fixture', subdominio: withScopedTenant('concurrency') })
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

    const results = await Promise.allSettled([
      serviceRole.from('configuracion').insert(row),
      serviceRole.from('configuracion').insert(row),
    ])

    const outcomes = results.map((result) =>
      result.status === 'fulfilled' ? result.value.error === null : false,
    )
    const successes = outcomes.filter(Boolean).length
    const failures = outcomes.length - successes

    expect(successes).toBe(1)
    expect(failures).toBe(1)
  })
})
