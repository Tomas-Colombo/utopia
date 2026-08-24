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
import { formaPagoLabel } from '@/lib/types/precios'
import {
  CONCEPTO_RETENCION_LABEL,
  desgloseCosto,
  ESTADO_CUOTA_LABEL,
  MEDIO_PAGO_LABEL,
  nombreCliente,
  TIPO_COMPROBANTE_LABEL,
  type CuotaFinanciadaRow,
  type EstadoCuota,
  type PagoVentaRow,
  type TipoComprobante,
  type VentaConDetalle,
} from '@/lib/types/ventas'
import { saldoCuota } from '@/lib/cuotas/generar-plan'
import {
  anularVentaAction,
  devolverItemVentaAction,
  emitirComprobanteAction,
} from '../actions'

const CUOTA_VARIANT: Record<EstadoCuota, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  pendiente: 'info',
  parcial: 'warning',
  pagada: 'success',
  incobrable: 'danger',
  anulada: 'neutral',
}

export function VentaDetalleView({
  venta,
  cuotas,
}: {
  venta: VentaConDetalle
  cuotas: CuotaFinanciadaRow[]
}) {
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

  // Neto de la cobranza. Sólo se muestra si hubo algo que descontar: si el
  // neto es igual al total, repetirlo abajo no informa nada.
  const costoTotal = venta.pagos.reduce((a, p) => a + Number(p.costo_cobro), 0)
  const netoTotal =
    costoTotal > 0
      ? venta.pagos.reduce((a, p) => a + Number(p.neto_acreditado ?? p.monto), 0)
      : null
  // La fecha en la que termina de acreditar todo: la más lejana de los pagos.
  const fechaAcreditacion = (() => {
    const fechas = venta.pagos.map((p) => p.fecha_acreditacion).filter((f): f is string => !!f)
    if (fechas.length === 0) return null
    const max = fechas.reduce((a, f) => (f > a ? f : a))
    // Acreditación el mismo día = ya está en la cuenta, no hay nada que avisar.
    return max <= venta.fecha.slice(0, 10)
      ? null
      : `acredita el ${new Date(`${max}T00:00:00`).toLocaleDateString('es-AR')}`
  })()

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
          <div className="mt-1">{nombreCliente(venta.cliente)}</div>
          {venta.cliente?.telefono && (
            <div className="text-xs text-muted">{venta.cliente.telefono}</div>
          )}
        </div>
        <div>
          <div className="text-xs uppercase font-mono text-muted">Forma de pago</div>
          <div className="mt-1">{formaPagoLabel(venta.forma_pago)}</div>
        </div>
        <div>
          <div className="text-xs uppercase font-mono text-muted">Total</div>
          <div className="mt-1 font-mono font-semibold">
            $ {total.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
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
        <div className="rounded-md border border-alerta-ink bg-alerta-bg px-3 py-2 text-sm text-alerta-ink">
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
                </td>
                <td className="px-4 py-3 font-mono text-xs">{l.item?.qr_code ?? '—'}</td>
                <td className="px-4 py-3 text-right font-mono">
                  $ {Number(l.precio_venta).toLocaleString('es-AR', { maximumFractionDigits: 0 })}
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
                    {p.cuotas != null && p.cuotas > 1 && (
                      <span className="text-muted"> · {p.cuotas} cuotas</span>
                    )}
                    {p.cuenta && <span className="text-muted"> · {p.cuenta.nombre}</span>}
                  </div>
                  {p.referencia && (
                    <div className="font-mono text-xs text-muted">Ref. {p.referencia}</div>
                  )}
                  {p.vuelto != null && p.vuelto > 0 && (
                    <div className="text-xs text-muted">
                      Recibido $ {Number(p.monto_recibido).toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                      {' · '}
                      vuelto $ {Number(p.vuelto).toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                    </div>
                  )}
                  <DesgloseCobro pago={p} />
                </div>
                <div className="text-right whitespace-nowrap">
                  <div className="font-mono font-semibold">
                    $ {Number(p.monto).toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                  </div>
                  {Number(p.costo_cobro) > 0 && (
                    <div className="font-mono text-xs text-muted">
                      neto $ {Number(p.neto_acreditado).toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {netoTotal !== null && (
            <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-sm">
              <span className="text-muted">
                Neto acreditado
                {fechaAcreditacion && ` · ${fechaAcreditacion}`}
              </span>
              <span className="font-mono font-semibold">
                $ {netoTotal.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Plan de cuotas financiado por la casa. */}
      {cuotas.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-3 font-display text-lg">Cuotas financiadas</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-2 py-2">Cuota</th>
                  <th className="px-2 py-2">Vence</th>
                  <th className="px-2 py-2 text-right">Monto</th>
                  <th className="px-2 py-2 text-right">Pagado</th>
                  <th className="px-2 py-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {cuotas.map((c) => (
                  <tr key={c.id_cuota_financiada} className="border-b border-border-2 last:border-0">
                    <td className="px-2 py-2 font-mono text-xs">#{c.numero}</td>
                    <td className="px-2 py-2">
                      {new Date(`${c.fecha_vencimiento}T00:00:00`).toLocaleDateString('es-AR')}
                    </td>
                    <td className="px-2 py-2 text-right font-mono">{money(Number(c.monto))}</td>
                    <td className="px-2 py-2 text-right font-mono text-muted">
                      {Number(c.monto_pagado) > 0 ? money(Number(c.monto_pagado)) : '—'}
                    </td>
                    <td className="px-2 py-2">
                      <Badge variant={CUOTA_VARIANT[c.estado]}>
                        {ESTADO_CUOTA_LABEL[c.estado]}
                      </Badge>
                      {c.estado === 'incobrable' && c.motivo_incobrable && (
                        <div className="mt-1 text-xs text-muted">{c.motivo_incobrable}</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-card-2">
                  <td colSpan={2} className="px-2 py-2 font-semibold">
                    Pendiente de cobro
                  </td>
                  <td colSpan={3} className="px-2 py-2 text-right font-mono font-semibold">
                    {money(
                      cuotas
                        .filter((c) => c.estado === 'pendiente' || c.estado === 'parcial')
                        .reduce((a, c) => a + saldoCuota(c), 0),
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
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
              className="w-full"
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

/**
 * Desglose de lo que se llevó el procesador de un cobro. Lee el SNAPSHOT
 * guardado en el pago (00057), no recalcula: el tarifario de hoy no es el que
 * se aplicó cuando se vendió.
 */
function DesgloseCobro({ pago }: { pago: Pick<PagoVentaRow, 'desglose_costo'> }) {
  const d = desgloseCosto(pago.desglose_costo)
  if (!d || d.sin_tarifario || d.costo_total <= 0) return null
  return (
    <ul className="mt-1 space-y-0.5 text-xs text-muted">
      <li>
        Arancel {d.arancel_pct}% · −{money(d.arancel_monto)}
      </li>
      {d.iva_arancel_monto > 0 && (
        <li>
          IVA s/arancel {d.iva_arancel_pct}% · −{money(d.iva_arancel_monto)}
        </li>
      )}
      {d.retenciones.map((r) => (
        <li key={r.concepto}>
          {CONCEPTO_RETENCION_LABEL[r.concepto]} {r.pct}% · −{money(r.monto)}
        </li>
      ))}
    </ul>
  )
}

function money(n: number): string {
  return `$ ${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
}
