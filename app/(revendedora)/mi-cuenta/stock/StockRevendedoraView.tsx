'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { RvpMiStockRow } from '@/lib/types/revendedoras'
import { formatearMoneda } from '@/lib/utils/moneda'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { mensajeDeError } from '@/lib/errores/mensajes'
import { declararVentaAction } from '../actions'

interface Props {
  items: RvpMiStockRow[]
}

export function StockRevendedoraView({ items }: Props) {
  const router = useRouter()
  const toast = useToast()
  const [selectedItem, setSelectedItem] = useState<RvpMiStockRow | null>(null)
  const [nota, setNota] = useState('')
  const [isPending, startTransition] = useTransition()

  const handleOpenModal = (item: RvpMiStockRow) => {
    setSelectedItem(item)
    setNota('')
  }

  const handleCloseModal = () => {
    if (isPending) return
    setSelectedItem(null)
    setNota('')
  }

  const handleConfirmarDeclaracion = () => {
    if (!selectedItem) return
    startTransition(async () => {
      const res = await declararVentaAction({
        id_item: selectedItem.id_item,
        nota,
      })

      if (res.ok) {
        toast.success('Declaración registrada', 'El local la confirmará a la brevedad.')
        handleCloseModal()
        router.refresh()
      } else {
        toast.error('Error al declarar venta', mensajeDeError(res.reason))
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold font-display tracking-tight">Mercadería en tu poder</h1>
          <p className="text-sm text-muted">
            Prendas consignadas que tenés disponibles para vender.
          </p>
        </div>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-accent/10 text-accent">
          {items.length} {items.length === 1 ? 'prenda' : 'prendas'}
        </span>
      </div>

      {items.length === 0 ? (
        <div className="p-8 text-center rounded-xl border border-dashed border-border bg-card">
          <p className="text-muted text-sm">No tenés prendas en tu poder en este momento.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map((item) => (
            <div
              key={item.id_item}
              className="p-4 rounded-xl border border-border bg-card shadow-sm flex flex-col justify-between space-y-3"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-semibold text-base leading-snug">{item.nombre_producto}</h2>
                  <span className="text-base font-bold text-accent whitespace-nowrap">
                    {formatearMoneda(item.precio_venta)}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-muted">
                  <span className="px-2 py-0.5 rounded bg-muted/10 font-mono">{item.sku}</span>
                  {item.talle && (
                    <span className="px-2 py-0.5 rounded bg-muted/10">Talle: {item.talle}</span>
                  )}
                  <span>Entregado: {new Date(item.fecha_entrega).toLocaleDateString('es-AR')}</span>
                </div>
              </div>

              <div className="pt-2 border-t border-border/50 flex items-center justify-between">
                {item.declaracion_pendiente ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                    Pendiente de confirmar
                  </span>
                ) : (
                  <Button
                    variant="primary"
                    size="sm"
                    className="min-h-[44px] px-4 w-full sm:w-auto"
                    onClick={() => handleOpenModal(item)}
                  >
                    Declarar venta
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal para declarar venta */}
      {selectedItem && (
        <Modal
          open={true}
          onClose={handleCloseModal}
          title="Declarar venta de prenda"
        >
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-card-hover border border-border space-y-1">
              <p className="text-sm font-semibold">{selectedItem.nombre_producto}</p>
              <div className="flex gap-2 text-xs text-muted font-mono">
                <span>{selectedItem.sku}</span>
                {selectedItem.talle && <span>· Talle {selectedItem.talle}</span>}
              </div>
              <p className="text-sm font-bold text-accent pt-1">
                Precio de venta: {formatearMoneda(selectedItem.precio_venta)}
              </p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="nota-declaracion" className="block text-xs font-semibold text-muted uppercase tracking-wider">
                Nota u observación (opcional)
              </label>
              <input
                id="nota-declaracion"
                type="text"
                maxLength={500}
                placeholder="Ej: Vendido a clienta frecuente, pago acordado"
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 text-sm rounded-lg border border-border bg-bg text-text focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>

            <p className="text-xs text-muted">
              Al declarar la venta, el artículo permanecerá marcado como pendiente hasta que el local confirme la operación. Podrás retirarla en cualquier momento antes de la confirmación.
            </p>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
              <Button
                variant="secondary"
                className="min-h-[44px] px-4"
                onClick={handleCloseModal}
                disabled={isPending}
              >
                Cancelar
              </Button>
              <Button
                variant="primary"
                className="min-h-[44px] px-4"
                onClick={handleConfirmarDeclaracion}
                disabled={isPending}
              >
                {isPending ? 'Declarando...' : 'Confirmar declaración'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
