import { describe, expect, it } from 'vitest'
import { createServiceRoleTestClient } from '@/lib/dal/supabase-test'
import { hasTestDb, withScopedTenant } from './_helpers'

/** DB testing postponed until end of Slice 8 — see apply-progress. */
describe.skipIf(!hasTestDb)('sp_update_usuario — 00009 atomicity (needs Supabase test project)', () => {
  it('successful call updates usuario AND inserts an auditoria row in the same transaction (REQ-AL-03)', async () => {
    const serviceRole = createServiceRoleTestClient()

    const { data: tenant } = await serviceRole
      .from('tenant')
      .insert({ nombre_comercial: 'sp atomicity', subdominio: withScopedTenant('sp-atomic') })
      .select('id_tenant')
      .single()
    if (!tenant) throw new Error('fixture insert failed: tenant is null')

    const email = `${withScopedTenant('sp-user')}@example.com`
    const { data: authUser } = await serviceRole.auth.admin.createUser({
      email,
      password: 'Fixture-Password-1!',
      email_confirm: true,
    })
    if (!authUser?.user) throw new Error('fixture auth user creation failed')

    const { data: rol } = await serviceRole
      .from('rol')
      .insert({ id_tenant: tenant.id_tenant, nombre: 'Administrador', permisos: {} })
      .select('id_rol')
      .single()
    if (!rol) throw new Error('fixture insert failed: rol is null')

    await serviceRole.from('usuario').insert({
      id_usuario: authUser.user.id,
      id_tenant: tenant.id_tenant,
      email,
      nombre_completo: 'Original Name',
      id_rol: rol.id_rol,
    })

    const { error: rpcError } = await serviceRole.rpc('sp_update_usuario', {
      p_id_usuario: authUser.user.id,
      p_nombre_completo: 'Updated Name',
      p_id_rol: rol.id_rol,
    })
    expect(rpcError).toBeNull()

    const { data: usuario } = await serviceRole
      .from('usuario')
      .select('nombre_completo')
      .eq('id_usuario', authUser.user.id)
      .single()
    expect(usuario?.nombre_completo).toBe('Updated Name')

    const { data: auditRows } = await serviceRole
      .from('auditoria')
      .select('accion')
      .eq('entidad_id', authUser.user.id)
      .eq('accion', 'editar')
    expect((auditRows ?? []).length).toBeGreaterThan(0)
  })

  it('failure (invalid FK id_rol) rolls back BOTH the usuario mutation and the auditoria insert', async () => {
    const serviceRole = createServiceRoleTestClient()

    const { data: tenant } = await serviceRole
      .from('tenant')
      .insert({ nombre_comercial: 'sp rollback', subdominio: withScopedTenant('sp-rollback') })
      .select('id_tenant')
      .single()
    if (!tenant) throw new Error('fixture insert failed: tenant is null')

    const email = `${withScopedTenant('sp-user2')}@example.com`
    const { data: authUser } = await serviceRole.auth.admin.createUser({
      email,
      password: 'Fixture-Password-1!',
      email_confirm: true,
    })
    if (!authUser?.user) throw new Error('fixture auth user creation failed')

    const { data: rol } = await serviceRole
      .from('rol')
      .insert({ id_tenant: tenant.id_tenant, nombre: 'Administrador', permisos: {} })
      .select('id_rol')
      .single()
    if (!rol) throw new Error('fixture insert failed: rol is null')

    await serviceRole.from('usuario').insert({
      id_usuario: authUser.user.id,
      id_tenant: tenant.id_tenant,
      email,
      nombre_completo: 'Name Before Failure',
      id_rol: rol.id_rol,
    })

    const invalidRolId = '00000000-0000-0000-0000-000000000000'
    const { error: rpcError } = await serviceRole.rpc('sp_update_usuario', {
      p_id_usuario: authUser.user.id,
      p_nombre_completo: 'Should Not Persist',
      p_id_rol: invalidRolId,
    })
    expect(rpcError).not.toBeNull()

    const { data: usuario } = await serviceRole
      .from('usuario')
      .select('nombre_completo')
      .eq('id_usuario', authUser.user.id)
      .single()
    expect(usuario?.nombre_completo).toBe('Name Before Failure')

    const { data: auditRows } = await serviceRole
      .from('auditoria')
      .select('accion')
      .eq('entidad_id', authUser.user.id)
      .eq('accion', 'editar')
    expect(auditRows ?? []).toEqual([])
  })
})
