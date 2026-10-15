'use client'

import { useState, useTransition } from 'react'
import type { DeclaracionVentaLocalRow } from '@/lib/types/revendedoras'
import { formatearMoneda } from '@/lib/utils/moneda'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { mensajeDeError } from '@/lib/errores/mensajes'
import { confirmarDeclaracionAction, rechazarDeclaracionAction } from './actions'

interface Props {
  declaraciones: DeclaracionVentaLocalRow[]
  puedeGestionar: boolean
}

export function DeclaracionesTableView({ declaraciones, puedeGestionar }: Props) {
  const toast = useToast()
  const [isPending, startTransition] = useTransition()

  // Modal confirmar
  const [declaracionConfirmar, setDeclaracionConfirmar] = useState<DeclaracionVentaLocalRow | null>(null)

  // Modal rechazar
  const [declaracionRechazar, setDeclaracionRechazar] = useState<DeclaracionVentaLocalRow | null>(null)
  const [motivoRechazo, setMotivoRechazo] = useState('')

  const handleConfirmar = () => {
    if (!declaracionConfirmar) return
    startTransition(async () => {
      const res = await confirmarDeclaracionAction({
        id_declaracion: declaracionConfirmar.id_declaracion,
      })

      if (res.ok) {
        toast.success('Declaración confirmada', 'Se generó la venta por canal revendedora.')
        setDeclaracionConfirmar(null)
      } else {
        toast.error('Error al confirmar', mensajeDeError(res.reason))
      }
    })
  }

  const handleRechazar = () => {
    if (!declaracionRechazar) return
    if (!motivoRechazo.trim()) {
      toast.error('Campo requerido', 'Escribí el motivo del rechazo.')
      return
    }

    startTransition(async () => {
      const res = await rechazarDeclaracionAction({
        id_declaracion: declaracionRechazar.id_declaracion,
        motivo: motivoRechazo.trim(),
      })

      if (res.ok) {
        toast.success('Declaración rechazada', 'La revendedora podrá ver el motivo en su portal.')
        setDeclaracionRechazar(null)
        setMotivoRechazo('')
      } else {
        toast.error('Error al rechazar', mensajeDeError(res.reason))
      }
    })
  }

  return (
    <div className="space-y-4">
      {declaraciones.length === 0 ? (
        <div className="p-10 text-center rounded-xl border border-dashed border-border bg-card">
          <p className="text-muted text-sm">No se encontraron declaraciones para los filtros seleccionados.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-card-hover border-b border-border text-xs text-muted font-semibold uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Revendedora</th>
                <th className="px-4 py-3">Producto / SKU</th>
                <th className="px-4 py-3">Precio</th>
                <th className="px-4 py-3">Nota</th>
                <th className="px-4 py-3">Estado</th>
                {puedeGestionar && <th className="px-4 py-3 text-right">Acciones</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {declaraciones.map((d) => (
                <tr key={d.id_declaracion} className="hover:bg-card-hover/50 transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-muted">
                    {new Date(d.fecha).toLocaleDateString('es-AR')}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap font-medium">
                    {d.revendedora_nombre} {d.revendedora_apellido}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-text">{d.nombre_producto}</div>
                    <div className="text-xs text-muted font-mono">
                      {d.sku}
                      {d.talle && ` · Talle ${d.talle}`}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap font-semibold text-accent">
                    {formatearMoneda(d.precio_venta)}
                  </td>
                  <td className="px-4 py-3 max-w-xs truncate text-xs text-muted">
                    {d.nota || '—'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {d.estado === 'pendiente' && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                        Pendiente
                      </span>
                    )}
                    {d.estado === 'confirmada' && (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        Confirmada
                      </span>
                    )}
                    {d.estado === 'rechazada' && (
                      <div>
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-destructive/10 text-destructive">
                          Rechazada
                        </span>
                        {d.motivo_rechazo && (
                          <div className="text-[11px] text-destructive mt-0.5 max-w-xs truncate" title={d.motivo_rechazo}>
                            {d.motivo_rechazo}
                          </div>
                        )}
                      </div>
                    )}
                    {d.estado === 'retirada' && (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-muted/10 text-muted">
                        Retirada
                      </span>
                    )}
                  </td>
                  {puedeGestionar && (
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      {d.estado === 'pendiente' ? (
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="primary"
                            size="sm"
                            className="min-h-[44px] px-3 text-xs"
                            onClick={() => setDeclaracionConfirmar(d)}
                            disabled={isPending}
                          >
                            Confirmar
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            className="min-h-[44px] px-3 text-xs text-destructive border-border hover:bg-destructive/10"
                            onClick={() => {
                              setDeclaracionRechazar(d)
                              setMotivoRechazo('')
                            }}
                            disabled={isPending}
                          >
                            Rechazar
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Confirmar Declaración */}
      {declaracionConfirmar && (
        <Modal
          open={true}
          onClose={() => {
            if (!isPending) setDeclaracionConfirmar(null)
          }}
          title="Confirmar declaración de venta"
        >
          <div className="space-y-4">
            <p className="text-sm text-muted">
              Vas a confirmar la venta autodeclarada por{' '}
              <strong className="text-text">
                {declaracionConfirmar.revendedora_nombre} {declaracionConfirmar.revendedora_apellido}
              </strong>{' '}
              para el artículo <strong className="text-text">{declaracionConfirmar.nombre_producto}</strong>.
            </p>
            <div className="p-3 rounded-lg bg-card-hover border border-border text-xs space-y-1">
              <div>
                <span className="text-muted">SKU:</span> <span className="font-mono font-semibold">{declaracionConfirmar.sku}</span>
              </div>
              <div>
                <span className="text-muted">Precio de lista:</span>{' '}
                <span className="font-semibold text-accent">{formatearMoneda(declaracionConfirmar.precio_venta)}</span>
              </div>
              {declaracionConfirmar.nota && (
                <div>
                  <span className="text-muted">Nota de la revendedora:</span>{' '}
                  <span className="italic">{declaracionConfirmar.nota}</span>
                </div>
              )}
            </div>
            <p className="text-xs text-muted">
              Esta operación registrará la venta en el canal &ldquo;revendedora&rdquo;, marcará la prenda como vendida y aplicará la comisión correspondiente a su cuenta corriente.
            </p>
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
              <Button
                variant="secondary"
                className="min-h-[44px] px-4"
                onClick={() => setDeclaracionConfirmar(null)}
                disabled={isPending}
              >
                Cancelar
              </Button>
              <Button
                variant="primary"
                className="min-h-[44px] px-4"
                onClick={handleConfirmar}
                disabled={isPending}
              >
                {isPending ? 'Confirmando...' : 'Confirmar venta'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal Rechazar Declaración */}
      {declaracionRechazar && (
        <Modal
          open={true}
          onClose={() => {
            if (!isPending) setDeclaracionRechazar(null)
          }}
          title="Rechazar declaración de venta"
        >
          <div className="space-y-4">
            <p className="text-sm text-muted">
              Vas a rechazar la declaración de{' '}
              <strong className="text-text">
                {declaracionRechazar.revendedora_nombre} {declaracionRechazar.revendedora_apellido}
              </strong>{' '}
              para la prenda <strong className="text-text">{declaracionRechazar.nombre_producto}</strong>. La prenda continuará figurando en su poder.
            </p>

            <div className="space-y-1.5">
              <label htmlFor="motivo-rechazo" className="block text-xs font-semibold text-muted uppercase tracking-wider">
                Motivo del rechazo (obligatorio)
              </label>
              <textarea
                id="motivo-rechazo"
                rows={3}
                placeholder="Explicá el motivo para que la revendedora pueda verlo en su portal..."
                value={motivoRechazo}
                onChange={(e) => setMotivoRechazo(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 text-sm rounded-lg border border-border bg-bg text-text focus:outline-none focus:ring-2 focus:ring-accent resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
              <Button
                variant="secondary"
                className="min-h-[44px] px-4"
                onClick={() => setDeclaracionRechazar(null)}
                disabled={isPending}
              >
                Cancelar
              </Button>
              <Button
                variant="danger"
                className="min-h-[44px] px-4"
                onClick={handleRechazar}
                disabled={isPending}
              >
                {isPending ? 'Rechazando...' : 'Rechazar declaración'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
