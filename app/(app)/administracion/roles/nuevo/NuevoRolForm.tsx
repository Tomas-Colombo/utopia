'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { PermisosEditor } from '@/components/administracion/PermisosEditor'
import { createRolAction } from '../../actions'

export function NuevoRolForm() {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = useTransition()

  const [nombre, setNombre] = useState('')
  const [permisos, setPermisos] = useState<Record<string, string[]>>({})
  const [err, setErr] = useState<string | null>(null)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (nombre.trim().length < 2) return setErr('Nombre muy corto')
    setErr(null)
    start(async () => {
      const res = await createRolAction({ nombre, permisos })
      if (!res.ok) return toast.error('No se pudo crear', res.reason)
      toast.success('Rol creado')
      router.push('/administracion/roles')
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <Field htmlFor="rol-nombre" label="Nombre del rol" required error={err ?? undefined}>
          <Input
            id="rol-nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            autoFocus
            invalid={!!err}
            placeholder='Ej. "Vendedor", "Encargado", "Administrador"'
          />
        </Field>
      </div>

      <div>
        <h3 className="font-display text-lg mb-2">Permisos</h3>
        <PermisosEditor value={permisos} onChange={setPermisos} />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={() => router.back()} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? 'Creando…' : 'Crear rol'}
        </Button>
      </div>
    </form>
  )
}
