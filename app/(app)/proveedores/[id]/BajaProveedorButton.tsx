'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { setProveedorActivoAction } from '../actions'

/**
 * Toggle de baja/reactivación. Con confirm inline porque dar de baja tiene
 * efectos visibles en toda la app (deja de aparecer en selectores). El texto
 * del confirm es distinto según el sentido.
 */
export function BajaProveedorButton({
  id,
  activo,
  tieneDeudaPendiente,
}: {
  id: string
  activo: boolean
  tieneDeudaPendiente: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = useTransition()
  const [confirming, setConfirming] = useState(false)

  function apply() {
    start(async () => {
      const res = await setProveedorActivoAction({ id, activo: !activo })
      if (!res.ok) {
        toast.error('No se pudo actualizar', res.reason)
        return
      }
      toast.success(activo ? 'Proveedor dado de baja' : 'Proveedor reactivado')
      setConfirming(false)
      router.refresh()
    })
  }

  if (!confirming) {
    return (
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setConfirming(true)}
        disabled={pending}
      >
        {activo ? 'Dar de baja' : 'Reactivar'}
      </Button>
    )
  }

  return (
    <div className="flex flex-col items-end gap-2 rounded-md border border-border bg-card-2 p-3">
      <p className="text-sm text-text">
        {activo
          ? '¿Dar de baja? No aparecerá en nuevos movimientos.'
          : '¿Reactivar? Vuelve a aparecer en los selectores.'}
      </p>
      {activo && tieneDeudaPendiente && (
        <p className="text-xs text-terracota">
          Tiene deuda pendiente — los movimientos históricos quedan igual.
        </p>
      )}
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setConfirming(false)}
          disabled={pending}
        >
          Cancelar
        </Button>
        <Button size="sm" onClick={apply} disabled={pending}>
          {pending ? 'Guardando…' : activo ? 'Confirmar baja' : 'Confirmar reactivar'}
        </Button>
      </div>
    </div>
  )
}
