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
import type { PlanCuotasRow } from '@/lib/types/precios'
import {
  actualizarCuentaDestinoAction,
  cerrarVigenciaArancelAction,
  crearArancelCobroAction,
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
  planesCuotas,
}: {
  cuenta: CuentaDestinoRow
  aranceles: ArancelCobroRow[]
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
    <div className="space-y-4 rounded-lg border border-border bg-card-2 p-4">
      <div>
        <h4 className="font-display text-base">Costo de cobro</h4>
        <p className="mt-1 text-xs text-muted">
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
                {propios.map((a) => (
                  <tr key={a.id_arancel_cobro} className="border-b border-border-2 last:border-0">
                    <td className="px-3 py-2">{MEDIO_PAGO_LABEL[a.medio]}</td>
                    <td className="px-3 py-2 text-xs text-muted">
                      {a.cuotas === null ? 'Todos' : a.cuotas === 1 ? '1 pago' : `${a.cuotas} cuotas`}
                    </td>
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
                      {a.dias_acreditacion === 0 ? 'al instante' : `${a.dias_acreditacion} días`}
                    </td>
                    <td className="px-3 py-2 text-right">
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
