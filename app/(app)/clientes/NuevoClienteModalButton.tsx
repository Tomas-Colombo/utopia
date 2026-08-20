'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { NuevoClienteForm } from './nuevo/NuevoClienteForm'

/**
 * Alta de cliente sin salir del listado: el formulario se abre en un modal y,
 * al crear, refresca la tabla que está detrás. La ruta `/clientes/nuevo` sigue
 * existiendo para enlaces directos — mismo criterio que
 * `NuevaReglaModalButton`.
 */
export function NuevoClienteModalButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Nuevo cliente
      </Button>

      <Modal open={open} title="Nuevo cliente" onClose={() => setOpen(false)}>
        <NuevoClienteForm
          onSuccess={() => {
            setOpen(false)
            router.refresh()
          }}
        />
      </Modal>
    </>
  )
}
