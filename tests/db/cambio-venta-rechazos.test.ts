import { describe, expect, test } from 'vitest'
import { createServiceRoleTestClient } from '@/lib/dal/supabase-test'
import { hasTestDb, signInAs } from './_helpers'
import { ventaFixture, venderContado, venderFinanciado, PRECIO, COSTO } from './_fixtures-ventas'

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

describe.skipIf(!hasTestDb)('Slice 8 — Cambios de Producto: Matriz de Rechazos (REQ-RV-DB-07, DR-5, DR-7)', () => {
  test('rechazos: venta liquidada, cuotas abiertas, ítem no disponible, línea ya cambiada o devuelta, sesión revendedora', async () => {
    const f = await ventaFixture('CambioRechazos', 2, { tipoIngreso: 'compra' })
    await habilitarModuloRevendedoras(f.tenantId)

    // 3a. Línea ya cambiada o devuelta
    const { data: idVenta1 } = await venderContado(f, { items: [f.items[0]] })
    const { data: det1 } = await f.serviceRole
      .from('detalle_venta')
      .select('id_detalle_venta')
      .eq('id_venta', idVenta1)
      .single()

    // Primer cambio OK
    const { error: errOk } = await f.authenticated.rpc('sp_registrar_cambio', {
      p_id_detalle_original: det1!.id_detalle_venta,
      p_id_item_entregado: f.items[1],
    })
    expect(errOk).toBeNull()

    // Intentar segundo cambio sobre el mismo detalle original -> detalle-ya-cambiado
    const { error: errYaCambiado } = await f.authenticated.rpc('sp_registrar_cambio', {
      p_id_detalle_original: det1!.id_detalle_venta,
      p_id_item_entregado: f.items[0],
    })
    expect(errYaCambiado?.message).toMatch(/detalle-ya-cambiado/)

    // 3b. Venta liquidada -> venta-liquidada
    const { data: idRev } = await f.authenticated.rpc('sp_crear_revendedora', {
      p_nombre: 'Rechazos',
      p_apellido: 'Rev',
    })

    const { data: cat } = await f.serviceRole
      .from('categoria')
      .select('id_categoria')
      .eq('id_tenant', f.tenantId)
      .limit(1)
      .single()

    const { data: prodExtra } = await f.serviceRole
      .from('producto')
      .insert({
        id_tenant: f.tenantId,
        id_categoria: cat!.id_categoria,
        nombre: 'ProdExtra',
        precio_venta: PRECIO,
        precio_venta_resuelto_at: new Date().toISOString(),
      })
      .select('id_producto')
      .single()

    await f.authenticated.rpc('sp_crear_stock_directo', {
      p_id_producto: prodExtra!.id_producto,
      p_costo: COSTO,
      p_tipo_ingreso: 'compra',
      p_items: [{ talle: null, cantidad: 1 }],
    })

    const { data: itemExtra } = await f.serviceRole
      .from('item_producto')
      .select('id_item')
      .eq('id_producto', prodExtra!.id_producto)
      .eq('estado_item', 'disponible')
      .single()

    const { data: idConsigLiq } = await f.authenticated.rpc(
      'sp_crear_consignacion_revendedora_con_items',
      {
        p_id_revendedora: idRev,
        p_items: [itemExtra!.id_item],
        p_periodo_desde: '2026-10-01',
      },
    )
    await f.authenticated.rpc('sp_confirmar_consignacion_revendedora', {
      p_id_consignacion_revendedora: idConsigLiq,
    })

    const { data: idVentaRev } = await f.authenticated.rpc('sp_registrar_venta', {
      p_lineas: [{ id_item: itemExtra!.id_item }],
      p_canal: 'revendedora',
      p_id_revendedora: idRev,
    })

    const { data: detRev } = await f.serviceRole
      .from('detalle_venta')
      .select('id_detalle_venta')
      .eq('id_venta', idVentaRev)
      .single()

    const hoy = new Date().toISOString().slice(0, 10)
    await f.authenticated.rpc('sp_generar_liquidacion', {
      p_id_revendedora: idRev,
      p_desde: '2026-10-01',
      p_hasta: hoy,
    })

    // Intentar cambio sobre venta liquidada
    const { error: errLiq } = await f.authenticated.rpc('sp_registrar_cambio', {
      p_id_detalle_original: detRev!.id_detalle_venta,
      p_id_item_entregado: f.items[0],
    })
    expect(errLiq?.message).toMatch(/venta-liquidada/)

    // 3c. Ítem entregado no disponible
    const { data: idVenta2 } = await venderContado(f, { items: [f.items[0]] })
    const { data: det2 } = await f.serviceRole
      .from('detalle_venta')
      .select('id_detalle_venta')
      .eq('id_venta', idVenta2)
      .single()

    // Intentar entregar f.items[0] que ya está vendido
    const { error: errNoDisp } = await f.authenticated.rpc('sp_registrar_cambio', {
      p_id_detalle_original: det2!.id_detalle_venta,
      p_id_item_entregado: f.items[0],
    })
    expect(errNoDisp?.message).toMatch(/item-no-disponible|item-no-esta-disponible/)

    // 3d. Línea ya devuelta -> detalle-ya-devuelto
    const { data: prodDev } = await f.serviceRole
      .from('producto')
      .insert({
        id_tenant: f.tenantId,
        id_categoria: cat!.id_categoria,
        nombre: 'ProdDev',
        precio_venta: PRECIO,
        precio_venta_resuelto_at: new Date().toISOString(),
      })
      .select('id_producto')
      .single()

    await f.authenticated.rpc('sp_crear_stock_directo', {
      p_id_producto: prodDev!.id_producto,
      p_costo: COSTO,
      p_tipo_ingreso: 'compra',
      p_items: [{ talle: null, cantidad: 2 }],
    })

    const { data: itemsDev } = await f.serviceRole
      .from('item_producto')
      .select('id_item')
      .eq('id_producto', prodDev!.id_producto)
      .eq('estado_item', 'disponible')

    const { data: idVentaDev } = await venderContado(f, { items: [itemsDev![0].id_item] })
    const { data: detDev } = await f.serviceRole
      .from('detalle_venta')
      .select('id_detalle_venta')
      .eq('id_venta', idVentaDev)
      .single()

    await f.authenticated.rpc('sp_registrar_devolucion_cliente', {
      p_id_detalle_venta: detDev!.id_detalle_venta,
      p_motivo: 'Devolución test',
      p_id_cuenta_reintegro: f.idCuenta,
      p_medio_reintegro: 'efectivo',
    })

    const { error: errYaDevuelto } = await f.authenticated.rpc('sp_registrar_cambio', {
      p_id_detalle_original: detDev!.id_detalle_venta,
      p_id_item_entregado: itemsDev![1].id_item,
    })
    expect(errYaDevuelto?.message).toMatch(/detalle-ya-devuelto/)

    // 3e. Venta con cuotas abiertas -> cambio-venta-con-cuotas-abiertas
    const { data: idVentaCuotas } = await venderFinanciado(f, {
      items: [itemsDev![1].id_item],
      cuotas: 3,
      primerVencimiento: '2026-11-01',
    })
    const { data: detCuotas } = await f.serviceRole
      .from('detalle_venta')
      .select('id_detalle_venta')
      .eq('id_venta', idVentaCuotas)
      .single()

    const { error: errCuotas } = await f.authenticated.rpc('sp_registrar_cambio', {
      p_id_detalle_original: detCuotas!.id_detalle_venta,
      p_id_item_entregado: f.items[1],
    })
    expect(errCuotas?.message).toMatch(/cambio-venta-con-cuotas-abiertas/)

    // 3f. Sesión de revendedora rechazada con no-permission
    const emailRev = `rev_cambio_${Date.now()}@utopia.test`
    const { data: userRevAuth } = await f.serviceRole.auth.admin.createUser({
      email: emailRev,
      password: 'Password123!',
      email_confirm: true,
    })

    const { data: rolRev } = await f.serviceRole.from('rol').insert({
      id_tenant: f.tenantId,
      nombre: 'Revendedora',
      permisos: { revendedoras: ['ver_propio'] },
    }).select('id_rol').single()

    await f.serviceRole.rpc('sp_enlazar_revendedora_usuario', {
      p_id_revendedora: idRev,
      p_id_usuario: userRevAuth.user!.id,
      p_id_tenant: f.tenantId,
      p_email: emailRev,
      p_nombre: 'Rev User',
      p_id_rol: rolRev!.id_rol,
    })

    const authRev = await signInAs({
      email: emailRev,
      password: 'Password123!',
    })

    const { error: errNoPerm } = await authRev.rpc('sp_registrar_cambio', {
      p_id_detalle_original: det1!.id_detalle_venta,
      p_id_item_entregado: f.items[1],
    })
    expect(errNoPerm?.message).toMatch(/no-permission/)
  })
})
