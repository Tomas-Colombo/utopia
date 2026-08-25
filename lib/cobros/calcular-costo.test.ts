import { describe, expect, it } from 'vitest'
import type { ArancelCobroRow, MedioPago } from '@/lib/types/ventas'
import {
  acreditacionMasTardia,
  calcularCostoCobro,
  resolverArancel,
  sumarCosto,
  type RetencionesCuenta,
} from './calcular-costo'

const CUENTA = 'cta-mp'

function arancel(patch: Partial<ArancelCobroRow> = {}): ArancelCobroRow {
  return {
    id_arancel_cobro: 'ar-1',
    id_tenant: 't-1',
    id_cuenta_destino: CUENTA,
    medio: 'tarjeta_credito' as MedioPago,
    cuotas: null,
    arancel_pct: 0,
    iva_arancel_pct: 21,
    dias_acreditacion: 0,
    vigente_desde: '2026-01-01',
    vigente_hasta: null,
    notas: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...patch,
  }
}

const SIN_RETENCIONES: RetencionesCuenta = {
  ret_iva_pct: 0,
  ret_ganancias_pct: 0,
  ret_iibb_pct: 0,
  imp_deb_cred_pct: 0,
}

describe('calcularCostoCobro', () => {
  it('sin tarifario devuelve costo 0 y el bruto como neto', () => {
    const d = calcularCostoCobro({ monto: 50_000, arancel: null, retenciones: null })
    expect(d).toEqual({
      sin_tarifario: true,
      costo_total: 0,
      neto: 50_000,
      dias_acreditacion: 0,
    })
  })

  it('sin tarifario ignora las retenciones de la cuenta', () => {
    // Si no, un cobro en efectivo contra una caja con IIBB cargado se comería
    // un descuento que no existe.
    const d = calcularCostoCobro({
      monto: 50_000,
      arancel: null,
      retenciones: { ...SIN_RETENCIONES, ret_iibb_pct: 2 },
    })
    expect(d.costo_total).toBe(0)
    expect(d.neto).toBe(50_000)
  })

  it('aplica el arancel solo', () => {
    const d = calcularCostoCobro({
      monto: 50_000,
      arancel: arancel({ arancel_pct: 6.29, iva_arancel_pct: 0 }),
      retenciones: SIN_RETENCIONES,
    })
    if (d.sin_tarifario) throw new Error('esperaba tarifario')
    expect(d.arancel_monto).toBe(3145)
    expect(d.iva_arancel_monto).toBe(0)
    expect(d.costo_total).toBe(3145)
    expect(d.neto).toBe(46_855)
  })

  it('el IVA se calcula SOBRE EL ARANCEL, no sobre la venta', () => {
    const d = calcularCostoCobro({
      monto: 50_000,
      arancel: arancel({ arancel_pct: 6.29, iva_arancel_pct: 21 }),
      retenciones: SIN_RETENCIONES,
    })
    if (d.sin_tarifario) throw new Error('esperaba tarifario')
    // 21% de 3.145, no de 50.000 (que serían 10.500).
    expect(d.iva_arancel_monto).toBe(660.45)
    expect(d.costo_total).toBe(3805.45)
    expect(d.neto).toBe(46_194.55)
  })

  it('suma las cuatro retenciones sobre el bruto y las lista en orden', () => {
    const d = calcularCostoCobro({
      monto: 50_000,
      arancel: arancel({ arancel_pct: 0, iva_arancel_pct: 0 }),
      retenciones: {
        ret_iva_pct: 10.5,
        ret_ganancias_pct: 2,
        ret_iibb_pct: 3,
        imp_deb_cred_pct: 0.6,
      },
    })
    if (d.sin_tarifario) throw new Error('esperaba tarifario')
    expect(d.retenciones.map((r) => r.concepto)).toEqual([
      'iva',
      'ganancias',
      'iibb',
      'imp_deb_cred',
    ])
    expect(d.retenciones.map((r) => r.monto)).toEqual([5250, 1000, 1500, 300])
    expect(d.costo_total).toBe(8050)
  })

  it('omite las retenciones en cero en vez de listarlas', () => {
    const d = calcularCostoCobro({
      monto: 50_000,
      arancel: arancel({ arancel_pct: 1 }),
      retenciones: { ...SIN_RETENCIONES, ret_iibb_pct: 2 },
    })
    if (d.sin_tarifario) throw new Error('esperaba tarifario')
    expect(d.retenciones).toHaveLength(1)
    expect(d.retenciones[0].concepto).toBe('iibb')
  })

  it('redondea cada componente a centavos, no sólo el total', () => {
    // 333,33 al 3,333% = 11,1108... → 11,11. El IVA sale del monto YA
    // redondeado, igual que en el SP.
    const d = calcularCostoCobro({
      monto: 333.33,
      arancel: arancel({ arancel_pct: 3.333, iva_arancel_pct: 21 }),
      retenciones: SIN_RETENCIONES,
    })
    if (d.sin_tarifario) throw new Error('esperaba tarifario')
    expect(d.arancel_monto).toBe(11.11)
    expect(d.iva_arancel_monto).toBe(2.33)
    expect(d.costo_total).toBe(13.44)
    expect(d.neto).toBe(319.89)
  })

  it('el neto más el costo reconstruyen el bruto exacto', () => {
    const d = calcularCostoCobro({
      monto: 12_345.67,
      arancel: arancel({ arancel_pct: 6.29, iva_arancel_pct: 21 }),
      retenciones: { ...SIN_RETENCIONES, ret_iibb_pct: 2.5 },
    })
    expect(d.neto + d.costo_total).toBeCloseTo(12_345.67, 2)
  })

  it('monto 0 no genera costo', () => {
    const d = calcularCostoCobro({
      monto: 0,
      arancel: arancel({ arancel_pct: 6.29 }),
      retenciones: SIN_RETENCIONES,
    })
    expect(d.sin_tarifario).toBe(true)
    expect(d.costo_total).toBe(0)
  })

  it('propaga los días de acreditación del tarifario', () => {
    const d = calcularCostoCobro({
      monto: 1000,
      arancel: arancel({ arancel_pct: 1, dias_acreditacion: 18 }),
      retenciones: SIN_RETENCIONES,
    })
    expect(d.dias_acreditacion).toBe(18)
  })
})

describe('resolverArancel', () => {
  const comodin = arancel({ id_arancel_cobro: 'comodin', cuotas: null, arancel_pct: 3 })
  const seis = arancel({ id_arancel_cobro: 'seis', cuotas: 6, arancel_pct: 12 })

  it('el plan exacto le gana al comodín', () => {
    expect(resolverArancel([comodin, seis], CUENTA, 'tarjeta_credito', 6)?.id_arancel_cobro)
      .toBe('seis')
  })

  it('cae al comodín cuando no hay fila para ese plan', () => {
    expect(resolverArancel([comodin, seis], CUENTA, 'tarjeta_credito', 3)?.id_arancel_cobro)
      .toBe('comodin')
  })

  it('un pago sin cuotas sólo matchea el comodín', () => {
    // Espeja `cuotas = NULL` en SQL, que da NULL y no true.
    expect(resolverArancel([seis], CUENTA, 'tarjeta_credito', null)).toBeNull()
    expect(resolverArancel([comodin], CUENTA, 'tarjeta_credito', null)?.id_arancel_cobro)
      .toBe('comodin')
  })

  it('ignora los tarifarios con vigencia cerrada', () => {
    const viejo = arancel({ id_arancel_cobro: 'viejo', vigente_hasta: '2026-06-30' })
    expect(resolverArancel([viejo], CUENTA, 'tarjeta_credito', null)).toBeNull()
  })

  it('no cruza cuentas ni medios', () => {
    expect(resolverArancel([comodin], 'otra-cuenta', 'tarjeta_credito', null)).toBeNull()
    expect(resolverArancel([comodin], CUENTA, 'transferencia', null)).toBeNull()
  })
})

describe('agregados', () => {
  it('sumarCosto de una lista vacía es 0', () => {
    expect(sumarCosto([])).toBe(0)
  })

  it('sumarCosto redondea el acumulado', () => {
    const uno = calcularCostoCobro({
      monto: 333.33,
      arancel: arancel({ arancel_pct: 3.333 }),
      retenciones: SIN_RETENCIONES,
    })
    const dos = calcularCostoCobro({ monto: 100, arancel: null, retenciones: null })
    expect(sumarCosto([uno, dos])).toBe(13.44)
  })

  it('acreditacionMasTardia devuelve null cuando todo acredita al instante', () => {
    const efectivo = calcularCostoCobro({ monto: 100, arancel: null, retenciones: null })
    expect(acreditacionMasTardia([efectivo])).toBeNull()
  })

  it('acreditacionMasTardia toma el plazo más largo', () => {
    const a = calcularCostoCobro({
      monto: 100,
      arancel: arancel({ dias_acreditacion: 2 }),
      retenciones: SIN_RETENCIONES,
    })
    const b = calcularCostoCobro({
      monto: 100,
      arancel: arancel({ dias_acreditacion: 18 }),
      retenciones: SIN_RETENCIONES,
    })
    expect(acreditacionMasTardia([a, b])).toBe(18)
  })
})
