'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { PermisosEditor } from '@/components/administracion/PermisosEditor'
import { updateRolAction } from '../../actions'

export function EditarRolForm({
  idRol,
  nombreInicial,
  permisosIniciales,
}: {
  idRol: string
  nombreInicial: string
  permisosIniciales: Record<string, string[]>
}) {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = useTransition()

  const [nombre, setNombre] = useState(nombreInicial)
  const [permisos, setPermisos] = useState<Record<string, string[]>>(permisosIniciales)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (nombre.trim().length < 2) return toast.error('Nombre muy corto')
    start(async () => {
      const res = await updateRolAction({ idRol, nombre, permisos })
      if (!res.ok) return toast.error('No se pudo guardar', res.reason)
      toast.success('Rol actualizado')
      router.push('/administracion/roles')
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <Field htmlFor="rol-e-nombre" label="Nombre del rol" required>
          <Input id="rol-e-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
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
          {pending ? 'Guardando…' : 'Guardar cambios'}
        </Button>
      </div>
    </form>
  )
}
