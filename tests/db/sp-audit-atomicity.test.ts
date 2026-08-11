import { describe, expect, it } from 'vitest'
import { createTenantWithUser, hasTestDb, signInAs } from './_helpers'

/**
 * `sp_update_usuario` must be called through an AUTHENTICATED session, not
 * with the service_role key. Its first statement is
 * `v_actor uuid := auth.uid()`, and it writes that into
 * `auditoria.id_usuario`, which is NOT NULL — so a service_role call (no user,
 * `auth.uid()` is null) dies with `23502` before reaching anything this suite
 * means to assert. The rollback case below used to "pass" on exactly that
 * error while claiming to prove an FK rollback.
 */
describe.skipIf(!hasTestDb)('sp_update_usuario — 00009 atomicity', () => {
  it('successful call updates usuario AND inserts an auditoria row in the same transaction (REQ-AL-03)', async () => {
    const user = await createTenantWithUser('sp-atomic')
    const authenticated = await signInAs(user)

    const { error: rpcError } = await authenticated.rpc('sp_update_usuario', {
      p_id_usuario: user.userId,
      p_nombre_completo: 'Updated Name',
      p_id_rol: user.rolId,
    })
    expect(rpcError).toBeNull()

    const { data: usuario } = await user.serviceRole
      .from('usuario')
      .select('nombre_completo')
      .eq('id_usuario', user.userId)
      .single()
    expect(usuario?.nombre_completo).toBe('Updated Name')

    const { data: auditRows } = await user.serviceRole
      .from('auditoria')
      .select('accion, id_usuario')
      .eq('entidad_id', user.userId)
      .eq('accion', 'editar')

    expect((auditRows ?? []).length).toBeGreaterThan(0)
    // The actor really came from `auth.uid()`, which is the whole point of
    // routing the call through a session.
    expect(auditRows?.[0]?.id_usuario).toBe(user.userId)
  })

  it('failure (invalid FK id_rol) rolls back BOTH the usuario mutation and the auditoria insert', async () => {
    const user = await createTenantWithUser('sp-rollback')
    const authenticated = await signInAs(user)

    const invalidRolId = '00000000-0000-0000-0000-000000000000'
    const { error: rpcError } = await authenticated.rpc('sp_update_usuario', {
      p_id_usuario: user.userId,
      p_nombre_completo: 'Should Not Persist',
      p_id_rol: invalidRolId,
    })

    expect(rpcError).not.toBeNull()
    // Assert the FK specifically. Accepting any error is what let this test
    // pass for years on a NOT NULL violation from an unrelated column.
    expect(rpcError?.code).toBe('23503')

    const { data: usuario } = await user.serviceRole
      .from('usuario')
      .select('nombre_completo')
      .eq('id_usuario', user.userId)
      .single()
    expect(usuario?.nombre_completo).toBe(`Fixture User sp-rollback`)

    const { data: auditRows } = await user.serviceRole
      .from('auditoria')
      .select('accion')
      .eq('entidad_id', user.userId)
      .eq('accion', 'editar')
    expect(auditRows ?? []).toEqual([])
  })
})
