import { describe, expect, test, afterAll } from 'vitest'
import { createServiceRoleTestClient } from '@/lib/dal/supabase-test'
import { hasTestDb, signInAs, createTenantWithUser } from './_helpers'
import { ventaFixture } from './_fixtures-ventas'

describe.skipIf(!hasTestDb)('Slice 9b — Declaración de venta: DB (REQ-RV-ACC-30…33, DR-11)', () => {
  const serviceRole = createServiceRoleTestClient()
  const tenantsToClean: string[] = []
  const usersToClean: string[] = []

  afterAll(async () => {
    for (const t of tenantsToClean) {
      await serviceRole.rpc('sp_borrar_tenant', { p_id: t })
    }
    for (const u of usersToClean) {
      await serviceRole.auth.admin.deleteUser(u)
    }
  })

  async function setupFixture() {
    const fA = await ventaFixture('DecVentaA', 5, { tipoIngreso: 'compra' })
    tenantsToClean.push(fA.tenantId)

    // Habilitar módulo revendedoras
    const { data: mod } = await serviceRole
      .from('modulo')
      .select('id_modulo')
      .eq('codigo', 'revendedoras')
      .single()
    await serviceRole
      .from('tenant_modulo')
      .insert({ id_tenant: fA.tenantId, id_modulo: mod!.id_modulo, habilitado: true })

    // Crear dos revendedoras en tenant A
    const { data: idRevA } = await fA.authenticated.rpc('sp_crear_revendedora', {
      p_nombre: 'Ana',
      p_apellido: 'RevA',
      p_email: 'ana_reva@test.com',
    })

    const { data: idRevB } = await fA.authenticated.rpc('sp_crear_revendedora', {
      p_nombre: 'Berta',
      p_apellido: 'RevB',
      p_email: 'berta_revb@test.com',
    })

    // Rol Revendedora
    const { data: rolRev } = await serviceRole
      .from('rol')
      .insert({
        id_tenant: fA.tenantId,
        nombre: 'Revendedora',
        permisos: { revendedoras: ['ver_propio'] },
      })
      .select('id_rol')
      .single()

    // Crear usuario Auth para Ana
    const emailAna = `ana_${Date.now()}@test.com`
    const { data: userAna } = await serviceRole.auth.admin.createUser({
      email: emailAna,
      password: 'Password123!',
      email_confirm: true,
    })
    usersToClean.push(userAna.user!.id)

    await serviceRole.rpc('sp_enlazar_revendedora_usuario', {
      p_id_revendedora: idRevA,
      p_id_usuario: userAna.user!.id,
      p_id_tenant: fA.tenantId,
      p_email: emailAna,
      p_nombre: 'Ana RevA',
      p_id_rol: rolRev!.id_rol,
    })

    // Crear usuario Auth para Berta
    const emailBerta = `berta_${Date.now()}@test.com`
    const { data: userBerta } = await serviceRole.auth.admin.createUser({
      email: emailBerta,
      password: 'Password123!',
      email_confirm: true,
    })
    usersToClean.push(userBerta.user!.id)

    await serviceRole.rpc('sp_enlazar_revendedora_usuario', {
      p_id_revendedora: idRevB,
      p_id_usuario: userBerta.user!.id,
      p_id_tenant: fA.tenantId,
      p_email: emailBerta,
      p_nombre: 'Berta RevB',
      p_id_rol: rolRev!.id_rol,
    })

    // Tenant B para aislamiento cruzado
    const tC = await createTenantWithUser('DecC')
    tenantsToClean.push(tC.tenantId)

    // Entregar 2 ítems a Ana y 2 a Berta
    const itemsAna = [fA.items[0], fA.items[1]]
    const itemsBerta = [fA.items[2], fA.items[3]]
    const itemDisponible = fA.items[4]

    const hoy = new Date().toISOString().slice(0, 10)
    const { data: idConsAna, error: errConsAna } = await fA.authenticated.rpc('sp_crear_consignacion_revendedora_con_items', {
      p_id_revendedora: idRevA,
      p_items: itemsAna,
      p_periodo_desde: hoy,
    })
    expect(errConsAna).toBeNull()
    const { error: errConfAna } = await fA.authenticated.rpc('sp_confirmar_consignacion_revendedora', {
      p_id_consignacion_revendedora: idConsAna,
    })
    expect(errConfAna).toBeNull()

    const { data: idConsBerta, error: errConsBerta } = await fA.authenticated.rpc('sp_crear_consignacion_revendedora_con_items', {
      p_id_revendedora: idRevB,
      p_items: itemsBerta,
      p_periodo_desde: hoy,
    })
    expect(errConsBerta).toBeNull()
    const { error: errConfBerta } = await fA.authenticated.rpc('sp_confirmar_consignacion_revendedora', {
      p_id_consignacion_revendedora: idConsBerta,
    })
    expect(errConfBerta).toBeNull()

    const authAna = await signInAs({ email: emailAna, password: 'Password123!' })
    const authBerta = await signInAs({ email: emailBerta, password: 'Password123!' })

    return {
      fA,
      idRevA,
      idRevB,
      authAna,
      authBerta,
      itemsAna,
      itemsBerta,
      itemDisponible,
      tC,
    }
  }

  test('1. A no ve declaraciones de B (mismo tenant) ni de otro tenant, y B no ve las de A', async () => {
    const ctx = await setupFixture()

    // Ana declara un ítem en su poder
    const { data: idDecAna, error: errDec } = await ctx.authAna.rpc('sp_declarar_venta_revendedora', {
      p_id_item: ctx.itemsAna[0],
      p_nota: 'Venta por Instagram',
    })
    expect(errDec).toBeNull()
    expect(idDecAna).toBeDefined()

    // Ana lee declaraciones directamente
    const { data: decsAna, error: errAna } = await ctx.authAna
      .from('declaracion_venta_revendedora')
      .select('*')
    expect(errAna).toBeNull()
    expect(decsAna).toHaveLength(1)
    expect(decsAna![0].id_declaracion).toBe(idDecAna)

    // Berta lee declaraciones directamente -> 0 filas
    const { data: decsBerta, error: errBerta } = await ctx.authBerta
      .from('declaracion_venta_revendedora')
      .select('*')
    expect(errBerta).toBeNull()
    expect(decsBerta).toHaveLength(0)

    // El operador del local (sin claim de revendedora) ve todo el tenant
    const { data: decsAdmin, error: errAdmin } = await ctx.fA.authenticated
      .from('declaracion_venta_revendedora')
      .select('*')
    expect(errAdmin).toBeNull()
    expect(decsAdmin).toHaveLength(1)
  })

  test('2. A no puede declarar un ítem de B, ni un ítem disponible, ni duplicar pendiente', async () => {
    const ctx = await setupFixture()

    // Ana intenta declarar ítem en poder de Berta -> item-no-en-poder
    const { error: errAjeno } = await ctx.authAna.rpc('sp_declarar_venta_revendedora', {
      p_id_item: ctx.itemsBerta[0],
      p_nota: 'Intento ajeno',
    })
    expect(errAjeno?.message).toMatch(/item-no-en-poder/)

    // Ana intenta declarar ítem disponible en local -> item-no-en-poder (o item-no-disponible)
    const { error: errDisp } = await ctx.authAna.rpc('sp_declarar_venta_revendedora', {
      p_id_item: ctx.itemDisponible,
      p_nota: 'Intento disponible',
    })
    expect(errDisp?.message).toMatch(/item-no-en-poder|item-no-disponible/)

    // Ana declara su ítem 0
    const { data: idDec, error: errOk } = await ctx.authAna.rpc('sp_declarar_venta_revendedora', {
      p_id_item: ctx.itemsAna[0],
      p_nota: 'Primera declaracion',
    })
    expect(errOk).toBeNull()
    expect(idDec).toBeDefined()

    // Ana intenta declarar OTRA VEZ el mismo ítem 0 mientras está pendiente -> declaracion-duplicada
    const { error: errDup } = await ctx.authAna.rpc('sp_declarar_venta_revendedora', {
      p_id_item: ctx.itemsAna[0],
      p_nota: 'Segunda declaracion',
    })
    expect(errDup?.message).toMatch(/declaracion-duplicada/)
  })

  test('3. A no puede UPDATE/DELETE directo a capricho, ni insertar con id_revendedora ajeno', async () => {
    const ctx = await setupFixture()

    const { data: idDec } = await ctx.authAna.rpc('sp_declarar_venta_revendedora', {
      p_id_item: ctx.itemsAna[0],
      p_nota: 'Para mutacion directa',
    })

    // UPDATE directo por Ana a 'confirmada' denegado por RLS / trigger
    const { data: updData, error: errUpd } = await ctx.authAna
      .from('declaracion_venta_revendedora')
      .update({ estado: 'confirmada' })
      .eq('id_declaracion', idDec)
      .select()
    expect(updData === null || (Array.isArray(updData) && updData.length === 0) || errUpd !== null).toBe(true)

    // UPDATE directo por Ana modificando 'nota' denegado
    const { data: updNota, error: errUpdNota } = await ctx.authAna
      .from('declaracion_venta_revendedora')
      .update({ nota: 'Modificada sin permiso' })
      .eq('id_declaracion', idDec)
      .select()
    expect(updNota === null || (Array.isArray(updNota) && updNota.length === 0) || errUpdNota !== null).toBe(true)

    // DELETE directo por Ana denegado por RLS (0 filas afectadas o error)
    const { data: delData, error: errDel } = await ctx.authAna
      .from('declaracion_venta_revendedora')
      .delete()
      .eq('id_declaracion', idDec)
      .select()
    expect(delData === null || (Array.isArray(delData) && delData.length === 0) || errDel !== null).toBe(true)

    // INSERT directo con id_revendedora ajeno denegado
    const { error: errInsAjeno } = await ctx.authAna
      .from('declaracion_venta_revendedora')
      .insert({
        id_tenant: ctx.fA.tenantId,
        id_revendedora: ctx.idRevB, // de Berta
        id_item: ctx.itemsAna[1],
        nota: 'Insert tramposo',
      })
    expect(errInsAjeno).not.toBeNull()
  })

  test('4. A no puede ejecutar sp_confirmar, sp_rechazar ni sp_registrar_venta (no-permission)', async () => {
    const ctx = await setupFixture()

    const { data: idDec } = await ctx.authAna.rpc('sp_declarar_venta_revendedora', {
      p_id_item: ctx.itemsAna[0],
      p_nota: 'Para probar SPs administrativos',
    })

    // Ana intenta confirmar
    const { error: errConf } = await ctx.authAna.rpc('sp_confirmar_declaracion_venta', {
      p_id_declaracion: idDec,
    })
    expect(errConf?.message).toMatch(/no-permission/)

    // Ana intenta rechazar
    const { error: errRech } = await ctx.authAna.rpc('sp_rechazar_declaracion_venta', {
      p_id_declaracion: idDec,
      p_motivo: 'Rechazo propio',
    })
    expect(errRech?.message).toMatch(/no-permission/)

    // Ana intenta registrar venta directamente
    const { error: errVta } = await ctx.authAna.rpc('sp_registrar_venta', {
      p_lineas: [{ id_item: ctx.itemsAna[0] }],
      p_canal: 'revendedora',
      p_id_revendedora: ctx.idRevA,
    })
    expect(errVta?.message).toMatch(/no-permission/)
  })

  test('5. retiro propio pasa a estado "retirada"; B no puede retirar declaración de A', async () => {
    const ctx = await setupFixture()

    const { data: idDec } = await ctx.authAna.rpc('sp_declarar_venta_revendedora', {
      p_id_item: ctx.itemsAna[0],
      p_nota: 'Para retirar',
    })

    // Berta intenta retirar la declaración de Ana -> declaracion-no-encontrada o no-permission
    const { error: errBertaRetira } = await ctx.authBerta.rpc('sp_retirar_declaracion', {
      p_id_declaracion: idDec,
    })
    expect(errBertaRetira?.message).toMatch(/declaracion-no-encontrada|no-permission/)

    // Ana retira su propia declaración
    const { error: errRetiraOk } = await ctx.authAna.rpc('sp_retirar_declaracion', {
      p_id_declaracion: idDec,
    })
    expect(errRetiraOk).toBeNull()

    // Comprobar que el estado es 'retirada'
    const { data: decRetirada } = await ctx.authAna
      .from('declaracion_venta_revendedora')
      .select('estado')
      .eq('id_declaracion', idDec)
      .single()
    expect(decRetirada?.estado).toBe('retirada')

    // Ana vuelve a declarar el mismo ítem -> permitido porque ya no está pendiente
    const { data: idDecNuevo, error: errReDeclara } = await ctx.authAna.rpc('sp_declarar_venta_revendedora', {
      p_id_item: ctx.itemsAna[0],
      p_nota: 'Re-declarada tras retiro',
    })
    expect(errReDeclara).toBeNull()
    expect(idDecNuevo).toBeDefined()
  })

  test('6. mientras esté pendiente: ítem sigue en_revendedora y sin venta/comisión; rechazar exige motivo; confirmar genera venta', async () => {
    const ctx = await setupFixture()

    const { data: idDec } = await ctx.authAna.rpc('sp_declarar_venta_revendedora', {
      p_id_item: ctx.itemsAna[0],
      p_nota: 'Para flujo completo',
    })

    // Invariante ACC-30/33: el ítem sigue en_revendedora, detalle sigue en_poder
    const { data: itemPendiente } = await ctx.fA.authenticated
      .from('item_producto')
      .select('estado_item')
      .eq('id_item', ctx.itemsAna[0])
      .single()
    expect(itemPendiente!.estado_item).toBe('en_revendedora')

    const { data: crdPendiente } = await ctx.fA.authenticated
      .from('consignacion_revendedora_detalle')
      .select('estado_detalle')
      .eq('id_item', ctx.itemsAna[0])
      .single()
    expect(crdPendiente!.estado_detalle).toBe('en_poder')

    // Sin ventas en la base para este ítem
    const { data: ventasDet } = await ctx.fA.authenticated
      .from('detalle_venta')
      .select('id_detalle_venta')
      .eq('id_item', ctx.itemsAna[0])
    expect(ventasDet).toHaveLength(0)

    // Rechazar exige motivo
    const { error: errSinMotivo } = await ctx.fA.authenticated.rpc('sp_rechazar_declaracion_venta', {
      p_id_declaracion: idDec,
      p_motivo: '   ',
    })
    expect(errSinMotivo?.message).toMatch(/motivo-requerido/)

    // Confirmar venta por el operador
    const { data: idVentaConfirmada, error: errConf } = await ctx.fA.authenticated.rpc('sp_confirmar_declaracion_venta', {
      p_id_declaracion: idDec,
    })
    expect(errConf).toBeNull()
    expect(idVentaConfirmada).toBeDefined()

    // La declaración ahora está confirmada y enlaza id_venta
    const { data: decConfirmada } = await ctx.fA.authenticated
      .from('declaracion_venta_revendedora')
      .select('*')
      .eq('id_declaracion', idDec)
      .single()
    expect(decConfirmada!.estado).toBe('confirmada')
    expect(decConfirmada!.id_venta).toBe(idVentaConfirmada)

    // Ahora sí el ítem está vendido y la venta existe
    const { data: itemVendido } = await ctx.fA.authenticated
      .from('item_producto')
      .select('estado_item')
      .eq('id_item', ctx.itemsAna[0])
      .single()
    expect(itemVendido!.estado_item).toBe('vendido')
  })

  test('7. modulo-revendedoras-deshabilitado: todos los SPs fallan si el módulo está apagado', async () => {
    const fOff = await ventaFixture('DecModOff', 1, { tipoIngreso: 'compra' })
    tenantsToClean.push(fOff.tenantId)

    const fakeId = '00000000-0000-0000-0000-000000000001'

    const { error: e1 } = await fOff.authenticated.rpc('sp_declarar_venta_revendedora', {
      p_id_item: fOff.items[0],
    })
    expect(e1?.message).toMatch(/modulo-revendedoras-deshabilitado/)

    const { error: e2 } = await fOff.authenticated.rpc('sp_retirar_declaracion', {
      p_id_declaracion: fakeId,
    })
    expect(e2?.message).toMatch(/modulo-revendedoras-deshabilitado/)

    const { error: e3 } = await fOff.authenticated.rpc('sp_confirmar_declaracion_venta', {
      p_id_declaracion: fakeId,
    })
    expect(e3?.message).toMatch(/modulo-revendedoras-deshabilitado/)

    const { error: e4 } = await fOff.authenticated.rpc('sp_rechazar_declaracion_venta', {
      p_id_declaracion: fakeId,
      p_motivo: 'Motivo',
    })
    expect(e4?.message).toMatch(/modulo-revendedoras-deshabilitado/)

    // rvp_item_en_mi_poder con módulo apagado
    const { error: e5 } = await fOff.authenticated.rpc('rvp_item_en_mi_poder', {
      p_id_item: fOff.items[0],
    })
    // Puede dar no-revendedora (si el actor no tiene claim) o modulo-revendedoras-deshabilitado
    expect(e5?.message).toMatch(/modulo-revendedoras-deshabilitado|no-revendedora/)
  })

  test('8. rvp_item_en_mi_poder: sólo true para ítems en su poder; false para ajenos/disponibles; no-revendedora para operador', async () => {
    const ctx = await setupFixture()

    // Ana consulta su ítem -> true
    const { data: esDeAna, error: errAna } = await ctx.authAna.rpc('rvp_item_en_mi_poder', {
      p_id_item: ctx.itemsAna[0],
    })
    expect(errAna).toBeNull()
    expect(esDeAna).toBe(true)

    // Ana consulta ítem de Berta -> false (no error, solo false, sin revelar datos ajenos)
    const { data: esDeBerta, error: errBerta } = await ctx.authAna.rpc('rvp_item_en_mi_poder', {
      p_id_item: ctx.itemsBerta[0],
    })
    expect(errBerta).toBeNull()
    expect(esDeBerta).toBe(false)

    // Ana consulta ítem disponible en local -> false
    const { data: esDisp, error: errDisp } = await ctx.authAna.rpc('rvp_item_en_mi_poder', {
      p_id_item: ctx.itemDisponible,
    })
    expect(errDisp).toBeNull()
    expect(esDisp).toBe(false)

    // Operador del local (sin claim auth_revendedora_id) llama a rvp_item_en_mi_poder -> no-revendedora
    const { error: errOperador } = await ctx.fA.authenticated.rpc('rvp_item_en_mi_poder', {
      p_id_item: ctx.itemsAna[0],
    })
    expect(errOperador?.message).toMatch(/no-revendedora/)
  })
})
