'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { StockTalleLoader, type LineaTalle } from '@/components/inventario/StockTalleLoader'
import { asignarTallesProductoAction } from '../actions'

/**
 * Reasigna retroactivamente talles a ítems que se cargaron sin talle y
 * siguen disponibles (los vendidos/reservados quedan intactos). El
 * `StockTalleLoader` ya enforce el tope con `max=disponiblesSinTalle`, y
 * el RPC del server re-valida por si algún ítem se movió mientras tanto.
 */
export function AsignarTallesModal({
  open,
  idProducto,
  disponiblesSinTalle,
  tallesCategoria,
  onClose,
}: {
  open: boolean
  idProducto: string
  disponiblesSinTalle: number
  tallesCategoria: string[]
  onClose: () => void
}) {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = useTransition()
  const [lineas, setLineas] = useState<LineaTalle[]>([])

  // Empty the draft every time the modal opens, so a cancelled distribution
  // never reappears on the next open. Adjusted during render instead of in an
  // effect: the reset lands before the first paint of the open modal, rather
  // than showing the stale rows for one frame.
  const [wasOpen, setWasOpen] = useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) setLineas([])
  }

  const total = lineas.reduce((a, l) => a + l.cantidad, 0)
  const restante = Math.max(0, disponiblesSinTalle - total)
  // Solo talles reales de la categoría: no queremos re-crear "sin talle".
  const puedeGuardar = lineas.length > 0 && total > 0 && total <= disponiblesSinTalle

  function guardar() {
    // Filtro defensivo: nunca mandamos lineas con talle=null al server (la UI
    // ya evita agregarlas, pero StockTalleLoader es genérico y las permite).
    const distribucion = lineas
      .filter((l): l is { talle: string; cantidad: number } => l.talle !== null)
      .map((l) => ({ talle: l.talle, cantidad: l.cantidad }))
    if (distribucion.length === 0) {
      toast.error('Elegí al menos un talle')
      return
    }
    start(async () => {
      const res = await asignarTallesProductoAction({ idProducto, distribucion })
      if (!res.ok) return toast.error('No se pudieron asignar los talles', res.reason)
      toast.success('Talles asignados', `${res.data?.actualizados ?? 0} unidad(es) actualizada(s)`)
      onClose()
      router.refresh()
    })
  }

  return (
    <Modal
      open={open}
      onClose={() => (pending ? null : onClose())}
      title="Asignar talles a stock sin talle"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={pending || !puedeGuardar}>
            {pending ? 'Guardando…' : 'Asignar talles'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Hay <b className="text-text">{disponiblesSinTalle}</b> unidad(es) disponible(s)
          sin talle. Los ítems vendidos, reservados o dados de baja no se tocan.
          {restante > 0 && (
            <> Podés dejar algunas sin asignar: quedarían como «sin talle».</>
          )}
        </p>

        <StockTalleLoader
          talles={tallesCategoria}
          value={lineas}
          onChange={setLineas}
          max={disponiblesSinTalle}
          disabled={pending}
        />
      </div>
    </Modal>
  )
}
