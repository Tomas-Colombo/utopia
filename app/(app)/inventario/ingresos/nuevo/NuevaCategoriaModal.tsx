'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { TallesEditor } from '@/components/inventario/TallesEditor'
import type { CategoriaRow } from '@/lib/types/inventario'
import { createCategoriaAction } from '../../actions'

/**
 * Alta rápida de categoría desde la carga de un ingreso, sin abandonar la
 * pantalla. Solo nombre + talles (lo mínimo para clasificar y cargar stock);
 * el resto se completa después en /inventario/categorias. Al crear, devuelve
 * la fila para preseleccionarla en la línea que disparó el alta.
 */
export function NuevaCategoriaModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (categoria: CategoriaRow) => void
}) {
  const toast = useToast()
  const [pending, start] = useTransition()

  const [nombre, setNombre] = useState('')
  const [talles, setTalles] = useState<string[]>([])
  const [errNombre, setErrNombre] = useState<string | null>(null)

  function reset() {
    setNombre('')
    setTalles([])
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
      const res = await createCategoriaAction({ nombre, talles })
      if (!res.ok) return toast.error('No se pudo crear', res.reason)
      if (!res.data) return toast.error('No se pudo crear')
      toast.success('Categoría creada')
      const now = new Date().toISOString()
      onCreated({
        id_categoria: res.data.id,
        id_tenant: '',
        nombre: nombre.trim(),
        descripcion: null,
        activa: true,
        talles,
        created_at: now,
        updated_at: now,
      })
      reset()
    })
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Nueva categoría"
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" form="nueva-categoria-modal-form" disabled={pending}>
            {pending ? 'Guardando…' : 'Crear categoría'}
          </Button>
        </>
      }
    >
      <form id="nueva-categoria-modal-form" onSubmit={submit} className="space-y-3">
        <Field htmlFor="cm-nombre" label="Nombre" required error={errNombre ?? undefined}>
          <Input
            id="cm-nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            autoFocus
            invalid={!!errNombre}
          />
        </Field>
        <Field
          htmlFor="cm-talles"
          label="Talles"
          hint="Talles/medidas de esta categoría (ej: S, M, L). Se usan al cargar el stock."
        >
          <TallesEditor value={talles} onChange={setTalles} disabled={pending} />
        </Field>
      </form>
    </Modal>
  )
}
