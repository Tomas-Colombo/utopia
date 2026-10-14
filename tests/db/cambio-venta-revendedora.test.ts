import { describe, expect, test } from 'vitest'
import { createServiceRoleTestClient } from '@/lib/dal/supabase-test'
import { hasTestDb } from './_helpers'
import { ventaFixture, PRECIO, COSTO } from './_fixtures-ventas'

async function habilitarModuloRevendedoras(tenantId: string) {
  const sr = createServiceRoleTestClient()
  const { data: mod, error: modErr } = await sr
    .from('modulo')
    .select('id_modulo')
    .eq('codigo', 'revendedoras')
    .single()
  expect(modErr).toBeNull()
  const { error } = await sr
    .from('tenant_modulo')
    .upsert({ id_tenant: tenantId, id_modulo: mod!.id_modulo, habilitado: true })
  expect(error).toBeNull()
}

describe.skipIf(!hasTestDb)('Slice 8 — Cambios de Producto en Canal Revendedora (REQ-RV-DB-07, DR-5, DR-7)', () => {
  test('1. cambio en canal revendedora con diferencia 0: ítem original vuelve a en_revendedora (reabre consignación), nuevo a vendido, comisión invariante', async () => {
    const f = await ventaFixture('CambioRevDif0', 2, { tipoIngreso: 'compra' })
    await habilitarModuloRevendedoras(f.tenantId)

    // Crear revendedora y regla de comisión 10%
    const { data: idRev } = await f.authenticated.rpc('sp_crear_revendedora', {
      p_nombre: 'Clara',
      p_apellido: 'Rev',
    })

    const { data: regla } = await f.serviceRole
      .from('regla_comision')
      .insert({
        id_tenant: f.tenantId,
        id_revendedora: idRev,
        ambito: 'revendedora',
        vigente_desde: '2026-01-01',
        activo: true,
      })
      .select('id_regla')
      .single()

    await f.serviceRole.from('escala_comision').insert({
      id_tenant: f.tenantId,
      id_regla: regla!.id_regla,
      objetivo_desde: 0,
      porcentaje: 10,
    })

    // Entregar items 0 y 1 a la revendedora
    const { data: idConsig } = await f.authenticated.rpc(
      'sp_crear_consignacion_revendedora_con_items',
      {
        p_id_revendedora: idRev,
        p_items: [f.items[0], f.items[1]],
        p_periodo_desde: '2026-10-01',
      },
    )
    await f.authenticated.rpc('sp_confirmar_consignacion_revendedora', {
      p_id_consignacion_revendedora: idConsig,
    })

    // Venta canal revendedora de ítem 0
    const { data: idVenta, error: errVenta } = await f.authenticated.rpc('sp_registrar_venta', {
      p_lineas: [{ id_item: f.items[0] }],
      p_canal: 'revendedora',
      p_id_revendedora: idRev,
    })
    expect(errVenta).toBeNull()

    const { data: detOriginal } = await f.serviceRole
      .from('detalle_venta')
      .select('id_detalle_venta')
      .eq('id_venta', idVenta)
      .single()

    // Registrar cambio por ítem 1 (que está en consignación de esa revendedora)
    const { error: errCambio } = await f.authenticated.rpc('sp_registrar_cambio', {
      p_id_detalle_original: detOriginal!.id_detalle_venta,
      p_id_item_entregado: f.items[1],
      p_motivo: 'Cambio cliente revendedora',
    })
    expect(errCambio).toBeNull()

    // Ítem original vuelve a en_revendedora
    const { data: itemOrig } = await f.serviceRole
      .from('item_producto')
      .select('estado_item')
      .eq('id_item', f.items[0])
      .single()
    expect(itemOrig?.estado_item).toBe('en_revendedora')

    // Línea de consignación de ítem original vuelve a en_poder
    const { data: consigDetOrig } = await f.serviceRole
      .from('consignacion_revendedora_detalle')
      .select('estado_detalle')
      .eq('id_item', f.items[0])
      .single()
    expect(consigDetOrig?.estado_detalle).toBe('en_poder')

    // Ítem entregado pasa a vendido
    const { data: itemEntregado } = await f.serviceRole
      .from('item_producto')
      .select('estado_item')
      .eq('id_item', f.items[1])
      .single()
    expect(itemEntregado?.estado_item).toBe('vendido')

    // Línea de consignación de ítem entregado pasa a vendido
    const { data: consigDetNuevo } = await f.serviceRole
      .from('consignacion_revendedora_detalle')
      .select('estado_detalle')
      .eq('id_item', f.items[1])
      .single()
    expect(consigDetNuevo?.estado_detalle).toBe('vendido')

    // Comisión invariante en preview_liquidacion: 10% sobre PRECIO
    const hoy = new Date().toISOString().slice(0, 10)
    const { data: preview } = await f.authenticated.rpc('preview_liquidacion', {
      p_id_revendedora: idRev,
      p_desde: '2026-10-01',
      p_hasta: hoy,
    })
    expect(preview).toBeDefined()
    expect(Number(preview.monto_comision)).toBe(PRECIO * 0.1)
  })

  test('2. cambio en canal revendedora con diferencia positiva: suma a deuda de revendedora sin entrar a caja directa, sin comisión sobre la diferencia', async () => {
    const f = await ventaFixture('CambioRevDifPos', 1, { tipoIngreso: 'compra' })
    await habilitarModuloRevendedoras(f.tenantId)

    const { data: idRev } = await f.authenticated.rpc('sp_crear_revendedora', {
      p_nombre: 'Dora',
      p_apellido: 'Deuda',
    })

    const { data: regla } = await f.serviceRole
      .from('regla_comision')
      .insert({
        id_tenant: f.tenantId,
        id_revendedora: idRev,
        ambito: 'revendedora',
        vigente_desde: '2026-01-01',
        activo: true,
      })
      .select('id_regla')
      .single()

    await f.serviceRole.from('escala_comision').insert({
      id_tenant: f.tenantId,
      id_regla: regla!.id_regla,
      objetivo_desde: 0,
      porcentaje: 10,
    })

    // Crear un producto más caro ($62.000)
    const { data: cat } = await f.serviceRole
      .from('categoria')
      .select('id_categoria')
      .eq('id_tenant', f.tenantId)
      .single()

    const { data: prodCaro } = await f.serviceRole
      .from('producto')
      .insert({
        id_tenant: f.tenantId,
        id_categoria: cat!.id_categoria,
        nombre: 'Vestido Caro',
        precio_venta: PRECIO + 2000,
        precio_venta_resuelto_at: new Date().toISOString(),
      })
      .select('id_producto')
      .single()

    await f.authenticated.rpc('sp_crear_stock_directo', {
      p_id_producto: prodCaro!.id_producto,
      p_costo: COSTO + 1000,
      p_tipo_ingreso: 'compra',
      p_items: [{ talle: null, cantidad: 1 }],
    })

    const { data: itemCaro } = await f.serviceRole
      .from('item_producto')
      .select('id_item')
      .eq('id_producto', prodCaro!.id_producto)
      .eq('estado_item', 'disponible')
      .single()

    // Consignar ambos ítems a Dora
    const { data: idConsig } = await f.authenticated.rpc(
      'sp_crear_consignacion_revendedora_con_items',
      {
        p_id_revendedora: idRev,
        p_items: [f.items[0], itemCaro!.id_item],
        p_periodo_desde: '2026-10-01',
      },
    )
    await f.authenticated.rpc('sp_confirmar_consignacion_revendedora', {
      p_id_consignacion_revendedora: idConsig,
    })

    // Venta canal revendedora del ítem 0
    const { data: idVenta } = await f.authenticated.rpc('sp_registrar_venta', {
      p_lineas: [{ id_item: f.items[0] }],
      p_canal: 'revendedora',
      p_id_revendedora: idRev,
    })

    const { data: detOriginal } = await f.serviceRole
      .from('detalle_venta')
      .select('id_detalle_venta')
      .eq('id_venta', idVenta)
      .single()

    // Cambio por el ítem más caro
    const { error: errCambio } = await f.authenticated.rpc('sp_registrar_cambio', {
      p_id_detalle_original: detOriginal!.id_detalle_venta,
      p_id_item_entregado: itemCaro!.id_item,
      p_motivo: 'Cambio de fiesta',
    })
    expect(errCambio).toBeNull()

    // Verificar cuenta corriente de revendedora: adeudado = PRECIO + 2000
    const { data: cc } = await f.authenticated.rpc('rf_cuenta_corriente_revendedora', {
      p_id_revendedora: idRev,
    })
    expect(Number(cc[0].adeudado)).toBe(PRECIO + 2000)

    // Caja directa del local = 0 (no entra a cobrado en flujo)
    const hoy = new Date().toISOString().slice(0, 10)
    const { data: flujo } = await f.authenticated.rpc('rf_finanzas_flujo', {
      p_desde: hoy,
      p_hasta: hoy,
    })
    expect(Number(flujo![0].cobrado)).toBe(0)

    // Liquidación: comisión sigue siendo 10% sobre PRECIO, la diferencia NO genera comisión
    const { data: preview } = await f.authenticated.rpc('preview_liquidacion', {
      p_id_revendedora: idRev,
      p_desde: '2026-10-01',
      p_hasta: hoy,
    })
    expect(Number(preview.monto_comision)).toBe(PRECIO * 0.1)
  })
})
