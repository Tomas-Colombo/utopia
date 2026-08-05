'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { NumberInput } from '@/components/ui/NumberInput'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import type { TipoProveedor } from '@/lib/types/inventario'
import { createProveedorAction } from '@/app/(app)/inventario/actions'

const TIPOS: { value: TipoProveedor; label: string }[] = [
  { value: 'mayorista', label: 'Mayorista' },
  { value: 'particular', label: 'Particular' },
  { value: 'consignatario', label: 'Consignatario' },
]

export function NuevoProveedorForm() {
  const router = useRouter()
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
      toast.success('Proveedor creado')
      router.push('/proveedores')
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field htmlFor="p-nombre" label="Nombre" required error={errNombre ?? undefined}>
        <Input
          id="p-nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          autoFocus
          invalid={!!errNombre}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field htmlFor="p-tipo" label="Tipo" required>
          <select
            id="p-tipo"
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
        <Field
          htmlFor="p-dias"
          label="Días de rotación esperados"
          hint="Usado por Reportes (RF-12)"
        >
          <NumberInput
            id="p-dias"
            min={0}
            value={dias}
            onChange={(e) => setDias(e.target.value)}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field htmlFor="p-tel" label="Teléfono" hint="Se usa para link WhatsApp">
          <Input
            id="p-tel"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            placeholder="+54 9 11 ..."
          />
        </Field>
        <Field htmlFor="p-email" label="Email">
          <Input
            id="p-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
      </div>

      <Field htmlFor="p-cuit" label="CUIT">
        <Input id="p-cuit" value={cuit} onChange={(e) => setCuit(e.target.value)} />
      </Field>

      <Field htmlFor="p-notas" label="Notas">
        <Textarea
          id="p-notas"
          rows={3}
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
        />
      </Field>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={() => router.back()} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? 'Guardando…' : 'Crear proveedor'}
        </Button>
      </div>
    </form>
  )
}
