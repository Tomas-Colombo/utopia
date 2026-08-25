import type {
  MedioPagoRecargo,
  RecargoCuotasRow,
  TipoValorRegla,
} from '@/lib/types/precios'

/**
 * Recargo por cuotas: cuánto se le suma al precio por pagar en partes.
 *
 * Espejo exacto de `resolver_recargo_cuotas` (00063). La UI la usa para el
 * preview en vivo mientras el vendedor arma la venta; el SP es la FUENTE DE
 * VERDAD al persistir. Si las dos difieren, manda el SP — y es un bug.
 *
 * Módulo puro: sin `server-only`, sin DB, sin fechas. Se puede importar desde
 * un componente cliente.
 */

/** Quién financia esta venta. Es lo que decide qué fila del tarifario aplica. */
export interface Financiador {
  /** `null` cuando todavía no se eligió destino (o cuando financia el comercio). */
  idCuentaDestino: string | null
  /** `null` cuando no hay medio definido. */
  medio: MedioPagoRecargo | null
  /** `true` = lo financia el comercio: no hay procesador ni cuenta. */
  propia: boolean
}

/**
 * Elige el recargo vigente para (cuotas, financiador), con la misma
 * precedencia que el SP:
 *
 *   3 · cuenta + medio   → "Mercado Pago con crédito en 3"
 *   2 · cuenta           → "Mercado Pago en 3, por cualquier medio"
 *   1 · medio            → "cualquier crédito en 3"
 *   0 · comodín          → "en 3, pase por donde pase"
 *
 * Gana el destino sobre el medio porque el arancel que el recargo pretende
 * cubrir es una propiedad de la cuenta: dos procesadores con el mismo medio
 * tienen aranceles distintos.
 *
 * La financiación propia NO cae al comodín. Heredar el recargo de una tarjeta
 * significaría cobrarle al cliente un arancel que en ese caso no existe, y es
 * el error más fácil de cometer acá: el número queda "razonable" y nadie lo
 * revisa. Sin fila propia, financiar sale sin recargo.
 *
 * `null` no es un error: es "no hay recargo configurado". Una venta jamás se
 * cae por eso.
 */
export function resolverRecargoCuotas(
  recargos: RecargoCuotasRow[],
  cuotas: number | null,
  financiador: Financiador,
): RecargoCuotasRow | null {
  if (cuotas == null || cuotas < 2) return null

  const candidatos = recargos.filter((r) => {
    if (r.cuotas !== cuotas) return false
    if (r.vigente_hasta !== null) return false
    if (r.propia !== financiador.propia) return false
    if (financiador.propia) return true
    const cuentaOk =
      r.id_cuenta_destino === null ||
      r.id_cuenta_destino === financiador.idCuentaDestino
    const medioOk = r.medio === null || r.medio === financiador.medio
    return cuentaOk && medioOk
  })
  if (candidatos.length === 0) return null

  return candidatos.reduce((mejor, r) =>
    especificidad(r) > especificidad(mejor) ? r : mejor,
  )
}

/** Mismo puntaje que el `order by` del SP. */
function especificidad(r: RecargoCuotasRow): number {
  return (r.id_cuenta_destino !== null ? 2 : 0) + (r.medio !== null ? 1 : 0)
}

/** Lo que el recargo le suma a un precio. Ya redondeado a centavos. */
export interface RecargoAplicado {
  id_recargo_cuotas: string
  tipo_valor: TipoValorRegla
  /** En porcentaje es 10 para "+10%"; en monto_fijo es el importe. */
  valor: number
  /** Los pesos que se suman al precio. */
  monto: number
}

/**
 * Aplica el recargo sobre un precio YA descontado.
 *
 * El orden importa y es el mismo que en el SP: lista − descuentos + recargo.
 * Aplicarlo sobre el precio de lista daría un número más alto y una venta que
 * no cierra contra lo que muestra la línea del carrito.
 */
export function aplicarRecargo(
  precio: number,
  recargo: RecargoCuotasRow | null,
): RecargoAplicado | null {
  if (!recargo || !Number.isFinite(precio) || precio <= 0) return null

  const monto =
    recargo.tipo_valor === 'porcentaje'
      ? redondear(precio * (recargo.valor / 100))
      : redondear(recargo.valor)
  if (monto <= 0) return null

  return {
    id_recargo_cuotas: recargo.id_recargo_cuotas,
    tipo_valor: recargo.tipo_valor,
    valor: recargo.valor,
    monto,
  }
}

/**
 * Etiqueta del financiador, para mostrar el combo en la venta y en el
 * tarifario. `cuentas` es el catálogo donde buscar el nombre.
 */
export function financiadorLabel(
  recargo: RecargoCuotasRow,
  cuentas: Array<{ id_cuenta_destino: string; nombre: string }>,
): string {
  if (recargo.propia) return 'Crédito del local'
  if (recargo.id_cuenta_destino) {
    const cuenta = cuentas.find(
      (c) => c.id_cuenta_destino === recargo.id_cuenta_destino,
    )
    return cuenta?.nombre ?? 'Cuenta eliminada'
  }
  if (recargo.medio) return MEDIO_RECARGO_LABEL[recargo.medio]
  return 'Cualquier destino'
}

const MEDIO_RECARGO_LABEL: Record<MedioPagoRecargo, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta_debito: 'Tarjeta de débito',
  tarjeta_credito: 'Tarjeta de crédito',
}

/** Redondeo a centavos: espeja el `round(..., 2)` del SP. */
function redondear(n: number): number {
  return Math.round(n * 100) / 100
}
