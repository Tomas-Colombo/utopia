'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import { crearClienteAction } from '../../ventas/actions'

export function NuevoClienteForm() {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = useTransition()

  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [email, setEmail] = useState('')
  const [notas, setNotas] = useState('')
  const [err, setErr] = useState<string | null>(null)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (nombre.trim().length < 2) return setErr('Nombre muy corto')
    setErr(null)
    start(async () => {
      const res = await crearClienteAction({
        nombre,
        telefono: telefono || null,
        email: email || null,
        notas: notas || null,
      })
      if (!res.ok) return toast.error('No se pudo crear', res.reason)
      toast.success('Cliente creado')
      router.push('/clientes')
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field htmlFor="cn" label="Nombre" required error={err ?? undefined}>
        <Input
          id="cn"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          autoFocus
          invalid={!!err}
        />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field htmlFor="ct" label="Teléfono" hint="Se usa para link WhatsApp">
          <Input
            id="ct"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            placeholder="+54 9 11 ..."
          />
        </Field>
        <Field htmlFor="ce" label="Email">
          <Input id="ce" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
      </div>
      <Field htmlFor="cno" label="Notas">
        <Textarea id="cno" rows={3} value={notas} onChange={(e) => setNotas(e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={() => router.back()} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? 'Guardando…' : 'Crear cliente'}
        </Button>
      </div>
    </form>
  )
}
