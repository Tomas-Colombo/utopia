'use client'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { NumberInput } from '@/components/ui/NumberInput'
import {
  MEDIO_PAGO_LABEL,
  type ArancelCobroRow,
  type CuentaDestinoRow,
  type DesgloseCosto,
  type MedioPago,
} from '@/lib/types/ventas'
import type { PlanCuotasRow } from '@/lib/types/precios'
import { calcularCostoCobro, resolverArancel } from '@/lib/cobros/calcular-costo'

/** Un pago mientras se edita. `recibido` es texto porque puede quedar vacío. */
export interface PagoBorrador {
  key: string
  medio: MedioPago
  idCuenta: string
  monto: number
  /** Sólo en `tarjeta_credito`. Define qué fila del tarifario aplica (00057). */
  cuotas: number | null
  recibido: string
  referencia: string
}

const MEDIOS: MedioPago[] = ['efectivo', 'transferencia', 'tarjeta_debito', 'tarjeta_credito']

/** Tolerancia de centavo para comparar contra el total. */
const EPSILON = 0.005

// Contador en vez de randomUUID: la key termina en el `id` del input de
// vuelto, así que tiene que dar lo mismo en el render del server y en la
// hidratación o React tira mismatch.
let secuencia = 0

/**
 * Cuentas que tienen sentido para un medio: el efectivo entra a una caja, y
 * todo lo demás a un banco o billetera. Si no hay ninguna del tipo que
 * corresponde, se ofrecen todas antes que dejar al vendedor sin opción.
 */
export function cuentasPara(
  cuentas: CuentaDestinoRow[],
  medio: MedioPago,
): CuentaDestinoRow[] {
  const buscoEfectivo = medio === 'efectivo'
  const filtradas = cuentas.filter((c) => (c.tipo === 'efectivo') === buscoEfectivo)
  return filtradas.length > 0 ? filtradas : cuentas
}

export function nuevoPago(cuentas: CuentaDestinoRow[], monto: number): PagoBorrador {
  return {
    key: `pago-${secuencia++}`,
    medio: 'efectivo',
    idCuenta: cuentasPara(cuentas, 'efectivo')[0]?.id_cuenta_destino ?? '',
    monto,
    cuotas: null,
    recibido: '',
    referencia: '',
  }
}

/**
 * Normaliza en render (no en un efecto) para que no exista un frame con la
 * cobranza mintiendo. Tres reglas:
 *
 *   - Un solo pago cubre SIEMPRE el total: no tiene sentido hacer que el
 *     vendedor tipee el número que ya está arriba, ni dejarlo desincronizado
 *     cuando cambia el carrito. Con dos o más, los montos son los que cargó.
 *   - La cuenta sigue al medio: si el pago pasó a efectivo, su cuenta pasa a
 *     ser la caja sola, sin que nadie tenga que tocar el selector.
 *   - Las cuotas sólo existen en crédito. El SP rechaza un pago de crédito
 *     sin cuotas y uno de otro medio CON cuotas, así que normalizarlo acá es
 *     lo que evita un error después de haber tocado stock.
 */
export function normalizarPagos(
  pagos: PagoBorrador[],
  total: number,
  cuentas: CuentaDestinoRow[],
  /**
   * Con financiación propia el pago del día NO tiene por qué cubrir el total:
   * lo que falta es la deuda. Forzarlo dejaría al vendedor sin forma de
   * cargar un anticipo — o de no cargar ninguno.
   */
  montoLibre = false,
): PagoBorrador[] {
  const conMonto =
    pagos.length === 1 && !montoLibre ? [{ ...pagos[0], monto: total }] : pagos
  return conMonto.map((p) => {
    const opciones = cuentasPara(cuentas, p.medio)
    const conCuenta = opciones.some((c) => c.id_cuenta_destino === p.idCuenta)
      ? p
      : { ...p, idCuenta: opciones[0]?.id_cuenta_destino ?? '' }

    if (conCuenta.medio === 'tarjeta_credito') {
      // 1 = un pago con tarjeta. Es el default honesto: la mayoría de las
      // ventas con tarjeta no son en cuotas.
      return conCuenta.cuotas == null ? { ...conCuenta, cuotas: 1 } : conCuenta
    }
    return conCuenta.cuotas == null ? conCuenta : { ...conCuenta, cuotas: null }
  })
}

/**
 * Costo de cobro de un pago, resuelto contra el tarifario vigente. Espeja lo
 * que va a hacer `sp_registrar_venta`; sirve para mostrarlo ANTES de
 * confirmar. El SP recalcula y es el que manda.
 */
export function costoDePago(
  pago: PagoBorrador,
  cuentas: CuentaDestinoRow[],
  aranceles: ArancelCobroRow[],
): DesgloseCosto {
  const cuenta = cuentas.find((c) => c.id_cuenta_destino === pago.idCuenta) ?? null
  return calcularCostoCobro({
    monto: pago.monto,
    arancel: resolverArancel(aranceles, pago.idCuenta, pago.medio, pago.cuotas),
    retenciones: cuenta,
  })
}

export function sumaPagos(pagos: PagoBorrador[]): number {
  return pagos.reduce((a, p) => a + (Number.isFinite(p.monto) ? p.monto : 0), 0)
}

export function cobranzaCuadra(pagos: PagoBorrador[], total: number): boolean {
  return Math.abs(sumaPagos(pagos) - total) < EPSILON
}

/**
 * Panel de cobranza: dónde entra la plata de esta venta.
 *
 * NO toca el precio — eso lo define `forma_pago` vía las reglas de recargo.
 * Acá sólo se registra el reparto: cuánto en efectivo, cuánto por
 * transferencia, contra qué cuenta, y el vuelto si el cliente pagó con más.
 */
export function CobranzaPanel({
  cuentas,
  pagos,
  total,
  disabled,
  aranceles,
  planesCuotas,
  montoLibre = false,
  onChange,
}: {
  cuentas: CuentaDestinoRow[]
  pagos: PagoBorrador[]
  /** Lo que hay que cubrir. Con financiación es el anticipo, no la venta. */
  total: number
  disabled: boolean
  aranceles: ArancelCobroRow[]
  planesCuotas: PlanCuotasRow[]
  /** El monto del pago único es editable y no se compara contra el total. */
  montoLibre?: boolean
  onChange: (pagos: PagoBorrador[]) => void
}) {
  const unico = pagos.length === 1 && !montoLibre
  const asignado = sumaPagos(pagos)
  const restante = total - asignado
  const cuadra = Math.abs(restante) < EPSILON

  // Costo por pago, resuelto contra el tarifario vigente. El SP recalcula al
  // persistir; esto es para que el vendedor vea el neto ANTES de confirmar.
  const costos = pagos.map((p) => costoDePago(p, cuentas, aranceles))
  const costoTotal = costos.reduce((a, d) => a + d.costo_total, 0)
  const diasMax = Math.max(0, ...costos.map((d) => d.dias_acreditacion))
  // Sólo se avisa por los medios que DEBERÍAN tener arancel: que el efectivo
  // no tenga tarifario no es un problema a resolver.
  const faltaTarifario = pagos.some(
    (p, i) => p.medio !== 'efectivo' && costos[i].sin_tarifario,
  )

  function actualizar(key: string, patch: Partial<PagoBorrador>) {
    onChange(pagos.map((p) => (p.key === key ? { ...p, ...patch } : p)))
  }

  function agregar() {
    // El pago nuevo arranca con lo que falta asignar: en el caso típico
    // (un pago que cubría todo) eso es 0, y el vendedor baja el primero.
    onChange([...pagos, nuevoPago(cuentas, Math.max(0, redondear(restante)))])
  }

  function quitar(key: string) {
    onChange(pagos.filter((p) => p.key !== key))
  }

  /** Este pago absorbe lo que falta asignar. */
  function absorberResto(key: string) {
    const otros = pagos.filter((p) => p.key !== key)
    onChange(
      pagos.map((p) =>
        p.key === key ? { ...p, monto: Math.max(0, redondear(total - sumaPagos(otros))) } : p,
      ),
    )
  }

  if (cuentas.length === 0) {
    return (
      <div className="rounded-md border border-terracota bg-card-2 p-3 text-xs text-terracota">
        No hay cuentas activas donde registrar el cobro. Creá una en Ventas →
        Cuentas antes de vender.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">Pagos</span>
        <Button type="button" size="sm" variant="secondary" onClick={agregar} disabled={disabled}>
          + Pago
        </Button>
      </div>

      <div className="space-y-3">
        {pagos.map((p, i) => {
          const esEfectivo = p.medio === 'efectivo'
          const costo = costos[i]
          // El selector de cuenta sólo aparece cuando hay algo que elegir.
          // Con efectivo la plata va a la caja, y con una sola cuenta cargada
          // no hay decisión que tomar: preguntar sería ruido.
          const opcionesCuenta = cuentasPara(cuentas, p.medio)
          const recibido = Number(p.recibido.replace(',', '.'))
          const vuelto =
            esEfectivo && p.recibido.trim() !== '' && Number.isFinite(recibido)
              ? recibido - p.monto
              : null

          return (
            <div key={p.key} className="rounded-md border border-border bg-card-2 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <select
                  value={p.medio}
                  onChange={(e) => {
                    const medio = e.target.value as MedioPago
                    // El vuelto sólo existe en efectivo (lo enforcea un check
                    // en la DB); al cambiar de medio se descarta. La cuenta la
                    // reacomoda `normalizarPagos`.
                    actualizar(p.key, { medio, recibido: medio === 'efectivo' ? p.recibido : '' })
                  }}
                  disabled={disabled}
                  aria-label="Medio de pago"
                  className="flex-1"
                >
                  {MEDIOS.map((m) => (
                    <option key={m} value={m}>
                      {MEDIO_PAGO_LABEL[m]}
                    </option>
                  ))}
                </select>
                {!unico && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => quitar(p.key)}
                    disabled={disabled}
                    aria-label="Quitar pago"
                  >
                    Quitar
                  </Button>
                )}
              </div>

              {opcionesCuenta.length > 1 && (
                <select
                  value={p.idCuenta}
                  onChange={(e) => actualizar(p.key, { idCuenta: e.target.value })}
                  disabled={disabled}
                  aria-label="Cuenta destino"
                  className="w-full"
                >
                  {opcionesCuenta.map((c) => (
                    <option key={c.id_cuenta_destino} value={c.id_cuenta_destino}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              )}

              {/* El plan define el arancel: 6 cuotas no cuesta lo mismo que 1
                  pago. Sin esto no hay forma de resolver el tarifario. */}
              {p.medio === 'tarjeta_credito' && (
                <select
                  value={p.cuotas ?? 1}
                  onChange={(e) => actualizar(p.key, { cuotas: Number(e.target.value) })}
                  disabled={disabled}
                  aria-label="Cuotas"
                  className="w-full"
                >
                  <option value={1}>1 pago</option>
                  {planesCuotas.map((pl) => (
                    <option key={pl.cuotas} value={pl.cuotas}>
                      {pl.cuotas} cuotas
                    </option>
                  ))}
                </select>
              )}

              <div className="flex items-center gap-2">
                <label className="text-xs text-muted w-16 shrink-0">Monto</label>
                <NumberInput
                  thousands
                  value={p.monto}
                  // Con un solo pago el monto ES el total; editarlo no tiene
                  // sentido y sólo genera estados inconsistentes.
                  disabled={disabled || unico}
                  onChange={(e) => actualizar(p.key, { monto: Number(e.target.value || 0) })}
                  aria-label="Monto del pago"
                  className="flex-1 text-right"
                />
                {!unico && !cuadra && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => absorberResto(p.key)}
                    disabled={disabled}
                  >
                    Resto
                  </Button>
                )}
              </div>

              {esEfectivo && (
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted w-16 shrink-0" htmlFor={`recibido-${p.key}`}>
                    Recibí
                  </label>
                  {/* Opcional: si el vendedor no lo carga, la venta se registra
                      igual y el pago queda sin vuelto. */}
                  <NumberInput
                    id={`recibido-${p.key}`}
                    thousands
                    value={p.recibido}
                    onChange={(e) => actualizar(p.key, { recibido: e.target.value })}
                    disabled={disabled}
                    placeholder="Opcional — con cuánto paga"
                    className="flex-1 text-right"
                  />
                </div>
              )}

              {vuelto != null && vuelto > 0 && (
                <div className="flex items-center justify-between rounded bg-pink-bg px-2 py-1 text-sm">
                  <span className="text-muted">Vuelto</span>
                  <span className="font-mono font-semibold text-pink-strong">{money(vuelto)}</span>
                </div>
              )}
              {vuelto != null && vuelto < 0 && (
                <p className="text-xs text-terracota">
                  Recibiste menos que el monto del pago.
                </p>
              )}

              {p.medio === 'transferencia' && (
                <Input
                  value={p.referencia}
                  onChange={(e) => actualizar(p.key, { referencia: e.target.value })}
                  disabled={disabled}
                  placeholder="Nro. de operación (opcional)"
                  aria-label="Referencia"
                />
              )}

              {/* Lo que retiene el procesador de ESTE pago. Se muestra sólo
                  cuando hay algo que descontar: un "comisión $0" en cada
                  cobro en efectivo es ruido. */}
              {!costo.sin_tarifario && costo.costo_total > 0 && (
                <div className="flex items-center justify-between border-t border-border-2 pt-2 text-xs">
                  <span className="text-muted">
                    Comisión {costo.arancel_pct}%
                    {costo.dias_acreditacion > 0 && ` · acredita en ${costo.dias_acreditacion} días`}
                  </span>
                  <span className="font-mono text-terracota">−{money(costo.costo_total)}</span>
                </div>
              )}
              {!esEfectivo && costo.sin_tarifario && (
                <div className="border-t border-border-2 pt-2">
                  <Badge variant="warning">Sin arancel configurado</Badge>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {!unico && !montoLibre && (
        <div
          className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm ${
            cuadra ? 'border-border bg-card-2 text-muted' : 'border-terracota text-terracota'
          }`}
        >
          <span>{cuadra ? 'Cobranza completa' : restante > 0 ? 'Falta asignar' : 'Te pasaste por'}</span>
          <span className="font-mono font-semibold">
            {cuadra ? money(total) : money(Math.abs(restante))}
          </span>
        </div>
      )}

      {/* Neto: lo que realmente vas a cobrar. Aparece sólo si hay algo que
          descontar — sin costo, el total ya está arriba y repetirlo no
          agrega nada. */}
      {costoTotal > 0 && (
        <div className="space-y-1 rounded-md border border-border bg-card-2 p-3 text-sm">
          <div className="flex items-center justify-between text-muted">
            <span>Total de la venta</span>
            <span className="font-mono">{money(total)}</span>
          </div>
          <div className="flex items-center justify-between text-terracota">
            <span>Costo de cobro</span>
            <span className="font-mono">−{money(costoTotal)}</span>
          </div>
          <div className="flex items-center justify-between border-t border-border pt-1 font-semibold">
            <span>Neto que vas a cobrar</span>
            <span className="font-mono">{money(total - costoTotal)}</span>
          </div>
          {diasMax > 0 && (
            <p className="pt-1 text-xs text-muted">
              Acredita en {diasMax} día{diasMax === 1 ? '' : 's'}.
            </p>
          )}
        </div>
      )}

      {faltaTarifario && (
        <p className="rounded-md border border-border bg-card-2 px-3 py-2 text-xs text-muted">
          Hay pagos sin arancel cargado: se registran con costo cero. Cargalos
          en Ventas → Cuentas para que el neto sea real.
        </p>
      )}
    </div>
  )
}

/** Redondeo a centavos: evita que el "resto" arrastre basura de punto flotante. */
function redondear(n: number): number {
  return Math.round(n * 100) / 100
}

function money(n: number): string {
  return `$ ${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
}
