import { describe, expect, it } from 'vitest'
import { createServiceRoleTestClient } from '@/lib/dal/supabase-test'
import { createTenantWithUser, hasTestDb, signInAs,  } from './_helpers'

describe.skipIf(!hasTestDb)('revendedora — 00076', () => {
  it('aislamiento por tenant (REQ-RV-MOD-04)', async () => {
    const tenantA = await createTenantWithUser('revendedora-a')
    const tenantB = await createTenantWithUser('revendedora-b')

    const authA = await signInAs(tenantA)
    const authB = await signInAs(tenantB)

    const serviceRole = createServiceRoleTestClient()
    const { data: modulo, error: errModulo } = await serviceRole.from('modulo').select('id_modulo').eq('codigo', 'revendedoras').single()
    expect(errModulo).toBeNull()
    const { error: errModA } = await serviceRole.from('tenant_modulo').insert({ id_tenant: tenantA.tenantId, id_modulo: modulo!.id_modulo, habilitado: true })
    expect(errModA).toBeNull()
    const { error: errModB } = await serviceRole.from('tenant_modulo').insert({ id_tenant: tenantB.tenantId, id_modulo: modulo!.id_modulo, habilitado: true })
    expect(errModB).toBeNull()
    
    // A crea revendedora
    const { error: errA, data: idRevA } = await authA.rpc('sp_crear_revendedora', {
      p_nombre: 'Reven A',
      p_apellido: 'A',
      p_telefono: '111',
      p_email: 'a@re.com'
    })
    expect(errA).toBeNull()

    // B no puede ver la de A
    const { data: listB } = await authB.from('revendedora').select('id_revendedora')
    expect(listB).toEqual([])

    // A intenta inserción cruzada (RLS la rechaza o el default lo impide)
    const { error: errCross } = await authA.from('revendedora').insert({
      id_tenant: tenantB.tenantId,
      nombre: 'Hacking',
      apellido: 'B',
    })
    expect(errCross).not.toBeNull()

    // B intenta editar o dar de baja la de A
    const { error: errEditB } = await authB.rpc('sp_editar_revendedora', {
      p_id: idRevA,
      p_nombre: 'Hacking',
      p_apellido: 'A',
    })
    expect(errEditB).not.toBeNull()
    expect(errEditB?.message).toMatch(/revendedora-not-found|P0002/)

    const { error: errBajaB } = await authB.rpc('sp_baja_revendedora', {
      p_id: idRevA,
    })
    expect(errBajaB).not.toBeNull()
    expect(errBajaB?.message).toMatch(/revendedora-not-found|P0002/)
  })

  it('rechaza si el módulo está apagado (REQ-RV-MOD)', async () => {
    const tenant = await createTenantWithUser('revendedora-apagado')
    const auth = await signInAs(tenant)
    // No habilitamos el módulo.

    const { error } = await auth.rpc('sp_crear_revendedora', {
      p_nombre: 'Reven Apagado',
      p_apellido: 'Apagado',
      p_telefono: '222',
      p_email: 'x@re.com'
    })
    
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/modulo-revendedoras-deshabilitado/)
  })

  it('baja idempotente', async () => {
    const tenant = await createTenantWithUser('revendedora-baja')
    const auth = await signInAs(tenant)
    const serviceRole = createServiceRoleTestClient()
    const { data: modulo } = await serviceRole.from('modulo').select('id_modulo').eq('codigo', 'revendedoras').single()
    await serviceRole.from('tenant_modulo').insert({ id_tenant: tenant.tenantId, id_modulo: modulo!.id_modulo, habilitado: true })

    const { data: id } = await auth.rpc('sp_crear_revendedora', {
      p_nombre: 'A',
      p_apellido: 'B'
    })

    const { error: err1 } = await auth.rpc('sp_baja_revendedora', { p_id: id })
    expect(err1).toBeNull()

    const { error: err2 } = await auth.rpc('sp_baja_revendedora', { p_id: id })
    expect(err2).toBeNull() // idempotente
  })

  it('registra en auditoria y controla email duplicado', async () => {
    const tenant = await createTenantWithUser('revendedora-audit')
    const auth = await signInAs(tenant)
    const serviceRole = createServiceRoleTestClient()
    const { data: modulo } = await serviceRole.from('modulo').select('id_modulo').eq('codigo', 'revendedoras').single()
    await serviceRole.from('tenant_modulo').insert({ id_tenant: tenant.tenantId, id_modulo: modulo!.id_modulo, habilitado: true })

    const { data: id, error: err1 } = await auth.rpc('sp_crear_revendedora', {
      p_nombre: 'C',
      p_apellido: 'D',
      p_email: 'unico@re.com'
    })
    expect(err1).toBeNull()

    // auditoria crear
    const { data: audit1 } = await serviceRole.from('auditoria').select('*').eq('entidad', 'revendedora').eq('accion', 'crear').eq('entidad_id', id)
    expect(audit1).toHaveLength(1)

    // email duplicado
    const { error: errDup } = await auth.rpc('sp_crear_revendedora', {
      p_nombre: 'E',
      p_apellido: 'F',
      p_email: 'unico@re.com'
    })
    expect(errDup?.code).toBe('23505')

    // editar
    const { error: errEdit } = await auth.rpc('sp_editar_revendedora', {
      p_id: id,
      p_nombre: 'CC',
      p_apellido: 'D',
      p_email: 'unico2@re.com'
    })
    expect(errEdit).toBeNull()

    // auditoria editar
    const { data: audit2 } = await serviceRole.from('auditoria').select('*').eq('entidad', 'revendedora').eq('accion', 'editar').eq('entidad_id', id)
    expect(audit2).toHaveLength(1)

    // baja
    await auth.rpc('sp_baja_revendedora', { p_id: id })
    const { data: audit3 } = await serviceRole.from('auditoria').select('*').eq('entidad', 'revendedora').eq('accion', 'baja').eq('entidad_id', id)
    expect(audit3).toHaveLength(1)

    // despues de la baja puedo usar el email
    const { error: errFree } = await auth.rpc('sp_crear_revendedora', {
      p_nombre: 'New',
      p_apellido: 'User',
      p_email: 'unico2@re.com'
    })
    expect(errFree).toBeNull()
  })
})
