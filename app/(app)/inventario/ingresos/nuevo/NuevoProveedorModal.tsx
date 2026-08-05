'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { NumberInput } from '@/components/ui/NumberInput'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import type { ProveedorRow, TipoProveedor } from '@/lib/types/inventario'
import { createProveedorAction } from '../../actions'

const TIPOS: { value: TipoProveedor; label: string }[] = [
  { value: 'mayorista', label: 'Mayorista' },
  { value: 'particular', label: 'Particular' },
  { value: 'consignatario', label: 'Consignatario' },
]

/**
 * Alta rápida de proveedor desde el formulario de ingreso, sin abandonar la
 * carga en curso. Mismos campos que /proveedores/nuevo. Al crear,
 * devuelve la fila (parcial) por `onCreated` para preseleccionarla en el
 * select del ingreso; el listado maestro se revalida vía la server action.
 */
export function NuevoProveedorModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (proveedor: ProveedorRow) => void
}) {
  const toast = useToast()
  const [pending, start] = useTransition()

  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState<TipoProveedor>('mayorista')
  const [telefono, setTelefono] = useState('')
  const [email, setEmail] = useState('')
  const [cuit, setCuit] = useState('')
  const [dias, setDias] = useState('')
  const [notas, setNotas] = useState('')
  const [errNombre, setErrNombre] = useState<string | null>(null)

  function reset() {
    setNombre('')
    setTipo('mayorista')
    setTelefono('')
    setEmail('')
    setCuit('')
    setDias('')
    setNotas('')
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
      const res = await createProveedorAction({
        nombre,
        tipo,
        telefono: telefono || null,
        email: email || null,
        cuit: cuit || null,
        dias_rotacion: dias ? Number(dias) : null,
        notas: notas || null,
      })
      if (!res.ok) return toast.error('No se pudo crear', res.reason)
      if (!res.data) return toast.error('No se pudo crear')
      toast.success('Proveedor creado')
      onCreated({
        id_proveedor: res.data.id,
        id_tenant: '',
        nombre: nombre.trim(),
        tipo,
        telefono: telefono || null,
        email: email || null,
        cuit: cuit || null,
        dias_rotacion: dias ? Number(dias) : null,
        notas: notas || null,
        activo: true,
        created_at: '',
        updated_at: '',
      })
      reset()
    })
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Nuevo proveedor"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" form="nuevo-proveedor-modal-form" disabled={pending}>
            {pending ? 'Guardando…' : 'Crear proveedor'}
          </Button>
        </>
      }
    >
      <form id="nuevo-proveedor-modal-form" onSubmit={submit} className="space-y-4">
        <Field htmlFor="pm-nombre" label="Nombre" required error={errNombre ?? undefined}>
          <Input
            id="pm-nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            invalid={!!errNombre}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field htmlFor="pm-tipo" label="Tipo" required>
            <select
              id="pm-tipo"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoProveedor)}
              className="w-full"
            >
              {TIPOS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
          <Field htmlFor="pm-dias" label="Días de rotación esperados" hint="Usado por Reportes (RF-12)">
            <NumberInput id="pm-dias" min={0} value={dias} onChange={(e) => setDias(e.target.value)} />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field htmlFor="pm-tel" label="Teléfono" hint="Se usa para link WhatsApp">
            <Input
              id="pm-tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="+54 9 11 ..."
            />
          </Field>
          <Field htmlFor="pm-email" label="Email">
            <Input id="pm-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
        </div>

        <Field htmlFor="pm-cuit" label="CUIT">
          <Input id="pm-cuit" value={cuit} onChange={(e) => setCuit(e.target.value)} />
        </Field>

        <Field htmlFor="pm-notas" label="Notas">
          <Textarea id="pm-notas" rows={3} value={notas} onChange={(e) => setNotas(e.target.value)} />
        </Field>
      </form>
    </Modal>
  )
}
