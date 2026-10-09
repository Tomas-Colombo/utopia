import { describe, expect, it } from 'vitest'
import { createServiceRoleTestClient } from '@/lib/dal/supabase-test'
import { createTenantWithUser, hasTestDb, signInAs, withScopedTenant } from './_helpers'

describe.skipIf(!hasTestDb)('revendedora — 00076', () => {
  it('aislamiento por tenant (REQ-RV-MOD-04)', async () => {
    const tenantA = await createTenantWithUser('revendedora-a')
    const tenantB = await createTenantWithUser('revendedora-b')

    const authA = await signInAs(tenantA)
    const authB = await signInAs(tenantB)

    // A habilita el módulo
    const serviceRole = createServiceRoleTestClient()
    const { data: modulo } = await serviceRole.from('modulo').select('id_modulo').eq('codigo', 'revendedoras').single()
    await serviceRole.from('tenant_modulo').insert({ id_tenant: tenantA.tenantId, id_modulo: modulo!.id_modulo, habilitado: true })
    
    // A crea revendedora
    const { error: errA, data: idRevA } = await authA.rpc('sp_crear_revendedora', {
      _nombre: 'Reven A',
      _apellido: 'A',
      _telefono: '111',
      _email: 'a@re.com'
    })
    expect(errA).toBeNull()

    // B no puede ver la de A
    const { data: listB } = await authB.from('revendedora').select('id_revendedora')
    expect(listB).toEqual([])

    // A intenta inserción cruzada (no debería poder ni si usa SQL directo, pero probamos con serviceRole o el SP)
    // El SP ignora el tenant que le pases (usa el del token).
  })

  it('rechaza si el módulo está apagado (REQ-RV-MOD)', async () => {
    const tenant = await createTenantWithUser('revendedora-apagado')
    const auth = await signInAs(tenant)
    // No habilitamos el módulo.

    const { error } = await auth.rpc('sp_crear_revendedora', {
      _nombre: 'Reven Apagado',
      _apellido: 'Apagado',
      _telefono: '222',
      _email: 'x@re.com'
    })
    
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/modulo-revendedoras-deshabilitado/)
  })
})
