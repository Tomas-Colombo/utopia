import { describe, expect, it } from 'vitest'
import { hasTestDb } from './_helpers'
import { ventaFixture, venderContado, venderFinanciado } from './_fixtures-ventas'

describe.skipIf(!hasTestDb)('Reversas — Anulación y Reintegros (Slice 5)', () => {
  it('Anulación de venta contado crea reintegro_cliente y retorna total_reintegrado', async () => {
    const f = await ventaFixture('reversa-contado')
    
    // Vender contado
    const { data: id_venta, error: errV } = await venderContado(f)
    expect(errV).toBeNull()
    
    // Anular venta
    const { data, error } = await f.authenticated.rpc('sp_anular_venta', {
      p_id_venta: id_venta,
      p_motivo: 'Me arrepentí',
      p_ip: '127.0.0.1'
    })
    
    expect(error).toBeNull()
    
    // Debe retornar el JSON con total_reintegrado
    expect(data).toBeDefined()
    expect(data!.total_reintegrado).toBe(f.precio) // f.precio es el precio del fixture

    // Verificar en DB que se creó reintegro_cliente
    const { data: reintegros } = await f.serviceRole.from('reintegro_cliente')
      .select('*')
      .eq('id_venta', id_venta)
    
    expect(reintegros).toHaveLength(1)
    expect(reintegros![0].monto).toBe(f.precio)
    expect(reintegros![0].origen).toBe('anulacion')
    expect(reintegros![0].id_cuenta_destino).toBe(f.idCuenta)
    expect(reintegros![0].motivo).toBe('Me arrepentí')
  })

  it('Anulación de venta con cuotas pagadas crea reintegros por los pagos', async () => {
    const f = await ventaFixture('reversa-cuotas')
    
    // Venta propia, 20.000 (anticipo 5.000, 3 cuotas de 5.000)
    const { data: id_venta, error: errV } = await venderFinanciado(f, {
      cuotas: 3,
      primerVencimiento: '2026-02-01',
      anticipo: 5000
    })
    expect(errV).toBeNull()

    // Cobrar cuota 1
    const { data: cuotas } = await f.serviceRole.from('cuota_financiada')
      .select('id_cuota_financiada')
      .eq('id_venta', id_venta)
      .order('numero', { ascending: true })
    
    const { error: errCobro } = await f.authenticated.rpc('sp_cobrar_cuota', {
      p_id_cuota: cuotas![0].id_cuota_financiada,
      p_id_cuenta_destino: f.idCuenta,
      p_medio: 'efectivo',
      p_monto: 5000,
      p_ip: null
    })
    expect(errCobro).toBeNull()

    // Anular venta
    const { data, error } = await f.authenticated.rpc('sp_anular_venta', {
      p_id_venta: id_venta,
      p_motivo: 'Test',
      p_ip: '127.0.0.1'
    })
    
    expect(error).toBeNull()
    expect(data!.total_reintegrado).toBe(10000) // anticipo + 1 cuota

    // Verificamos reintegros
    const { data: reintegros } = await f.serviceRole.from('reintegro_cliente')
      .select('*')
      .eq('id_venta', id_venta)
    
    expect(reintegros).toHaveLength(2)
  })

  it('Anulación bloqueada por incobrable devuelve error venta-con-incobrables', async () => {
    const f = await ventaFixture('reversa-incobrable')
    
    const { data: id_venta, error: errV } = await venderFinanciado(f, {
      cuotas: 1,
      primerVencimiento: '2026-02-01'
    })
    expect(errV).toBeNull()

    const { data: cuotas } = await f.serviceRole.from('cuota_financiada')
      .select('id_cuota_financiada')
      .eq('id_venta', id_venta)
    
    // Marcar incobrable
    const { error: errInc } = await f.authenticated.rpc('sp_marcar_cuota_incobrable', {
      p_id_cuota: cuotas![0].id_cuota_financiada,
      p_motivo: 'test',
      p_ip: null
    })
    expect(errInc).toBeNull()

    // Anular
    const { error } = await f.authenticated.rpc('sp_anular_venta', {
      p_id_venta: id_venta,
      p_motivo: 'Test',
      p_ip: '127.0.0.1'
    })
    
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/venta-con-incobrables/)
  })
})
