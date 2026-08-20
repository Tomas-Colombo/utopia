'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import type { ClienteRow } from '@/lib/types/ventas'
import { updateClienteAction } from '../ventas/actions'

/**
 * Edición de cliente en modal. Se usa desde el listado y desde la ficha: es
 * el mismo formulario, y una ruta `/clientes/[id]/editar` sólo agregaría una
 * pantalla para cambiar un teléfono.
 *
 * `apellido` es obligatorio desde 00058. Los clientes anteriores lo tienen en
 * `null` — este formulario es justamente por donde se van corrigiendo, así
 * que la validación aplica también al editar.
 */
export function EditarClienteModal({
  cliente,
  open,
  onClose,
}: {
  cliente: ClienteRow | null
  open: boolean
  onClose: () => void
}) {
  return (
    <Modal open={open} title="Editar cliente" onClose={onClose}>
      {/* `key` por cliente: al abrir el modal sobre otra fila el formulario se
          REMONTA con sus valores iniciales. Sincronizarlo con un efecto
          funcionaba, pero encadenaba un render extra por apertura — y el
          estado inicial derivado de props es justo lo que `key` resuelve. */}
      {cliente && (
        <FormularioEditar key={cliente.id_cliente} cliente={cliente} onClose={onClose} />
      )}
    </Modal>
  )
}

function FormularioEditar({
  cliente,
  onClose,
}: {
  cliente: ClienteRow
  onClose: () => void
}) {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = useTransition()

  const [nombre, setNombre] = useState(cliente.nombre)
  const [apellido, setApellido] = useState(cliente.apellido ?? '')
  const [telefono, setTelefono] = useState(cliente.telefono ?? '')
  const [email, setEmail] = useState(cliente.email ?? '')
  const [notas, setNotas] = useState(cliente.notas ?? '')
  const [errNombre, setErrNombre] = useState<string | null>(null)
  const [errApellido, setErrApellido] = useState<string | null>(null)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const n = nombre.trim().length >= 2 ? null : 'Nombre muy corto'
    const a = apellido.trim().length >= 2 ? null : 'Apellido muy corto'
    setErrNombre(n)
    setErrApellido(a)
    if (n || a) return

    start(async () => {
      const res = await updateClienteAction({
        id: cliente.id_cliente,
        patch: {
          nombre: nombre.trim(),
          apellido: apellido.trim(),
          telefono: telefono.trim() || null,
          email: email.trim() || null,
          notas: notas.trim() || null,
        },
      })
      if (!res.ok) return toast.error('No se pudo guardar', explicar(res.reason))
      toast.success('Cliente actualizado')
      onClose()
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {!cliente.apellido && (
        <p className="rounded-md border border-border bg-card-2 px-3 py-2 text-xs text-muted">
          Este cliente se cargó con el nombre completo en un solo campo.
          Separalo para que aparezca en el orden alfabético.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field htmlFor="ec-apellido" label="Apellido" required error={errApellido ?? undefined}>
          <Input
            id="ec-apellido"
            value={apellido}
            onChange={(e) => setApellido(e.target.value)}
            autoFocus
            invalid={!!errApellido}
          />
        </Field>
        <Field htmlFor="ec-nombre" label="Nombre" required error={errNombre ?? undefined}>
          <Input
            id="ec-nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            invalid={!!errNombre}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field htmlFor="ec-tel" label="Teléfono" hint="Se usa para link WhatsApp">
          <Input
            id="ec-tel"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            placeholder="+54 9 11 ..."
          />
        </Field>
        <Field htmlFor="ec-email" label="Email">
          <Input
            id="ec-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
      </div>

      <Field htmlFor="ec-notas" label="Notas">
        <Textarea
          id="ec-notas"
          rows={3}
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
        />
      </Field>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? 'Guardando…' : 'Guardar cambios'}
        </Button>
      </div>
    </form>
  )
}

function explicar(reason: string): string {
  if (reason.includes('cliente_tenant_email_uk')) {
    return 'Ya hay otro cliente con ese email.'
  }
  if (reason === 'no-permission') return 'Tu rol no puede editar clientes.'
  return reason
}
