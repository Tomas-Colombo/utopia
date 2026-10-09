'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { mensajeDeError } from '@/lib/errores/mensajes'
import { crearRevendedoraAction } from '../actions'

export function NuevaRevendedoraForm() {
  const router = useRouter()
  const toast = useToast()
  const [loading, setLoading] = useState(false)

  async function action(formData: FormData) {
    setLoading(true)
    const payload = {
      nombre: formData.get('nombre') as string,
      apellido: formData.get('apellido') as string,
      telefono: (formData.get('telefono') as string) || null,
      email: (formData.get('email') as string) || null,
      notas: (formData.get('notas') as string) || null,
    }

    const res = await crearRevendedoraAction(payload)
    if (!res.ok) {
      toast.error(mensajeDeError(res.reason))
      setLoading(false)
      return
    }

    toast.success('Revendedora creada')
    router.push('/revendedoras')
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <Field htmlFor="nr_nombre" label="Nombre" required>
          <Input id="nr_nombre" name="nombre" required autoFocus autoComplete="off" />
        </Field>
        <Field htmlFor="nr_apellido" label="Apellido" required>
          <Input id="nr_apellido" name="apellido" required autoComplete="off" />
        </Field>
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <Field htmlFor="nr_telefono" label="Teléfono">
          <Input id="nr_telefono" name="telefono" type="tel" autoComplete="off" />
        </Field>
        <Field htmlFor="nr_email" label="Email">
          <Input id="nr_email" name="email" type="email" autoComplete="off" />
        </Field>
      </div>

      <Field htmlFor="nr_notas" label="Notas">
        <Textarea id="nr_notas" name="notas" rows={3} />
      </Field>

      <div className="mt-4 flex justify-end gap-3">
        <Button type="button" variant="neutral" onClick={() => router.back()} disabled={loading}>
          Cancelar
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? 'Guardando...' : 'Guardar'}
        </Button>
      </div>
    </form>
  )
}
