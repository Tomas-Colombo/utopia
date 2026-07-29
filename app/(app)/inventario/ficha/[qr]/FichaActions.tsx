'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import type { EstadoItem } from '@/lib/types/inventario'
import { transicionItemAction } from '../../actions'

/**
 * Acciones disponibles según estado actual del ítem. Sincronizado con
 * la máquina de estados en DB (`is_transicion_item_valida` en 00016).
 *
 * Etapa 3 sólo expone las transiciones no-transaccionales (baja, ajuste
 * de devolución al proveedor sin venta). Vender/reservar corresponden a
 * Etapa 5.
 */
type Accion = {
  label: string
  destino: EstadoItem
  tipoMovimiento: string
  variant?: 'default' | 'danger'
  confirm?: string
}

const ACCIONES_POR_ESTADO: Record<EstadoItem, Accion[]> = {
  disponible: [
    {
      label: 'Devolver al proveedor',
      destino: 'devuelto',
      tipoMovimiento: 'devolucion',
      confirm: 'Este ítem sale del inventario y no se puede vender.',
    },
    {
      label: 'Dar de baja',
      destino: 'baja',
      tipoMovimiento: 'baja',
      variant: 'danger',
      confirm: 'La baja es permanente. Se usa para pérdida, daño o robo.',
    },
  ],
  reservado: [
    {
      label: 'Liberar reserva',
      destino: 'disponible',
      tipoMovimiento: 'liberacion',
    },
    {
      label: 'Dar de baja',
      destino: 'baja',
      tipoMovimiento: 'baja',
      variant: 'danger',
      confirm: 'La baja es permanente.',
    },
  ],
  vendido: [
    // Ventas + devoluciones al cliente son flujo Etapa 5 en pantalla de venta.
    // Aquí solo mantenemos "baja" como escape.
    {
      label: 'Dar de baja',
      destino: 'baja',
      tipoMovimiento: 'baja',
      variant: 'danger',
      confirm: 'La baja es permanente.',
    },
  ],
  devuelto_cliente: [
    {
      label: 'Reponer a disponible',
      destino: 'disponible',
      tipoMovimiento: 'ajuste',
    },
    {
      label: 'Dar de baja',
      destino: 'baja',
      tipoMovimiento: 'baja',
      variant: 'danger',
    },
  ],
  devuelto: [], // terminal
  baja: [], // terminal
}

export function FichaActions({
  idItem,
  estadoActual,
}: {
  idItem: string
  estadoActual: EstadoItem
}) {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = useTransition()
  const [confirm, setConfirm] = useState<Accion | null>(null)

  const acciones = ACCIONES_POR_ESTADO[estadoActual]

  function ejecutar(accion: Accion) {
    setConfirm(null)
    start(async () => {
      const res = await transicionItemAction({
        idItem,
        estadoHasta: accion.destino,
        tipoMovimiento: accion.tipoMovimiento,
      })
      if (!res.ok) return toast.error('No se pudo transicionar', res.reason)
      toast.success('Estado actualizado')
      router.refresh()
    })
  }

  if (acciones.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card-2 p-4 text-sm text-muted">
        Estado terminal. No hay acciones disponibles.
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="font-display text-lg mb-3">Acciones</h3>
      <div className="flex flex-wrap gap-2">
        {acciones.map((a) => (
          <Button
            key={a.destino + a.tipoMovimiento}
            variant={a.variant === 'danger' ? 'danger' : 'secondary'}
            disabled={pending}
            onClick={() => (a.confirm ? setConfirm(a) : ejecutar(a))}
          >
            {a.label}
          </Button>
        ))}
      </div>

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.label ?? ''}
        description={confirm?.confirm}
        variant={confirm?.variant === 'danger' ? 'danger' : 'default'}
        confirmLabel="Sí, continuar"
        cancelLabel="Cancelar"
        onConfirm={() => confirm && ejecutar(confirm)}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}
