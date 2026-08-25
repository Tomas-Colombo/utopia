/**
 * Plan de cuotas de la financiación propia (00059).
 *
 * Espejo exacto de lo que hace `sp_registrar_venta`: la UI lo usa para
 * mostrar el plan ANTES de confirmar, y el SP es la fuente de verdad al
 * persistir. Si difieren, manda el SP — y es un bug.
 *
 * Módulo puro: sin DB, sin `server-only`, sin `Date.now()`. Se puede importar
 * desde un componente cliente y testear sin mocks.
 */

export interface CuotaPlan {
  numero: number
  monto: number
  /** ISO `YYYY-MM-DD`. */
  vencimiento: string
}

export const CUOTAS_FINANCIACION_MIN = 1
export const CUOTAS_FINANCIACION_MAX = 24

/**
 * Suma meses a una fecha ISO ajustando el día al último del mes destino,
 * igual que `date + interval 'N months'` en Postgres: 31/01 + 1 mes = 28/02.
 *
 * Se trabaja con los componentes de la fecha y NO con `new Date(iso)`, que
 * interpreta `YYYY-MM-DD` como UTC y corre un día para atrás en cualquier
 * huso al oeste de Greenwich — el nuestro incluido.
 */
export function sumarMeses(iso: string, meses: number): string {
  const [a, m, d] = iso.split('-').map(Number)
  if (!a || !m || !d) throw new Error(`fecha-invalida: ${iso}`)

  const totalMeses = (m - 1) + meses
  const anioDestino = a + Math.floor(totalMeses / 12)
  const mesDestino = ((totalMeses % 12) + 12) % 12 // 0-11

  // Día 0 del mes SIGUIENTE = último día del mes destino.
  const ultimoDia = new Date(Date.UTC(anioDestino, mesDestino + 1, 0)).getUTCDate()
  const dia = Math.min(d, ultimoDia)

  return [
    String(anioDestino).padStart(4, '0'),
    String(mesDestino + 1).padStart(2, '0'),
    String(dia).padStart(2, '0'),
  ].join('-')
}

/**
 * Reparte `montoAFinanciar` en `cuotas` vencimientos mensuales.
 *
 * Dos reglas que NO son cosméticas:
 *
 *   - Cada vencimiento se calcula desde la fecha BASE (`base + (i-1) meses`),
 *     nunca sumando un mes al anterior. El ajuste de fin de mes no es
 *     reversible: acumulándolo, un plan que arranca el 31/01 daría 28/02,
 *     28/03, 28/04… y se come tres días para siempre.
 *   - El residuo del redondeo va ENTERO a la última cuota. Repartirlo o
 *     ignorarlo deja `sum(cuotas) ≠ montoAFinanciar`, y a partir de ahí todo
 *     reporte de deuda arrastra centavos que nadie puede explicar.
 */
export function generarPlanCuotas(input: {
  montoAFinanciar: number
  cuotas: number
  primerVencimiento: string
}): CuotaPlan[] {
  const { montoAFinanciar, cuotas, primerVencimiento } = input

  if (!Number.isInteger(cuotas) || cuotas < CUOTAS_FINANCIACION_MIN || cuotas > CUOTAS_FINANCIACION_MAX) {
    throw new Error(`cuotas-invalidas: ${cuotas}`)
  }
  if (!Number.isFinite(montoAFinanciar) || montoAFinanciar <= 0) {
    throw new Error(`monto-invalido: ${montoAFinanciar}`)
  }

  const base = redondear2(montoAFinanciar / cuotas)
  const plan: CuotaPlan[] = []
  let acumulado = 0

  for (let i = 1; i <= cuotas; i++) {
    const monto = i === cuotas ? redondear2(montoAFinanciar - acumulado) : base
    acumulado = redondear2(acumulado + monto)
    plan.push({
      numero: i,
      monto,
      vencimiento: sumarMeses(primerVencimiento, i - 1),
    })
  }
  return plan
}

/** Total del plan. Debe dar exactamente el monto financiado. */
export function totalPlan(plan: CuotaPlan[]): number {
  return redondear2(plan.reduce((a, c) => a + c.monto, 0))
}

/** Saldo pendiente de una cuota. */
export function saldoCuota(c: { monto: number; monto_pagado: number }): number {
  return redondear2(c.monto - c.monto_pagado)
}

function redondear2(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Lo mínimo que necesita `cuotasArrastradas` de una cuota. */
export interface CuotaArrastrable {
  id_venta: string
  numero: number
  estado: string
  monto: number
  monto_pagado: number
}

/**
 * Las cuotas que se dan por perdidas junto con la elegida.
 *
 * Espeja el `where` de `sp_marcar_cuota_incobrable` (00060): la elegida y
 * todas las POSTERIORES **del mismo plan** que sigan abiertas. El SP es la
 * fuente de verdad; esto existe para mostrar el alcance antes de confirmar.
 *
 * Tres cosas que NO arrastra, y son deliberadas:
 *   - Las anteriores: si quedó una impaga más atrás, puede haber un acuerdo
 *     por esa sola. Es otra decisión.
 *   - Las ya cerradas (`pagada`, `incobrable`, `anulada`).
 *   - Otras ventas del mismo cliente: que no pague una compra no prueba que
 *     no vaya a pagar otra.
 */
export function cuotasArrastradas<T extends CuotaArrastrable>(
  cuotas: T[],
  elegida: CuotaArrastrable,
): T[] {
  return cuotas
    .filter(
      (c) =>
        c.id_venta === elegida.id_venta &&
        c.numero >= elegida.numero &&
        (c.estado === 'pendiente' || c.estado === 'parcial'),
    )
    .sort((a, b) => a.numero - b.numero)
}

/** Saldo total de un conjunto de cuotas. */
export function saldoTotal(cuotas: CuotaArrastrable[]): number {
  return redondear2(cuotas.reduce((a, c) => a + saldoCuota(c), 0))
}
