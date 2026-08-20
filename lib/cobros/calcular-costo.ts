import type {
  ArancelCobroRow,
  DesgloseCosto,
  MedioPago,
  RetencionAplicada,
} from '@/lib/types/ventas'

/**
 * Costo de cobro de UN pago: cuánto se lleva el procesador y cuánto queda.
 *
 * Espejo exacto de `sp_calcular_costo_cobro` (00057). La UI la usa para el
 * preview en vivo mientras el vendedor arma la cobranza; el SP es la FUENTE
 * DE VERDAD al persistir. Si las dos difieren, manda el SP — y es un bug.
 *
 * Por eso el redondeo se hace componente por componente, igual que en SQL:
 * redondear sólo el total daría diferencias de centavos entre lo que el
 * vendedor vio y lo que quedó guardado.
 *
 * Módulo puro: sin `server-only`, sin DB, sin fechas. Se puede importar desde
 * un componente cliente.
 */

/** Alícuotas de retención de la cuenta destino, en porcentaje. */
export interface RetencionesCuenta {
  ret_iva_pct: number
  ret_ganancias_pct: number
  ret_iibb_pct: number
  imp_deb_cred_pct: number
}

/**
 * Elige el tarifario vigente para (cuenta, medio, cuotas), con la misma
 * precedencia que el SP: una fila con el plan exacto le gana al comodín
 * (`cuotas = null`).
 *
 * `cuotas = null` en el pago (efectivo, transferencia, débito) sólo matchea
 * el comodín — igual que en SQL, donde `cuotas = NULL` da NULL y no true.
 */
export function resolverArancel(
  aranceles: ArancelCobroRow[],
  idCuentaDestino: string,
  medio: MedioPago,
  cuotas: number | null,
): ArancelCobroRow | null {
  const candidatos = aranceles.filter(
    (a) =>
      a.id_cuenta_destino === idCuentaDestino &&
      a.medio === medio &&
      a.vigente_hasta === null &&
      (a.cuotas === cuotas || a.cuotas === null),
  )
  if (candidatos.length === 0) return null
  // El específico primero; entre dos específicos, cualquiera sirve (el unique
  // index parcial de 00057 garantiza que no haya dos vigentes iguales).
  return candidatos.find((a) => a.cuotas !== null) ?? candidatos[0]
}

export function calcularCostoCobro(input: {
  monto: number
  arancel: ArancelCobroRow | null
  retenciones: RetencionesCuenta | null
}): DesgloseCosto {
  const { monto, arancel, retenciones } = input

  // Sin tarifario NO es un error: el pago se registra con costo 0 y la venta
  // sigue. El vendedor no puede cargar un arancel desde el mostrador, y
  // bloquear la venta por eso pierde plata de verdad para ganar una precisión
  // contable que se corrige después.
  //
  // Las retenciones tampoco se aplican en este caso: si no, un cobro en
  // efectivo contra una caja con retenciones cargadas se comería un descuento
  // que no existe. Para retener sobre un medio hay que darle su fila, aunque
  // sea con arancel 0.
  if (!arancel || !Number.isFinite(monto) || monto <= 0) {
    return {
      sin_tarifario: true,
      costo_total: 0,
      neto: Number.isFinite(monto) ? monto : 0,
      dias_acreditacion: 0,
    }
  }

  const arancelMonto = redondear2((monto * arancel.arancel_pct) / 100)
  const ivaMonto = redondear2((arancelMonto * arancel.iva_arancel_pct) / 100)

  const rets: RetencionAplicada[] = []
  if (retenciones) {
    // Sólo entran las alícuotas > 0: una lista con cuatro ceros es ruido en
    // el detalle de la venta. Mismo orden que el SP.
    agregarRetencion(rets, 'iva', retenciones.ret_iva_pct, monto)
    agregarRetencion(rets, 'ganancias', retenciones.ret_ganancias_pct, monto)
    agregarRetencion(rets, 'iibb', retenciones.ret_iibb_pct, monto)
    agregarRetencion(rets, 'imp_deb_cred', retenciones.imp_deb_cred_pct, monto)
  }
  const retTotal = rets.reduce((a, r) => a + r.monto, 0)

  const costoTotal = redondear2(arancelMonto + ivaMonto + retTotal)

  return {
    sin_tarifario: false,
    id_arancel_cobro: arancel.id_arancel_cobro,
    arancel_pct: arancel.arancel_pct,
    arancel_monto: arancelMonto,
    iva_arancel_pct: arancel.iva_arancel_pct,
    iva_arancel_monto: ivaMonto,
    retenciones: rets,
    costo_total: costoTotal,
    neto: redondear2(monto - costoTotal),
    dias_acreditacion: arancel.dias_acreditacion,
  }
}

/** Total de costo de varios pagos. Devuelve 0 con la lista vacía. */
export function sumarCosto(desgloses: DesgloseCosto[]): number {
  return redondear2(desgloses.reduce((a, d) => a + d.costo_total, 0))
}

/**
 * Días hasta que acredita el pago más tardío. `null` si ninguno tiene plazo —
 * anunciar "acredita hoy" cuando todo fue efectivo sería ruido.
 */
export function acreditacionMasTardia(desgloses: DesgloseCosto[]): number | null {
  const dias = desgloses.map((d) => d.dias_acreditacion).filter((d) => d > 0)
  return dias.length > 0 ? Math.max(...dias) : null
}

function agregarRetencion(
  acc: RetencionAplicada[],
  concepto: RetencionAplicada['concepto'],
  pct: number,
  monto: number,
): void {
  if (!Number.isFinite(pct) || pct <= 0) return
  acc.push({ concepto, pct, monto: redondear2((monto * pct) / 100) })
}

/**
 * Redondeo a centavos, medio hacia arriba, igual que `round(numeric, 2)` en
 * Postgres. El `EPSILON` corrige el caso clásico de binario flotante en el
 * que un valor exacto en decimal (1.005) se representa apenas por debajo y
 * redondearía para el lado equivocado.
 */
function redondear2(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.round((n + Number.EPSILON) * 100) / 100
}
