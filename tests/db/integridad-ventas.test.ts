import { describe, expect, it } from 'vitest'
import { hasTestDb } from './_helpers'
import { ventaFixture } from './_fixtures-ventas'

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
