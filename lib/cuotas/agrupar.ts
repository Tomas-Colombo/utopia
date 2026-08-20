import { saldoCuota } from './generar-plan'

/**
 * Agrupaciones del estado de cuenta de un cliente.
 *
 * Son dos preguntas distintas sobre las mismas filas, y por eso son dos
 * agrupaciones y no una con un parámetro:
 *
 *   por MES    — "¿cuánto me entra en septiembre?". Mezcla planes: si compró
 *                dos veces, las cuotas de las dos caen juntas.
 *   por COMPRA — "¿cómo viene la compra de agosto?". Separa planes: cada
 *                compra con su progreso propio.
 *
 * Módulo puro: sin DB, sin `Date.now()`, sin `server-only`.
 */

/** Lo mínimo que necesitan las agrupaciones de una cuota. */
export interface CuotaAgrupable {
  id_venta: string
  numero: number
  estado: string
  monto: number
  monto_pagado: number
  fecha_vencimiento: string
  venta?: { fecha: string; total: number } | null
}

function esDeuda(estado: string): boolean {
  return estado === 'pendiente' || estado === 'parcial'
}

// ─── Por mes de vencimiento ──────────────────────────────────────────

export interface GrupoMes {
  /** `YYYY-MM`. */
  mes: string
  /** Saldo a cobrar ese mes. Sólo cuotas abiertas. */
  monto: number
  cuotas: number
  /** Cuántas COMPRAS distintas aportan cuotas a ese mes. */
  planes: number
}

/**
 * Cuánto entra cada mes, sin importar de qué compra viene.
 *
 * Sólo cuotas abiertas: una cuota pagada no es plata que vaya a entrar, y
 * sumarla al mes inflaría la proyección con dinero que ya está en la caja.
 */
export function agruparPorMes(cuotas: CuotaAgrupable[]): GrupoMes[] {
  const m = new Map<string, { monto: number; cuotas: number; planes: Set<string> }>()
  for (const c of cuotas) {
    if (!esDeuda(c.estado)) continue
    const mes = c.fecha_vencimiento.slice(0, 7)
    const e = m.get(mes) ?? { monto: 0, cuotas: 0, planes: new Set<string>() }
    e.monto = redondear2(e.monto + saldoCuota(c))
    e.cuotas++
    e.planes.add(c.id_venta)
    m.set(mes, e)
  }
  // Cronológico: el mes más cercano primero, que es el que hay que cobrar.
  return [...m.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, e]) => ({ mes, monto: e.monto, cuotas: e.cuotas, planes: e.planes.size }))
}

// ─── Por compra ──────────────────────────────────────────────────────

export interface GrupoCompra<T extends CuotaAgrupable> {
  id_venta: string
  /** ISO de `venta.fecha`. `null` si el join no la trajo. */
  fecha: string | null
  /** Total de la venta. `null` si el join no lo trajo. */
  total: number | null
  cuotas: T[]
  /** Cuotas del plan, incluidas las ya cerradas. */
  cantidad: number
  /** Cuántas siguen abiertas. */
  pendientes: number
  /** Saldo que resta cobrar de esta compra. */
  adeudado: number
  /** Suma de `monto_pagado` de TODAS sus cuotas. */
  pagado: number
}

/**
 * Las cuotas separadas por compra, **de la más nueva a la más vieja**.
 *
 * Ese orden es deliberado y opuesto al de la vista por mes: acá no se está
 * planificando una cobranza sino revisando un historial, y lo que se busca
 * primero es lo último que pasó.
 *
 * Dentro de cada compra las cuotas van en orden de plan (1, 2, 3…), no por
 * vencimiento: en un plan mensual dan lo mismo, pero el número de cuota es el
 * que el cliente tiene en la cabeza.
 *
 * El desempate por `id_venta` mantiene el orden estable cuando dos compras
 * caen el mismo día — sin él, dos renders podrían mostrar distinto.
 */
export function agruparPorCompra<T extends CuotaAgrupable>(cuotas: T[]): GrupoCompra<T>[] {
  const m = new Map<string, T[]>()
  for (const c of cuotas) {
    const g = m.get(c.id_venta) ?? []
    g.push(c)
    m.set(c.id_venta, g)
  }

  const grupos = [...m.entries()].map(([id_venta, filas]) => {
    const ordenadas = [...filas].sort((a, b) => a.numero - b.numero)
    const abiertas = ordenadas.filter((c) => esDeuda(c.estado))
    const conVenta = ordenadas.find((c) => c.venta)?.venta ?? null
    return {
      id_venta,
      fecha: conVenta?.fecha ?? null,
      total: conVenta ? Number(conVenta.total) : null,
      cuotas: ordenadas,
      cantidad: ordenadas.length,
      pendientes: abiertas.length,
      adeudado: redondear2(abiertas.reduce((a, c) => a + saldoCuota(c), 0)),
      pagado: redondear2(ordenadas.reduce((a, c) => a + Number(c.monto_pagado), 0)),
    }
  })

  return grupos.sort((a, b) => {
    // Sin fecha van al final: no se puede afirmar que sean las más nuevas.
    if (a.fecha && b.fecha && a.fecha !== b.fecha) return a.fecha < b.fecha ? 1 : -1
    if (a.fecha && !b.fecha) return -1
    if (!a.fecha && b.fecha) return 1
    return a.id_venta.localeCompare(b.id_venta)
  })
}

function redondear2(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.round((n + Number.EPSILON) * 100) / 100
}
