'use client'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { NumberInput } from '@/components/ui/NumberInput'
import {
  MEDIO_PAGO_LABEL,
  type CuentaDestinoRow,
  type MedioPago,
} from '@/lib/types/ventas'

/** Un pago mientras se edita. `recibido` es texto porque puede quedar vacío. */
export interface PagoBorrador {
  key: string
  medio: MedioPago
  idCuenta: string
  monto: number
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
    recibido: '',
    referencia: '',
  }
}

/**
 * Normaliza en render (no en un efecto) para que no exista un frame con la
 * cobranza mintiendo. Dos reglas:
 *
 *   - Un solo pago cubre SIEMPRE el total: no tiene sentido hacer que el
 *     vendedor tipee el número que ya está arriba, ni dejarlo desincronizado
 *     cuando cambia el carrito. Con dos o más, los montos son los que cargó.
 *   - La cuenta sigue al medio: si el pago pasó a efectivo, su cuenta pasa a
 *     ser la caja sola, sin que nadie tenga que tocar el selector.
 */
export function normalizarPagos(
  pagos: PagoBorrador[],
  total: number,
  cuentas: CuentaDestinoRow[],
): PagoBorrador[] {
  const conMonto = pagos.length === 1 ? [{ ...pagos[0], monto: total }] : pagos
  return conMonto.map((p) => {
    const opciones = cuentasPara(cuentas, p.medio)
    return opciones.some((c) => c.id_cuenta_destino === p.idCuenta)
      ? p
      : { ...p, idCuenta: opciones[0]?.id_cuenta_destino ?? '' }
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
  onChange,
}: {
  cuentas: CuentaDestinoRow[]
  pagos: PagoBorrador[]
  total: number
  disabled: boolean
  onChange: (pagos: PagoBorrador[]) => void
}) {
  const unico = pagos.length === 1
  const asignado = sumaPagos(pagos)
  const restante = total - asignado
  const cuadra = Math.abs(restante) < EPSILON

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
        {pagos.map((p) => {
          const esEfectivo = p.medio === 'efectivo'
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
                  className="flex-1 rounded-md border border-border bg-card px-2 py-1.5 text-sm text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-pink"
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
                  className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-pink"
                >
                  {opcionesCuenta.map((c) => (
                    <option key={c.id_cuenta_destino} value={c.id_cuenta_destino}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              )}

              <div className="flex items-center gap-2">
                <label className="text-xs text-muted w-16 shrink-0">Monto</label>
                <NumberInput
                  min={0}
                  step={0.01}
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
                  <Input
                    id={`recibido-${p.key}`}
                    inputMode="decimal"
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
            </div>
          )
        })}
      </div>

      {!unico && (
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
    </div>
  )
}

/** Redondeo a centavos: evita que el "resto" arrastre basura de punto flotante. */
function redondear(n: number): number {
  return Math.round(n * 100) / 100
}

function money(n: number): string {
  return `$ ${n.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
}
