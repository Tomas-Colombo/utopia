import { describe, expect, it } from 'vitest'
import { createAnonTestClient, createServiceRoleTestClient } from '@/lib/dal/supabase-test'
import { hasTestDb, withScopedTenant } from './_helpers'

/**
 * DB testing is postponed until end of Slice 8 — see apply-progress. This
 * suite type-checks and imports cleanly now; it will actually run once
 * `utopia-test` exists and migrations 00001 (+00002, for the enum-on-table
 * assertions below) are applied.
 */
describe.skipIf(!hasTestDb)('helpers-behavior — 00001 extensions & enums (needs Supabase test project)', () => {
  it('auth_tenant_id() returns NULL for an authenticated client with no tenant_id claim', async () => {
    const supabase = createAnonTestClient()
    const { data, error } = await supabase.rpc('auth_tenant_id')

    expect(error).toBeNull()
    expect(data).toBeNull()
  })

  it('tenant_estado enum accepts every design-specified value', async () => {
    const serviceRole = createServiceRoleTestClient()

    for (const estado of ['activo', 'suspendido', 'archivado'] as const) {
      const { error } = await serviceRole
        .from('tenant')
        .insert({
          nombre_comercial: `Estado ${estado}`,
          subdominio: withScopedTenant(`estado-${estado}`),
          estado_tenant: estado,
        })
      expect(error).toBeNull()
    }
  })

  it('tenant_estado enum rejects an unknown value', async () => {
    const serviceRole = createServiceRoleTestClient()

    const { error } = await serviceRole.from('tenant').insert({
      nombre_comercial: 'Estado invalido',
      subdominio: withScopedTenant('estado-invalido'),
      estado_tenant: 'not-a-real-estado',
    })

    expect(error).not.toBeNull()
  })
})
