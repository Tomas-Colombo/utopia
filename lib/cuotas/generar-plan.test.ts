import { describe, expect, it } from 'vitest'
import {
  cuotasArrastradas,
  generarPlanCuotas,
  saldoCuota,
  saldoTotal,
  sumarMeses,
  totalPlan,
} from './generar-plan'

describe('sumarMeses', () => {
  it('suma meses sin tocar el día cuando existe', () => {
    expect(sumarMeses('2026-09-10', 0)).toBe('2026-09-10')
    expect(sumarMeses('2026-09-10', 1)).toBe('2026-10-10')
    expect(sumarMeses('2026-09-10', 3)).toBe('2026-12-10')
  })

  it('cruza el año', () => {
    expect(sumarMeses('2026-11-05', 3)).toBe('2027-02-05')
    expect(sumarMeses('2026-12-31', 1)).toBe('2027-01-31')
  })

  it('ajusta al último día cuando el mes destino es más corto', () => {
    expect(sumarMeses('2026-01-31', 1)).toBe('2026-02-28')
    expect(sumarMeses('2026-01-31', 3)).toBe('2026-04-30')
    expect(sumarMeses('2026-08-31', 1)).toBe('2026-09-30')
  })

  it('contempla el año bisiesto', () => {
    // 2028 es bisiesto; 2026 no.
    expect(sumarMeses('2028-01-31', 1)).toBe('2028-02-29')
    expect(sumarMeses('2026-01-30', 1)).toBe('2026-02-28')
  })

  it('NO acumula el ajuste: cada salto sale de la fecha base', () => {
    // Éste es el bug que la función existe para evitar. Sumando mes a mes,
    // 31/01 → 28/02 → 28/03 → 28/04. Desde la base, marzo vuelve al 31.
    const base = '2026-01-31'
    expect(sumarMeses(base, 1)).toBe('2026-02-28')
    expect(sumarMeses(base, 2)).toBe('2026-03-31')
    expect(sumarMeses(base, 3)).toBe('2026-04-30')
  })

  it('no corre un día por interpretar la fecha como UTC', () => {
    // `new Date('2026-09-01')` es medianoche UTC; en AR eso es el 31/08.
    expect(sumarMeses('2026-09-01', 0)).toBe('2026-09-01')
    expect(sumarMeses('2026-01-01', 12)).toBe('2027-01-01')
  })

  it('rechaza una fecha malformada', () => {
    expect(() => sumarMeses('no-es-fecha', 1)).toThrow(/fecha-invalida/)
  })
})

describe('generarPlanCuotas', () => {
  it('reparte parejo cuando divide exacto', () => {
    const plan = generarPlanCuotas({
      montoAFinanciar: 60_000,
      cuotas: 6,
      primerVencimiento: '2026-09-10',
    })
    expect(plan).toHaveLength(6)
    expect(plan.every((c) => c.monto === 10_000)).toBe(true)
    expect(totalPlan(plan)).toBe(60_000)
  })

  it('manda el residuo del redondeo a la ÚLTIMA cuota', () => {
    // 60.000 / 7 = 8571,428… → 8571,43 × 6 = 51.428,58; la última cierra.
    const plan = generarPlanCuotas({
      montoAFinanciar: 60_000,
      cuotas: 7,
      primerVencimiento: '2026-09-10',
    })
    expect(plan.slice(0, 6).every((c) => c.monto === 8571.43)).toBe(true)
    expect(plan[6].monto).toBe(8571.42)
    expect(totalPlan(plan)).toBe(60_000)
  })

  it('la suma cierra exacto para cualquier plan', () => {
    // El criterio que evita centavos fantasma en los reportes de deuda.
    for (const monto of [100, 333.33, 12_345.67, 99_999.99, 60_000]) {
      for (const cuotas of [1, 2, 3, 6, 7, 12, 24]) {
        const plan = generarPlanCuotas({
          montoAFinanciar: monto,
          cuotas,
          primerVencimiento: '2026-01-31',
        })
        expect(totalPlan(plan), `${monto} en ${cuotas}`).toBe(monto)
      }
    }
  })

  it('una sola cuota es el monto entero', () => {
    const plan = generarPlanCuotas({
      montoAFinanciar: 12_345.67,
      cuotas: 1,
      primerVencimiento: '2026-09-10',
    })
    expect(plan).toEqual([{ numero: 1, monto: 12_345.67, vencimiento: '2026-09-10' }])
  })

  it('numera desde 1 y encadena vencimientos mensuales', () => {
    const plan = generarPlanCuotas({
      montoAFinanciar: 3000,
      cuotas: 3,
      primerVencimiento: '2026-11-15',
    })
    expect(plan.map((c) => c.numero)).toEqual([1, 2, 3])
    expect(plan.map((c) => c.vencimiento)).toEqual([
      '2026-11-15',
      '2026-12-15',
      '2027-01-15',
    ])
  })

  it('aplica el ajuste de fin de mes desde la base en todo el plan', () => {
    const plan = generarPlanCuotas({
      montoAFinanciar: 4000,
      cuotas: 4,
      primerVencimiento: '2026-01-31',
    })
    expect(plan.map((c) => c.vencimiento)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31', // vuelve al 31: el ajuste NO se acumuló
      '2026-04-30',
    ])
  })

  it('rechaza planes fuera de rango', () => {
    const base = { montoAFinanciar: 1000, primerVencimiento: '2026-09-10' }
    expect(() => generarPlanCuotas({ ...base, cuotas: 0 })).toThrow(/cuotas-invalidas/)
    expect(() => generarPlanCuotas({ ...base, cuotas: 25 })).toThrow(/cuotas-invalidas/)
    expect(() => generarPlanCuotas({ ...base, cuotas: 2.5 })).toThrow(/cuotas-invalidas/)
  })

  it('rechaza un monto que no se puede financiar', () => {
    const base = { cuotas: 3, primerVencimiento: '2026-09-10' }
    expect(() => generarPlanCuotas({ ...base, montoAFinanciar: 0 })).toThrow(/monto-invalido/)
    expect(() => generarPlanCuotas({ ...base, montoAFinanciar: -100 })).toThrow(/monto-invalido/)
  })
})

describe('saldoCuota', () => {
  it('resta lo ya pagado', () => {
    expect(saldoCuota({ monto: 10_000, monto_pagado: 0 })).toBe(10_000)
    expect(saldoCuota({ monto: 10_000, monto_pagado: 4000 })).toBe(6000)
    expect(saldoCuota({ monto: 10_000, monto_pagado: 10_000 })).toBe(0)
  })

  it('no arrastra basura de punto flotante', () => {
    expect(saldoCuota({ monto: 8571.43, monto_pagado: 0.1 })).toBe(8571.33)
  })
})

describe('cuotasArrastradas', () => {
  function c(
    numero: number,
    estado: string,
    extra: { id_venta?: string; monto?: number; monto_pagado?: number } = {},
  ) {
    return {
      id_venta: extra.id_venta ?? 'v1',
      numero,
      estado,
      monto: extra.monto ?? 10_000,
      monto_pagado: extra.monto_pagado ?? 0,
    }
  }

  const plan = [
    c(1, 'pagada'),
    c(2, 'pagada'),
    c(3, 'pendiente'),
    c(4, 'pendiente'),
    c(5, 'pendiente'),
    c(6, 'pendiente'),
  ]

  it('arrastra la elegida y todas las que le siguen', () => {
    const r = cuotasArrastradas(plan, c(3, 'pendiente'))
    expect(r.map((x) => x.numero)).toEqual([3, 4, 5, 6])
  })

  it('NO toca las anteriores, ni las pagadas', () => {
    const r = cuotasArrastradas(plan, c(3, 'pendiente'))
    expect(r.some((x) => x.numero < 3)).toBe(false)
    expect(r.some((x) => x.estado === 'pagada')).toBe(false)
  })

  it('arrastra una parcial: lo cobrado queda, el saldo se pierde', () => {
    const conParcial = [c(3, 'parcial', { monto_pagado: 4000 }), c(4, 'pendiente')]
    const r = cuotasArrastradas(conParcial, conParcial[0])
    expect(r).toHaveLength(2)
    expect(saldoTotal(r)).toBe(16_000) // 6.000 del saldo parcial + 10.000
  })

  it('salta las que ya están cerradas en el medio', () => {
    const mixto = [
      c(3, 'pendiente'),
      c(4, 'pagada'),
      c(5, 'incobrable'),
      c(6, 'anulada'),
      c(7, 'pendiente'),
    ]
    const r = cuotasArrastradas(mixto, mixto[0])
    expect(r.map((x) => x.numero)).toEqual([3, 7])
  })

  it('NO cruza a otras compras del mismo cliente', () => {
    // Que no pague una compra no prueba que no vaya a pagar otra: eso lo
    // decide el operador, cuota por cuota.
    const dosPlanes = [
      c(1, 'pendiente', { id_venta: 'v1' }),
      c(2, 'pendiente', { id_venta: 'v1' }),
      c(1, 'pendiente', { id_venta: 'v2' }),
      c(2, 'pendiente', { id_venta: 'v2' }),
    ]
    const r = cuotasArrastradas(dosPlanes, dosPlanes[0])
    expect(r).toHaveLength(2)
    expect(r.every((x) => x.id_venta === 'v1')).toBe(true)
  })

  it('la última cuota del plan se arrastra sola', () => {
    const r = cuotasArrastradas(plan, c(6, 'pendiente'))
    expect(r.map((x) => x.numero)).toEqual([6])
  })

  it('devuelve el arrastre ordenado aunque la lista venga desordenada', () => {
    const r = cuotasArrastradas([c(6, 'pendiente'), c(3, 'pendiente'), c(4, 'pendiente')], c(3, 'pendiente'))
    expect(r.map((x) => x.numero)).toEqual([3, 4, 6])
  })
})

describe('saldoTotal', () => {
  it('una lista vacía suma 0', () => {
    expect(saldoTotal([])).toBe(0)
  })

  it('no arrastra basura de punto flotante', () => {
    const cuotas = Array.from({ length: 7 }, (_, i) => ({
      id_venta: 'v1',
      numero: i + 1,
      estado: 'pendiente',
      monto: 8571.43,
      monto_pagado: 0,
    }))
    expect(saldoTotal(cuotas)).toBe(60_000.01)
  })
})
