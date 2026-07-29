'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { cancelarReservaAction } from '../../actions'

export function ReservaDetalleActions({ idReserva }: { idReserva: string }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = useTransition()
  const [confirm, setConfirm] = useState(false)

  function cancelar() {
    setConfirm(false)
    start(async () => {
      const res = await cancelarReservaAction({ idReserva })
      if (!res.ok) return toast.error('No se pudo cancelar', res.reason)
      toast.success('Reserva cancelada')
      router.refresh()
    })
  }

  return (
    <>
      <Button
        size="sm"
        variant="danger"
        onClick={() => setConfirm(true)}
        disabled={pending}
      >
        Cancelar reserva
      </Button>
      <ConfirmDialog
        open={confirm}
        title="Cancelar reserva"
        description="Los ítems quedan liberados y pueden reservarse o venderse de nuevo."
        variant="danger"
        confirmLabel="Sí, cancelar"
        cancelLabel="Volver"
        onConfirm={cancelar}
        onCancel={() => setConfirm(false)}
      />
    </>
  )
}
