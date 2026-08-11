import { describe, expect, it } from 'vitest'
import { createServiceRoleTestClient } from '@/lib/dal/supabase-test'
import { createTenantWithUser, hasTestDb, signInAs, unwrapFixture, withScopedTenant } from './_helpers'

/**
 * REQ-AUTH-04 (`usuario.id_usuario` REFERENCES `auth.users(id)`) is asserted
 * behaviourally, by the rejected INSERT below.
 *
 * There used to be a separate structural test that read
 * `information_schema.table_constraints` through the Supabase client. It could
 * never have passed: PostgREST only exposes the schemas listed in
 * `config.toml` (`public`, `graphql_public`), so the request came back
 * `PGRST205: Could not find the table ... in the schema cache`. A constraint
 * that rejects the row it is supposed to reject is the stronger proof anyway —
 * it tests the behaviour, not the catalogue entry.
 */
describe.skipIf(!hasTestDb)('usuario — 00006', () => {
  it('cross-tenant SELECT returns zero rows', async () => {
    const userA = await createTenantWithUser('usuario-cross-a')
    const tenantB = await createTenantWithUser('usuario-cross-b')

    const asUserA = await signInAs(userA)
    const { data, error } = await asUserA.from('usuario').select('id_usuario, email')

    expect(error).toBeNull()
    // A sees itself and nobody from B.
    expect(data?.map((u) => u.id_usuario)).toEqual([userA.userId])
    expect(data?.map((u) => u.id_usuario)).not.toContain(tenantB.userId)
  })

  it('INSERT of usuario without a matching auth.users row is rejected on FK (REQ-AUTH-04)', async () => {
    const serviceRole = createServiceRoleTestClient()

    const tenant = unwrapFixture(
      'tenant insert',
      await serviceRole
        .from('tenant')
        .insert({ nombre_comercial: 'Usuario FK', subdominio: withScopedTenant('usuario-fk') })
        .select('id_tenant')
        .single(),
    )

    const rol = unwrapFixture(
      'rol insert',
      await serviceRole
        .from('rol')
        .insert({ id_tenant: tenant.id_tenant, nombre: 'Administrador', permisos: {} })
        .select('id_rol')
        .single(),
    )

    const { error } = await serviceRole.from('usuario').insert({
      id_usuario: '00000000-0000-0000-0000-000000000000', // no auth.users row for this id
      id_tenant: tenant.id_tenant,
      email: 'ghost@example.com',
      nombre_completo: 'Ghost User',
      id_rol: rol.id_rol,
    })

    expect(error).not.toBeNull()
    // Specifically the FK, not just "some error" — 23503 is
    // foreign_key_violation. service_role bypasses RLS, so a 42501 here would
    // mean the fixture broke rather than the constraint holding.
    expect(error?.code).toBe('23503')
  })
})
