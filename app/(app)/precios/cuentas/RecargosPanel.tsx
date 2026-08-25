'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { NumberInput } from '@/components/ui/NumberInput'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import { resolverArancel } from '@/lib/cobros/calcular-costo'
import {
  MEDIO_PAGO_LABEL,
  type ArancelCobroRow,
  type CuentaDestinoRow,
  type MedioPago,
} from '@/lib/types/ventas'
import type {
  MedioPagoRecargo,
  PlanCuotasRow,
  RecargoCuotasRow,
} from '@/lib/types/precios'
import {
  cerrarVigenciaRecargoAction,
  crearRecargoCuotasAction,
} from '../actions'

/** Los medios que pueden financiar. El débito no tiene planes de cuotas. */
const MEDIOS_FINANCIABLES: MedioPagoRecargo[] = ['tarjeta_credito', 'transferencia']

/**
 * Recargo por cuotas, enfrentado al arancel que pretende cubrir.
 *
 * Esta es la pantalla que justifica que Cuentas viva dentro de Precios. Los
 * dos números existen desde 00057 y 00063, pero hasta ahora vivían separados:
 * el arancel en el tarifario de la cuenta, el recargo en las reglas de precio.
 * Separados, nadie podía contestar la única pregunta que importa — ¿lo que le
 * cobro de más al cliente alcanza para cubrir lo que me retiene el
 * procesador?
 *
 * El margen que se muestra en cada fila ES esa respuesta.
 */
export function RecargosPanel({
  cuentas,
  recargos,
  aranceles,
  planesCuotas,
}: {
  cuentas: CuentaDestinoRow[]
  recargos: RecargoCuotasRow[]
  aranceles: ArancelCobroRow[]
  planesCuotas: PlanCuotasRow[]
}) {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = useTransition()

  const [creando, setCreando] = useState(false)
  const [cuotas, setCuotas] = useState<number>(planesCuotas[0]?.cuotas ?? 3)
  // El financiador se elige con un solo `select`: las tres formas
  // (comodín / medio / cuenta / propia) son excluyentes, y ofrecerlas como
  // campos separados dejaba armar combinaciones que la tabla rechaza.
  const [financiador, setFinanciador] = useState('*')
  const [valor, setValor] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const planes = useMemo(
    () => planesCuotas.filter((p) => p.activo).sort((a, b) => a.cuotas - b.cuotas),
    [planesCuotas],
  )

  /**
   * Una fila por recargo vigente, con el arancel que le corresponde al lado.
   *
   * El arancel sólo se puede resolver cuando el recargo nombra una cuenta Y un
   * medio: el tarifario cuelga de esa combinación. Un recargo comodín no tiene
   * un arancel único que enfrentarle — tiene todos — así que ahí la comparación
   * se omite en vez de inventar un promedio.
   */
  const filas = useMemo(
    () =>
      recargos
        .filter((r) => r.vigente_hasta === null)
        .map((r) => {
          const arancel =
            !r.propia && r.id_cuenta_destino && r.medio
              ? resolverArancel(
                  aranceles,
                  r.id_cuenta_destino,
                  r.medio as MedioPago,
                  r.cuotas,
                )
              : null
          // El arancel tiene IVA sobre la comisión: comparar sólo el
          // `arancel_pct` subestimaría el costo real en un 21% de sí mismo.
          const costoPct = arancel
            ? arancel.arancel_pct * (1 + arancel.iva_arancel_pct / 100)
            : null
          const margen =
            costoPct !== null && r.tipo_valor === 'porcentaje'
              ? r.valor - costoPct
              : null
          return { r, costoPct, margen }
        })
        .sort((a, b) => a.r.cuotas - b.r.cuotas || etiqueta(a.r, cuentas).localeCompare(etiqueta(b.r, cuentas))),
    [recargos, aranceles, cuentas],
  )

  function crear() {
    setError(null)
    const destino = parseFinanciador(financiador)
    start(async () => {
      const res = await crearRecargoCuotasAction({ cuotas, valor, ...destino })
      if (!res.ok) return setError(explicar(res.reason))
      toast.success('Recargo creado')
      setCreando(false)
      setValor(0)
      router.refresh()
    })
  }

  function cerrar(id: string) {
    start(async () => {
      const res = await cerrarVigenciaRecargoAction({
        id,
        hasta: new Date().toISOString().slice(0, 10),
      })
      if (!res.ok) return toast.error(explicar(res.reason))
      toast.success('Recargo dado de baja')
      router.refresh()
    })
  }

  if (planes.length === 0) {
    return (
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="font-display text-lg text-text">Recargo por cuotas</h2>
        <p className="mt-2 text-sm text-muted">
          Todavía no hay planes de cuotas configurados. Cargá al menos uno en
          Precios antes de definir cuánto se cobra de más por cada plan: el
          recargo cuelga del plan, no al revés.
        </p>
      </section>
    )
  }

  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="font-display text-lg text-text">Recargo por cuotas</h2>
          <p className="text-sm text-muted">
            Lo que le cobrás de más al cliente por pagar en partes, enfrentado a
            lo que te retiene el procesador.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setCreando((v) => !v)}
          disabled={pending}
        >
          {creando ? 'Cancelar' : 'Nuevo recargo'}
        </Button>
      </div>

      {creando && (
        <div className="space-y-3 rounded-md border border-pink-strong/40 bg-card-2 p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field htmlFor="rc-cuotas" label="Plan" required>
              <Select
                id="rc-cuotas"
                value={cuotas}
                onChange={(e) => setCuotas(Number(e.target.value))}
                disabled={pending}
              >
                {planes.map((p) => (
                  <option key={p.cuotas} value={p.cuotas}>
                    {p.cuotas} cuotas
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              htmlFor="rc-fin"
              label="Quién financia"
              required
              hint="Lo más específico gana: una cuenta le gana a un medio, y un medio al comodín."
            >
              <Select
                id="rc-fin"
                value={financiador}
                onChange={(e) => setFinanciador(e.target.value)}
                disabled={pending}
              >
                <option value="*">Cualquier destino (comodín)</option>
                <option value="propia">Crédito del local</option>
                {MEDIOS_FINANCIABLES.map((m) => (
                  <option key={`m:${m}`} value={`m:${m}`}>
                    Cualquier {MEDIO_PAGO_LABEL[m as MedioPago].toLowerCase()}
                  </option>
                ))}
                {cuentas
                  .filter((c) => c.activo && c.tipo !== 'efectivo')
                  .map((c) =>
                    MEDIOS_FINANCIABLES.map((m) => (
                      <option
                        key={`c:${c.id_cuenta_destino}:${m}`}
                        value={`c:${c.id_cuenta_destino}:${m}`}
                      >
                        {c.nombre} · {MEDIO_PAGO_LABEL[m as MedioPago].toLowerCase()}
                      </option>
                    )),
                  )}
              </Select>
            </Field>

            <Field
              htmlFor="rc-valor"
              label="Recargo %"
              required
              hint="Sobre el precio ya descontado."
            >
              <NumberInput
                id="rc-valor"
                min={0}
                max={100}
                value={valor}
                onChange={(e) => setValor(Number(e.target.value || 0))}
                disabled={pending}
                className="text-right"
              />
            </Field>
          </div>

          {financiador === 'propia' && (
            <p className="rounded-md border border-border bg-card px-3 py-2 text-xs text-muted">
              El crédito del local no hereda el recargo de las tarjetas. Si no
              cargás esta fila, financiar vos sale sin recargo — que es lo
              prudente, pero probablemente no lo que querés.
            </p>
          )}

          {error && (
            <p className="rounded-md border border-alerta-ink bg-alerta-bg px-3 py-2 text-xs text-alerta-ink">
              {error}
            </p>
          )}

          <Button type="button" size="sm" onClick={crear} disabled={pending}>
            {pending ? 'Creando…' : 'Crear recargo'}
          </Button>
        </div>
      )}

      {filas.length === 0 ? (
        <p className="rounded-md border border-border bg-card-2 px-3 py-4 text-sm text-muted">
          No hay recargos cargados. Sin ellos, vender en cuotas sale al mismo
          precio que al contado y el arancel del procesador te lo comés entero.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th className="px-3 py-2">Plan</th>
                <th className="px-3 py-2">Quién financia</th>
                <th className="px-3 py-2 text-right">Te cobran</th>
                <th className="px-3 py-2 text-right">Cobrás</th>
                <th className="px-3 py-2 text-right">Te queda</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filas.map(({ r, costoPct, margen }) => (
                <tr key={r.id_recargo_cuotas} className="border-b border-border-2">
                  <td className="px-3 py-2 font-medium">{r.cuotas} cuotas</td>
                  <td className="px-3 py-2">
                    {etiqueta(r, cuentas)}
                    {r.propia && (
                      <Badge variant="warning">
                        <span className="ml-1">propia</span>
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-muted">
                    {costoPct === null ? '—' : `${pct(costoPct)}%`}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {r.tipo_valor === 'porcentaje'
                      ? `+${pct(r.valor)}%`
                      : `+$ ${r.valor.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`}
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-mono ${
                      margen !== null && margen < 0 ? 'text-terracota' : ''
                    }`}
                  >
                    {margen === null ? '—' : `${margen >= 0 ? '+' : ''}${pct(margen)}%`}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => cerrar(r.id_recargo_cuotas)}
                      disabled={pending}
                      className="text-xs text-muted underline-offset-2 hover:text-terracota hover:underline disabled:opacity-50"
                      title="Cierra la vigencia. El recargo no se borra: deja de aplicar desde hoy."
                    >
                      Dar de baja
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filas.some((f) => f.margen !== null && f.margen < 0) && (
        <p className="rounded-md border border-alerta-ink bg-alerta-bg px-3 py-2 text-xs text-alerta-ink">
          Hay planes donde el recargo no cubre el arancel: cada venta en esas
          condiciones te deja menos de lo que muestra el precio.
        </p>
      )}

      <p className="text-xs text-muted">
        &laquo;Te cobran&raquo; incluye el IVA sobre la comisión, que es la
        parte que se suele olvidar. Los recargos comodín no muestran
        comparación: aplican a varios procesadores con aranceles distintos, y
        promediarlos sería inventar un número.
      </p>
    </section>
  )
}

/** Cómo se lee un financiador en la tabla. */
function etiqueta(r: RecargoCuotasRow, cuentas: CuentaDestinoRow[]): string {
  if (r.propia) return 'Crédito del local'
  const medio = r.medio ? MEDIO_PAGO_LABEL[r.medio as MedioPago].toLowerCase() : null
  if (r.id_cuenta_destino) {
    const c = cuentas.find((x) => x.id_cuenta_destino === r.id_cuenta_destino)
    const nombre = c?.nombre ?? 'Cuenta eliminada'
    return medio ? `${nombre} · ${medio}` : nombre
  }
  if (medio) return `Cualquier ${medio}`
  return 'Cualquier destino'
}

/** `'c:<uuid>:<medio>'` / `'m:<medio>'` / `'propia'` / `'*'` → input de la action. */
function parseFinanciador(v: string): {
  idCuentaDestino?: string | null
  medio?: MedioPagoRecargo | null
  propia?: boolean
} {
  if (v === 'propia') return { propia: true }
  if (v.startsWith('m:')) return { medio: v.slice(2) as MedioPagoRecargo }
  if (v.startsWith('c:')) {
    const [, id, medio] = v.split(':')
    return { idCuentaDestino: id, medio: medio as MedioPagoRecargo }
  }
  return {}
}

function pct(n: number): string {
  return n.toLocaleString('es-AR', { maximumFractionDigits: 2 })
}

function explicar(reason: string): string {
  if (reason === 'cuotas-invalidas') return 'El plan de cuotas no es válido.'
  if (reason === 'valor-invalido') return 'El recargo tiene que estar entre 0 y 100.'
  if (reason === 'propia-con-procesador') {
    return 'El crédito del local no pasa por ninguna cuenta.'
  }
  if (reason === 'recargo-duplicado') {
    return 'Ya hay un recargo vigente para ese plan y ese financiador. Dalo de baja primero.'
  }
  return reason
}
