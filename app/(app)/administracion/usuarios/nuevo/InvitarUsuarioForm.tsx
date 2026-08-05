'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { invitarUsuarioAction } from '../../actions'

const REASON_LABEL: Record<string, string> = {
  'email-invalido': 'El email no es válido',
  'nombre-corto': 'El nombre es muy corto',
  'rol-requerido': 'Elegí un rol',
  'password-corto': 'La contraseña debe tener al menos 8 caracteres',
}

/** Crypto-random temp password, avoiding ambiguous chars (0/O, 1/l/I). */
function generarPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const arr = new Uint32Array(14)
  crypto.getRandomValues(arr)
  return Array.from(arr, (n) => chars[n % chars.length]).join('')
}

export function InvitarUsuarioForm({
  roles,
}: {
  roles: Array<{ id: string; nombre: string }>
}) {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = useTransition()

  const [email, setEmail] = useState('')
  const [nombre, setNombre] = useState('')
  const [idRol, setIdRol] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    start(async () => {
      const res = await invitarUsuarioAction({
        email,
        nombreCompleto: nombre,
        idRol,
        password,
      })
      if (!res.ok) {
        const msg = REASON_LABEL[res.reason] ?? res.reason
        setErr(msg)
        return toast.error('No se pudo invitar', msg)
      }
      // Sticky toast (duration 0) so the admin can copy the temp password
      // before it disappears. The ToastProvider lives above the shell, so it
      // survives the navigation below.
      toast.show({
        variant: 'success',
        title: 'Usuario invitado',
        description: `Contraseña temporal: ${password}`,
        duration: 0,
      })
      router.push('/administracion/usuarios')
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="rounded-md border border-border bg-card-2 p-3 text-xs text-muted">
        Se crea la cuenta con una contraseña temporal. Compartila con la
        persona; puede cambiarla luego desde su configuración.
      </div>

      <Field htmlFor="ue" label="Email" required error={err ?? undefined}>
        <Input
          id="ue"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoFocus
          invalid={!!err}
        />
      </Field>

      <Field htmlFor="un" label="Nombre completo" required>
        <Input id="un" value={nombre} onChange={(e) => setNombre(e.target.value)} />
      </Field>

      <Field htmlFor="ur" label="Rol" required hint="Define qué módulos podrá ver y usar">
        <select
          id="ur"
          value={idRol}
          onChange={(e) => setIdRol(e.target.value)}
          className="w-full"
        >
          <option value="">— Elegí un rol —</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nombre}
            </option>
          ))}
        </select>
      </Field>

      <Field htmlFor="up" label="Contraseña temporal" required hint="Mínimo 8 caracteres">
        <div className="flex gap-2">
          <Input
            id="up"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Escribila o generala"
          />
          <Button
            variant="secondary"
            onClick={() => setPassword(generarPassword())}
          >
            Generar
          </Button>
        </div>
      </Field>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={() => router.back()} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? 'Invitando…' : 'Invitar usuario'}
        </Button>
      </div>
    </form>
  )
}
