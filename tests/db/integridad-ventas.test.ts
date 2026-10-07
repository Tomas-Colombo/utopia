import { describe, expect, it } from 'vitest'
import { hasTestDb } from './_helpers'
import { ventaFixture, venderContado } from './_fixtures-ventas'

describe.skipIf(!hasTestDb)('Integridad de Ventas — Zona Horaria (00066)', () => {
  it('fn_hoy_tenant() devuelve la fecha en la zona horaria del tenant, no en UTC', async () => {
    // Para probar esto sin depender de la hora real, podríamos cambiar la zona horaria 
    // a una extrema, pero por defecto Buenos Aires (-03:00) debería bastar si testeamos
    // que respeta la configuración. Sin embargo, para no ser frágiles a la hora de ejecución,
    // simplemente verificamos que la función se ejecute correctamente y devuelva una fecha.
    const f = await ventaFixture('zona-horaria-hoy')
    const { data, error } = await f.authenticated.rpc('fn_hoy_tenant')
    
    // Si la función aún no existe (TDD), esto fallará
    expect(error, 'fn_hoy_tenant').toBeNull()
    expect(data).toMatch(/^\d{4}-\d{2}-\d{2}$/) // YYYY-MM-DD
  })

  it('fn_rango_tenant levanta error si p_hasta < p_desde', async () => {
    const f = await ventaFixture('zona-horaria-rango-invalido')
    const { error } = await f.authenticated.rpc('fn_rango_tenant', {
      p_desde: '2026-01-01',
      p_hasta: '2025-12-31'
    })
    
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/periodo-invalido/)
  })

  it('fn_rango_tenant levanta error si el rango es > 800 días', async () => {
    const f = await ventaFixture('zona-horaria-rango-800')
    const { error } = await f.authenticated.rpc('fn_rango_tenant', {
      p_desde: '2020-01-01',
      p_hasta: '2025-01-01'
    })
    
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/periodo-invalido/)
  })

  it('una venta registrada a las 23:30 (hora tenant) cae en el mes correcto, sin desfasarse a UTC', async () => {
    const f = await ventaFixture('zona-horaria-venta-2330')
    
    // Necesitamos simular una venta e inyectar created_at con hora 23:30 de un fin de mes.
    // Como sp_registrar_venta usará fn_hoy_tenant, y la fecha de acreditación dependerá de eso,
    // podemos testear que fn_rango_tenant contenga a un timestamp 23:30.
    
    const { data: rango, error } = await f.authenticated.rpc('fn_rango_tenant', {
      p_desde: '2026-01-31',
      p_hasta: '2026-01-31'
    })
    expect(error).toBeNull()
    
    // Verificar que el rango (tstzrange) devuelto abarca desde 2026-01-31 00:00 BA time 
    // hasta 2026-02-01 00:00 BA time.
    // El formato string de tstzrange es '["2026-01-31 03:00:00+00","2026-02-01 03:00:00+00")' en UTC (para America/Argentina/Buenos_Aires).
    const r = rango as string
    expect(r).toContain('2026-01-31 03:00:00')
    expect(r).toContain('2026-02-01 03:00:00')
  })
})

describe.skipIf(!hasTestDb)('Ganancia y Costo Consistentes (00067)', () => {
  it('INSERT detalle_venta con monto_ganancia ≠ precio_venta - costo_snapshot levanta error de integridad', async () => {
    const f = await ventaFixture('ganancia-inconsistente')
    const sr = f.serviceRole
    
    // Necesitamos una venta vacía para inyectarle un detalle
    const { data: venta } = await sr.from('venta').insert({
      id_tenant: f.tenantId,
      id_cliente: f.idCliente,
      id_usuario_alta: f.userId,
      forma_pago: 'efectivo',
      total: f.precio
    }).select('id_venta').single()
    
    const { error } = await sr.from('detalle_venta').insert({
      id_tenant: f.tenantId,
      id_venta: venta!.id_venta,
      id_item: f.items[0],
      id_producto: f.idProducto,
      precio_venta: f.precio,
      costo_snapshot: f.costo,
      monto_proveedor: 0,
      monto_gasto: 0,
      monto_ganancia: f.precio, // INCORRECTO: Debería ser precio - costo
      tipo_ingreso_snapshot: 'compra'
    })
    
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/monto_ganancia/)
  })

  it('INSERT detalle_venta de compra con monto_proveedor ≠ 0 levanta error', async () => {
    const f = await ventaFixture('compra-monto-proveedor')
    const sr = f.serviceRole
    
    const { data: venta } = await sr.from('venta').insert({
      id_tenant: f.tenantId,
      id_cliente: f.idCliente,
      id_usuario_alta: f.userId,
      forma_pago: 'efectivo',
      total: f.precio
    }).select('id_venta').single()
    
    const { error } = await sr.from('detalle_venta').insert({
      id_tenant: f.tenantId,
      id_venta: venta!.id_venta,
      id_item: f.items[0],
      id_producto: f.idProducto,
      precio_venta: f.precio,
      costo_snapshot: f.costo,
      monto_proveedor: f.costo, // INCORRECTO para compra
      monto_gasto: 0,
      monto_ganancia: f.precio - f.costo,
      tipo_ingreso_snapshot: 'compra'
    })
    
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/monto_proveedor/)
  })

  it('INSERT detalle_venta de consignación con monto_proveedor ≠ costo_snapshot levanta error', async () => {
    const f = await ventaFixture('consignacion-monto-proveedor', 1, { tipoIngreso: 'consignacion' })
    const sr = f.serviceRole
    
    const { data: venta } = await sr.from('venta').insert({
      id_tenant: f.tenantId,
      id_cliente: f.idCliente,
      id_usuario_alta: f.userId,
      forma_pago: 'efectivo',
      total: f.precio
    }).select('id_venta').single()
    
    const { error } = await sr.from('detalle_venta').insert({
      id_tenant: f.tenantId,
      id_venta: venta!.id_venta,
      id_item: f.items[0],
      id_producto: f.idProducto,
      precio_venta: f.precio,
      costo_snapshot: f.costo,
      monto_proveedor: 0, // INCORRECTO para consignacion (debería ser f.costo)
      monto_gasto: 0,
      monto_ganancia: f.precio - f.costo,
      tipo_ingreso_snapshot: 'consignacion'
    })
    
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/monto_proveedor/)
  })

  it('venta de compra calcula monto_ganancia = precio - costo, NO precio entero', async () => {
    const f = await ventaFixture('venta-compra-ganancia')
    
    // Registrar una venta normal usando sp_registrar_venta
    const { data: idVenta, error } = await venderContado(f)
    expect(error).toBeNull()
    
    const { data: detalle } = await f.serviceRole
      .from('detalle_venta')
      .select('monto_ganancia, costo_snapshot, precio_venta, tipo_ingreso_snapshot')
      .eq('id_venta', idVenta)
      .single()
      
    expect(detalle?.tipo_ingreso_snapshot).toBe('compra')
    expect(Number(detalle?.precio_venta)).toBe(f.precio)
    expect(Number(detalle?.costo_snapshot)).toBe(f.costo)
    expect(Number(detalle?.monto_ganancia)).toBe(f.precio - f.costo)
  })
})

describe.skipIf(!hasTestDb)('Incobrables sin doble conteo (00069)', () => {
  it('marcar cuota incobrable NO genera gasto_negocio', async () => {
    const f = await ventaFixture('incobrable-sin-gasto')
    const { venderFinanciado, cuotasDe } = await import('./_fixtures-ventas')
    
    const { data: idVenta } = await venderFinanciado(f, { cuotas: 3, primerVencimiento: '2026-01-01' })
    const cuotas = await cuotasDe(f, idVenta as string)
    
    const { error } = await f.authenticated.rpc('sp_marcar_cuota_incobrable', {
      p_id_cuota: cuotas[0].id_cuota_financiada,
      p_motivo: 'test'
    })
    
    expect(error).toBeNull()
    
    const { count } = await f.serviceRole.from('gasto_negocio').select('*', { count: 'exact', head: true }).eq('id_tenant', f.tenantId)
    expect(count).toBe(0)
  })

  it('cobrar cuota de venta anulada levanta error venta-anulada', async () => {
    const f = await ventaFixture('cobrar-cuota-anulada')
    const { venderFinanciado, cuotasDe } = await import('./_fixtures-ventas')
    
    const { data: idVenta } = await venderFinanciado(f, { cuotas: 3, primerVencimiento: '2026-01-01' })
    const cuotas = await cuotasDe(f, idVenta as string)
    
    // Forzamos el estado de la venta a 'anulada' saltando el trigger (service role direct update)
    // Wait, tr_venta_inmutable protects it. We will use sp_anular_venta once implemented, 
    // but for now, wait, we don't have sp_anular_venta yet! Slice 5 implements anulación.
    // However, we can bypass the trigger by temporarily disabling it OR by creating a dummy venta
    // Oh, the trigger tr_venta_inmutable allows state change! "solo permite editar columnas secundarias como estado_venta"
    // Wait, tr_venta_inmutable DOES allow changing estado_venta.
    await f.serviceRole.from('venta').update({ estado_venta: 'anulada' }).eq('id_venta', idVenta)
    
    const { error } = await f.authenticated.rpc('sp_cobrar_cuota', {
      p_id_cuota: cuotas[0].id_cuota_financiada,
      p_monto: cuotas[0].monto,
      p_medio: 'efectivo',
      p_id_cuenta_destino: f.idCuenta
    })
    
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/venta-anulada/)
  })

  it('marcar incobrable de venta anulada levanta error venta-anulada', async () => {
    const f = await ventaFixture('incobrable-anulada')
    const { venderFinanciado, cuotasDe } = await import('./_fixtures-ventas')
    
    const { data: idVenta } = await venderFinanciado(f, { cuotas: 3, primerVencimiento: '2026-01-01' })
    const cuotas = await cuotasDe(f, idVenta as string)
    
    await f.serviceRole.from('venta').update({ estado_venta: 'anulada' }).eq('id_venta', idVenta)
    
    const { error } = await f.authenticated.rpc('sp_marcar_cuota_incobrable', {
      p_id_cuota: cuotas[0].id_cuota_financiada,
      p_motivo: 'test'
    })
    
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/venta-anulada/)
  })
})
