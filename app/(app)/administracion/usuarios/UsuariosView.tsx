'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import {
  USUARIO_ESTADO_LABEL,
  type UsuarioConRol,
  type UsuarioEstado,
} from '@/lib/types/administracion'
import { asignarRolAction, toggleUsuarioEstadoAction } from '../actions'

const ESTADO_VARIANT: Record<UsuarioEstado, 'success' | 'neutral' | 'warning'> = {
  activo: 'success',
  inactivo: 'neutral',
  invitado: 'warning',
}

/**
 * ABM de usuarios. NO permite crear (la creación real pasa por
 * `supabase.auth.admin.createUser` que requiere service_role — fuera
 * de scope de esta pantalla). Sí permite:
 *   - Cambiar estado (activo|inactivo|invitado).
 *   - Reasignar rol.
 *
 * El alta de usuarios reales se hace por invitación (que carga la fila
 * en usuario vía trigger o inserción manual del admin de tenant).
 */
export function UsuariosView({
  initial,
  roles,
}: {
  initial: UsuarioConRol[]
  roles: Array<{ id: string; nombre: string }>
}) {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = useTransition()
  const [rows, setRows] = useState(initial)

  function cambiarEstado(u: UsuarioConRol, next: UsuarioEstado) {
    start(async () => {
      const res = await toggleUsuarioEstadoAction({ idUsuario: u.id_usuario, estado: next })
      if (!res.ok) return toast.error('No se pudo actualizar', res.reason)
      toast.success('Estado actualizado')
      setRows((rs) =>
        rs.map((r) =>
          r.id_usuario === u.id_usuario ? { ...r, estado_usuario: next } : r,
        ),
      )
      router.refresh()
    })
  }

  function cambiarRol(u: UsuarioConRol, idRol: string) {
    if (!idRol) return
    start(async () => {
      const res = await asignarRolAction({
        idUsuario: u.id_usuario,
        idRol,
        nombreCompleto: u.nombre_completo ?? '',
      })
      if (!res.ok) return toast.error('No se pudo asignar rol', res.reason)
      toast.success('Rol actualizado')
      const nuevoRol = roles.find((r) => r.id === idRol) ?? null
      setRows((rs) =>
        rs.map((r) =>
          r.id_usuario === u.id_usuario
            ? {
                ...r,
                id_rol: idRol,
                rol: nuevoRol ? { id_rol: nuevoRol.id, nombre: nuevoRol.nombre } : null,
              }
            : r,
        ),
      )
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border bg-card-2 p-3 text-xs text-muted">
        El alta de nuevos usuarios se hace por invitación (Supabase Auth).
        Esta pantalla permite gestionar rol y estado de los existentes.
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="px-4 py-3">Usuario</th>
              <th className="px-4 py-3">Rol</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-muted">
                  Sin usuarios en este tenant.
                </td>
              </tr>
            ) : (
              rows.map((u) => (
                <tr key={u.id_usuario} className="border-b border-border-2">
                  <td className="px-4 py-3">
                    <div className="font-medium">{u.nombre_completo || u.email}</div>
                    {u.nombre_completo && (
                      <div className="text-xs text-muted">{u.email}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={u.id_rol ?? ''}
                      onChange={(e) => cambiarRol(u, e.target.value)}
                      disabled={pending}
                      aria-label={`Rol de ${u.email}`}
                      className="rounded-md border border-border bg-card px-2 py-1 text-sm text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-pink"
                    >
                      <option value="">— Sin rol —</option>
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>{r.nombre}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={ESTADO_VARIANT[u.estado_usuario]}>
                      {USUARIO_ESTADO_LABEL[u.estado_usuario]}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {u.estado_usuario === 'activo' ? (
                      <Button size="sm" variant="ghost" onClick={() => cambiarEstado(u, 'inactivo')} disabled={pending}>
                        Desactivar
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => cambiarEstado(u, 'activo')} disabled={pending}>
                        Activar
                      </Button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
