'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { invitarUsuarioAction } from '../../actions'
import { mensajeDeError } from '@/lib/errores/mensajes'

/** Crypto-random temp password, avoiding ambiguous chars (0/O, 1/l/I). */
function generarPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const arr = new Uint32Array(14)
  crypto.getRandomValues(arr)
  return Array.from(arr, (n) => chars[n % chars.length]).join('')
}

export function InvitarUsuarioForm({
  roles,
  revendedorasLibres,
}: {
  roles: Array<{ id: string; nombre: string }>
  revendedorasLibres?: Array<{ id_revendedora: string; nombre: string; apellido: string }>
}) {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = useTransition()

  const [email, setEmail] = useState('')
  const [nombre, setNombre] = useState('')
  const [idRol, setIdRol] = useState('')
  const [idRevendedora, setIdRevendedora] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)

  const isRevendedoraRole = roles.find((r) => r.id === idRol)?.nombre === 'Revendedora'

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    start(async () => {
      let res
      if (isRevendedoraRole) {
        if (!idRevendedora) return setErr('Debe elegir una revendedora sin acceso')
        const { darAccesoRevendedoraAction } = await import('@/app/(app)/revendedoras/actions')
        res = await darAccesoRevendedoraAction({
          idRevendedora,
          email,
          nombreCompleto: nombre,
          password
        })
      } else {
        res = await invitarUsuarioAction({
          email,
          nombreCompleto: nombre,
          idRol,
          password,
        })
      }
      
      if (!res.ok) {
        const rawReason = (res as { reason?: unknown }).reason
        const msg = typeof rawReason === 'string' ? rawReason : ((rawReason as { reason?: string })?.reason || 'error-desconocido')
        const finalMsg = mensajeDeError(msg, { accion: 'invitar usuarios' })
        setErr(finalMsg)
        return toast.error('No se pudo invitar', finalMsg)
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

      {isRevendedoraRole && revendedorasLibres && (
        <Field htmlFor="idRev" label="Revendedora a enlazar" required hint="Solo se muestran revendedoras activas sin usuario">
          {revendedorasLibres.length > 0 ? (
            <select
              id="idRev"
              value={idRevendedora}
              onChange={(e) => setIdRevendedora(e.target.value)}
              className="w-full bg-bg border border-border rounded px-2 py-1"
            >
              <option value="">— Elegí la revendedora —</option>
              {revendedorasLibres.map((r) => (
                <option key={r.id_revendedora} value={r.id_revendedora}>
                  {r.nombre} {r.apellido}
                </option>
              ))}
            </select>
          ) : (
            <div className="text-sm text-muted-2">No hay revendedoras libres para invitar.</div>
          )}
        </Field>
      )}

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
