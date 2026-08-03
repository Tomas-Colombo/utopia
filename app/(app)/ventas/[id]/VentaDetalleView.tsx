'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import {
  FORMA_PAGO_LABEL,
} from '@/lib/types/precios'
import {
  MEDIO_PAGO_LABEL,
  TIPO_COMPROBANTE_LABEL,
  type TipoComprobante,
  type VentaConDetalle,
} from '@/lib/types/ventas'
import {
  anularVentaAction,
  devolverItemVentaAction,
  emitirComprobanteAction,
} from '../actions'

export function VentaDetalleView({ venta }: { venta: VentaConDetalle }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = useTransition()

  const [anularOpen, setAnularOpen] = useState(false)
  const [devolverOpen, setDevolverOpen] = useState<string | null>(null)
  const [comprobanteOpen, setComprobanteOpen] = useState(false)
  const [tipoComp, setTipoComp] = useState<TipoComprobante>('ticket')
  const [numeroComp, setNumeroComp] = useState('')

  const readonly = venta.estado_venta === 'anulada'
  const tieneComprobante = venta.comprobantes.length > 0
  const total = Number(venta.total)

  function anular() {
    setAnularOpen(false)
    start(async () => {
      const res = await anularVentaAction({ idVenta: venta.id_venta })
      if (!res.ok) return toast.error('No se pudo anular', res.reason)
      toast.success('Venta anulada')
      router.refresh()
    })
  }

  function devolver() {
    if (!devolverOpen) return
    const id = devolverOpen
    setDevolverOpen(null)
    start(async () => {
      const res = await devolverItemVentaAction({
        idDetalleVenta: id,
        idVenta: venta.id_venta,
      })
      if (!res.ok) return toast.error('No se pudo devolver', res.reason)
      toast.success('Ítem devuelto por cliente')
      router.refresh()
    })
  }

  function emitir(e: React.FormEvent) {
    e.preventDefault()
    if (!numeroComp.trim()) return toast.error('Falta número')
    start(async () => {
      const res = await emitirComprobanteAction({
        idVenta: venta.id_venta,
        tipo: tipoComp,
        numero: numeroComp,
      })
      if (!res.ok) return toast.error('No se pudo emitir', res.reason)
      toast.success('Comprobante emitido')
      setComprobanteOpen(false)
      setNumeroComp('')
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      {/* Metadata + acciones */}
      <div className="rounded-lg border border-border bg-card p-4 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
        <div>
          <div className="text-xs uppercase font-mono text-muted">Cliente</div>
          <div className="mt-1">{venta.cliente?.nombre ?? 'Mostrador'}</div>
          {venta.cliente?.telefono && (
            <div className="text-xs text-muted">{venta.cliente.telefono}</div>
          )}
        </div>
        <div>
          <div className="text-xs uppercase font-mono text-muted">Forma de pago</div>
          <div className="mt-1">{FORMA_PAGO_LABEL[venta.forma_pago]}</div>
        </div>
        <div>
          <div className="text-xs uppercase font-mono text-muted">Total</div>
          <div className="mt-1 font-mono font-semibold">
            $ {total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
          </div>
        </div>
        <div className="flex items-end justify-end gap-2">
          {!readonly && !tieneComprobante && (
            <Button size="sm" variant="secondary" onClick={() => setComprobanteOpen(true)}>
              Emitir comprobante
            </Button>
          )}
          {!readonly && (
            <Button size="sm" variant="danger" onClick={() => setAnularOpen(true)}>
              Anular venta
            </Button>
          )}
        </div>
      </div>

      {venta.motivo_anulacion && (
        <div className="rounded-md border border-pink-strong bg-pink-bg px-3 py-2 text-sm text-pink-strong">
          Anulada: {venta.motivo_anulacion}
        </div>
      )}

      {/* Líneas */}
      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="px-4 py-3">Producto</th>
              <th className="px-4 py-3">QR</th>
              <th className="px-4 py-3 text-right">Precio</th>
              <th className="px-4 py-3 text-right">Costo</th>
              <th className="px-4 py-3 text-right">Prov.</th>
              <th className="px-4 py-3 text-right">Ganancia</th>
              <th className="px-4 py-3">Rendición</th>
              {!readonly && <th className="px-4 py-3"></th>}
            </tr>
          </thead>
          <tbody>
            {venta.lineas.map((l) => (
              <tr key={l.id_detalle_venta} className="border-b border-border-2">
                <td className="px-4 py-3">
                  <div className="font-medium">{l.producto?.nombre ?? '—'}</div>
                  {l.producto?.sku && (
                    <div className="text-xs font-mono text-muted">{l.producto.sku}</div>
                  )}
                  <div className="text-xs text-muted capitalize">
                    {l.tipo_ingreso_snapshot}
                  </div>
                </td>
                <td className="px-4 py-3 font-mono text-xs">{l.item?.qr_code ?? '—'}</td>
                <td className="px-4 py-3 text-right font-mono">
                  $ {Number(l.precio_venta).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-3 text-right font-mono text-muted">
                  $ {Number(l.costo_snapshot).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-3 text-right font-mono">
                  $ {Number(l.monto_proveedor).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-3 text-right font-mono">
                  <span className={Number(l.monto_ganancia) < 0 ? 'text-pink-strong' : 'text-success'}>
                    $ {Number(l.monto_ganancia).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {l.id_rendicion ? (
                    <Badge variant="success">Rendida</Badge>
                  ) : l.excluida_rendicion ? (
                    <Badge variant="neutral">Excluida</Badge>
                  ) : l.monto_proveedor > 0 ? (
                    <Badge variant="warning">Pendiente</Badge>
                  ) : (
                    <span className="text-muted-2">—</span>
                  )}
                </td>
                {!readonly && (
                  <td className="px-4 py-3 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDevolverOpen(l.id_detalle_venta)}
                    >
                      Devolver
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Cobranza: dónde entró la plata. Separada de "Forma de pago", que es
          cómo se precio la venta. */}
      {venta.pagos.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-display text-lg mb-3">Cobranza</h3>
          <ul className="space-y-2 text-sm">
            {venta.pagos.map((p) => (
              <li
                key={p.id_pago_venta}
                className="flex flex-wrap items-start justify-between gap-2 border-b border-border-2 pb-2 last:border-0"
              >
                <div className="min-w-0">
                  <div className="font-medium">
                    {MEDIO_PAGO_LABEL[p.medio]}
                    {p.cuenta && <span className="text-muted"> · {p.cuenta.nombre}</span>}
                  </div>
                  {p.referencia && (
                    <div className="font-mono text-xs text-muted">Ref. {p.referencia}</div>
                  )}
                  {p.vuelto != null && p.vuelto > 0 && (
                    <div className="text-xs text-muted">
                      Recibido $ {Number(p.monto_recibido).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      {' · '}
                      vuelto $ {Number(p.vuelto).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </div>
                  )}
                </div>
                <span className="font-mono font-semibold whitespace-nowrap">
                  $ {Number(p.monto).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Comprobantes */}
      {venta.comprobantes.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-display text-lg mb-3">Comprobantes</h3>
          <ul className="space-y-2 text-sm">
            {venta.comprobantes.map((c) => (
              <li key={c.id_comprobante} className="flex items-center justify-between border-b border-border-2 pb-2 last:border-0">
                <div>
                  <div className="font-medium">{TIPO_COMPROBANTE_LABEL[c.tipo]} — {c.numero}</div>
                  <div className="text-xs text-muted">
                    Emitido: {new Date(c.fecha_emision).toLocaleString('es-AR')}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {venta.observaciones && (
        <div className="rounded-lg border border-border bg-card-2 p-4 text-sm">
          <div className="text-xs uppercase font-mono text-muted mb-1">Observaciones</div>
          <div>{venta.observaciones}</div>
        </div>
      )}

      {/* Modales */}
      <ConfirmDialog
        open={anularOpen}
        title="Anular venta"
        description="Los ítems vuelven a stock disponible. Si alguna línea ya fue rendida al proveedor, no se puede anular."
        variant="danger"
        confirmLabel="Sí, anular"
        cancelLabel="Cancelar"
        onConfirm={anular}
        onCancel={() => setAnularOpen(false)}
      />
      <ConfirmDialog
        open={!!devolverOpen}
        title="Devolución del cliente"
        description="El ítem pasa a estado 'devuelto por cliente'. La venta no se anula."
        confirmLabel="Sí, devolver"
        cancelLabel="Cancelar"
        onConfirm={devolver}
        onCancel={() => setDevolverOpen(null)}
      />

      <Modal
        open={comprobanteOpen}
        title="Emitir comprobante"
        onClose={() => setComprobanteOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setComprobanteOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button onClick={(e: React.MouseEvent) => emitir(e as unknown as React.FormEvent)} disabled={pending}>
              {pending ? 'Emitiendo…' : 'Emitir'}
            </Button>
          </>
        }
      >
        <form onSubmit={emitir} className="space-y-3">
          <Field htmlFor="c-tipo" label="Tipo" required>
            <select
              id="c-tipo"
              value={tipoComp}
              onChange={(e) => setTipoComp(e.target.value as TipoComprobante)}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-pink"
            >
              {(Object.keys(TIPO_COMPROBANTE_LABEL) as TipoComprobante[]).map((t) => (
                <option key={t} value={t}>{TIPO_COMPROBANTE_LABEL[t]}</option>
              ))}
            </select>
          </Field>
          <Field htmlFor="c-num" label="Número" required>
            <Input
              id="c-num"
              value={numeroComp}
              onChange={(e) => setNumeroComp(e.target.value)}
              autoFocus
            />
          </Field>
        </form>
      </Modal>
    </div>
  )
}
