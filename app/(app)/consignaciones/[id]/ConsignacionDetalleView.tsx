'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import {
  ESTADO_DETALLE_LABEL,
  type ConsignacionConDetalle,
  type EstadoConsignacionDetalle,
} from '@/lib/types/consignaciones'
import {
  agregarItemConsignacionAction,
  cancelarItemConsignacionAction,
  cerrarConsignacionAction,
  confirmarSalidaItemAction,
} from '../actions'

const DETALLE_VARIANT: Record<EstadoConsignacionDetalle, 'success' | 'warning' | 'neutral'> = {
  pendiente: 'warning',
  devuelto: 'success',
  cancelado: 'neutral',
}

interface LookupOk {
  ok: true
  item: {
    id_item: string
    qr_code: string
    producto_nombre: string
    sku: string | null
    categoria_nombre: string | null
    costo_ingreso: number
    fecha_ingreso: string
  }
}
interface LookupFail { ok: false; reason: string; estado?: string }
type LookupResp = LookupOk | LookupFail

export function ConsignacionDetalleView({ cons }: { cons: ConsignacionConDetalle }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = useTransition()

  const [qrInput, setQrInput] = useState('')
  const [motivoItem, setMotivoItem] = useState('')
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null)
  const [buscando, setBuscando] = useState(false)

  const [confirmarSalida, setConfirmarSalida] = useState<string | null>(null)
  const [cancelarItem, setCancelarItem] = useState<string | null>(null)
  const [cerrarOpen, setCerrarOpen] = useState(false)

  const readonly = cons.estado === 'cerrada'
  const pendientes = cons.detalles.filter((d) => d.estado === 'pendiente').length
  const devueltos = cons.detalles.filter((d) => d.estado === 'devuelto').length

  async function agregarItem(e?: React.FormEvent) {
    e?.preventDefault()
    const qr = qrInput.trim()
    if (!qr) return
    if (!cons.proveedor) return setErrorBusqueda('Consignación sin proveedor')
    setBuscando(true)
    setErrorBusqueda(null)
    try {
      const r = await fetch(
        `/api/consignaciones/lookup-item?qr=${encodeURIComponent(qr)}&id_proveedor=${cons.proveedor.id_proveedor}`,
      )
      const data = (await r.json()) as LookupResp
      if (!data.ok) {
        setErrorBusqueda(traducir(data.reason, data))
        return
      }
      // Llamar al RPC vía Server Action
      start(async () => {
        const res = await agregarItemConsignacionAction({
          idConsignacion: cons.id_consignacion,
          idItem: data.item.id_item,
          motivo: motivoItem || null,
        })
        if (!res.ok) {
          setErrorBusqueda(traducir(res.reason))
          return
        }
        toast.success('Ítem apartado')
        setQrInput('')
        router.refresh()
      })
    } catch (err) {
      setErrorBusqueda((err as Error).message)
    } finally {
      setBuscando(false)
    }
  }

  function ejecutarConfirmar() {
    if (!confirmarSalida) return
    const id = confirmarSalida
    setConfirmarSalida(null)
    start(async () => {
      const res = await confirmarSalidaItemAction({
        idDetalle: id,
        idConsignacion: cons.id_consignacion,
      })
      if (!res.ok) return toast.error('No se pudo confirmar salida', traducir(res.reason))
      toast.success('Ítem devuelto al proveedor')
      router.refresh()
    })
  }

  function ejecutarCancelar() {
    if (!cancelarItem) return
    const id = cancelarItem
    setCancelarItem(null)
    start(async () => {
      const res = await cancelarItemConsignacionAction({
        idDetalle: id,
        idConsignacion: cons.id_consignacion,
      })
      if (!res.ok) return toast.error('No se pudo cancelar', traducir(res.reason))
      toast.success('Ítem liberado')
      router.refresh()
    })
  }

  function ejecutarCerrar() {
    setCerrarOpen(false)
    start(async () => {
      const res = await cerrarConsignacionAction({ idConsignacion: cons.id_consignacion })
      if (!res.ok) return toast.error('No se pudo cerrar', traducir(res.reason))
      toast.success('Consignación cerrada')
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      {/* Metadata */}
      <div className="rounded-lg border border-border bg-card p-4 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
        <div>
          <div className="text-xs uppercase font-mono text-muted">Proveedor</div>
          <div className="mt-1">{cons.proveedor?.nombre ?? '—'}</div>
          {cons.proveedor?.telefono && (
            <div className="text-xs text-muted">{cons.proveedor.telefono}</div>
          )}
        </div>
        <div>
          <div className="text-xs uppercase font-mono text-muted">Fecha</div>
          <div className="mt-1">{new Date(cons.fecha).toLocaleString('es-AR')}</div>
        </div>
        <div>
          <div className="text-xs uppercase font-mono text-muted">Ítems</div>
          <div className="mt-1 font-mono">
            {cons.detalles.length}
            {pendientes > 0 && (
              <span className="text-terracota"> ({pendientes} pendientes)</span>
            )}
          </div>
        </div>
        <div className="flex items-end justify-end gap-2">
          {!readonly && (
            <Button
              variant={pendientes > 0 ? 'secondary' : 'primary'}
              size="sm"
              onClick={() => setCerrarOpen(true)}
              disabled={pending || pendientes > 0}
              title={pendientes > 0 ? 'Resolvé todos los pendientes primero' : ''}
            >
              Cerrar lote
            </Button>
          )}
        </div>
      </div>

      {/* Agregar item */}
      {!readonly && (
        <form
          onSubmit={agregarItem}
          className="rounded-lg border border-border bg-card p-4 space-y-3"
        >
          <h3 className="font-display text-lg">Apartar ítem</h3>
          <Field
            htmlFor="qr-c"
            label="QR del ítem"
            error={errorBusqueda ?? undefined}
            hint="Solo ítems del proveedor de este lote, con tipo_ingreso=consignacion y estado=disponible"
          >
            <div className="flex gap-2">
              <Input
                id="qr-c"
                autoFocus
                value={qrInput}
                onChange={(e) => setQrInput(e.target.value)}
                placeholder="Escaneá o tipeá"
                invalid={!!errorBusqueda}
                disabled={buscando || pending}
              />
              <Button type="submit" disabled={buscando || pending || !qrInput.trim()}>
                {buscando ? 'Buscando…' : pending ? 'Apartando…' : 'Apartar'}
              </Button>
            </div>
          </Field>
          <Field htmlFor="mot-c" label="Motivo (aplica al próximo)" hint="Opcional; se guarda por línea">
            <Input
              id="mot-c"
              value={motivoItem}
              onChange={(e) => setMotivoItem(e.target.value)}
              placeholder="Ej: sin rotación, defecto de fábrica"
            />
          </Field>
        </form>
      )}

      {/* Tabla de items */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="px-4 py-3">Producto</th>
              <th className="px-4 py-3">QR</th>
              <th className="px-4 py-3 text-right">Costo</th>
              <th className="px-4 py-3">Motivo</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Fechas</th>
              {!readonly && <th className="px-4 py-3"></th>}
            </tr>
          </thead>
          <tbody>
            {cons.detalles.length === 0 ? (
              <tr>
                <td colSpan={readonly ? 6 : 7} className="px-4 py-8 text-center text-muted">
                  Sin ítems apartados todavía.
                </td>
              </tr>
            ) : (
              cons.detalles.map((d) => (
                <tr key={d.id_consignacion_detalle} className="border-b border-border-2">
                  <td className="px-4 py-3">
                    <div className="font-medium">{d.producto?.nombre ?? '—'}</div>
                    {d.producto?.sku && (
                      <div className="text-xs font-mono text-muted">{d.producto.sku}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{d.item?.qr_code ?? '—'}</td>
                  <td className="px-4 py-3 text-right font-mono">
                    {d.item?.costo_ingreso != null
                      ? `$ ${Number(d.item.costo_ingreso).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs">{d.motivo ?? <span className="text-muted-2">—</span>}</td>
                  <td className="px-4 py-3">
                    <Badge variant={DETALLE_VARIANT[d.estado]}>
                      {ESTADO_DETALLE_LABEL[d.estado]}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">
                    <div>Apart: {new Date(d.fecha_apartado).toLocaleDateString('es-AR')}</div>
                    {d.fecha_devolucion && (
                      <div>Sal: {new Date(d.fecha_devolucion).toLocaleDateString('es-AR')}</div>
                    )}
                  </td>
                  {!readonly && (
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {d.estado === 'pendiente' && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setCancelarItem(d.id_consignacion_detalle)}
                            disabled={pending}
                          >
                            Liberar
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            className="ml-2"
                            onClick={() => setConfirmarSalida(d.id_consignacion_detalle)}
                            disabled={pending}
                          >
                            Confirmar salida
                          </Button>
                        </>
                      )}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
          {cons.detalles.length > 0 && (
            <tfoot>
              <tr className="border-t border-border bg-card-2">
                <td colSpan={4} className="px-4 py-3 font-semibold">
                  Total {cons.detalles.length} ítem(s)
                </td>
                <td colSpan={readonly ? 2 : 3} className="px-4 py-3 text-xs text-muted">
                  {pendientes} pendientes · {devueltos} devueltos
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {cons.observaciones && (
        <div className="rounded-lg border border-border bg-card-2 p-4 text-sm">
          <div className="text-xs uppercase font-mono text-muted mb-1">Observaciones</div>
          <div>{cons.observaciones}</div>
        </div>
      )}

      {/* Modales */}
      <ConfirmDialog
        open={!!confirmarSalida}
        title="Confirmar salida del ítem"
        description="El ítem pasa a estado 'devuelto'. Esta acción no se puede deshacer; el ítem no vuelve al stock disponible."
        confirmLabel="Sí, salió"
        cancelLabel="Cancelar"
        onConfirm={ejecutarConfirmar}
        onCancel={() => setConfirmarSalida(null)}
      />
      <ConfirmDialog
        open={!!cancelarItem}
        title="Liberar ítem apartado"
        description="El ítem vuelve a estar disponible para venta o para otra consignación."
        variant="danger"
        confirmLabel="Sí, liberar"
        cancelLabel="Volver"
        onConfirm={ejecutarCancelar}
        onCancel={() => setCancelarItem(null)}
      />
      <ConfirmDialog
        open={cerrarOpen}
        title="Cerrar consignación"
        description="No se van a poder apartar más ítems en este lote. Solo se puede cerrar si no quedan ítems pendientes."
        confirmLabel="Sí, cerrar"
        cancelLabel="Cancelar"
        onConfirm={ejecutarCerrar}
        onCancel={() => setCerrarOpen(false)}
      />
    </div>
  )
}

function traducir(reason: string, extra?: LookupFail): string {
  if (reason.startsWith('item-not-found')) return 'No se encontró un ítem con ese QR.'
  if (reason.startsWith('item-no-disponible')) {
    const est = extra?.estado ? ` (estado: ${extra.estado})` : ''
    return `El ítem no está disponible${est}.`
  }
  if (reason.startsWith('item-no-es-consignacion'))
    return 'El ítem no es de consignación (fue comprado directamente).'
  if (reason === 'item-otro-proveedor')
    return 'El ítem pertenece a otro proveedor.'
  if (reason.startsWith('item-ya-en-consignacion-pendiente'))
    return 'Ya está apartado en otra consignación pendiente.'
  if (reason.startsWith('item-en-reserva'))
    return 'El ítem está en una reserva activa; canceladla primero.'
  if (reason.startsWith('quedan-pendientes'))
    return 'No se puede cerrar: quedan ítems pendientes de devolver o cancelar.'
  if (reason === 'consignacion-no-activa')
    return 'La consignación ya está cerrada.'
  return reason
}
