import { describe, expect, test } from 'vitest'
import { createTenantWithUser, signInAs, hasTestDb } from './_helpers'
import { ventaFixture } from './_fixtures-ventas'
import { createServiceRoleTestClient } from '@/lib/dal/supabase-test'

interface PreviewLiquidacion {
  cantidad_lineas?: number
  monto_vendido?: number
  porcentaje_resuelto?: number
  monto_comision?: number
  monto_a_cobrar?: number
}

async function habilitarModulo(tenantId: string, codigo: string) {
  const sr = createServiceRoleTestClient()
  const { data: mod, error: modErr } = await sr
    .from('modulo')
    .select('id_modulo')
    .eq('codigo', codigo)
    .single()
  expect(modErr).toBeNull()
  const { error } = await sr
    .from('tenant_modulo')
    .upsert({ id_tenant: tenantId, id_modulo: mod!.id_modulo, habilitado: true })
  expect(error).toBeNull()
}

describe.skipIf(!hasTestDb)('Liquidación de revendedoras — Seguridad y aislamiento (REQ-RV-DB-06 / REQ-RV-ACC-07)', () => {
  test('módulo apagado: preview, generar, excluir, reincluir y marcar pagada rechazados con modulo-revendedoras-deshabilitado', async () => {
    const user = await createTenantWithUser('LiqModOff')
    const authenticated = await signInAs(user)
    const fakeId = '00000000-0000-0000-0000-000000000001'

    const { error: errPrev } = await authenticated.rpc('preview_liquidacion', {
      p_id_revendedora: fakeId,
      p_desde: '2026-05-01',
      p_hasta: '2026-05-31',
    })
    expect(errPrev?.message).toContain('modulo-revendedoras-deshabilitado')

    const { error: errGen } = await authenticated.rpc('sp_generar_liquidacion', {
      p_id_revendedora: fakeId,
      p_desde: '2026-05-01',
      p_hasta: '2026-05-31',
    })
    expect(errGen?.message).toContain('modulo-revendedoras-deshabilitado')

    const { error: errExc } = await authenticated.rpc('sp_excluir_detalle_liquidacion', {
      p_id_detalle: fakeId,
    })
    expect(errExc?.message).toContain('modulo-revendedoras-deshabilitado')

    const { error: errReinc } = await authenticated.rpc('sp_reincluir_detalle_liquidacion', {
      p_id_detalle: fakeId,
    })
    expect(errReinc?.message).toContain('modulo-revendedoras-deshabilitado')

    const { error: errPago } = await authenticated.rpc('sp_marcar_liquidacion_pagada', {
      p_id_liquidacion: fakeId,
      p_id_cuenta: fakeId,
      p_monto: 10_000,
    })
    expect(errPago?.message).toContain('modulo-revendedoras-deshabilitado')
  })

  test('aislamiento entre tenants: tenant B no puede ver ni operar liquidaciones de tenant A', async () => {
    const userA = await createTenantWithUser('LiqIsoA')
    const authA = await signInAs(userA)
    const srA = userA.serviceRole
    await habilitarModulo(userA.tenantId, 'revendedoras')

    const userB = await createTenantWithUser('LiqIsoB')
    const authB = await signInAs(userB)
    const srB = userB.serviceRole
    await habilitarModulo(userB.tenantId, 'revendedoras')

    const { data: revA } = await srA.from('revendedora').insert({
      id_tenant: userA.tenantId,
      nombre: 'Rev Tenant A',
      apellido: 'Tenant A',
      activo: true,
    }).select('id_revendedora').single()

    // B no puede hacer preview de revendedora de A
    const { error: prevErr } = await authB.rpc('preview_liquidacion', {
      p_id_revendedora: revA!.id_revendedora,
      p_desde: '2026-05-01',
      p_hasta: '2026-05-31',
    })
    expect(prevErr?.message).toContain('revendedora-not-found')

    // B no puede generar liquidación para revendedora de A
    const { error: genErr } = await authB.rpc('sp_generar_liquidacion', {
      p_id_revendedora: revA!.id_revendedora,
      p_desde: '2026-05-01',
      p_hasta: '2026-05-31',
    })
    expect(genErr?.message).toContain('revendedora-not-found')

    // Crear liquidación en A
    const { data: liqA } = await srA.from('liquidacion_revendedora').insert({
      id_tenant: userA.tenantId,
      id_revendedora: revA!.id_revendedora,
      periodo_desde: '2026-05-01',
      periodo_hasta: '2026-05-31',
      monto_vendido: 100_000,
      monto_comision: 10_000,
      monto_a_cobrar: 90_000,
      cantidad_lineas: 1,
      porcentaje_aplicado: 10,
      estado: 'pendiente',
    }).select('id_liquidacion').single()

    // Cuenta en B
    const { data: ctaB } = await srB.from('cuenta_destino').insert({
      id_tenant: userB.tenantId,
      nombre: 'Caja B',
      tipo: 'efectivo',
      activo: true,
    }).select('id_cuenta_destino').single()

    // B no puede marcar pagada la liquidación de A
    const { error: pagoBErr } = await authB.rpc('sp_marcar_liquidacion_pagada', {
      p_id_liquidacion: liqA!.id_liquidacion,
      p_id_cuenta: ctaB!.id_cuenta_destino,
      p_monto: 90_000,
    })
    expect(pagoBErr?.message).toContain('liquidacion-no-encontrada')

    // A no puede pagar su liquidación usando la cuenta de B (cuenta ajena)
    const { error: ctaAjenaErr } = await authA.rpc('sp_marcar_liquidacion_pagada', {
      p_id_liquidacion: liqA!.id_liquidacion,
      p_id_cuenta: ctaB!.id_cuenta_destino,
      p_monto: 90_000,
    })
    expect(ctaAjenaErr?.message).toContain('cuenta-invalida-liquidacion')

    // RLS: B consulta liquidacion_revendedora y ve 0 filas de A
    const { data: liqsB } = await authB.from('liquidacion_revendedora').select('*').eq('id_liquidacion', liqA!.id_liquidacion)
    expect(liqsB).toHaveLength(0)
  })

  test('seguridad: una sesión de revendedora es rechazada en cada SP con no-permission', async () => {
    const f = await ventaFixture('LiqRevSec', 1, { tipoIngreso: 'compra' })
    await habilitarModulo(f.tenantId, 'revendedoras')

    const { data: rev } = await f.serviceRole.from('revendedora').insert({
      id_tenant: f.tenantId,
      nombre: 'Paula',
      apellido: 'RevAuth',
      activo: true,
    }).select('id_revendedora').single()

    const emailRev = `paula_${Date.now()}@utopia.test`
    const { data: userAuth, error: authErr } = await f.serviceRole.auth.admin.createUser({
      email: emailRev,
      password: 'Password123!',
      email_confirm: true,
    })
    expect(authErr).toBeNull()

    const { data: rId } = await f.serviceRole.from('rol').insert({
      id_tenant: f.tenantId,
      nombre: 'Revendedora',
      permisos: { revendedoras: ['ver_propio'] },
    }).select('id_rol').single()

    await f.serviceRole.rpc('sp_enlazar_revendedora_usuario', {
      p_id_revendedora: rev!.id_revendedora,
      p_id_usuario: userAuth.user!.id,
      p_id_tenant: f.tenantId,
      p_email: emailRev,
      p_nombre: 'Paula RevAuth',
      p_id_rol: rId!.id_rol,
    })

    const authRev = await signInAs({ email: emailRev, password: 'Password123!' })
    const fakeId = '00000000-0000-0000-0000-000000000001'

    const { error: errPrev } = await authRev.rpc('preview_liquidacion', {
      p_id_revendedora: rev!.id_revendedora,
      p_desde: '2026-05-01',
      p_hasta: '2026-05-31',
    })
    expect(errPrev?.message).toContain('no-permission')

    const { error: errGen } = await authRev.rpc('sp_generar_liquidacion', {
      p_id_revendedora: rev!.id_revendedora,
      p_desde: '2026-05-01',
      p_hasta: '2026-05-31',
    })
    expect(errGen?.message).toContain('no-permission')

    const { error: errExc } = await authRev.rpc('sp_excluir_detalle_liquidacion', {
      p_id_detalle: fakeId,
    })
    expect(errExc?.message).toContain('no-permission')

    const { error: errReinc } = await authRev.rpc('sp_reincluir_detalle_liquidacion', {
      p_id_detalle: fakeId,
    })
    expect(errReinc?.message).toContain('no-permission')

    const { error: errPago } = await authRev.rpc('sp_marcar_liquidacion_pagada', {
      p_id_liquidacion: fakeId,
      p_id_cuenta: fakeId,
      p_monto: 10_000,
    })
    expect(errPago?.message).toContain('no-permission')
  })

  test('venta registrada entre preview y commit: se captura una vez sin duplicar', async () => {
    const f = await ventaFixture('LiqConcurrente', 2, { tipoIngreso: 'compra' })
    await habilitarModulo(f.tenantId, 'revendedoras')
    const sr = f.serviceRole

    const { data: rev } = await sr.from('revendedora').insert({
      id_tenant: f.tenantId,
      nombre: 'Lucia',
      apellido: 'Concurrente',
      activo: true,
    }).select('id_revendedora').single()
    const idRev = rev!.id_revendedora

    const hoy = new Date().toISOString().slice(0, 10)
    const pDesde = hoy.slice(0, 8) + '01'
    const pHasta = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)
      .toISOString()
      .slice(0, 10)

    // Regla de comisión por tramos (Tramo 1: 10%, Tramo 2 > 100k: 15%)
    await f.authenticated.rpc('sp_crear_regla_comision', {
      p_ambito: 'revendedora',
      p_nombre: 'Regla Concurrente',
      p_id_revendedora: idRev,
      p_vigente_desde: pDesde,
      p_escalas: [
        { objetivo_desde: 0, porcentaje: 10 },
        { objetivo_desde: 100000.01, porcentaje: 15 },
      ],
    })

    // Entregar 2 ítems en consignación
    const { data: consig } = await sr.from('consignacion_revendedora').insert({
      id_tenant: f.tenantId,
      id_revendedora: idRev,
      confirmada: false,
      estado: 'abierta',
    }).select('id_consignacion_revendedora').single()

    await sr.from('consignacion_revendedora_detalle').insert([
      { id_tenant: f.tenantId, id_consignacion_revendedora: consig!.id_consignacion_revendedora, id_item: f.items[0], id_producto: f.idProducto, estado_detalle: 'pendiente' },
      { id_tenant: f.tenantId, id_consignacion_revendedora: consig!.id_consignacion_revendedora, id_item: f.items[1], id_producto: f.idProducto, estado_detalle: 'pendiente' },
    ])
    await f.authenticated.rpc('sp_confirmar_consignacion_revendedora', { p_id_consignacion_revendedora: consig!.id_consignacion_revendedora })

    // 1. Venta 1 de $60.000 (ítem 0)
    const { data: v1, error: v1Err } = await f.authenticated.rpc('sp_registrar_venta', {
      p_lineas: [{ id_item: f.items[0] }],
      p_forma_pago: 'efectivo',
      p_canal: 'revendedora',
      p_id_revendedora: idRev,
    })
    expect(v1Err).toBeNull()
    expect(v1).toBeTruthy()

    // 2. Operador hace preview: ve 1 sola línea ($60.000)
    const { data: prevData, error: prevErr } = await f.authenticated.rpc('preview_liquidacion', {
      p_id_revendedora: idRev,
      p_desde: pDesde,
      p_hasta: pHasta,
    })
    expect(prevErr).toBeNull()
    const prev = prevData as PreviewLiquidacion
    expect(prev.cantidad_lineas).toBe(1)
    expect(Number(prev.monto_vendido)).toBe(60_000)

    // 3. Antes de ejecutar sp_generar_liquidacion, entra Venta 2 ($60.000)
    const { data: v2, error: v2Err } = await f.authenticated.rpc('sp_registrar_venta', {
      p_lineas: [{ id_item: f.items[1] }],
      p_forma_pago: 'efectivo',
      p_canal: 'revendedora',
      p_id_revendedora: idRev,
    })
    expect(v2Err).toBeNull()
    expect(v2).toBeTruthy()

    // 4. Se ejecuta sp_generar_liquidacion: bloquea líneas candidatas con FOR UPDATE
    // y captura AMBAS ventas ($120.000 total, pasando a tramo 2: 15% -> 18.000 comision)
    const { data: idLiq, error: genErr } = await f.authenticated.rpc('sp_generar_liquidacion', {
      p_id_revendedora: idRev,
      p_desde: pDesde,
      p_hasta: pHasta,
      p_observaciones: 'Liquidacion con venta concurrente',
    })
    expect(genErr).toBeNull()
    expect(idLiq).toBeDefined()

    // Verificar cabecera recalculada desde las filas selladas
    const { data: liqRow } = await sr.from('liquidacion_revendedora').select('*').eq('id_liquidacion', idLiq as string).single()
    expect(liqRow!.cantidad_lineas).toBe(2)
    expect(Number(liqRow!.monto_vendido)).toBe(120_000)
    expect(Number(liqRow!.porcentaje_aplicado)).toBe(15)
    expect(Number(liqRow!.monto_comision)).toBe(18_000)
    expect(Number(liqRow!.monto_a_cobrar)).toBe(102_000)

    // 5. Invariante: las líneas están selladas y no se duplican
    const { data: prevPost } = await f.authenticated.rpc('preview_liquidacion', {
      p_id_revendedora: idRev,
      p_desde: pDesde,
      p_hasta: pHasta,
    })
    expect((prevPost as PreviewLiquidacion).cantidad_lineas).toBe(0)

    // Intentar generar nuevamente da liquidacion-vacia
    const { error: genDupErr } = await f.authenticated.rpc('sp_generar_liquidacion', {
      p_id_revendedora: idRev,
      p_desde: pDesde,
      p_hasta: pHasta,
    })
    expect(genDupErr?.message).toContain('liquidacion-vacia')
  })
})
