'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { NumberInput } from '@/components/ui/NumberInput'
import { Select } from '@/components/ui/Select'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
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
import { resolverArancel } from '@/lib/cobros/calcular-costo'
import { hoyISO } from '@/lib/utils/hoy'
import {
  actualizarArancelCobroAction,
  actualizarCuentaDestinoAction,
  actualizarRecargoCuotasAction,
  cerrarVigenciaArancelAction,
  cerrarVigenciaRecargoAction,
  crearArancelCobroAction,
  crearRecargoCuotasAction,
} from '../actions'

/** Los medios que pueden tener costo. El efectivo no paga arancel. */
const MEDIOS_CON_COSTO: MedioPago[] = ['transferencia', 'tarjeta_debito', 'tarjeta_credito']

/**
 * Configuración del costo de cobro de UNA cuenta (00057): el tarifario del
 * procesador y las retenciones fiscales.
 *
 * Están separados a propósito. El tarifario cambia por plan de cuotas y lo
 * define el procesador; las retenciones dependen de la situación fiscal del
 * comercio y son las mismas para 3 cuotas o para 12.
 */
export function ArancelesPanel({
  cuenta,
  aranceles,
  recargos,
  planesCuotas,
}: {
  cuenta: CuentaDestinoRow
  aranceles: ArancelCobroRow[]
  /** Todos los recargos vigentes; el panel se queda con los de esta cuenta. */
  recargos: RecargoCuotasRow[]
  planesCuotas: PlanCuotasRow[]
}) {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = useTransition()

  const [creando, setCreando] = useState(false)
  const [medio, setMedio] = useState<MedioPago>('tarjeta_credito')
  const [cuotas, setCuotas] = useState('')
  const [arancelPct, setArancelPct] = useState('')
  const [ivaPct, setIvaPct] = useState('21')
  const [dias, setDias] = useState('0')
  const [notas, setNotas] = useState('')
  const [error, setError] = useState<string | null>(null)

  const [cerrar, setCerrar] = useState<ArancelCobroRow | null>(null)

  // Edición de UNA fila del tarifario. El medio y el plan no se editan: son
  // la identidad de la fila. Cambiarlos sería otra fila, y para eso está el
  // alta — editarlos en el lugar dejaría dos tarifarios distintos apuntando
  // al mismo `arancel_cobro_vigente_uk`.
  const [editando, setEditando] = useState<string | null>(null)
  const [borrador, setBorrador] = useState({ arancelPct: '', ivaPct: '', dias: '' })

  // ─── Recargos de ESTA cuenta ───
  const [creandoRec, setCreandoRec] = useState(false)
  const [recCuotas, setRecCuotas] = useState<number>(planesCuotas[0]?.cuotas ?? 3)
  const [recMedio, setRecMedio] = useState<MedioPagoRecargo>('tarjeta_credito')
  const [recValor, setRecValor] = useState('')
  const [errorRec, setErrorRec] = useState<string | null>(null)
  const [editandoRec, setEditandoRec] = useState<string | null>(null)
  const [recBorrador, setRecBorrador] = useState('')

  // Retenciones: se editan juntas y se guardan de una, porque cambiarlas de a
  // una deja la cuenta en un estado fiscal que no existe.
  const [editandoRet, setEditandoRet] = useState(false)
  const [ret, setRet] = useState({
    ret_iva_pct: String(cuenta.ret_iva_pct),
    ret_ganancias_pct: String(cuenta.ret_ganancias_pct),
    ret_iibb_pct: String(cuenta.ret_iibb_pct),
    imp_deb_cred_pct: String(cuenta.imp_deb_cred_pct),
  })

  const propios = useMemo(
    () => aranceles.filter((a) => a.id_cuenta_destino === cuenta.id_cuenta_destino),
    [aranceles, cuenta.id_cuenta_destino],
  )

  /**
   * Los recargos de esta cuenta, enfrentados al arancel que pretenden cubrir.
   * El margen ES la pregunta que justifica tener las dos cosas en la misma
   * pantalla: ¿lo que le cobro de más al cliente alcanza para lo que me
   * retiene el procesador?
   */
  const recargosPropios = useMemo(
    () =>
      recargos
        .filter(
          (r) =>
            !r.propia &&
            r.vigente_hasta === null &&
            r.id_cuenta_destino === cuenta.id_cuenta_destino,
        )
        .sort((a, b) => a.cuotas - b.cuotas)
        .map((r) => {
          const ar = resolverArancel(
            aranceles,
            cuenta.id_cuenta_destino,
            (r.medio ?? 'tarjeta_credito') as MedioPago,
            r.cuotas,
          )
          const costoPct = ar ? ar.arancel_pct * (1 + ar.iva_arancel_pct / 100) : null
          const margen =
            costoPct === null || r.tipo_valor !== 'porcentaje' ? null : r.valor - costoPct
          return { r, costoPct, margen }
        }),
    [recargos, aranceles, cuenta.id_cuenta_destino],
  )

  const totalRetenciones =
    cuenta.ret_iva_pct + cuenta.ret_ganancias_pct + cuenta.ret_iibb_pct + cuenta.imp_deb_cred_pct

  function crear() {
    const pct = num(arancelPct)
    if (pct === null) return setError('Cargá el arancel.')
    const n = cuotas ? Number(cuotas) : null
    setError(null)
    start(async () => {
      const res = await crearArancelCobroAction({
        idCuentaDestino: cuenta.id_cuenta_destino,
        medio,
        cuotas: medio === 'tarjeta_credito' ? n : null,
        arancelPct: pct,
        ivaArancelPct: num(ivaPct) ?? 21,
        diasAcreditacion: num(dias) ?? 0,
        notas: notas.trim() || null,
      })
      if (!res.ok) return setError(explicarArancel(res.reason))
      setCreando(false)
      setArancelPct('')
      setCuotas('')
      setNotas('')
      toast.success('Arancel cargado')
      router.refresh()
    })
  }

  function guardarRetenciones() {
    const patch = {
      ret_iva_pct: num(ret.ret_iva_pct) ?? 0,
      ret_ganancias_pct: num(ret.ret_ganancias_pct) ?? 0,
      ret_iibb_pct: num(ret.ret_iibb_pct) ?? 0,
      imp_deb_cred_pct: num(ret.imp_deb_cred_pct) ?? 0,
    }
    start(async () => {
      const res = await actualizarCuentaDestinoAction({ id: cuenta.id_cuenta_destino, patch })
      if (!res.ok) return toast.error('No se pudo guardar', explicarArancel(res.reason))
      setEditandoRet(false)
      toast.success('Retenciones actualizadas')
      router.refresh()
    })
  }

  function abrirEdicion(a: ArancelCobroRow) {
    setEditando(a.id_arancel_cobro)
    setBorrador({
      arancelPct: String(a.arancel_pct),
      ivaPct: String(a.iva_arancel_pct),
      dias: String(a.dias_acreditacion),
    })
  }

  function guardarArancel(id: string) {
    start(async () => {
      const res = await actualizarArancelCobroAction({
        id,
        patch: {
          arancel_pct: num(borrador.arancelPct) ?? 0,
          iva_arancel_pct: num(borrador.ivaPct) ?? 0,
          dias_acreditacion: num(borrador.dias) ?? 0,
        },
      })
      if (!res.ok) return toast.error('No se pudo guardar', explicarArancel(res.reason))
      setEditando(null)
      toast.success('Arancel actualizado')
      router.refresh()
    })
  }

  function crearRecargo() {
    const v = num(recValor)
    if (v === null) return setErrorRec('Cargá el recargo.')
    setErrorRec(null)
    start(async () => {
      const res = await crearRecargoCuotasAction({
        cuotas: recCuotas,
        idCuentaDestino: cuenta.id_cuenta_destino,
        medio: recMedio,
        tipoValor: 'porcentaje',
        valor: v,
      })
      if (!res.ok) return setErrorRec(explicarArancel(res.reason))
      setCreandoRec(false)
      setRecValor('')
      toast.success('Recargo cargado')
      router.refresh()
    })
  }

  function guardarRecargo(id: string) {
    start(async () => {
      const res = await actualizarRecargoCuotasAction({ id, valor: num(recBorrador) ?? 0 })
      if (!res.ok) return toast.error('No se pudo guardar', explicarArancel(res.reason))
      setEditandoRec(null)
      toast.success('Recargo actualizado')
      router.refresh()
    })
  }

  function bajaRecargo(id: string) {
    start(async () => {
      const res = await cerrarVigenciaRecargoAction({ id, hasta: hoyISO() })
      if (!res.ok) return toast.error('No se pudo dar de baja', explicarArancel(res.reason))
      toast.success('Recargo dado de baja')
      router.refresh()
    })
  }

  function ejecutarCerrar() {
    const a = cerrar
    setCerrar(null)
    if (!a) return
    start(async () => {
      const res = await cerrarVigenciaArancelAction({ id: a.id_arancel_cobro })
      if (!res.ok) return toast.error('No se pudo cerrar', explicarArancel(res.reason))
      toast.success('Arancel dado de baja', 'Ya podés cargar el nuevo valor')
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-muted">
          Estos porcentajes tienen que salir de tu liquidación real, no de una
          estimación. El arancel cambia según el plan de cuotas y el plazo de
          acreditación que hayas contratado. Sin arancel cargado, el cobro se
          registra con costo cero.
        </p>
      </div>

      {/* ─── Tarifario ─────────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs uppercase font-mono text-muted">Aranceles vigentes</span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setCreando((v) => !v)
              setError(null)
            }}
            aria-expanded={creando}
          >
            {creando ? 'Cerrar' : '+ Arancel'}
          </Button>
        </div>

        {creando && (
          <div className="grid grid-cols-1 gap-3 rounded-md border border-border bg-card p-3 md:grid-cols-3">
            <Field htmlFor={`ar-medio-${cuenta.id_cuenta_destino}`} label="Medio" required>
              <Select
                id={`ar-medio-${cuenta.id_cuenta_destino}`}
                value={medio}
                onChange={(e) => setMedio(e.target.value as MedioPago)}
                disabled={pending}
              >
                {MEDIOS_CON_COSTO.map((m) => (
                  <option key={m} value={m}>
                    {MEDIO_PAGO_LABEL[m]}
                  </option>
                ))}
              </Select>
            </Field>

            {/* El plan sólo existe en crédito: en el resto de los medios un
                `cuotas` colgado haría que el tarifario no matchee nunca. */}
            {medio === 'tarjeta_credito' && (
              <Field
                htmlFor={`ar-cuotas-${cuenta.id_cuenta_destino}`}
                label="Plan"
                hint="Vacío = aplica a cualquier plan"
              >
                <Select
                  id={`ar-cuotas-${cuenta.id_cuenta_destino}`}
                  value={cuotas}
                  onChange={(e) => setCuotas(e.target.value)}
                  disabled={pending}
                >
                  <option value="">Todos los planes</option>
                  <option value="1">1 pago</option>
                  {planesCuotas.map((p) => (
                    <option key={p.cuotas} value={p.cuotas}>
                      {p.cuotas} cuotas
                    </option>
                  ))}
                </Select>
              </Field>
            )}

            <Field
              htmlFor={`ar-pct-${cuenta.id_cuenta_destino}`}
              label="Arancel %"
              required
              error={error ?? undefined}
            >
              <NumberInput
                id={`ar-pct-${cuenta.id_cuenta_destino}`}
                value={arancelPct}
                onChange={(e) => setArancelPct(e.target.value)}
                min={0}
                max={100}
                placeholder="6.29"
                invalid={!!error}
                disabled={pending}
                className="text-right"
              />
            </Field>

            <Field
              htmlFor={`ar-iva-${cuenta.id_cuenta_destino}`}
              label="IVA sobre arancel %"
              hint="21% de la comisión, no de la venta"
            >
              <NumberInput
                id={`ar-iva-${cuenta.id_cuenta_destino}`}
                value={ivaPct}
                onChange={(e) => setIvaPct(e.target.value)}
                min={0}
                max={100}
                disabled={pending}
                className="text-right"
              />
            </Field>

            <Field
              htmlFor={`ar-dias-${cuenta.id_cuenta_destino}`}
              label="Días de acreditación"
              hint="0 = al instante"
            >
              <NumberInput
                id={`ar-dias-${cuenta.id_cuenta_destino}`}
                value={dias}
                onChange={(e) => setDias(e.target.value)}
                min={0}
                disabled={pending}
                className="text-right"
              />
            </Field>

            <Field htmlFor={`ar-notas-${cuenta.id_cuenta_destino}`} label="Notas">
              <Input
                id={`ar-notas-${cuenta.id_cuenta_destino}`}
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Ej: plan 18 días"
                disabled={pending}
              />
            </Field>

            <div className="md:col-span-3">
              <Button type="button" size="sm" onClick={crear} disabled={pending}>
                {pending ? 'Guardando…' : 'Cargar arancel'}
              </Button>
            </div>
          </div>
        )}

        {propios.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted">
            Sin aranceles cargados. Los cobros de esta cuenta se registran con costo cero.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-3 py-2">Medio</th>
                  <th className="px-3 py-2">Plan</th>
                  <th className="px-3 py-2 text-right">Arancel</th>
                  <th className="px-3 py-2 text-right">IVA</th>
                  <th className="px-3 py-2 text-right">Acredita</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {propios.map((a) => {
                  const enEdicion = editando === a.id_arancel_cobro
                  return (
                    <tr
                      key={a.id_arancel_cobro}
                      className="border-b border-border-2 last:border-0"
                    >
                      <td className="px-3 py-2">{MEDIO_PAGO_LABEL[a.medio]}</td>
                      <td className="px-3 py-2 text-xs text-muted">
                        {a.cuotas === null
                          ? 'Todos'
                          : a.cuotas === 1
                            ? '1 pago'
                            : `${a.cuotas} cuotas`}
                      </td>
                      {/* En edición los tres números se vuelven inputs en su
                          propia columna. Es la fila la que se edita, no un
                          formulario aparte que obligue a recordar de qué fila
                          venía cada valor. */}
                      {enEdicion ? (
                        <>
                          <td className="px-2 py-1">
                            <NumberInput
                              value={borrador.arancelPct}
                              onChange={(e) =>
                                setBorrador((s) => ({ ...s, arancelPct: e.target.value }))
                              }
                              min={0}
                              max={100}
                              aria-label="Arancel %"
                              disabled={pending}
                              className="text-right"
                            />
                          </td>
                          <td className="px-2 py-1">
                            <NumberInput
                              value={borrador.ivaPct}
                              onChange={(e) =>
                                setBorrador((s) => ({ ...s, ivaPct: e.target.value }))
                              }
                              min={0}
                              max={100}
                              aria-label="IVA sobre arancel %"
                              disabled={pending}
                              className="text-right"
                            />
                          </td>
                          <td className="px-2 py-1">
                            <NumberInput
                              value={borrador.dias}
                              onChange={(e) =>
                                setBorrador((s) => ({ ...s, dias: e.target.value }))
                              }
                              min={0}
                              aria-label="Días de acreditación"
                              disabled={pending}
                              className="text-right"
                            />
                          </td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => setEditando(null)}
                              disabled={pending}
                            >
                              Cancelar
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => guardarArancel(a.id_arancel_cobro)}
                              disabled={pending}
                            >
                              Guardar
                            </Button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-2 text-right font-mono">
                            {a.arancel_pct === 0 ? (
                              <Badge variant="warning">Sin cargar</Badge>
                            ) : (
                              `${a.arancel_pct}%`
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-xs text-muted">
                            {a.iva_arancel_pct}%
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-xs">
                            {a.dias_acreditacion === 0
                              ? 'al instante'
                              : `${a.dias_acreditacion} días`}
                          </td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => abrirEdicion(a)}
                              disabled={pending}
                            >
                              Editar
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => setCerrar(a)}
                              disabled={pending}
                            >
                              Dar de baja
                            </Button>
                          </td>
                        </>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── Recargo por cuotas ────────────────────────────────────
          Vive acá y no en una pantalla aparte porque sólo tiene sentido
          contra el arancel de ARRIBA: el recargo existe para cubrirlo. Con
          las dos tablas separadas había que abrir dos pantallas y restar de
          memoria para saber si un plan daba pérdida. La tabla global sigue
          existiendo como panorama de todas las cuentas juntas. */}
      <div className="space-y-2 border-t border-border pt-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs uppercase font-mono text-muted">
            Recargo por cuotas
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setCreandoRec((v) => !v)
              setErrorRec(null)
            }}
            aria-expanded={creandoRec}
            disabled={pending}
          >
            {creandoRec ? 'Cerrar' : '+ Recargo'}
          </Button>
        </div>

        {creandoRec && (
          <div className="grid grid-cols-1 gap-3 rounded-md border border-border bg-card p-3 md:grid-cols-3">
            <Field htmlFor={`rc-cuotas-${cuenta.id_cuenta_destino}`} label="Plan" required>
              <Select
                id={`rc-cuotas-${cuenta.id_cuenta_destino}`}
                value={recCuotas}
                onChange={(e) => setRecCuotas(Number(e.target.value))}
                disabled={pending}
              >
                {planesCuotas.map((p) => (
                  <option key={p.cuotas} value={p.cuotas}>
                    {p.cuotas} cuotas
                  </option>
                ))}
              </Select>
            </Field>
            <Field htmlFor={`rc-medio-${cuenta.id_cuenta_destino}`} label="Medio" required>
              <Select
                id={`rc-medio-${cuenta.id_cuenta_destino}`}
                value={recMedio}
                onChange={(e) => setRecMedio(e.target.value as MedioPagoRecargo)}
                disabled={pending}
              >
                <option value="tarjeta_credito">Tarjeta de crédito</option>
                <option value="transferencia">Transferencia</option>
              </Select>
            </Field>
            <Field
              htmlFor={`rc-valor-${cuenta.id_cuenta_destino}`}
              label="Recargo %"
              required
              error={errorRec ?? undefined}
              hint="Sobre el precio ya descontado."
            >
              <NumberInput
                id={`rc-valor-${cuenta.id_cuenta_destino}`}
                value={recValor}
                onChange={(e) => setRecValor(e.target.value)}
                min={0}
                max={100}
                placeholder="12"
                invalid={!!errorRec}
                disabled={pending}
                className="text-right"
              />
            </Field>
            <div className="md:col-span-3">
              <Button type="button" size="sm" onClick={crearRecargo} disabled={pending}>
                {pending ? 'Guardando…' : 'Cargar recargo'}
              </Button>
            </div>
          </div>
        )}

        {recargosPropios.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted">
            Sin recargos para esta cuenta. Vender en cuotas sale al mismo precio
            que al contado y el arancel te lo comés entero.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-3 py-2">Plan</th>
                  <th className="px-3 py-2">Medio</th>
                  <th className="px-3 py-2 text-right">Te cobran</th>
                  <th className="px-3 py-2 text-right">Cobrás</th>
                  <th className="px-3 py-2 text-right">Te queda</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {recargosPropios.map(({ r, costoPct, margen }) => {
                  const enEdicion = editandoRec === r.id_recargo_cuotas
                  return (
                    <tr
                      key={r.id_recargo_cuotas}
                      className="border-b border-border-2 last:border-0"
                    >
                      <td className="px-3 py-2 font-medium">{r.cuotas} cuotas</td>
                      <td className="px-3 py-2 text-xs text-muted">
                        {r.medio ? MEDIO_PAGO_LABEL[r.medio as MedioPago] : 'Cualquiera'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-muted">
                        {costoPct === null ? '—' : `${redondear(costoPct)}%`}
                      </td>
                      {enEdicion ? (
                        <td className="px-2 py-1" colSpan={2}>
                          <NumberInput
                            value={recBorrador}
                            onChange={(e) => setRecBorrador(e.target.value)}
                            min={0}
                            max={100}
                            aria-label="Recargo %"
                            disabled={pending}
                            className="text-right"
                          />
                        </td>
                      ) : (
                        <>
                          <td className="px-3 py-2 text-right font-mono">
                            {r.tipo_valor === 'porcentaje'
                              ? `+${redondear(r.valor)}%`
                              : `+$ ${r.valor.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`}
                          </td>
                          {/* En rojo significa que ese plan da pérdida: el
                              recargo no llega a cubrir la comisión. */}
                          <td
                            className={`px-3 py-2 text-right font-mono ${
                              margen !== null && margen < 0 ? 'text-terracota' : ''
                            }`}
                          >
                            {margen === null
                              ? '—'
                              : `${margen >= 0 ? '+' : ''}${redondear(margen)}%`}
                          </td>
                        </>
                      )}
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {enEdicion ? (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => setEditandoRec(null)}
                              disabled={pending}
                            >
                              Cancelar
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => guardarRecargo(r.id_recargo_cuotas)}
                              disabled={pending}
                            >
                              Guardar
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEditandoRec(r.id_recargo_cuotas)
                                setRecBorrador(String(r.valor))
                              }}
                              disabled={pending}
                            >
                              Editar
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => bajaRecargo(r.id_recargo_cuotas)}
                              disabled={pending}
                            >
                              Dar de baja
                            </Button>
                          </>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {recargosPropios.some((f) => f.margen !== null && f.margen < 0) && (
          <p className="rounded-md border border-alerta-ink bg-alerta-bg px-3 py-2 text-xs text-alerta-ink">
            Hay planes donde el recargo no cubre el arancel: cada venta así te
            deja menos de lo que muestra el precio.
          </p>
        )}
      </div>

      {/* ─── Retenciones ───────────────────────────────────────────── */}
      <div className="space-y-2 border-t border-border pt-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <span className="text-xs uppercase font-mono text-muted">Retenciones</span>
            {!editandoRet && (
              <span className="ml-2 font-mono text-sm">
                {totalRetenciones === 0 ? (
                  <span className="text-muted-2">ninguna</span>
                ) : (
                  `${redondear(totalRetenciones)}% total`
                )}
              </span>
            )}
          </div>
          {!editandoRet && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setEditandoRet(true)}
              disabled={pending}
            >
              Editar
            </Button>
          )}
        </div>

        {editandoRet ? (
          <div className="space-y-3 rounded-md border border-border bg-card p-3">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {(
                [
                  ['ret_iva_pct', 'IVA %'],
                  ['ret_ganancias_pct', 'Ganancias %'],
                  ['ret_iibb_pct', 'IIBB %'],
                  ['imp_deb_cred_pct', 'Imp. déb./créd. %'],
                ] as const
              ).map(([campo, label]) => (
                <Field
                  key={campo}
                  htmlFor={`${campo}-${cuenta.id_cuenta_destino}`}
                  label={label}
                >
                  <NumberInput
                    id={`${campo}-${cuenta.id_cuenta_destino}`}
                    value={ret[campo]}
                    onChange={(e) => setRet((r) => ({ ...r, [campo]: e.target.value }))}
                    min={0}
                    max={100}
                    disabled={pending}
                    className="text-right"
                  />
                </Field>
              ))}
            </div>
            <p className="text-xs text-muted">
              Las retenciones sólo se aplican a los medios que tengan arancel
              cargado. Un cobro en efectivo nunca retiene.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  setRet({
                    ret_iva_pct: String(cuenta.ret_iva_pct),
                    ret_ganancias_pct: String(cuenta.ret_ganancias_pct),
                    ret_iibb_pct: String(cuenta.ret_iibb_pct),
                    imp_deb_cred_pct: String(cuenta.imp_deb_cred_pct),
                  })
                  setEditandoRet(false)
                }}
                disabled={pending}
              >
                Cancelar
              </Button>
              <Button type="button" size="sm" onClick={guardarRetenciones} disabled={pending}>
                {pending ? 'Guardando…' : 'Guardar'}
              </Button>
            </div>
          </div>
        ) : (
          totalRetenciones > 0 && (
            <div className="flex flex-wrap gap-2 text-xs text-muted">
              {cuenta.ret_iva_pct > 0 && <span>IVA {cuenta.ret_iva_pct}%</span>}
              {cuenta.ret_ganancias_pct > 0 && <span>Ganancias {cuenta.ret_ganancias_pct}%</span>}
              {cuenta.ret_iibb_pct > 0 && <span>IIBB {cuenta.ret_iibb_pct}%</span>}
              {cuenta.imp_deb_cred_pct > 0 && (
                <span>Déb./créd. {cuenta.imp_deb_cred_pct}%</span>
              )}
            </div>
          )
        )}
      </div>

      <ConfirmDialog
        open={!!cerrar}
        title="Dar de baja el arancel"
        description="Deja de aplicarse a los cobros nuevos. Las ventas ya registradas conservan el costo con el que se calcularon."
        confirmLabel="Dar de baja"
        cancelLabel="Cancelar"
        onConfirm={ejecutarCerrar}
        onCancel={() => setCerrar(null)}
      />
    </div>
  )
}

/** "6,29" o "6.29" → 6.29. Vacío o no numérico → null. */
function num(raw: string): number | null {
  const n = Number(raw.replace(',', '.'))
  return raw.trim() !== '' && Number.isFinite(n) ? n : null
}

function redondear(n: number): number {
  return Math.round(n * 1000) / 1000
}

function explicarArancel(reason: string): string {
  if (reason === 'porcentaje-invalido') return 'El porcentaje tiene que estar entre 0 y 100.'
  if (reason === 'dias-invalidos') return 'Los días de acreditación no pueden ser negativos.'
  if (reason === 'cuotas-medio-invalido') return 'El plan de cuotas sólo aplica a tarjeta de crédito.'
  if (reason.includes('arancel_cobro_vigente_uk')) {
    return 'Ya hay un arancel vigente para ese medio y plan. Dalo de baja antes de cargar el nuevo.'
  }
  return reason
}
