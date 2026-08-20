'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { NumberInput } from '@/components/ui/NumberInput'
import { Pagination } from '@/components/ui/Pagination'
import { Select } from '@/components/ui/Select'
import { Table, type Column } from '@/components/ui/Table'
import { useToast } from '@/components/ui/Toast'
import {
  MEDIO_PAGO_LABEL,
  TIPO_CUENTA_DESTINO_LABEL,
  type ArancelCobroRow,
  type CuentaDestinoRow,
  type MedioPago,
  type TipoCuentaDestino,
} from '@/lib/types/ventas'
import type { PlanCuotasRow } from '@/lib/types/precios'
import {
  actualizarCuentaDestinoAction,
  crearCuentaDestinoAction,
  marcarCuentaPredeterminadaAction,
} from '../actions'
import { ArancelesPanel } from './ArancelesPanel'

const TIPOS: TipoCuentaDestino[] = ['efectivo', 'banco', 'billetera_virtual']

/** Los medios que pueden tener costo. El efectivo nunca paga arancel. */
const MEDIOS_CON_COSTO: MedioPago[] = ['transferencia', 'tarjeta_debito', 'tarjeta_credito']

/** Una fila del arancel rápido del alta. Texto, porque puede quedar vacía. */
interface ArancelBorrador {
  arancelPct: string
  ivaArancelPct: string
  diasAcreditacion: string
}

const ARANCEL_VACIO: ArancelBorrador = {
  arancelPct: '',
  ivaArancelPct: '21',
  diasAcreditacion: '0',
}

const RETENCIONES_VACIAS = {
  ret_iva_pct: '0',
  ret_ganancias_pct: '0',
  ret_iibb_pct: '0',
  imp_deb_cred_pct: '0',
}

/**
 * ABM de cuentas de cobro. La cuenta predeterminada es la que usa el server
 * cuando una venta no detalla su cobranza, así que siempre tiene que haber
 * una: por eso se puede cambiar cuál es, pero no dejar el tenant sin ninguna.
 *
 * El alta incluye el costo de cobro (00057) en el mismo formulario. Cargarlo
 * después obligaba a crear la cuenta, buscarla y volver a entrar — y dejaba
 * cuentas a medio configurar que registran cobros con costo cero sin que
 * nadie se entere.
 */
export function CuentasView({
  cuentas,
  aranceles,
  planesCuotas,
  page,
  pageSize,
  total,
}: {
  cuentas: CuentaDestinoRow[]
  aranceles: ArancelCobroRow[]
  planesCuotas: PlanCuotasRow[]
  page: number
  pageSize: number
  total: number
}) {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = useTransition()

  const [creando, setCreando] = useState(false)
  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState<TipoCuentaDestino>('banco')
  const [titular, setTitular] = useState('')
  const [identificador, setIdentificador] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Costo de cobro del alta: un arancel comodín por medio (el tarifario por
  // plan de cuotas se afina después, desde el panel de la cuenta).
  const [arancelesNuevos, setArancelesNuevos] = useState<Record<string, ArancelBorrador>>({
    transferencia: { ...ARANCEL_VACIO },
    tarjeta_debito: { ...ARANCEL_VACIO },
    tarjeta_credito: { ...ARANCEL_VACIO },
  })
  const [retenciones, setRetenciones] = useState({ ...RETENCIONES_VACIAS })

  // Cuenta cuyo tarifario detallado está abierto. Vive abajo de la tabla y no
  // dentro de una fila: `Table` renderiza filas planas, y meterle una fila
  // expandible rompería el markup que le da el rol ARIA correcto.
  const [detalle, setDetalle] = useState<string | null>(null)

  // La caja física no paga arancel: ofrecer el bloque ahí sería invitar a
  // cargar un costo que no existe.
  const cobraArancel = tipo !== 'efectivo'

  function resetForm() {
    setNombre('')
    setTitular('')
    setIdentificador('')
    setArancelesNuevos({
      transferencia: { ...ARANCEL_VACIO },
      tarjeta_debito: { ...ARANCEL_VACIO },
      tarjeta_credito: { ...ARANCEL_VACIO },
    })
    setRetenciones({ ...RETENCIONES_VACIAS })
  }

  function crear() {
    if (nombre.trim().length < 2) return setError('Nombre muy corto')
    setError(null)

    // Sólo viajan los medios con arancel cargado: una fila en blanco no es
    // "0%", es "todavía no lo sé".
    const filas = cobraArancel
      ? MEDIOS_CON_COSTO.flatMap((m) => {
          const b = arancelesNuevos[m]
          const pct = num(b.arancelPct)
          if (pct === null) return []
          return [
            {
              medio: m,
              arancelPct: pct,
              ivaArancelPct: num(b.ivaArancelPct) ?? 21,
              diasAcreditacion: num(b.diasAcreditacion) ?? 0,
            },
          ]
        })
      : []

    start(async () => {
      const res = await crearCuentaDestinoAction({
        nombre,
        tipo,
        titular: titular || null,
        identificador: identificador || null,
        retenciones: cobraArancel
          ? {
              ret_iva_pct: num(retenciones.ret_iva_pct) ?? 0,
              ret_ganancias_pct: num(retenciones.ret_ganancias_pct) ?? 0,
              ret_iibb_pct: num(retenciones.ret_iibb_pct) ?? 0,
              imp_deb_cred_pct: num(retenciones.imp_deb_cred_pct) ?? 0,
            }
          : undefined,
        aranceles: filas,
      })
      if (!res.ok) return setError(explicar(res.reason))
      resetForm()
      setCreando(false)
      const fallidos = res.data?.arancelesFallidos ?? 0
      if (fallidos > 0) {
        toast.error(
          'Cuenta creada, aranceles incompletos',
          `${fallidos} arancel(es) no se pudieron cargar. Revisalos en Costo de cobro.`,
        )
      } else {
        toast.success('Cuenta creada')
      }
      router.refresh()
    })
  }

  function toggleActivo(row: CuentaDestinoRow) {
    start(async () => {
      const res = await actualizarCuentaDestinoAction({
        id: row.id_cuenta_destino,
        patch: { activo: !row.activo },
      })
      if (!res.ok) return toast.error('No se pudo actualizar', explicar(res.reason))
      router.refresh()
    })
  }

  function hacerPredeterminada(row: CuentaDestinoRow) {
    start(async () => {
      const res = await marcarCuentaPredeterminadaAction({ id: row.id_cuenta_destino })
      if (!res.ok) return toast.error('No se pudo actualizar', explicar(res.reason))
      toast.success('Cuenta predeterminada', row.nombre)
      router.refresh()
    })
  }

  function goToPage(nextPage: number) {
    const params = new URLSearchParams()
    if (nextPage > 1) params.set('page', String(nextPage))
    const qs = params.toString()
    // Cambiar de página deja el panel de detalle apuntando a una cuenta que
    // ya no está en pantalla.
    setDetalle(null)
    start(() => router.push(qs ? `/ventas/cuentas?${qs}` : '/ventas/cuentas'))
  }

  const columns: Column<CuentaDestinoRow>[] = [
    {
      key: 'nombre',
      label: 'Cuenta',
      render: (c) => {
        const puedeTenerCosto = c.tipo !== 'efectivo'
        const conArancel = aranceles.some(
          (a) => a.id_cuenta_destino === c.id_cuenta_destino && a.arancel_pct > 0,
        )
        return (
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{c.nombre}</span>
              {c.es_predeterminada && <Badge variant="success">Predeterminada</Badge>}
              {puedeTenerCosto && !conArancel && <Badge variant="warning">Sin arancel</Badge>}
            </div>
            {c.titular && <div className="text-xs text-muted">{c.titular}</div>}
          </div>
        )
      },
    },
    { key: 'tipo', label: 'Tipo', render: (c) => TIPO_CUENTA_DESTINO_LABEL[c.tipo] },
    {
      key: 'identificador',
      label: 'Identificador',
      render: (c) =>
        c.identificador ? (
          <span className="font-mono text-xs">{c.identificador}</span>
        ) : (
          <span className="text-muted-2">—</span>
        ),
    },
    {
      key: 'estado',
      label: 'Estado',
      render: (c) =>
        c.activo ? (
          <span className="text-xs uppercase font-mono text-success">Activa</span>
        ) : (
          <span className="text-xs uppercase font-mono text-muted">Inactiva</span>
        ),
    },
    {
      key: 'acciones',
      label: '',
      align: 'right',
      render: (c) => (
        <div className="flex justify-end whitespace-nowrap">
          {c.tipo !== 'efectivo' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setDetalle(detalle === c.id_cuenta_destino ? null : c.id_cuenta_destino)
              }
              aria-expanded={detalle === c.id_cuenta_destino}
              disabled={pending}
            >
              {detalle === c.id_cuenta_destino ? 'Cerrar costo' : 'Costo de cobro'}
            </Button>
          )}
          {!c.es_predeterminada && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => hacerPredeterminada(c)}
                disabled={pending}
              >
                Predeterminada
              </Button>
              <Button variant="ghost" size="sm" onClick={() => toggleActivo(c)} disabled={pending}>
                {c.activo ? 'Desactivar' : 'Activar'}
              </Button>
            </>
          )}
        </div>
      ),
    },
  ]

  const cuentaDetalle = cuentas.find((c) => c.id_cuenta_destino === detalle) ?? null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted">
          Los lugares donde entra la plata de las ventas. La predeterminada se
          usa cuando una venta no detalla su cobranza.
        </p>
        <Button
          type="button"
          onClick={() => {
            setCreando((v) => !v)
            setError(null)
          }}
          aria-expanded={creando}
        >
          {creando ? 'Cerrar' : 'Nueva cuenta'}
        </Button>
      </div>

      {creando && (
        <div className="space-y-4 rounded-lg border border-border bg-card p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field htmlFor="c-nombre" label="Nombre" required error={error ?? undefined}>
              <Input
                id="c-nombre"
                autoFocus
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Caja, Santander, Mercado Pago…"
                invalid={!!error}
              />
            </Field>
            <Field htmlFor="c-tipo" label="Tipo" required>
              <Select
                id="c-tipo"
                value={tipo}
                onChange={(e) => setTipo(e.target.value as TipoCuentaDestino)}
              >
                {TIPOS.map((t) => (
                  <option key={t} value={t}>
                    {TIPO_CUENTA_DESTINO_LABEL[t]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field htmlFor="c-titular" label="Titular">
              <Input
                id="c-titular"
                value={titular}
                onChange={(e) => setTitular(e.target.value)}
                placeholder="A nombre de"
              />
            </Field>
            <Field
              htmlFor="c-ident"
              label="Identificador"
              hint="CBU, alias, o últimos 4 dígitos de la tarjeta"
            >
              <Input
                id="c-ident"
                value={identificador}
                onChange={(e) => setIdentificador(e.target.value)}
              />
            </Field>
          </div>

          {cobraArancel && (
            <div className="space-y-4 rounded-md border border-border bg-card-2 p-4">
              <div>
                <h3 className="text-sm font-semibold text-text">Costo de cobro</h3>
                <p className="mt-1 text-xs text-muted">
                  Opcional, se puede completar después. Los porcentajes tienen
                  que salir de tu liquidación real. Un medio sin arancel
                  registra sus cobros con costo cero.
                </p>
              </div>

              <div className="space-y-3">
                <span className="text-xs uppercase font-mono text-muted">Aranceles</span>
                {MEDIOS_CON_COSTO.map((m) => (
                  <div key={m} className="grid grid-cols-1 items-end gap-3 sm:grid-cols-4">
                    <span className="text-sm text-text sm:pb-2">{MEDIO_PAGO_LABEL[m]}</span>
                    <Field htmlFor={`na-${m}-pct`} label="Arancel %">
                      <NumberInput
                        id={`na-${m}-pct`}
                        value={arancelesNuevos[m].arancelPct}
                        onChange={(e) =>
                          setArancelesNuevos((s) => ({
                            ...s,
                            [m]: { ...s[m], arancelPct: e.target.value },
                          }))
                        }
                        placeholder="Sin cargar"
                        className="text-right"
                      />
                    </Field>
                    <Field htmlFor={`na-${m}-iva`} label="IVA s/arancel %">
                      <NumberInput
                        id={`na-${m}-iva`}
                        value={arancelesNuevos[m].ivaArancelPct}
                        onChange={(e) =>
                          setArancelesNuevos((s) => ({
                            ...s,
                            [m]: { ...s[m], ivaArancelPct: e.target.value },
                          }))
                        }
                        className="text-right"
                      />
                    </Field>
                    <Field htmlFor={`na-${m}-dias`} label="Días">
                      <NumberInput
                        id={`na-${m}-dias`}
                        value={arancelesNuevos[m].diasAcreditacion}
                        onChange={(e) =>
                          setArancelesNuevos((s) => ({
                            ...s,
                            [m]: { ...s[m], diasAcreditacion: e.target.value },
                          }))
                        }
                        className="text-right"
                      />
                    </Field>
                  </div>
                ))}
              </div>

              <div className="space-y-2 border-t border-border pt-3">
                <span className="text-xs uppercase font-mono text-muted">Retenciones</span>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  {(
                    [
                      ['ret_iva_pct', 'IVA %'],
                      ['ret_ganancias_pct', 'Ganancias %'],
                      ['ret_iibb_pct', 'IIBB %'],
                      ['imp_deb_cred_pct', 'Imp. déb./créd. %'],
                    ] as const
                  ).map(([campo, label]) => (
                    <Field key={campo} htmlFor={`nr-${campo}`} label={label}>
                      <NumberInput
                        id={`nr-${campo}`}
                        value={retenciones[campo]}
                        onChange={(e) =>
                          setRetenciones((r) => ({ ...r, [campo]: e.target.value }))
                        }
                        className="text-right"
                      />
                    </Field>
                  ))}
                </div>
                <p className="text-xs text-muted">
                  Sólo se aplican a los medios que tengan arancel cargado. Un
                  cobro en efectivo nunca retiene.
                </p>
              </div>
            </div>
          )}

          <Button type="button" onClick={crear} disabled={pending || nombre.trim().length < 2}>
            {pending ? 'Creando…' : 'Crear cuenta'}
          </Button>
        </div>
      )}

      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <Table
          columns={columns}
          data={cuentas}
          loading={pending}
          getRowId={(c) => c.id_cuenta_destino}
          emptyState="No hay cuentas cargadas."
        />
      </div>

      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={goToPage}
        disabled={pending}
      />

      {cuentaDetalle && (
        <ArancelesPanel
          cuenta={cuentaDetalle}
          aranceles={aranceles}
          planesCuotas={planesCuotas}
        />
      )}
    </div>
  )
}

/** "6,29" o "6.29" → 6.29. Vacío o no numérico → null. */
function num(raw: string): number | null {
  const n = Number(raw.replace(',', '.'))
  return raw.trim() !== '' && Number.isFinite(n) ? n : null
}

function explicar(reason: string): string {
  if (reason === 'nombre-invalido') return 'El nombre es muy corto.'
  if (reason === 'porcentaje-invalido') return 'Los porcentajes tienen que estar entre 0 y 100.'
  if (reason === 'dias-invalidos') return 'Los días de acreditación no pueden ser negativos.'
  if (reason.includes('cuenta_destino_nombre_uk')) return 'Ya existe una cuenta con ese nombre.'
  return reason
}
