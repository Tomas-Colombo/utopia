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
import { mensajeDeError } from '@/lib/errores/mensajes'
import { TableFrame, DataTable, THead, TBody, Tr, Th, Td } from '@/components/ui/TableParts'

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
      if (!res.ok) return toast.error('No se pudo actualizar', mensajeDeError(res.reason))
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
      if (!res.ok) return toast.error('No se pudo asignar rol', mensajeDeError(res.reason))
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

      <TableFrame>
        <DataTable>
          <THead>
            <Th>Usuario</Th>
            <Th>Rol</Th>
            <Th>Estado</Th>
            <Th></Th>
          </THead>
          <TBody>
            {rows.length === 0 ? (
              <Tr>
                <Td align="center" colSpan={4} className="px-4 py-6 text-muted">
                  Sin usuarios en este tenant.
                </Td>
              </Tr>
            ) : (
              rows.map((u) => (
                <Tr key={u.id_usuario}>
                  <Td>
                    <div className="font-medium">{u.nombre_completo || u.email}</div>
                    {u.nombre_completo && (
                      <div className="text-xs text-muted">{u.email}</div>
                    )}
                  </Td>
                  <Td>
                    <select
                      value={u.id_rol ?? ''}
                      onChange={(e) => cambiarRol(u, e.target.value)}
                      disabled={pending}
                      aria-label={`Rol de ${u.email}`}
                      className=""
                    >
                      <option value="">— Sin rol —</option>
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>{r.nombre}</option>
                      ))}
                    </select>
                  </Td>
                  <Td>
                    <Badge variant={ESTADO_VARIANT[u.estado_usuario]}>
                      {USUARIO_ESTADO_LABEL[u.estado_usuario]}
                    </Badge>
                  </Td>
                  <Td align="right">
                    {u.estado_usuario === 'activo' ? (
                      <Button size="sm" variant="ghost" onClick={() => cambiarEstado(u, 'inactivo')} disabled={pending}>
                        Desactivar
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => cambiarEstado(u, 'activo')} disabled={pending}>
                        Activar
                      </Button>
                    )}
                  </Td>
                </Tr>
              ))
            )}
          </TBody>
        </DataTable>
      </TableFrame>
    </div>
  )
}
