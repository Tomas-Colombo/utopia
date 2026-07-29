'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { marcarRendicionPagadaAction } from '../actions'

export function RendicionActions({ idRendicion }: { idRendicion: string }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = useTransition()
  const [open, setOpen] = useState(false)
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10))

  function marcar() {
    start(async () => {
      const res = await marcarRendicionPagadaAction({
        idRendicion,
        fechaPago: fecha ? new Date(fecha).toISOString() : null,
      })
      if (!res.ok) return toast.error('No se pudo marcar como pagada', res.reason)
      toast.success('Rendición marcada como pagada')
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} disabled={pending}>
        Marcar pagada
      </Button>
      <Modal
        open={open}
        title="Marcar rendición como pagada"
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button onClick={marcar} disabled={pending}>
              {pending ? 'Guardando…' : 'Confirmar'}
            </Button>
          </>
        }
      >
        <Field htmlFor="rp-fecha" label="Fecha de pago" required>
          <Input
            id="rp-fecha"
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />
        </Field>
      </Modal>
    </>
  )
}
