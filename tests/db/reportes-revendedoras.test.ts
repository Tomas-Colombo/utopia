import { describe, expect, test } from 'vitest'
import { createServiceRoleTestClient } from '@/lib/dal/supabase-test'
import { hasTestDb, signInAs } from './_helpers'
import { ventaFixture } from './_fixtures-ventas'

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

describe.skipIf(!hasTestDb)('Slice 9 — Reportes de Revendedoras (REQ-RV-DB-08)', () => {
  test('1. fixture fijo: rf_perfil_revendedora, rf_cumplimiento_objetivos y rf_resumen_canal con cifras calculadas a mano', async () => {
    const f = await ventaFixture('RepRev', 1, { tipoIngreso: 'compra' })
    await habilitarModuloRevendedoras(f.tenantId)

    // Crear dos productos con precios fijos:
    // PA: precio 10.000, costo 4.000
    // PB: precio 20.000, costo 8.000
    const { data: cat } = await f.serviceRole
      .from('categoria')
      .select('id_categoria')
      .eq('id_tenant', f.tenantId)
      .single()

    const { data: prodA } = await f.serviceRole
      .from('producto')
      .insert({
        id_tenant: f.tenantId,
        id_categoria: cat!.id_categoria,
        nombre: 'Producto A',
        precio_venta: 10_000,
        precio_venta_resuelto_at: new Date().toISOString(),
      })
      .select('id_producto')
      .single()

    await f.authenticated.rpc('sp_crear_stock_directo', {
      p_id_producto: prodA!.id_producto,
      p_costo: 4_000,
      p_tipo_ingreso: 'compra',
      p_items: [{ talle: null, cantidad: 4 }],
    })

    const { data: prodB } = await f.serviceRole
      .from('producto')
      .insert({
        id_tenant: f.tenantId,
        id_categoria: cat!.id_categoria,
        nombre: 'Producto B',
        precio_venta: 20_000,
        precio_venta_resuelto_at: new Date().toISOString(),
      })
      .select('id_producto')
      .single()

    await f.authenticated.rpc('sp_crear_stock_directo', {
      p_id_producto: prodB!.id_producto,
      p_costo: 8_000,
      p_tipo_ingreso: 'compra',
      p_items: [{ talle: null, cantidad: 3 }], // 2 para consignar + 1 para local
    })

    // Obtener los items creados
    const { data: itemsA } = await f.serviceRole
      .from('item_producto')
      .select('id_item')
      .eq('id_producto', prodA!.id_producto)
      .eq('estado_item', 'disponible')
    expect(itemsA).toHaveLength(4)

    const { data: itemsB } = await f.serviceRole
      .from('item_producto')
      .select('id_item')
      .eq('id_producto', prodB!.id_producto)
      .eq('estado_item', 'disponible')
    expect(itemsB).toHaveLength(3)

    // Crear revendedora Lucía Méndez
    const { data: idLucia } = await f.authenticated.rpc('sp_crear_revendedora', {
      p_nombre: 'Lucía',
      p_apellido: 'Méndez',
    })

    // Regla de comisión por escalas:
    // Tramo 1: 0 -> 10%
    // Tramo 2: 50.000 -> 15%
    // Tramo 3: 100.000 -> 20%
    const { data: regla } = await f.serviceRole
      .from('regla_comision')
      .insert({
        id_tenant: f.tenantId,
        id_revendedora: idLucia,
        ambito: 'revendedora',
        vigente_desde: '2026-01-01',
        activo: true,
      })
      .select('id_regla')
      .single()

    await f.serviceRole.from('escala_comision').insert([
      { id_tenant: f.tenantId, id_regla: regla!.id_regla, objetivo_desde: 0, porcentaje: 10 },
      { id_tenant: f.tenantId, id_regla: regla!.id_regla, objetivo_desde: 50_000, porcentaje: 15 },
      { id_tenant: f.tenantId, id_regla: regla!.id_regla, objetivo_desde: 100_000, porcentaje: 20 },
    ])

    // Consignar a Lucía: 4 unidades de PA y 2 unidades de PB (total 6 piezas, $80.000)
    const itemsConsignar = [
      itemsA![0].id_item, itemsA![1].id_item, itemsA![2].id_item, itemsA![3].id_item,
      itemsB![0].id_item, itemsB![1].id_item,
    ]
    const { data: idConsig } = await f.authenticated.rpc('sp_crear_consignacion_revendedora_con_items', {
      p_id_revendedora: idLucia,
      p_items: itemsConsignar,
      p_periodo_desde: '2026-10-01',
    })
    await f.authenticated.rpc('sp_confirmar_consignacion_revendedora', {
      p_id_consignacion_revendedora: idConsig,
    })

    // Venta 1 canal revendedora (Lucía): 2 items de PA ($20.000)
    const { error: errV1 } = await f.authenticated.rpc('sp_registrar_venta', {
      p_lineas: [{ id_item: itemsA![0].id_item }, { id_item: itemsA![1].id_item }],
      p_canal: 'revendedora',
      p_id_revendedora: idLucia,
    })
    expect(errV1).toBeNull()

    // Venta 2 canal revendedora (Lucía): 1 item de PB ($20.000)
    const { error: errV2 } = await f.authenticated.rpc('sp_registrar_venta', {
      p_lineas: [{ id_item: itemsB![0].id_item }],
      p_canal: 'revendedora',
      p_id_revendedora: idLucia,
    })
    expect(errV2).toBeNull()

    // Venta 3 canal local: 1 item de PB ($20.000)
    const { error: errV3 } = await f.authenticated.rpc('sp_registrar_venta', {
      p_lineas: [{ id_item: itemsB![2].id_item }],
      p_forma_pago: 'efectivo',
      p_id_cliente: f.idCliente,
      p_pagos: [
        {
          medio: 'efectivo',
          id_cuenta_destino: f.idCuenta,
          monto: 20_000,
        },
      ],
    })
    expect(errV3).toBeNull()

    const hoy = new Date().toISOString().slice(0, 10)
    const mesDesde = '2026-10-01'

    // ─────────────────────────────────────────────────────────────────────────────
    // 1. Verificación rf_perfil_revendedora
    // ─────────────────────────────────────────────────────────────────────────────
    const { data: perfilData, error: errPerfil } = await f.authenticated.rpc('rf_perfil_revendedora', {
      p_desde: mesDesde,
      p_hasta: hoy,
      p_id_revendedora: idLucia,
    })
    expect(errPerfil).toBeNull()
    expect(perfilData).toHaveLength(1)
    const perfil = perfilData![0]

    expect(perfil.id_revendedora).toBe(idLucia)
    expect(perfil.nombre).toBe('Lucía')
    expect(perfil.apellido).toBe('Méndez')
    expect(Number(perfil.total_vendido)).toBe(40_000)
    expect(Number(perfil.cantidad_ventas)).toBe(2)
    expect(Number(perfil.ticket_promedio)).toBe(20_000)
    expect(Number(perfil.comision_liquidada)).toBe(0)
    expect(Number(perfil.comision_estimada)).toBe(4_000)
    expect(Number(perfil.adeudado)).toBe(40_000)
    expect(Number(perfil.items_entregados)).toBe(6)
    expect(Number(perfil.items_vendidos)).toBe(3)
    expect(Number(perfil.rotacion)).toBe(50.00)

    // Cruzar vendido, comisión estimada y adeudado contra rf_cuenta_corriente_revendedora
    const { data: ccData, error: errCC } = await f.authenticated.rpc('rf_cuenta_corriente_revendedora', {
      p_id_revendedora: idLucia,
    })
    expect(errCC).toBeNull()
    expect(Number(ccData[0].total_vendido)).toBe(Number(perfil.total_vendido))
    expect(Number(ccData[0].adeudado)).toBe(Number(perfil.adeudado))

    // Cruzar vendido, comisión y adeudado contra rf_panel_revendedoras
    const { data: panelData, error: errPanel } = await f.authenticated.rpc('rf_panel_revendedoras', {
      p_desde: mesDesde,
      p_hasta: hoy,
      p_busqueda: 'Lucía',
    })
    expect(errPanel).toBeNull()
    expect(panelData).toHaveLength(1)
    expect(Number(panelData[0].vendido_periodo)).toBe(Number(perfil.total_vendido))
    expect(Number(panelData[0].comision_estimada)).toBe(Number(perfil.comision_estimada))
    expect(Number(panelData[0].adeudado)).toBe(Number(perfil.adeudado))

    // ─────────────────────────────────────────────────────────────────────────────
    // 2. Verificación rf_cumplimiento_objetivos
    // ─────────────────────────────────────────────────────────────────────────────
    const { data: objData, error: errObj } = await f.authenticated.rpc('rf_cumplimiento_objetivos', {
      p_desde: mesDesde,
      p_hasta: hoy,
      p_id_revendedora: idLucia,
    })
    expect(errObj).toBeNull()
    expect(objData).toHaveLength(1)
    const obj = objData![0]

    expect(obj.id_revendedora).toBe(idLucia)
    expect(Number(obj.vendido_periodo)).toBe(40_000)
    expect(Number(obj.tramo_actual_desde)).toBe(0)
    expect(Number(obj.porcentaje_actual)).toBe(10)
    expect(Number(obj.proximo_tramo_desde)).toBe(50_000)
    expect(Number(obj.proximo_porcentaje)).toBe(15)
    expect(Number(obj.falta_para_proximo)).toBe(10_000)

    // ─────────────────────────────────────────────────────────────────────────────
    // 3. Verificación rf_resumen_canal
    // ─────────────────────────────────────────────────────────────────────────────
    const { data: canalData, error: errCanal } = await f.authenticated.rpc('rf_resumen_canal', {
      p_desde: mesDesde,
      p_hasta: hoy,
    })
    expect(errCanal).toBeNull()
    expect(canalData).toBeDefined()
    const canal = canalData![0]

    expect(Number(canal.ventas_local_monto)).toBe(20_000)
    expect(Number(canal.ventas_local_cant)).toBe(1)
    expect(Number(canal.ventas_revendedora_monto)).toBe(40_000)
    expect(Number(canal.ventas_revendedora_cant)).toBe(2)
    expect(Number(canal.comision_revendedora_monto)).toBe(4_000)
    expect(Number(canal.stock_revendedoras_cant)).toBe(3)
    expect(Number(canal.stock_revendedoras_valor)).toBe(40_000)
  })

  test('2. aislamiento entre tenants: Tenant B no ve las métricas ni revendedoras de Tenant A', async () => {
    const fA = await ventaFixture('RepIsoA', 1, { tipoIngreso: 'compra' })
    const fB = await ventaFixture('RepIsoB', 1, { tipoIngreso: 'compra' })
    await habilitarModuloRevendedoras(fA.tenantId)
    await habilitarModuloRevendedoras(fB.tenantId)

    const { data: idRevA } = await fA.authenticated.rpc('sp_crear_revendedora', {
      p_nombre: 'RevA',
      p_apellido: 'TenantA',
    })

    const hoy = new Date().toISOString().slice(0, 10)
    const { data: perfilB } = await fB.authenticated.rpc('rf_perfil_revendedora', {
      p_desde: '2026-10-01',
      p_hasta: hoy,
      p_id_revendedora: idRevA,
    })
    expect(perfilB).toHaveLength(0)

    const { data: objB } = await fB.authenticated.rpc('rf_cumplimiento_objetivos', {
      p_desde: '2026-10-01',
      p_hasta: hoy,
      p_id_revendedora: idRevA,
    })
    expect(objB).toHaveLength(0)
  })

  test('3. modulo-revendedoras-deshabilitado: todas las funciones fallan si el módulo está apagado', async () => {
    const f = await ventaFixture('RepModOff', 1, { tipoIngreso: 'compra' })
    // Módulo revendedoras NO habilitado

    const hoy = new Date().toISOString().slice(0, 10)
    const { error: err1 } = await f.authenticated.rpc('rf_perfil_revendedora', {
      p_desde: '2026-10-01',
      p_hasta: hoy,
    })
    expect(err1?.message).toMatch(/modulo-revendedoras-deshabilitado/)

    const { error: err2 } = await f.authenticated.rpc('rf_cumplimiento_objetivos', {
      p_desde: '2026-10-01',
      p_hasta: hoy,
    })
    expect(err2?.message).toMatch(/modulo-revendedoras-deshabilitado/)

    const { error: err3 } = await f.authenticated.rpc('rf_resumen_canal', {
      p_desde: '2026-10-01',
      p_hasta: hoy,
    })
    expect(err3?.message).toMatch(/modulo-revendedoras-deshabilitado/)
  })

  test('4. sesión de revendedora rechazada con no-permission', async () => {
    const f = await ventaFixture('RepNoPerm', 1, { tipoIngreso: 'compra' })
    await habilitarModuloRevendedoras(f.tenantId)

    const { data: idRev } = await f.authenticated.rpc('sp_crear_revendedora', {
      p_nombre: 'RevSesion',
      p_apellido: 'Test',
    })

    const emailRev = `rev_rep_${Date.now()}@utopia.test`
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

    const hoy = new Date().toISOString().slice(0, 10)
    const { error: err1 } = await authRev.rpc('rf_perfil_revendedora', {
      p_desde: '2026-10-01',
      p_hasta: hoy,
    })
    expect(err1?.message).toMatch(/no-permission/)

    const { error: err2 } = await authRev.rpc('rf_cumplimiento_objetivos', {
      p_desde: '2026-10-01',
      p_hasta: hoy,
    })
    expect(err2?.message).toMatch(/no-permission/)

    const { error: err3 } = await authRev.rpc('rf_resumen_canal', {
      p_desde: '2026-10-01',
      p_hasta: hoy,
    })
    expect(err3?.message).toMatch(/no-permission/)
  })
})
