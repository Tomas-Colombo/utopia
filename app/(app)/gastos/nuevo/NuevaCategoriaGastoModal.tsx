'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { createCategoriaGastoAction } from '../../rendiciones/actions'

/**
 * Alta rápida de categoría de gasto desde el formulario "Nuevo gasto".
 * Devuelve la fila creada por `onCreated` para preseleccionarla en el select.
 */
export function NuevaCategoriaGastoModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (cat: { id: string; nombre: string }) => void
}) {
  const toast = useToast()
  const [pending, start] = useTransition()

  const [nombre, setNombre] = useState('')
  const [errNombre, setErrNombre] = useState<string | null>(null)

  function reset() {
    setNombre('')
    setErrNombre(null)
  }

  function close() {
    reset()
    onClose()
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (nombre.trim().length < 2) {
      setErrNombre('Mínimo 2 caracteres')
      return
    }
    setErrNombre(null)
    start(async () => {
      const res = await createCategoriaGastoAction({ nombre })
      if (!res.ok) return toast.error('No se pudo crear', res.reason)
      if (!res.data) return toast.error('No se pudo crear')
      toast.success('Categoría creada')
      onCreated({ id: res.data.id, nombre: nombre.trim() })
      reset()
    })
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Nueva categoría de gasto"
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" form="nueva-categoria-gasto-form" disabled={pending}>
            {pending ? 'Guardando…' : 'Crear categoría'}
          </Button>
        </>
      }
    >
      <form id="nueva-categoria-gasto-form" onSubmit={submit} className="space-y-3">
        <Field htmlFor="cg-nombre" label="Nombre" required error={errNombre ?? undefined}>
          <Input
            id="cg-nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            autoFocus
            invalid={!!errNombre}
            placeholder="Ej: Alquiler, Servicios, Impuestos"
          />
        </Field>
      </form>
    </Modal>
  )
}
