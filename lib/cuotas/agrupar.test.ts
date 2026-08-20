import { describe, expect, it } from 'vitest'
import { agruparPorCompra, agruparPorMes, type CuotaAgrupable } from './agrupar'

function c(
  patch: Partial<CuotaAgrupable> & Pick<CuotaAgrupable, 'numero' | 'fecha_vencimiento'>,
): CuotaAgrupable {
  return {
    id_venta: 'v1',
    estado: 'pendiente',
    monto: 10_000,
    monto_pagado: 0,
    ...patch,
  }
}

describe('agruparPorMes', () => {
  it('suma las cuotas que caen en el mismo mes', () => {
    const g = agruparPorMes([
      c({ numero: 1, fecha_vencimiento: '2026-09-10' }),
      c({ numero: 2, fecha_vencimiento: '2026-09-25' }),
      c({ numero: 3, fecha_vencimiento: '2026-10-10' }),
    ])
    expect(g.map((x) => x.mes)).toEqual(['2026-09', '2026-10'])
    expect(g[0].monto).toBe(20_000)
    expect(g[0].cuotas).toBe(2)
  })

  it('mezcla compras distintas dentro del mismo mes y las cuenta', () => {
    // El caso que motivó todo esto: compró dos veces con una semana de
    // diferencia y los dos planes caen en septiembre.
    const g = agruparPorMes([
      c({ id_venta: 'v1', numero: 1, fecha_vencimiento: '2026-09-10' }),
      c({ id_venta: 'v2', numero: 1, fecha_vencimiento: '2026-09-17' }),
    ])
    expect(g).toHaveLength(1)
    expect(g[0].monto).toBe(20_000)
    expect(g[0].planes).toBe(2)
  })

  it('IGNORA las cuotas cerradas: no son plata que vaya a entrar', () => {
    const g = agruparPorMes([
      c({ numero: 1, fecha_vencimiento: '2026-09-10', estado: 'pagada', monto_pagado: 10_000 }),
      c({ numero: 2, fecha_vencimiento: '2026-09-25', estado: 'incobrable' }),
      c({ numero: 3, fecha_vencimiento: '2026-09-28', estado: 'anulada' }),
      c({ numero: 4, fecha_vencimiento: '2026-09-30' }),
    ])
    expect(g).toHaveLength(1)
    expect(g[0].monto).toBe(10_000)
    expect(g[0].cuotas).toBe(1)
  })

  it('de una parcial cuenta sólo el saldo', () => {
    const g = agruparPorMes([
      c({ numero: 1, fecha_vencimiento: '2026-09-10', estado: 'parcial', monto_pagado: 4000 }),
    ])
    expect(g[0].monto).toBe(6000)
  })

  it('ordena cronológicamente: el mes más cercano primero', () => {
    const g = agruparPorMes([
      c({ numero: 3, fecha_vencimiento: '2027-01-10' }),
      c({ numero: 1, fecha_vencimiento: '2026-11-10' }),
      c({ numero: 2, fecha_vencimiento: '2026-12-10' }),
    ])
    expect(g.map((x) => x.mes)).toEqual(['2026-11', '2026-12', '2027-01'])
  })

  it('sin cuotas abiertas devuelve lista vacía', () => {
    expect(agruparPorMes([])).toEqual([])
    expect(
      agruparPorMes([c({ numero: 1, fecha_vencimiento: '2026-09-10', estado: 'pagada', monto_pagado: 10_000 })]),
    ).toEqual([])
  })

  it('no arrastra basura de punto flotante al acumular', () => {
    const g = agruparPorMes(
      Array.from({ length: 3 }, (_, i) =>
        c({ numero: i + 1, fecha_vencimiento: '2026-09-10', monto: 8571.43 }),
      ),
    )
    expect(g[0].monto).toBe(25_714.29)
  })
})

describe('agruparPorCompra', () => {
  const dosCompras: CuotaAgrupable[] = [
    // Compra vieja: agosto, 3 cuotas, una pagada.
    c({
      id_venta: 'vieja',
      numero: 1,
      fecha_vencimiento: '2026-09-05',
      estado: 'pagada',
      monto_pagado: 10_000,
      venta: { fecha: '2026-08-05T10:00:00Z', total: 30_000 },
    }),
    c({
      id_venta: 'vieja',
      numero: 2,
      fecha_vencimiento: '2026-10-05',
      venta: { fecha: '2026-08-05T10:00:00Z', total: 30_000 },
    }),
    c({
      id_venta: 'vieja',
      numero: 3,
      fecha_vencimiento: '2026-11-05',
      venta: { fecha: '2026-08-05T10:00:00Z', total: 30_000 },
    }),
    // Compra nueva: septiembre, 2 cuotas.
    c({
      id_venta: 'nueva',
      numero: 1,
      fecha_vencimiento: '2026-10-12',
      venta: { fecha: '2026-09-12T10:00:00Z', total: 20_000 },
    }),
    c({
      id_venta: 'nueva',
      numero: 2,
      fecha_vencimiento: '2026-11-12',
      venta: { fecha: '2026-09-12T10:00:00Z', total: 20_000 },
    }),
  ]

  it('separa las compras y pone la MÁS NUEVA primero', () => {
    const g = agruparPorCompra(dosCompras)
    expect(g.map((x) => x.id_venta)).toEqual(['nueva', 'vieja'])
  })

  it('dentro de cada compra ordena por número de cuota', () => {
    const desordenado = [dosCompras[2], dosCompras[0], dosCompras[1]]
    const g = agruparPorCompra(desordenado)
    expect(g[0].cuotas.map((x) => x.numero)).toEqual([1, 2, 3])
  })

  it('calcula el progreso de cada compra por separado', () => {
    const g = agruparPorCompra(dosCompras)
    const vieja = g.find((x) => x.id_venta === 'vieja')!
    expect(vieja.cantidad).toBe(3)
    expect(vieja.pendientes).toBe(2)
    expect(vieja.adeudado).toBe(20_000)
    expect(vieja.pagado).toBe(10_000)

    const nueva = g.find((x) => x.id_venta === 'nueva')!
    expect(nueva.cantidad).toBe(2)
    expect(nueva.adeudado).toBe(20_000)
    expect(nueva.pagado).toBe(0)
  })

  it('trae fecha y total de la venta', () => {
    const g = agruparPorCompra(dosCompras)
    expect(g[0].fecha).toBe('2026-09-12T10:00:00Z')
    expect(g[0].total).toBe(20_000)
  })

  it('una compra saldada queda con adeudado 0 y sin pendientes', () => {
    const g = agruparPorCompra([
      c({ numero: 1, fecha_vencimiento: '2026-09-05', estado: 'pagada', monto_pagado: 10_000 }),
      c({ numero: 2, fecha_vencimiento: '2026-10-05', estado: 'pagada', monto_pagado: 10_000 }),
    ])
    expect(g[0].pendientes).toBe(0)
    expect(g[0].adeudado).toBe(0)
    expect(g[0].pagado).toBe(20_000)
  })

  it('las incobrables no cuentan como pendientes ni como adeudado', () => {
    // Ya se registraron como gasto: seguir contándolas sería contar la
    // pérdida dos veces.
    const g = agruparPorCompra([
      c({ numero: 1, fecha_vencimiento: '2026-09-05', estado: 'incobrable' }),
      c({ numero: 2, fecha_vencimiento: '2026-10-05' }),
    ])
    expect(g[0].cantidad).toBe(2)
    expect(g[0].pendientes).toBe(1)
    expect(g[0].adeudado).toBe(10_000)
  })

  it('las compras sin fecha van al final, no al principio', () => {
    // Sin fecha no se puede afirmar que sean las más nuevas.
    const g = agruparPorCompra([
      c({ id_venta: 'sin-fecha', numero: 1, fecha_vencimiento: '2026-09-05' }),
      c({
        id_venta: 'con-fecha',
        numero: 1,
        fecha_vencimiento: '2026-09-05',
        venta: { fecha: '2026-01-01T10:00:00Z', total: 10_000 },
      }),
    ])
    expect(g.map((x) => x.id_venta)).toEqual(['con-fecha', 'sin-fecha'])
    expect(g[1].fecha).toBeNull()
    expect(g[1].total).toBeNull()
  })

  it('el orden es estable cuando dos compras caen el mismo día', () => {
    // Sin desempate, dos renders podrían mostrar distinto.
    const mismaFecha = { fecha: '2026-09-12T10:00:00Z', total: 10_000 }
    const filas = [
      c({ id_venta: 'bbb', numero: 1, fecha_vencimiento: '2026-10-01', venta: mismaFecha }),
      c({ id_venta: 'aaa', numero: 1, fecha_vencimiento: '2026-10-01', venta: mismaFecha }),
    ]
    expect(agruparPorCompra(filas).map((x) => x.id_venta)).toEqual(['aaa', 'bbb'])
    expect(agruparPorCompra([...filas].reverse()).map((x) => x.id_venta)).toEqual(['aaa', 'bbb'])
  })

  it('no muta la lista que recibe', () => {
    const filas = [
      c({ numero: 3, fecha_vencimiento: '2026-11-05' }),
      c({ numero: 1, fecha_vencimiento: '2026-09-05' }),
    ]
    agruparPorCompra(filas)
    expect(filas.map((x) => x.numero)).toEqual([3, 1])
  })

  it('sin cuotas devuelve lista vacía', () => {
    expect(agruparPorCompra([])).toEqual([])
  })
})
